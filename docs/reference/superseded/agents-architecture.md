# Agents Architecture & Execution Plan (Phase 1)

This document translates your product vision for **Agents** into a concrete technical architecture for the Sparstrowgen factory. Once you approve this, we will lock it in and move on to designing Phase 2: Teams.

## 1. Autonomy & Escalation (The "Headless" Loop)
**Vision:** Agents run headlessly. They escalate uncertainty to their Manager Agent, and if unresolved, to the Human. Blocked tasks pause and wait for human input.

**Technical Implementation:**
- **Task Status Upgrades:** We will introduce a new `blocked` status to the `tasks` table.
- **Blocker Tracking:** Add an `open_questions` (JSON array) column to `tasks`. When an agent reaches a dead end, it writes the specific question to this array and changes the task status to `blocked`.
- **The Dashboard Queue:** The UI will feature a dedicated "Human Attention Required" queue. When you answer the open question, the system updates the task's `injected_context` and automatically flips the status back to `todo`, waking the agent up to resume execution.
- **Manager Delegation:** We will utilize the existing `messages` table for agent-to-agent communication. If a Sub-Agent is stuck, it sends a `message` to the Lead Agent. The Sub-Agent's run suspends until the Lead Agent replies.

## 2. Dynamic Tool Management
**Vision:** Tool permissions are managed through a strict hierarchical inheritance model (Global → Project → Task). Lower levels (Task) take precedence over higher levels (Global).

**Technical Implementation:**
- **Schema Updates:** 
  - The `agents` table already has `allowedTools` and `disallowedTools`.
  - We will add `allowedTools` and `disallowedTools` (JSON array) columns to the `projects` table.
  - We will add `allowedTools` and `disallowedTools` (JSON array) columns to the `tasks` table.
- **Runtime Tool Resolution:** When the Orchestrator (`run-manager.ts`) spawns a CLI process, it resolves permissions top-to-bottom:
  1. Start with Global-level allowed tools.
  2. Apply Project-level additions and restrictions.
  3. Apply Task-level additions and restrictions.
  4. *Rule:* Any tool listed in a lower-level `disallowedTools` array strictly overrides a grant from a higher level.
- **UI Audit Trail:** The `/tasks` and `/runs` UI will feature a transparent permission audit matrix. It will clearly display the provenance of each tool (e.g., `Web Search: Granted by Project → Denied by Task`) and visually highlight overrides so the final effective toolset is crystal clear.

## 3. Tiered Context & Memory Handling
**Vision:** Prioritized retrieval across Task, Project, Agent, and Global memory to maintain continuity across executions.

**Technical Implementation:**
- **Schema Update:** The `memoryNotes` table already supports scopes. We will explicitly enforce a `scope` enum of `['global', 'project', 'agent', 'task']`.
- **Retrieval Engine (`one-shot.ts` / Memory Service):**
  - Before an agent spawns, the orchestrator triggers a "Context Assembly" phase.
  - **Priority 1 (Task):** It fetches all previous `run_events`, `result_text`, and task-scoped `memoryNotes` tied to the specific `taskId`.
  - **Priority 2 (Project):** It executes a semantic vector search against `project`-scoped memory for architecture/docs relevant to the prompt.
  - **Priority 3 & 4:** It fetches `agent` history and `global` standards.
- **Prompt Injection:** This prioritized data is compiled into a single contextual payload and injected directly into the agent's `systemPrompt` at boot time, ensuring it wakes up perfectly aware of where it left off.

## 4. Hierarchical Specialization & Team-Bounded Autonomy
**Vision:** Lead Agents coordinate specialized Sub-Agents (UX, UI, Accessibility) for evaluation and validation. Delegation is fully autonomous *within* a team, but strictly gated *across* teams to control costs and security.

**Technical Implementation:**
- **The "Lead" Protocol:** Lead Agents will be granted a specific core tool: `spawn_subtask`. 
- **Team-Bounded Autonomy (The Core Rule):**
  - **Intra-Team (Autonomous):** If an agent uses `spawn_subtask` to delegate to another agent *on the same Team* (defined in the `teamMembers` table), the sub-task spawns immediately.
  - **Cross-Team (Requires Approval):** If an agent attempts to spawn a sub-task for an agent *outside* its team, the sub-task is created with a `pending_approval` status. The Orchestrator halts the Lead Agent's execution and flags it in the Human Dashboard. Execution only resumes if the Human clicks "Approve".
- **Example Context:** 
  - You assign a task to the **Frontend Lead**. It uses `spawn_subtask` to ask the **Accessibility Agent** (who is on the Frontend Team) for a review. This happens instantly in the background. 
  - Later, the Frontend Lead realizes it needs a new database table. It uses `spawn_subtask` to ask the **Database Agent** (who is on the Backend Team). The system pauses, placing a notification on your dashboard: *"Frontend Lead requests Database Agent for 'Create Users Table'. Approve/Deny?"* This prevents a runaway agent from touching resources outside its domain without supervision.
- **Execution Flow:** 
  1. A task is assigned to a Lead Agent.
  2. The Lead Agent reads the task, then uses `spawn_subtask` to generate sub-tasks for its team members. 
  3. The Lead Agent's run suspends while Sub-Agents wake up, evaluate, and write their findings.
  4. The Lead Agent wakes back up, reads the consolidated results, and implements the code.
- **UI Support:** The `/tasks` UI will be updated to support parent-child relationships so you can visually see the Lead Agent's delegation tree, alongside an "Awaiting Approval" queue for cross-team requests.

---

## 5. Exceptional Agent Creation (Context-Aware)
**Vision:** Agent creation is not an isolated action, but a context-aware process that validates necessity, prevents duplicates, and produces behaviorally enforced, exceptional system instructions.

**Technical Implementation:**
- **Pre-Flight Evaluation:** Before drafting a new agent, the Agent Creator will automatically perform a background validation sweep:
  1. **Registry Scan:** Checks the `agents` table to see if an existing agent already fulfills this role, suggesting you use or update the existing one instead of creating a duplicate.
  2. **Memory Scan:** Queries Global, Project, and Agent memory to pull in relevant organizational standards and historical context.
- **Behavioral Enforcement (The "Exceptional" Prompt):** We will remove the current strict 40-line limit in `draft-service.ts`. The AI will generate highly structured, multi-page system prompts that strictly define:
  - What inputs/documents the agent must request before starting.
  - The strict output formats it must adhere to.
  - Operational constraints and behavioral loops.
- **The Result:** Agents will no longer just be a name and a short prompt; they will be spawned with robust, battle-tested instruction manuals (`SKILL.md`) that are fully aware of your organization's context.

## 6. Repository Analysis, Ingestion, & Security ("Skill Specter")
**Vision:** An elite ingestion pipeline that can discover external agent frameworks and `SKILL.md` files, run deep security inspections on them, and sandbox them for testing before they ever touch your production environment.

**Technical Implementation:**
- **The Intelligence Extractor Agent:** Equipped with `fetch_github_repo` and `ast_analyzer` tools to parse complex external codebases, mapping out architectures and workflows, and writing actionable insights directly to Global Memory.
- **Skill Ingestion & Reconstruction:** The system will automatically detect external `SKILL.md` definitions inside ingested repos and reconstruct them as draft agents inside Sparstrowgen.
- **The "Skill Specter" Security Layer:** Inspired by NVIDIA's Skill Specter, every imported agent must pass an automated security inspection before creation. This layer analyzes the imported instructions and tools to detect:
  - Unauthorized data exfiltration or hidden external communications.
  - Malicious logic, prompt injections, or unsafe tool requirements.
  - The Specter will flag risks, block harmful components, and suggest safe structural modifications to adapt the agent to your factory's security standards.
- **Isolated Sandboxing:** Imported agents are placed in a strict "Quarantine Sandbox." This environment uses a dedicated, ephemeral memory layer completely disconnected from your production Global/Project memory. Experimental agents cannot corrupt live data or influence existing agents.
- **Promotion Workflow:** After safely testing the agent in the Sandbox, you will have a 1-click UI option to either "Promote to Production" (which merges the agent into the main database and grants live memory access) or "Discard" it entirely.

## 7. Multi-Provider & Direct API Integration
**Vision:** Agents should not be restricted to running via the headless Claude Code CLI. You should be able to power agents using direct API connections (e.g., Gemini API, Anthropic API, OpenAI) and dynamically discover available models.

**Technical Implementation:**
- **Schema Upgrades:** 
  - We will add an `executionMode` column to the `agents` table (e.g., `cli` vs `direct_api`).
  - We will establish a secure configuration layer (likely expanding the `settings` table) to store API keys so they can be securely reused across agents without duplication.
- **Dynamic Model Discovery:** We will build a new backend route (e.g., `POST /api/v1/providers/discover-models`). When you input an API key for a provider in the UI, it will ping the provider's API directly and populate the model selection dropdown with the actual, real-time list of models your specific key has access to.
- **Execution Engine Adaptation:** The Orchestrator (`run-manager.ts`) will be updated to handle a dual-path execution flow. 
  - If the agent is set to `cli`, it spawns the local terminal process (the current behavior).
  - If set to `direct_api`, it routes the execution through standard API SDKs (like `@google/genai`), managing the tool-call loop and state directly within the Node backend.
