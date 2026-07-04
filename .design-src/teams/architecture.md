# Teams Architecture & Execution Plan (Phase 2)

This document outlines the technical architecture for the **Agent Teams** module, incorporating the vision from the North-star document and the requirement for dynamic, cross-functional collaboration.

## 1. Surface Ownership & Global vs. Scoped Views
**Vision:** Global pages (`/tasks`, `/pipelines`, `/schedule`) remain the absolute source of truth. The Team Workspace is a contextual, filtered viewport into the global system.

**Technical Implementation:**
- **The Global Engine:** The existing global tables (`tasks`, `pipelines`, `cronJobs`) will act as the single source of truth. 
- **The Scoped Views:** The `/teams/:id` page will be upgraded. Instead of having its own isolated databases, it will contain Tabs (Tasks, Pipelines, Schedules) that issue standard `GET` requests to the global APIs, appending `?teamId={id}` as a filter.
- **UI Consistency:** You get full factory visibility on the dashboard, while the Team Workspace provides an isolated, noise-free environment for day-to-day execution.

## 2. The Team Manager Agent (Dual-Mode)
**Vision:** A top-level manager agent that assists in workflow creation without executing rogue automation.

**Technical Implementation:**
- **Mode A (Advisor):** A chat interface within the Team Workspace. You can ask for architectural advice, and it will analyze your agent roster to identify gaps or suggest optimal workflows via text.
- **Mode B (Draft & Approve):** You can instruct the Manager to build a workflow. It will autonomously design a multi-agent execution pipeline, but it will **not** commit it to the database. Instead, it generates a "Draft Pipeline" JSON payload.
- **Visual Canvas:** This payload renders visually on a drag-and-drop canvas (n8n/Zapier style). You can review the Manager's proposed workflow, make manual adjustments, and click **Publish** to officially commit it to the global `/pipelines` registry.

## 3. Team Membership & Ephemeral Groupings
**Vision:** Agents can belong to multiple static teams, and cross-functional teams are spun up automatically on a per-task basis.

**Technical Implementation:**
- **Multi-Team Support:** The existing `team_members` junction table naturally supports an agent belonging to multiple teams without schema changes. 
- **Task-Based Ephemeral Teams:** 
  - We will add an `is_ephemeral` (boolean) column and a `linked_task_id` column to the `teams` table.
  - When you create a task and assign multiple agents to it, the backend will automatically generate a new `team` record with `is_ephemeral = true`.
  - These agents instantly form a cross-functional unit that shares the Team-Bounded Autonomy rules.
  - When the task status hits `done`, a background hook will automatically delete the ephemeral team record, cleanly dissolving the unit.

---

## 4. Team Memory & Cross-Team Messaging
**Vision:** Keep memory layers simple and allow lightweight, autonomous cross-team communication that prevents infinite loops.

**Technical Implementation:**
- **Memory Inheritance:** We will **not** introduce a dedicated Team Memory scope. Agents on a team will rely strictly on the 4 established memory layers: Task > Project > Agent > Global. This prevents context bloat and ensures operational standards live globally or within specific projects.
- **Autonomous Messaging (With Circuit Breakers):** Cross-team *delegation* (spawning tasks) strictly requires human approval. However, cross-team *messaging* (asking questions via the `messages` table) is fully autonomous.
  - **The Circuit Breaker:** To prevent infinite "chatter loops" between agents, the backend will enforce a hard limit of **3 messages per task** for any cross-team thread. 
  - If the agents cannot resolve their issue within 3 messages, the conversation is automatically halted, the task status is flipped to `blocked`, and the thread is escalated to the "Human Attention Required" queue on the dashboard.
