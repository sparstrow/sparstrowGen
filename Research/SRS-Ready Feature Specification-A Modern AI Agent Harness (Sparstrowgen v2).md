# SRS-Ready Feature Specification: A Modern AI Agent Harness ("Sparstrowgen v2")

## TL;DR
- **Build a "brain/hands" split platform**: a persistent orchestration backend (durable execution engine + Postgres/pgvector + event log + policy engine + LLM gateway) that is fully decoupled from stateless, per-task execution sandboxes (Firecracker/Kata microVMs running coding CLIs via a local daemon), modeled on Multica's Go-backend + Next.js + Postgres/pgvector + local-daemon architecture but adding the four things Multica lacks: scoped per-agent tool permissions, layered writable memory (agent/project/workspace), first-class human-in-the-loop gates, and per-project policy/compliance profiles.
- **The v1 MUST-haves are**: agent manifests with per-agent tool allowlists; a durable, resumable orchestration loop with interrupt/approval gates; three-tier persistent memory with explicit scoping and promotion governance; sandboxed execution with brokered secrets; an append-only event log for full audit/replay; RBAC/ABAC with distinct human and agent identities; per-project/per-agent budgets enforced at an LLM gateway; and OpenTelemetry GenAI tracing. Everything else (A2A federation, knowledge-graph memory, multi-region, marketplace) is later-phase.
- **Bootstrap it with spec-driven development in Claude Code**: use GitHub Spec Kit's `/speckit.specify → plan → tasks → implement` loop, define the specialized roles as `.claude/agents/` subagents with scoped `tools:` frontmatter, enforce invariants with hooks, and sequence the build so the harness can run its own backlog by v1 (self-hosting the bootstrap).

## Key Findings

1. **Multica is the right reference form factor but is deliberately thin on control.** Multica (multica-ai/multica, ~41.4k stars, v0.4.7 as of Jul 21 2026 — star/version counts are repo self-reported) is a Go backend (Chi router, sqlc, gorilla/websocket), Next.js 16 frontend, PostgreSQL 17 + pgvector, and a local daemon that executes coding CLIs (Claude Code, Codex, Cursor Agent, etc.). Its abstractions — managed agents with stable identity, issues/board, squads, autopilots (cron/webhook), runtimes, workspace isolation, SKILL.md skills — are exactly the surface you want. But community discussions flag its gaps; one user request states verbatim: "couldn't find any API permission management would be great if we had scopes in APIs." Combined with its coding-only orientation and thin HITL, these gaps are your differentiation targets.

2. **Layered memory maps cleanly to a three-scope model, but "promotion with approval" is not an off-the-shelf feature — you must build it.** MemGPT/Letta established the OS-style tiered model (core/recall/archival); Mem0 provides scope IDs (user_id/agent_id/run_id/app_id, at least one required per read/write, enforced as hard isolation boundaries); Zep/Graphiti provides bi-temporal validity windows (valid_at/invalid_at, "facts are invalidated — not deleted") for conflict/staleness; LangGraph provides namespaced cross-thread Stores (BaseStore, namespaces embed user/org IDs for hierarchical scoping). None ships a documented "promote a fact from agent scope to project/workspace scope only after human review" workflow — that governance layer is assembled from primitives plus research (Personize.ai "Governed Memory," arXiv:2603.17787, which uses automated quality gates + schema confidence + governance routing; and A-MemGuard, arXiv:2510.02373, consensus-gated writes requiring multi-source agreement before committing, reporting >95% attack mitigation at ~15% throughput overhead).

3. **Per-agent tool scoping is a solved pattern at the config layer but must be enforced deterministically.** Claude Code subagents already express `tools:`, `disallowedTools:`, `mcpServers:`, `permissionMode:`, `maxTurns:` in YAML frontmatter. But LLM-layer instructions are insufficient against tool poisoning: per Wang et al., "MCPTox: A Benchmark for Tool Poisoning Attack on Real-World MCP Servers" (arXiv:2508.14925, accepted AAAI 2026; 45 live MCP servers, 353 authentic tools, 20 LLM agents), "o1-mini [achieved] an attack success rate of 72.8%," the "average ASR for all model settings was 36.5%," and even the most-resistant model, Claude-3.7-Sonnet, refused poisoned calls "less than 3%" of the time. Enforcement must be server-side via hooks/interceptors and a policy engine (Cedar or OPA).

4. **Durable execution is the hard architectural choice.** LangGraph checkpoints are not durable execution (no failure detection, no auto-resume, no dup-execution prevention). Temporal is the production-grade orchestrator — confirmed by the July 30 2025 Temporal + OpenAI Agents SDK integration announcement, and per IntuitionLabs "Codex runs on Temporal in production, handling millions of requests" (Replit Agent also migrated its control plane to Temporal) — but its deterministic-replay model is awkward for open-ended agent loops. The 2026 consensus is a layered "brain/muscle" split: durable orchestrator (Temporal or equivalent) for the macro lifecycle, agent-reasoning framework for the micro loop.

5. **Domain-agnosticism is achieved through pluggable project blueprints + policy profiles.** Compliance (HIPAA/SOC2) should be a per-project policy profile that configures runtime behavior (data residency, PII/PHI handling, retention, audit level, approval strictness), not baked into the harness.

## Details

### A. Reference Architecture (recommended)

**Decouple the brain from the hands.** Two planes:

- **Control plane (the "brain," persistent):**
  - **API/Gateway service** (REST + WebSocket/SSE for live streaming).
  - **Orchestration/durable-execution engine** — owns workflow lifecycle, retries, timers, interrupt/resume, fan-out/fan-in.
  - **Policy Decision Point (PDP)** — Cedar or OPA, evaluates every tool call, handoff, and memory promotion.
  - **Memory service** — Postgres + pgvector for semantic/archival; optional knowledge-graph (Graphiti) later; scope-aware read/write.
  - **LLM gateway** (LiteLLM or Bifrost/Portkey) — model routing, per-key/per-project budgets, token attribution, spend caps.
  - **Event store** — append-only event log (event-sourced) as the system of record for sessions, audit, and replay.
  - **Relational store** — Postgres for agents, projects, workspaces, tasks/issues, identities, permissions.
  - **Secrets broker/vault** — issues short-lived, brokered credentials to sandboxes; secrets never enter the sandbox image.
- **Execution plane (the "hands," ephemeral):**
  - **Runner daemon** — runs on a machine/cloud, auto-detects and drives coding CLIs and other tools, reports runtimes.
  - **Sandbox** — one isolated microVM (Firecracker/Kata) or gVisor sandbox per task, with git worktree, egress controls, resource limits, snapshot/restore for multi-turn state.

**Event bus** connects planes: the orchestrator emits work items; runners claim them, heartbeat, stream output, and post results/artifacts back as events.

### B. Capability Areas → Functional Requirements (MoSCoW: M=Must v1, S=Should, C=Could, W=Won't-yet)

#### CA-1 Agent Definition & Lifecycle
- FR-1.1 (M) The system MUST represent each agent as a versioned manifest (spec) containing: id, name, role, system prompt, model selection/routing policy, tool allowlist, MCP server bindings, skills, memory-scope grants, max-turns/step budget, and permission mode.
- FR-1.2 (M) Agent manifests MUST be version-controlled and immutable per version; a running task MUST record the exact manifest version used.
- FR-1.3 (S) The system SHOULD provide an agent registry with discovery metadata (capabilities, skills) analogous to A2A AgentCards served at `/.well-known/agent-card.json`.
- FR-1.4 (S) The system SHOULD support agent evaluation/testing (regression suites, LLM-as-judge scorecards) gating promotion of a new agent version.
- FR-1.5 (C) The system COULD support agent deprecation with a lifecycle state (draft→active→deprecated→retired).
- FR-1.6 (M) Each agent MUST have a stable machine identity (service account) distinct from any human user.

#### CA-2 Orchestration
- FR-2.1 (M) The orchestrator MUST support supervisor/hierarchical delegation: an orchestrator owns context and spawns isolated subagents that return compressed summaries. This is the 2026-converged pattern; note its cost: per Anthropic's engineering post on its multi-agent Research system, an orchestrator-worker setup (Claude Opus 4 lead + Sonnet 4 subagents) "outperformed a single Claude Opus 4 agent by 90.2% on research evaluation tasks," but "multi-agent systems consume approximately 15x more tokens than single-agent interactions," and "token usage explains 80% of performance variance."
- FR-2.2 (M) The orchestrator MUST support sequential and parallel (fan-out/fan-in) execution of tasks.
- FR-2.3 (M) Execution MUST be durable and resumable across process/host failure (survive crashes, resume from last committed step).
- FR-2.4 (M) The orchestrator MUST enforce sub-agent spawning limits (max depth, max concurrent children) to prevent runaway fan-out.
- FR-2.5 (M) Retries MUST be configurable with idempotency guarantees; non-deterministic/side-effecting steps MUST be wrapped so replay does not re-execute them.
- FR-2.6 (S) The orchestrator SHOULD support compensation/rollback actions for side-effecting steps.
- FR-2.7 (S) The system SHOULD support both graph/DAG and state-machine execution models.
- FR-2.8 (M) The system MUST prevent deadlock/livelock via hard step ceilings and no-progress detection (see CA-4/HITL).

#### CA-3 Task & Work Management
- FR-3.1 (M) The system MUST model work as tasks/issues with status lifecycle (enqueue→claim→start→complete/fail/blocked), priority, dependencies, and assignee (human OR agent).
- FR-3.2 (M) Claimed tasks MUST emit heartbeats; a task whose runner stops heartbeating MUST be detected and requeued.
- FR-3.3 (M) Tasks MUST support cancellation that propagates to child tasks and terminates the sandbox.
- FR-3.4 (S) The system SHOULD support scheduled (cron) and webhook-triggered runs ("autopilots") that create and route issues automatically.
- FR-3.5 (S) The system SHOULD support a "squad"/routing-group abstraction where a lead agent delegates to members.

#### CA-4 Human-in-the-Loop (HITL)
- FR-4.1 (M) The system MUST support durable interrupt/approval gates that pause a run, persist state, and wait indefinitely for a human decision (approve/reject/edit), then resume from the checkpoint.
- FR-4.2 (M) Irreversible/side-effecting actions (deploys, deletes, external posts, spend above threshold) MUST require an approval gate governed by the project's policy profile.
- FR-4.3 (M) The system MUST auto-detect "stuck" states via: hard iteration/step cap, token/cost budget exhaustion, action-hash loop detection (same (tool,args) repeated within a sliding window), and no-progress detection (task state unchanged over k steps).
- FR-4.4 (M) On a stuck/budget-exhausted state, the agent MUST land cleanly: commit WIP to a branch, write a handoff note (state + next steps + blocker), and escalate to a human rather than dying silently.
- FR-4.5 (M) The system MUST provide an approval inbox/task-queue UX with notifications.
- FR-4.6 (S) Approval gates SHOULD support timeouts with a configured default action (e.g., auto-reject/hold-as-draft) per policy profile.
- FR-4.7 (M) Every approval decision MUST be recorded in the audit log (who, when, decision, rationale, artifact hash).

#### CA-5 Memory (agent / project / workspace scoping + promotion)
- FR-5.1 (M) The memory service MUST support explicit read/write at three scopes: agent-level (private to one agent), project-level (shared within a project), workspace-level (shared across a workspace/tenant), enforced as hard isolation boundaries (Mem0-style scope IDs: agent_id/project_id/workspace_id/run_id, at least one required per operation).
- FR-5.2 (M) Memory MUST be typed by function — working/short-term (thread-scoped checkpoint), episodic (past interactions), semantic (facts/preferences), procedural (learned workflows) — with type-isolated storage to prevent "heterogeneous memory contamination" (MemGuard, arXiv:2605.28009).
- FR-5.3 (M) Promotion of a memory item from a narrower to a broader scope (agent→project→workspace) MUST be an explicit, governed operation with a configurable approver (human reviewer and/or policy rule); who may approve is defined per project policy profile.
- FR-5.4 (M) Memory writes and promotions MUST be logged with provenance (which agent/human authored it, source, confidence, timestamp).
- FR-5.5 (S) The system SHOULD implement conflict resolution and staleness via temporal validity windows (valid_at/invalid_at, invalidate-don't-delete, prefer newer facts) á la Zep/Graphiti; Mem0's ADD/UPDATE/DELETE/NOOP is a prompted heuristic, not a learned policy, and can lose information on contradiction.
- FR-5.6 (S) Retrieval SHOULD be hybrid (vector similarity + optional graph traversal + recency/temporal filters), scope-filtered by the requesting agent's grants.
- FR-5.7 (M) The CLAUDE.md hierarchy MUST map onto the scope model: enterprise/managed policy → workspace scope; project ./CLAUDE.md → project scope; user ~/.claude/CLAUDE.md → agent/operator scope; CLAUDE.local.md → local/private. More specific scope wins on conflict (as in Claude Code's documented precedence).
- FR-5.8 (C) The system COULD provide consensus-gated memory writes (multi-source agreement before commit, á la A-MemGuard) to defend against memory poisoning.
- FR-5.9 (M) The system MUST provide a memory browser/editor UI for humans to inspect, edit, approve, and expire memory at each scope.

#### CA-6 Per-Agent Tool Access Control
- FR-6.1 (M) Each agent MUST have an individually scoped tool allowlist/denylist expressed in its manifest (capability manifest).
- FR-6.2 (M) MCP servers MUST be scoped per agent (which servers, and which tools/feature-groups within a server).
- FR-6.3 (M) Tool-call authorization MUST be enforced deterministically server-side (hook/interceptor + PDP), not via system-prompt instruction alone; injected instructions MUST NOT be able to widen access (defends against the 36.5% average / 72.8% peak tool-poisoning ASR documented by MCPTox).
- FR-6.4 (M) Every tool invocation MUST produce an auditable authorization decision (allow/deny + policy id + reason).
- FR-6.5 (S) The system SHOULD support permission modes (auto, ask, deny) and dynamic tool loading/search to limit context and blast radius.
- FR-6.6 (S) Tool/permission policies SHOULD be expressed in a reviewable policy language (Cedar preferred for determinism/analyzability — AWS reports Cedar 42–60× faster than Rego with formal verification; OPA/Rego where general-purpose policy is needed).

#### CA-7 Context Management
- FR-7.1 (M) The orchestrator MUST budget the context window per turn and compact/summarize when nearing limits.
- FR-7.2 (M) Subagents MUST run in isolated context windows and return only compressed summaries to the parent (context isolation).
- FR-7.3 (S) The system SHOULD produce durable context-handoff artifacts (progress files/handoff notes) at task boundaries and on interrupts.
- FR-7.4 (S) The system SHOULD guard against context rot (stale/irrelevant accumulation) with retrieval scoping and summarization checkpoints.

#### CA-8 Session & State
- FR-8.1 (M) All session activity MUST be recorded as an append-only event log (event-sourced), forming the system of record.
- FR-8.2 (M) The system MUST support checkpointing and replay from the event log.
- FR-8.3 (S) The system SHOULD support forking/branching sessions and time-travel debugging (rewind to a prior state, alter, re-run).

#### CA-9 Sandboxing & Execution Environments
- FR-9.1 (M) Untrusted/LLM-generated code MUST execute in a hardware-isolated sandbox (Firecracker or Kata microVM); shared-kernel containers are NOT sufficient. gVisor acceptable for compute-heavy, low-I/O, lower-risk tasks.
- FR-9.2 (M) Each task MUST get an isolated git worktree and filesystem; network egress MUST be controlled/allowlisted per policy profile.
- FR-9.3 (M) Sandboxes MUST enforce CPU/memory/time resource limits.
- FR-9.4 (M) Secrets MUST be brokered (short-lived credentials injected at runtime by the vault/broker), never baked into images or written to the sandbox filesystem persistently.
- FR-9.5 (S) The system SHOULD support environment definitions/images per project type and snapshot/restore for multi-turn state persistence (Firecracker initiates code in ~125ms, ~150 microVMs/sec/host, <5 MiB overhead; snapshot restore reaches ~28ms).

#### CA-10 Tool & Integration Layer
- FR-10.1 (M) The system MUST provide an MCP server registry with install, health checks, versioning, and vetting.
- FR-10.2 (M) MCP servers/skills MUST be supply-chain vetted (approved allowlist; scan tool descriptions/metadata for poisoning; pin versions; require auth for remote servers; adopt the 2026 MCP spec's incremental scope consent).
- FR-10.3 (S) The system SHOULD support first-party tool APIs, tool-result caching, and structured tool error handling.
- FR-10.4 (S) The system SHOULD support custom tool authoring (in-process MCP or SDK).

#### CA-11 Observability & Evaluation
- FR-11.1 (M) The system MUST emit OpenTelemetry GenAI traces (invoke_agent → chat → execute_tool span nesting; gen_ai.* attributes; token/cost/latency metrics), with convention strings isolated behind a mapping layer (spec still pre-1.0; v1.42.0 released 12 June 2026, attribute names can still shift).
- FR-11.2 (M) The system MUST provide per-agent/per-project cost, latency, and token dashboards.
- FR-11.3 (S) The system SHOULD support LLM-as-judge evals, regression suites for agents, and replay-based debugging.
- FR-11.4 (S) Prompt/completion content SHOULD be captured as span events (not indexed attributes) and be droppable at the collector for PII control.

#### CA-12 Cost & Resource Governance
- FR-12.1 (M) All model calls MUST route through an LLM gateway that meters every call (including retries and SDK-internal calls, which app-level tracking misses).
- FR-12.2 (M) The system MUST enforce per-agent and per-project budgets with soft-alert thresholds and hard caps.
- FR-12.3 (M) Token/cost MUST be attributable to workspace/project/agent/task via tags.
- FR-12.4 (S) The gateway SHOULD support model routing for cost (cheap models for exploration, frontier for reasoning) and spend-anomaly detection.

#### CA-13 Safety & Security
- FR-13.1 (M) Untrusted content (tool results, retrieved docs, PR titles, web pages) MUST be treated as untrusted; the system MUST apply prompt-injection defenses and MUST NOT allow tool-result content to escalate permissions. (In April 2026 researchers hijacked Claude Code, Gemini CLI, and Copilot via malicious GitHub PR titles, exfiltrating Actions secrets — this is a real, demonstrated class.)
- FR-13.2 (M) The system MUST enforce least privilege for agent identities and provide SIEM-consumable audit logs.
- FR-13.3 (S) The system SHOULD support output filtering/guardrails and an incident-response path for agent misbehavior (kill switch, quarantine agent/identity, revoke credentials).
- FR-13.4 (S) Agent-to-agent communication SHOULD be access-controlled and logged.

#### CA-14 Multi-User / Multi-Tenant / Mixed Teams
- FR-14.1 (M) The system MUST support workspace→project→task tenancy with data isolation between workspaces/tenants.
- FR-14.2 (M) The system MUST implement RBAC and ABAC over both human and agent principals.
- FR-14.3 (M) Tasks/artifacts MUST support handoff in all directions: agent→agent, agent→human, human→agent, with claim/assign/reassign lifecycle.
- FR-14.4 (M) The audit log MUST record who (human or agent identity) did what, when, on which artifact.
- FR-14.5 (S) The system SHOULD provide concurrency control (locking/optimistic concurrency) when humans and agents edit the same artifact, plus real-time presence.

#### CA-15 Domain-Agnostic Projects & Policy Profiles
- FR-15.1 (M) The system MUST model a generic project/workflow abstraction independent of domain (software, 3D design, research).
- FR-15.2 (M) The system MUST support pluggable project templates/blueprints that define the agent roster, tool/skill sets, workflow, and default policies for a project type.
- FR-15.3 (M) Each project MUST carry a policy/compliance profile (data residency, PII/PHI handling, retention, audit level, approval strictness, egress rules) that configures harness runtime behavior; compliance regimes MUST NOT be hardcoded into the harness.
- FR-15.4 (S) Tool/skill sets and agent rosters SHOULD be swappable per project type without code changes.

#### CA-16 APIs & Extensibility
- FR-16.1 (M) The system MUST expose a public REST API + SDK and webhooks.
- FR-16.2 (M) The system MUST support MCP for tool/context integration.
- FR-16.3 (S) The system SHOULD support A2A (Agent2Agent, Linux Foundation, v1.0, AgentCard discovery) for cross-boundary agent delegation; ACP folded into A2A in 2025.
- FR-16.4 (C) The system COULD support a plugin/extension model and AGNTCY/OASF discovery.

#### CA-17 Deployment & Operations of the Harness
- FR-17.1 (M) The harness MUST be self-hostable (Docker Compose for single-node; Helm for cluster).
- FR-17.2 (S) The system SHOULD support horizontal scaling of runners, a durable queue, backup/restore, and documented upgrade paths.
- FR-17.3 (C) The system COULD support multi-region deployment (later phase; interacts with data-residency policy profiles).

### C. Non-Functional Requirements
- NFR-1 (Performance): Interrupt/resume overhead should be negligible relative to LLM latency; sandbox cold-start under a few hundred ms (Firecracker ~125ms boot; snapshot restore ~28ms). Gateway added latency must be bounded (LiteLLM's Python proxy has shown high P99 under high RPS — load-test before standardizing).
- NFR-2 (Scalability): Orchestrator must handle many concurrent long-running workflows with durable timers; runners scale horizontally and are stateless between tasks.
- NFR-3 (Security/Auditability): Every privileged action (tool call, handoff, memory promotion, approval, spend) is authorized by the PDP and written immutably to the event log; SIEM export supported.
- NFR-4 (Extensibility): New project types, tools, and agent roles added via config/blueprints without core code changes.
- NFR-5 (Reliability): No single process failure loses committed work; duplicate-execution prevention on resume; idempotent side effects.
- NFR-6 (Portability): Model-agnostic via gateway; sandbox-agnostic runner interface.

### D. Data Model Concepts (core entities)
- **Workspace/Tenant** (isolation boundary) → **Project** (has a policy profile + blueprint) → **Task/Issue** (lifecycle, assignee, dependencies).
- **AgentManifest** (versioned) and **AgentInstance/Identity** (service account).
- **User** (human identity) and unified **Principal** (human or agent) for RBAC/ABAC.
- **Runtime** (compute env) and **Sandbox/Run** (per-task execution).
- **MemoryItem** (scope, type, content, embedding, provenance, valid_at/invalid_at, confidence).
- **ToolBinding / Permission / Policy** (capability manifest, allowlist, PDP rules).
- **Event** (append-only; the system of record) and **Checkpoint**.
- **ApprovalRequest/Decision**.
- **MCPServer** (registry entry, version, health, vetting status).
- **Budget/SpendRecord** (scope, cap, usage).
- **PolicyProfile** (residency, PII/PHI, retention, audit level, approval strictness, egress).
- **Blueprint/Template** (agent roster, tools, workflow, defaults).

### E. External Interfaces / Integrations
- **LLM providers** via gateway (LiteLLM/Bifrost/Portkey).
- **MCP servers** (tools/context).
- **A2A** (agent-to-agent, later).
- **OpenTelemetry** collector + observability backend (Langfuse/Datadog/etc.).
- **Policy engine** (Cedar/OPA).
- **Secrets vault** (brokered credentials).
- **Sandbox providers** (self-hosted Firecracker/Kata; or E2B/Daytona/Northflank/Modal/AWS Lambda MicroVMs).
- **Git provider / issue trackers** (webhooks).
- **Coding CLIs** driven by the runner daemon (Claude Code, Codex, Cursor Agent, etc.).

### F. How to BUILD it

**Technology recommendations (with tradeoffs):**
- **Orchestration**: Recommend Temporal for the durable macro-orchestration layer (proven: OpenAI's Codex runs on Temporal in production; Replit Agent migrated its control plane to it) paired with the Claude Agent SDK or a thin custom loop for the micro agent-reasoning inside each task. Rationale: LangGraph checkpoints are not durable execution; Temporal supplies failure detection, auto-resume, durable timers for indefinite HITL waits, and dup-execution prevention. Tradeoff: Temporal requires deterministic workflow code and has a learning curve; keep LLM calls in activities, not workflow code, and do NOT wrap an entire agent loop inside a single activity (a failure at iteration 47 restarts from 1). Alternative for a leaner v0: a custom state machine over the event store + a durable queue — lower ceiling, faster start.
- **Agent runtime**: Claude Agent SDK (same engine as Claude Code — hooks, subagents, sessions, built-in tools, MCP, permission system) is the natural fit given the build is in Claude Code and the daemon drives Claude Code. Keep it model-agnostic via the gateway where possible.
- **Database/vector**: PostgreSQL + pgvector (matches Multica; one datastore to operate). Add Graphiti/knowledge-graph only when temporal reasoning over changing facts is needed (later phase).
- **Realtime transport**: WebSocket (gorilla/websocket-style) or SSE for streaming agent output; the event log is the durable backbone.
- **Sandbox**: Firecracker or Kata microVMs for untrusted code; snapshot/restore for multi-turn. Consider E2B/Daytona OSS to avoid building sandbox infra initially.
- **Policy engine**: Cedar (fast, deterministic, analyzable) for authorization; OPA/Rego if you need general-purpose policy across infra too.
- **LLM gateway**: LiteLLM (OSS, per-key/team budgets, tag attribution) for v1; evaluate Bifrost/Portkey if LiteLLM's Python-proxy latency becomes a bottleneck at scale.

**Build sequencing (bootstrapping strategy):**
- **v0 (foundational, "can it run one agent safely?")**: single-node Docker Compose; Postgres+pgvector; one runner daemon; agent manifest with tool allowlist; deterministic tool-call enforcement (hook + minimal PDP); append-only event log; sandbox with brokered secrets; basic run view + live streaming; LLM gateway with a hard budget cap. This is the minimum to start using the harness to build itself.
- **v1 (MUST-have platform)**: durable orchestration + interrupt/approval gates; three-tier memory with scoping + human-approved promotion + memory browser; RBAC/ABAC with human+agent identities; task board with handoff lifecycle; per-project policy profiles + at least two blueprints (software + one non-coding, e.g., research); OTel GenAI tracing + cost dashboards; MCP registry with vetting; autopilots (cron/webhook).
- **v2 (scale & federate)**: knowledge-graph memory + temporal conflict resolution; A2A federation; multi-region + residency enforcement; time-travel debugging; marketplace/plugin model; advanced eval/regression suites and quality scorecards.

**Spec-driven development with Claude Code (the meta-process):**
- Use **GitHub Spec Kit** (`specify init`, `--integration claude`): run `/speckit.constitution` (project principles incl. security/audit invariants), then per feature `/speckit.specify → /speckit.plan → /speckit.tasks → /speckit.analyze → /speckit.implement`. Spec Kit generates spec.md, plan.md, data-model.md, tasks under `specs/NNN-feature/`. Use Spec Kit **workflows** (YAML, with `type: gate` steps and `on_reject: abort`) to encode human review gates between specify and plan.
- Define the specialized roles as **`.claude/agents/` subagents**, each with scoped `tools:` frontmatter, `model:` tier, `permissionMode:`, `maxTurns:`, and `memory:` scope: product/requirements, architect, builder(s), test/QA, security-review, deploy, observability, business-advisor, FinOps. Give each the minimum tools for its job (the core subagent design principle: omitting `tools:` grants every tool). Note that as of Claude Code v2.1.198 the `/agents` wizard is removed — create agents by editing `.claude/agents/*.md` directly or asking Claude.
- Use **skills** (SKILL.md) for reusable procedures (migrations, deploys, eval runs) and **hooks** (settings.json) for deterministic guarantees that must run every time (lint/format/security checks, block-dangerous-command, budget checks) rather than relying on prompt compliance.
- Structure **CLAUDE.md** as the concise pointer document (like Multica's AGENTS.md → CLAUDE.md pattern), keep it <~200 lines, and use the enterprise→project→user→local hierarchy to mirror workspace→project→agent memory scopes.

**Known failure modes / anti-patterns to avoid:**
- Treating LangGraph checkpoints as durable execution (no auto-recovery, dup-execution on concurrent resume).
- Wrapping an entire agent loop inside a single durable activity (loses granular replay).
- Enforcing permissions only in the system prompt (tool poisoning defeats this — MCPTox: 36.5% average ASR, 72.8% peak).
- Unbounded loops with a verifier but no budget ceiling (documented overnight-bill blowups; one agent called a broken tool 400 times in 5 minutes).
- Memory contamination/poisoning and context poisoning (collapsing memory types; letting untrusted content write memory unchecked).
- Over-using multi-agent where a single agent at equal token budget matches or beats it (~15× premium; token usage explains 80% of performance variance).
- Storing prompt/completion text in indexed span attributes (PII exposure).

**Existing OSS harnesses worth studying (honest assessment):**
- **Multica** — closest form-factor match; study its data model and daemon/runtime design; fork-worthy for the board/issue/runtime layer, but weak on permission scoping, HITL, and non-coding domains (your differentiators).
- **OpenHands** (formerly OpenDevin, MIT, ~70k stars, v1.6.0 Mar 2026) — mature sandboxed CodeAct execution, LiteLLM-based model-agnosticism, parallel agent orchestration; coding-centric; excellent reference for the execution plane.
- **Letta** — reference for memory-as-a-runtime; study tiered memory + shared memory blocks (many-to-many block attachment, read-only flags) + per-agent archival scoping; heavier as a whole-platform dependency.
- **LangGraph** — good for micro agent reasoning and namespaced Stores (BaseStore); not a durable orchestrator on its own.
- **Claude Agent SDK** — the runtime you will likely embed; battle-tested internals but Anthropic-centric.
- **SWE-agent / AutoGPT / CrewAI** — study patterns (harness loop, role crews) but not platform bases; CrewAI has the heaviest token footprint on simple tasks.

## Recommendations

**Stage 1 — Lock the foundational decisions before writing specs (this week):**
1. Commit to the brain/hands split and the event-sourced log as system of record. This single decision unlocks audit, replay, and durability.
2. Choose the orchestration substrate: default to **Temporal + Claude Agent SDK**; only fall back to a custom state machine if Temporal's operational weight is prohibitive for v0.
3. Choose **Cedar** for the PDP and **LiteLLM** for the gateway (revisit at scale).
4. Decide sandbox strategy: build on Firecracker/Kata directly, or start on E2B/Daytona OSS to defer sandbox infra.

**Stage 2 — Bootstrap the self-building loop (v0):** Build the minimum from the v0 list above, then immediately move the remaining backlog into the harness itself and drive it with the Claude Code subagents. Benchmark to change course: if per-task sandbox cold-start or gateway P99 latency degrades the dev loop, switch sandbox/gateway tech before adding features.

**Stage 3 — Ship v1 MUST-haves in priority order:** (1) durable interrupt/approval gates + stuck detection; (2) three-tier memory with governed promotion; (3) per-agent tool enforcement + audit; (4) RBAC/ABAC + identities; (5) policy profiles + two blueprints; (6) OTel + cost dashboards. Gate: do not add A2A/knowledge-graph/multi-region until all v1 MUST FRs pass their tests.

**Thresholds that change the plan:**
- If you never run untrusted third-party code and stay Claude-only, you can defer microVMs and use gVisor/containers — but the moment you accept external MCP servers or non-Claude models, microVM isolation and MCP vetting become MUST.
- If multi-agent token cost exceeds ~10–15× single-agent on your workloads without quality gains, collapse to single-agent-with-subagents-on-demand.
- If a project requires HIPAA/SOC2, that is a policy-profile change (residency, retention, audit level, approval strictness), not a harness fork.

## Caveats
- **Vendor-reported vs independently verified**: Multica's star/version counts, LiteLLM/Bifrost latency benchmarks, sandbox boot times (Firecracker's ~125ms and ~28ms restore are from the project/NSDI'20 paper and AWS), the "~90% incident reduction" from sandboxing, memory-benchmark scores (LOCOMO/LongMemEval — actively disputed between Zep and Mem0), Anthropic's 90.2%/15× multi-agent figures, and Personize.ai "Governed Memory" performance numbers are vendor/author self-reported; treat as directional, not audited. MCPTox (arXiv:2508.14925) is peer-reviewed (AAAI 2026).
- **Moving standards**: OpenTelemetry GenAI conventions are pre-1.0 (attribute names can change; June 2026 repo split; v1.42.0 on 12 June 2026) — isolate convention strings behind a mapping layer. A2A is at v1.0 under the Linux Foundation with ACP folded in, but governance features are still thin. MCP's 2026 spec adds incremental scope consent — require it.
- **The "governed memory promotion" gap is real**: no mainstream framework ships a documented human-approval promotion workflow across agent→project→workspace scopes as of mid-2026; you will assemble it from primitives (Mem0 scope IDs, Letta shared blocks + read-only flags, LangGraph namespaces) plus research patterns (A-MemGuard consensus-gated writes, Personize.ai governed-memory quality gates). Budget for this as custom work.
- **Open decisions the person must still make before speccing**: (a) Temporal vs custom orchestrator for v0; (b) self-hosted microVMs vs managed sandbox provider; (c) whether agents get A2A-style external identities in v1 or later; (d) single Postgres+pgvector vs adding a graph store, and when; (e) how strict default approval gates are per blueprint; (f) whether the memory promotion approver is always human in v1 or can be a policy rule; (g) license/model for any eventual open-sourcing.