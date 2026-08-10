# Sparstrowgen — Daemon + Cloud Control Plane

| | |
|---|---|
| **Status** | Approved 2026-08-09 · M1 complete · M2 complete · auth hardening complete 2026-08-10 · M3 next |
| **Supersedes** | The "Phase 4: Multi-Agent Swarm Orchestrator & Live Transcripts" proposal |
| **Tasks** | `doc/tasks/MasterTaskQueue.md` (bands 1–4 done · band 5 = M3, decomposed 2026-08-10) · `doc/tasks/M2/` · `doc/tasks/M3/` |
| **Open questions** | OQ-1 (uncommitted work) — parked for M4; blocks nothing in M3 |

> **Why the original Phase 4 proposal was replaced.** It described three features
> — live streaming transcripts, a GOAP/delegation visualizer, and a HITL
> attention queue — that were already built in `@sparstrow/ui` and
> `@sparstrow/core`. `run-detail.tsx` already merges live WebSocket frames with
> fetched events by `seq`; `goal-graph.tsx` is already a React Flow canvas over
> plan nodes; `attention-queue.tsx` already renders question/approval/review rows
> with working mutations. What was actually missing — and what this plan builds —
> is the transport underneath all three.

## Context

Sparstrowgen today is a single-machine, local-first agent runtime. `@sparstrow/core`
is a Fastify daemon on `127.0.0.1:48750` backed by SQLite, serving a Vite SPA
same-origin with a per-install bearer token.

The goal is a **daemon-per-machine runtime** (Windows, macOS, …) driving the agent
CLIs and models already installed and authenticated on each box — the Multica
model — with a Next.js frontend served both on the web (`app.sparstrow.com`) and
inside the Electron shell.

**What blocks it today:** `apps/web` has no connection to core at all. It fetches
relative `/api/v1` URLs and dials a relative `/ws`, which only resolve under the
Vite dev proxy or the packaged same-origin build. `next.config.ts` has no
rewrites, there are no route handlers under `app/api/`, and nothing injects the
token. There are zero Supabase/Postgres references in `packages/core/src`. Phase 3
wired Supabase Realtime to React Query invalidations for queries that cannot
currently resolve. A Vercel-hosted app can never reach `127.0.0.1:48750`, so the
missing piece is the **daemon ↔ control-plane spine**.

**Already scaffolded:** `packages/shared/src/db/schema.ts` is a Postgres
control-plane schema (`runtimes`, `targetRuntimeId` on tasks and runs,
`paused_hitl`, pgvector notes) with migration `0000_narrow_revanche` generated.
Nothing imports it.

**Measured evidence** (read-only query against `data/sparstrow.db`): 27 runs /
613 run_events / 1.33 MB = **~50 KB per run**, heaviest run 615 KB. 500 MB free
tier ≈ 10,200 runs; 8 GB Pro ≈ 167,000. `tool_result` payloads are 62% of bytes
(avg 4.9 KB, max 16.9 KB — under the 256 KB Realtime cap). Transcript storage is
not a near-term constraint, which is why transcripts go to cloud unarchived.

---

## Settled decisions

**1 — Data placement.** Cloud is the board and durable store; local keeps only
what is latency-critical or machine-bound.

- **☁️ Postgres:** workspaces/users/members, `runtimes`, `runtime_projects`,
  agents, agent_instances, projects, project_directives, teams+members+projects,
  tasks, task_questions, goals, plan_nodes, plan_edges, messages, runs,
  **run_events**, chat_sessions, chat_messages, pipelines(+steps,+runs),
  cron_jobs, skills(+files,+agent_skills), skill_imports, memory note content,
  dispatch queue, daemon tokens.
- **💾 Local SQLite:** `memory_chunks` / `memory_fts` / `memory_vec` (`float[384]`,
  derived — `reindexAll()` rebuilds), local mirror of memory notes, machine-scoped
  `settings`, offline event buffer.
- **📁 Local files, never synced:** `vaultPath` markdown (memory source of truth),
  `~/.sparstrow` secrets, `.api-token`, `dataDir/agents`, `dataDir/models`, graph
  store, tmp/logs, project working trees.
- **📦 Drive:** memory vault mirror. Transcript/chat archiving deferred.
- **Memory model:** cloud is durable + the cross-machine sync hub; each daemon
  reads its **local** index (sub-15ms, offline-tolerant). Writes local-first then
  push. Only note *content* syncs — every machine embeds with the same local
  384-dim model, so embeddings never cross the wire and the cloud needs **no
  vector column**. Last-write-wins; notes are append-mostly, one topic each. Do
  not build a CRDT.
- **Projects:** identity in cloud, bytes wherever the developer wants (local or
  GitHub). `project_not_available` gets four actions: **relink**, **clone from
  `gitRemote`**, **unbind/delete**, **reassign**.

**2 — Transport.** Outbound WS wake over durable command rows. Commands are
Postgres rows with claim/lease/ack and an idempotency key; the per-runtime
Realtime channel is the **doorbell only** (at-most-once — never trust it for
delivery); ~3s polling is the always-on fallback. The WS connection doubles as
the liveness signal for `runtimes.status`. Transcripts take a **dual path**: live
deltas broadcast over Realtime, events batched to Postgres every N events or ~1s.
The UI dedupes by `seq` — `run-detail.tsx:37` already does this; reuse it.

**3 — Degradation.** Buffer and resync. In-flight runs survive network blips;
events buffer locally and replay oldest-`seq`-first on reconnect. New work isn't
accepted while offline. This is nearly free — correct batching already requires a
retry buffer.

**4 — Auth and shell.** Pairing code → daemon token scoped to **one workspace and
one runtime**, revocable from the UI, stored in the existing encrypted
`~/.sparstrow` (`secretsDir`) — built precisely for this class of secret. Electron
loads the **hosted** Next app (no version skew against a migrating schema) and
renders a native offline screen when unreachable.

> ⚠️ **Security consequence, accepted knowingly.** Once dispatch is
> cloud-canonical, anyone who can write a task row targeting your runtime can
> cause code to run on your machine. Postgres **RLS becomes the security
> boundary** — workspace-scoped policies are mandatory new work, not optional.
> Core's existing `effectiveTools` resolution and the P3 delegation subset check
> still clamp capability at spawn.

---

## Milestones

### M1 — Cloud schema, RLS, pairing ✅ DONE (applied to staging 2026-08-09)

**Shipped:** 36 tables (`0000_special_romulus`), 25 FK indexes (`0001_flat_justin_hammer`),
RLS on all 36 with 45 policies, 11 tables in the realtime publication. Verified
live on `db.pnymngoqseltgigcfevq`: 0 tables without RLS, 0 tables with RLS but no
policy, 0 missing FK indexes, and a 10-assertion cross-workspace isolation test
passing (reads, writes, and the `daemon_tokens.token_hash` column all denied).
565 workspace tests still green.

**Applied `supabase-postgres-best-practices` and changed three things:**
- Policies use `workspace_id in (select private.current_workspace_ids())` — a
  zero-arg set-returning helper that Postgres hoists into a single InitPlan.
  The obvious `is_workspace_member(workspace_id)` form takes the row's column
  as an argument and runs per row.
- Helpers moved to a `private` schema so PostgREST cannot expose them as RPC.
- 25 unindexed FKs found and fixed (Postgres does not create them automatically).

**Also found:** a column-level `REVOKE` on `token_hash` is silently ineffective
while the role holds table-level `SELECT` — the table grant must be revoked
first, then safe columns granted back.

*(original scope below)*

`packages/shared/src/db/schema.ts`, `packages/shared/drizzle/`

- Drop `memory_notes.embedding`; delete `projects.rootDir`.
- Add `runtime_projects(runtime_id, project_id, local_path, state, last_seen)`.
- Add the board tables missing from the cloud schema: `run_events`,
  `chat_sessions`, `chat_messages`, `task_questions`, `goals`, `plan_nodes`,
  `plan_edges`, `pipelines`, `pipeline_steps`, `pipeline_runs`, `cron_jobs`,
  `skills`, `skill_files`, `agent_skills`, `skill_imports`, `teams`,
  `team_members`, `team_projects`, `agent_instances`, `messages`.
- Add `runtime_commands` (claim/lease/ack + idempotency key) and `daemon_tokens`.
- **Reconcile task status vocabulary** — local `inbox`/`waiting_children`/… vs
  cloud `backlog`/`todo`/`in_progress`/`review`/`done`. Pick one; translation at
  the boundary is a bug farm.
- RLS policies on every table, scoped by `workspace_id`.

### M2 — Web app actually reads the cloud ✅ DONE (2026-08-10)

**Shipped:** one catch-all route dispatching to 16 handler modules over
supabase-js with the caller's session, jsonb-aware case conversion, server-side
workspace resolution, health derived from `runtimes`, and honest 501s for
host-local and runtime-dependent endpoints. `packages/ui` untouched, as planned.

**Verified against live staging** with real sessions for three users: 40/40
endpoints land in their specified A/B/C category, 24/24 functional round-trips
persist and read back, cross-workspace read *and* write are denied in both
directions, jsonb payloads survive unmutated, and 577 workspace tests are green.

**Nine defects found and fixed during verification**, none of which typechecking
or the unit tests would have caught:

1. **Bootstrap was impossible.** M1's RLS deadlocked a new user's first write
   two separate ways. Fixed in `003_bootstrap_fix.sql` — which existed but had
   never been applied to staging, so every authenticated request 500'd.
2. **Bootstrap was not atomic.** Three PostgREST inserts with no transaction:
   partial failure orphaned a workspace, and two concurrent first-requests gave
   a user two workspaces and a permanent 400 with no picker to escape through.
   Moved into `bootstrap_workspace()` with an advisory lock (`004`).
3. **Co-members counted as your own memberships.** `getActiveWorkspaceId` read
   `workspace_members` without filtering by `user_id`. RLS deliberately exposes
   your co-members' rows, so any workspace with two people locked *everyone* in
   it out of every endpoint. The single worst bug of the phase, and invisible
   until a workspace had more than one member.
4. **Static routes lost to `:id`.** First-match-wins ordering meant
   `/agents/imports` resolved as an agent named "imports". Router now orders by
   specificity.
5. **`POST /goals` was registered twice**, and the real insert shadowed its own
   501 stub — creating goals with no plan nodes.
6. **`/agents/imports` queried a table that does not exist** (`agent_imports`;
   the real one is `skill_imports`).
7. **The attention queue 500'd** on a `task_id` filter against a table with no
   such column, and computed `NaN` ages from a `created_at` that does not exist.
8. **`POST /messages` was missing entirely** although the UI calls it.
9. **Skill assignments could wipe the workspace.** Delete-all-then-insert across
   two round trips: a failed insert left every assignment deleted. Moved into
   `set_agent_skill_assignments()` (`006`).

Also: cross-workspace writes reported success while doing nothing (delete now
verifies rows were affected), and unknown-column bodies returned 500 rather
than 400.

**Not verified:** anything requiring a rendered page. Sign-in needs a password
typed into a form, which an agent cannot do — see **OQ-2**. The API layer those
pages consume is fully exercised, so what is unproven is rendering, not data.

*(original scope below)*

Implement the `/api/v1` surface as Next route handlers backed by Supabase, using
the user's session server-side. **This leaves `packages/ui/src/api/hooks.ts` and
`packages/ui/src/lib/api.ts` untouched** — ~1400 lines of working react-query
hooks keep their contract, and the same API surface serves web and desktop.
Realtime subscriptions stay direct from the browser as they are today in
`providers.tsx`.

### M3 — Pairing, registration, heartbeat
`packages/core/src/cloud/` (new): `client.ts`, `pairing.ts`, `registration.ts`

- `sparstrow pair <code>` exchanges a short-lived code for a daemon token; store
  via the existing encrypted secrets path in `config.secretsDir`.
- Register the runtime with hostname, OS, `isElectron`, and capabilities probed
  from `listProviders()` in `packages/core/src/providers/index.ts`.
- Heartbeat + `runtimes.status` transitions.

### M4 — Command spine
`packages/core/src/cloud/commands.ts`, `packages/core/src/orchestrator/run-manager.ts`

- Realtime subscribe + 3s poll fallback; claim by row with lease and ack.
- Dispatch to the existing `runManager.createRun()` — the runner itself does not
  change.
- **Project preflight on claim:** verify the `runtime_projects` binding; on miss,
  set `blocked: project_not_available` rather than failing the task.

### M5 — Transcripts (Phase 4's headline)
`packages/core/src/cloud/transcripts.ts`, `packages/core/src/events/bus.ts`

- Subscribe to the existing event bus; batch `run_events` to Postgres every N
  events or ~1s; broadcast live deltas over Realtime.
- Offline buffer with a spill ceiling; replay oldest-`seq` first on reconnect.
- `/runs/[runId]` should light up with no UI rewrite — the seq-merge in
  `packages/ui/src/routes/pages/run-detail.tsx` already handles it.

### M6 — Memory sync
`packages/core/src/cloud/memory-sync.ts`, reusing `packages/core/src/memory/`

- Push local note content on write (after the existing `vault.ts` file write).
- Pull foreign notes → write markdown into the local vault → index through the
  existing `indexer.indexNote()` / `reindexAll()`. Embeddings computed locally.
- Last-write-wins on `contentHash` / `updatedAt`.

### M7 — Route parity and Electron
`apps/web/src/app/`, `packages/desktop/src/main.ts`

- Add the five missing routes whose UI pages already exist: `goals`/goal-detail,
  `imports`, `projects/[projectId]`, `skills/[skillId]`, `teams/[teamId]`.
  `/imports` is in the sidebar (`app-shell.tsx:69`) and 404s today.
- Point `mainWindow.loadURL` (`main.ts:100`) at the hosted app; add a native
  offline screen.

---

## Scope boundaries and deferred work

- **Host-local features cannot move to cloud.** Terminal PTY, `host-fs` browsing,
  git ops, and provider discovery are inherently daemon-local. In the hosted web
  app they are unavailable; in Electron they go over the IPC bridge — which is
  already **Phase 6** in the existing roadmap. Do not attempt them in M1–M7.
- **HITL gate redesign — deferred at your request.** `tasks.hitlApproved` and
  `runs.status: paused_hitl` exist in the cloud schema; build the spine so they
  remain available, but do not build UI against the current shape.
- Transcript archiving to Drive, chat archiving, and vault→Drive mirroring are
  deferred until real usage numbers justify them. ⚠️ If transcript archiving is
  ever enabled it **must** be gated on dream-cycle signal extraction having
  completed for that run — otherwise the factory silently stops learning from its
  own work, with no error.
- Semantic memory search from mobile would require re-adding a 384-dim vector
  column and pushing embeddings. Postgres full-text is likely enough for browsing.

---

## Verification

**M1** — `drizzle-kit generate` produces a clean migration; apply to a scratch
Supabase project. Write RLS tests: a member of workspace A cannot select, insert,
or update any row in workspace B.

**M2** — With the daemon stopped, load each route in `apps/web`. Every page
renders real data or a legitimate empty state; no request 404s or 401s. This is
the pass/fail for "the web app is connected", which is false today.

**M3** — Run pairing on this Windows machine; confirm a `runtimes` row appears
with `os: win32` and capabilities including `claude-code` and `ollama`. Kill the
daemon; confirm status flips to `offline` within the heartbeat window.

**M4** — Queue a run from the web UI; confirm it executes locally and reaches
`succeeded`. Then unbind the project and queue again: the task must land in
`project_not_available` with relink/clone/unbind/reassign offered — not fail.

**M5** — Start a long run; watch `/runs/[runId]` from a second device and confirm
live streaming. Mid-run, disconnect the daemon's network for 60s; on reconnect the
transcript must be complete and correctly ordered with no gaps or duplicate `seq`.
Compare the final cloud `run_events` count against the local buffer count.

**M6** — Save a note on machine A; confirm it appears in machine B's vault as
markdown and is returned by `memory_search` on B. Verify B computed its own
embedding (no vector crossed the wire).

**M7** — Every sidebar entry in `app-shell.tsx` resolves; `/imports` no longer
404s. Launch Electron with networking disabled and confirm the offline screen
renders instead of a blank window.

**Regression** — `pnpm test` across the workspace; the existing 346+ core tests
must stay green, since M1–M7 add a cloud layer rather than altering the runner.
