# Sparstrowgen — Architecture Audit & Findings

Date: 2026-06-18
Source: office-hours session, code-grounded 4-agent audit of this repo
Status: Reference document

---

## TL;DR

**Sparstrowgen is shippable as-is.** It is a real, well-architected, local-first AI agent orchestrator, not a half-built sketch. The stack is the right choice, the memory system is genuinely built and wired, and the core UI loop works end to end. The gap between "I have a factory" and "I'm building a real client website through it" is small:

1. A run does not execute in the project's folder (one ~5-line fix, or a zero-code workaround).
2. Nothing is backed up off the laptop (one afternoon: git the vault + DB, daily auto-push).
3. Verify the embedding model downloaded (2 minutes, optional).

Everything else the founder worried about (huge scale, the stack, cloud, the memory store) is either already fine or a "second machine / paying multi-user load" problem that does not exist yet. Do not re-architect.

---

## 1. What Sparstrowgen is

A **local-first agent harness**: it orchestrates Claude Code / Gemini CLI agents on the local machine, with scoped Obsidian-compatible memory, a task board, pipelines, and cron, behind a web dashboard. (From `package.json`: "local-first agent harness: orchestrate Claude Code / Gemini CLI agents with scoped Obsidian-compatible memory, task board, pipelines, and cron.")

**Structure:** a pnpm + Turbo TypeScript monorepo.
- `packages/shared` — Zod schemas + shared types (agent, project, task, pipeline, cron, memory), event types, constants.
- `packages/core` — Fastify API, SQLite (better-sqlite3 + Drizzle), the orchestrator/run engine, providers (Claude Code, Gemini CLI), the memory subsystem, taskboard, scheduler, terminals, MCP gateway, WebSocket hub.
- `packages/ui` — React + Vite + Radix/shadcn dashboard (TanStack Query/Router, zustand).
- `data/models/fast-bge-small-en-v1.5` — the local embedding model (ONNX) for semantic memory.

**Execution model (the important architectural fact):** a single Node process owns everything.
- `packages/core/src/orchestrator/run-manager.ts` — a `RunManager` singleton holds `active` / `busyAgents` Maps in memory, spawns each agent as a **local OS child process** (`node:child_process` spawn), parses stdout line by line into events, kills via `tree-kill`, enforces a 15-minute timeout, and sweeps orphaned runs on restart.
- Providers are thin CLI wrappers: `providers/claude-code.ts` spawns `claude -p --output-format stream-json`; `providers/gemini-cli.ts` spawns the `gemini` shim via cmd.exe.
- Concurrency is an in-process cap of **4** (`DEFAULT_GLOBAL_CONCURRENCY`, `packages/shared/src/constants.ts`) plus one-run-per-agent, enforced by `tick()`.
- SQLite is opened WAL mode with `busy_timeout=5000`; `db/connection.ts` `backupOnStart()` copies the `.db` into `data/backups/` and keeps the last 5 (all on the same disk).
- The event bus (`events/bus.ts`) is a Node `EventEmitter`; the scheduler (`scheduler/service.ts`) uses in-process croner timers; the pipeline executor runs steps sequentially in-process.

This single-machine design is **deliberate and correct** for a solo founder running a few agents.

---

## 2. The concerns that triggered this audit

The founder raised four worries:

1. **UI / features incomplete** — "from creating the agent to orchestrating it," some pages and the end-to-end flow aren't done as expected.
2. **Scale + stack** — wants this to "scale very huge," and isn't sure the right stack was used.
3. **Cloud backup / durability** — wants everything backed up to the cloud so that even if the laptop dies, the work survives and is usable in the future.
4. **Memory store** — considered Obsidian for memory, unsure how good it is for the purpose.

Underlying all four is a recurring pattern worth naming: a strong pull to make the *factory* bigger and more permanent before shipping anything *through* it. The audit's job was to give the smallest honest answer to each, so the tool gets good enough to ship through and no more.

---

## 3. How the audit was done

Four agents in parallel, read-only, each reading the actual source for one dimension (scale/stack, cloud-backup, memory, UI) and reporting structured findings with file citations. ~270k tokens, 77 file reads of the real codebase. No files were modified and the app was not run.

---

## 4. Findings by dimension

### 4.1 Scale & stack

**Verdict:** the stack is correct and the architecture is the right shape for what this tool is. The only real ceiling is "one laptop, ~4 concurrent agents," and none of the cloud/horizontal-scale work is needed to ship a website.

**Current state:** TS + Fastify + better-sqlite3/Drizzle + React/Vite. Single Node process, local child-process execution, in-process concurrency Map (cap 4), single-writer SQLite (WAL), in-process event bus + scheduler + pipeline executor.

**What couples it to one machine (intentional):**
- Agents are local child processes (`run-manager.ts` spawn).
- State is a local SQLite file; work happens on the local filesystem (`agent.cwd` / `vaultPath`).
- Concurrency and "which run is active" are in-process Maps, not a shared queue. A second machine cannot pick up a queued run.
- `sweepOrphans()` assumes exactly one writer process; two instances on one DB would fail each other's live runs.

**The real ceiling:** the **child-process model**, not the database. SQLite handles thousands of runs/events fine. The practical limit is CPU/RAM per machine (each child is a full Claude Code / Gemini process), so a handful of simultaneous agents on a laptop.

**Needed to ship one website:** nothing about scale or stack. A website is a few sequential agent runs. Ship on the current architecture.

**Defer (until a second machine or paying multi-user load):** Postgres / networked DB; a shared job queue (Redis/SQS/Temporal); horizontal scaling / distributed leases; running agents in the cloud (containers, remote spawn provider); a durable/distributed event bus or scheduler; object storage, multi-tenancy, auth/RBAC (API is bound to 127.0.0.1).

**Recommendation:** stop re-architecting for scale. The execution model is single-machine on purpose and that is appropriate. The only scale-adjacent thing worth doing now is getting backups off the laptop (Section 4.2), which is a config/sync change in hours, not a migration.

### 4.2 Cloud backup & availability

**Verdict:** durable, dead-laptop-proof backup is an afternoon's work (git the vault + the DB). Cloud *hosting* (running while the laptop is off) is a separate, harder, genuinely-deferrable problem you do not need for a website.

**Current state:** backup today is local and fragile. `db/connection.ts` `backupOnStart()` copies `sparstrow.db` into `data/backups/` (keeps 5) on the **same disk**. The vault lives at `C:\Sparstrow\memory` (`DEFAULT_VAULT_PATH`, `shared/src/constants.ts:6`), separate from the repo. The DB lives at `data/sparstrow.db` (`config.ts`). Nothing leaves the machine; there is zero remote component. Migrations (`db/migrations.ts`) are hand-written and deterministic, so schema is reproducible on any machine.

**The correction that matters:** the DB is **NOT** fully rebuildable from the markdown vault. `scanVault()` (`vault.ts:220-316`) only reconciles the vault into the *memory* tables (`memory_notes` / `memory_chunks` / FTS). All operational state lives **only** in SQLite: agents, projects, runs, run_events, tasks, messages, pipelines, pipeline_steps/runs, cron_jobs, settings. Back up only the vault and you lose all orchestration history and config.

**Two more gotchas:**
- The vault is **outside** the repo, so "git init the repo" does not capture memory.
- `.gitignore` excludes `data/`, so "push the repo" silently omits the database.
- WAL caveat: copying `sparstrow.db` while the app runs can capture a torn state; back up with the app stopped, or back up the clean snapshot `backupOnStart` already writes to `data/backups/`.

**Needed now (the backup runbook is in Section 8):** git the vault to a private repo; also back up the SQLite DB (the clean `data/backups/` snapshot) to a private repo; automate a daily push. ~$0.

**Defer:** cloud hosting / always-on execution; SQLite → hosted Postgres/Turso/LiteFS; streaming replication (Litestream → S3); multi-machine/team access; DR runbooks; backing up the model cache (reproducible).

### 4.3 Memory architecture (the Obsidian question)

**Verdict:** the memory system is genuinely built, correctly wired end to end, and architecturally sound for a solo agent factory. "Obsidian" is **not** load-bearing. Nothing needs re-architecting. Ship as-is.

**How it actually works (real, not stubbed):**
- Agents/users write markdown into the vault. `scanVault()` reconciles files into `memory_notes` by sha256 hash.
- `chunker.ts` splits notes (~1600-char sections by `##` heading, 200-char overlap). `indexer.ts` writes FTS5 rows (keyword) and embeds chunks into sqlite-vec (vectors).
- `search.ts` does true **hybrid search**: BM25 over FTS5 + KNN over sqlite-vec, fused with Reciprocal Rank Fusion, scope-filtered, 2 chunks/note cap.
- `injector.ts` runs the agent's prompt as the retrieval query and builds a `<memory>` block (8000-char budget) with a recency fallback when retrieval is empty and a self-injection guard (caps notes the agent authored itself to 3).
- **Embeddings are wired:** `embedder.ts` uses fastembed (BGE-small-en-v1.5, 384-dim, ONNX on CPU, ~100MB model downloaded once to `data/models`); fastembed and sqlite-vec are real declared deps.
- **Degrades gracefully:** if the model download or the sqlite-vec prebuild fails, search silently drops to FTS-only (keyword still works day one, zero setup).
- **Freshness, three ways:** a chokidar watcher with debounced rescan (catches external edits, including Obsidian), an explicit enqueue on agent MCP saves, and a post-run `scanVault`.

**Is Obsidian the right store?** The question dissolves. The code never imports Obsidian. The contract is plain `.md` + YAML frontmatter (via gray-matter), watched with chokidar. Obsidian (or VS Code, or Notepad) is just an optional human viewer. The vault is Obsidian-*compatible*, not Obsidian-*dependent*. Markdown-as-source is a strength: human-readable, portable, and it diffs cleanly in git (which doubles as your backup).

**Known limits (all small at this scale):** the watcher does an O(all notes) rescan per change (fine for hundreds, wasteful at thousands); embeddings are best-effort (a note can be FTS-only until a `/memory/reindex`); `memory_chunks` has no FK cascade (possible orphan rows, search noise only); single-process single-writer assumption.

**Needed now:** nothing in this module. Just add the backup (Section 8) and verify once that the embedder downloaded (memory page status); if not, you are in FTS-only mode, which is fine.

**Defer:** a dedicated vector DB (sqlite-vec brute-force KNN is fine to ~100k chunks); Postgres + pgvector; incremental/changed-files-only indexing; an automatic "embed the FTS-only backlog" sweep; FK cascade hardening; multi-agent write-contention tuning.

### 4.4 UI & end-to-end completeness

**Verdict:** the core loop (agent → project → run → live transcript → tasks/pipelines) is fully built and genuinely wired. The only real blocker to driving a real build is that a run's working directory is not derived from the project.

**What's actually built (real pages, not stubs):**
- `agents.tsx` — full CRUD, enable toggle, "Test spawn" that fires a real run; `agent-form.tsx` covers identity, model, cwd, add-dirs, permission mode, allowed/disallowed tools, memory read/write scopes.
- `projects.tsx` — full CRUD.
- `runs.tsx` — list with filters + "New run" dialog; `run-detail.tsx` subscribes to the WebSocket hub, merges live + fetched events, renders `run-transcript.tsx` (assistant text, collapsible tool calls, cost/turns, stderr), shows injected memory context, and has a working Cancel.
- `tasks.tsx` — full 6-column kanban (create/edit/status/assignee/run-with-assignee/delete).
- `pipelines.tsx` — multi-step chain editor (reorder, per-step agent + onFailure, `{{input}}`/`{{steps.N.output}}` templating) + per-pipeline run list.
- `dashboard.tsx` — health, providers, counts, vault path, active + recent runs.
- `main.tsx` bridges all WS events to React Query invalidation, so lists and run-detail update live.
- The orchestrator behind it (`run-manager.ts` + `providers/claude-code.ts`) is the real thing: spawns `claude -p --output-format stream-json`, streams, times out, finalizes with cost/turns, auto-wires the `sparstrow-memory` MCP server.

**The ONE blocker:** a run's cwd is `agent.cwd ?? opts.tempDir` (`providers/claude-code.ts:73`). `project.rootDir` is captured (`shared/src/schemas/project.ts:9`) but `run-manager.ts` `start()` only reads the project *slug* for memory scoping, never `rootDir`. So a project-scoped run does **not** run in the project's folder; with no `agent.cwd` it runs in a scratch temp dir (`config.tmpDir/<runId>`) that is never surfaced. Website files would be written somewhere you cannot find. (`runCreateSchema`, `run.ts:71`, also has no per-run cwd override.)

**Minor:** `placeholder.tsx` is dead/unused code (no page is a stub). Pipeline-run rows have no deep link into a transcript and a live-refresh key mismatch. Gemini is intentionally disabled ("phase 3") in the agent form. No in-app artifact/file browser after a run.

**Needed now:** make project `rootDir` drive the run cwd (~5-line change in `run-manager.ts start()`: resolve the project, pass `rootDir` as spawn cwd, fall back to `agent.cwd`, then tempDir). OR, zero-code: create one agent with `cwd` = the Seelin website folder, permission mode bypass, tools incl. Read/Edit/Write/Bash (the agent form already supports this). Optional 10-min nicety: surface the run's effective cwd on `run-detail.tsx`.

**Defer:** Gemini enablement; in-app artifact/diff browser; pipeline deep links; cron/schedule/terminals/messages polish; any cloud/scale UI.

---

## 4.5 gbrain vs Sparstrowgen's memory (considered 2026-06-18)

Question raised: use **gbrain** (github.com/garrytan/gbrain) instead of the markdown memory?

gbrain is Garry Tan's AI memory/knowledge/code brain: markdown source synced to Postgres/PGLite, hybrid retrieval (vector + BM25 + RRF + reranking), an auto-built knowledge graph from wikilinks, a synthesis layer (cited answers), git cross-machine sync, and an MCP server. Mature (23k stars, MIT, production-deployed).

**Notable:** that is the SAME architecture Sparstrowgen's memory already uses (markdown source + DB index + hybrid vector/BM25/RRF, git-syncable, MCP). Sparstrowgen is a smaller bespoke version of the same pattern, which is a good sign the design is sound.

**Decision, split by role:**
- **Sparstrowgen's internal agent memory: KEEP it.** It is wired into the agent model: per-agent read/write scopes, scoped `<memory>` injection per run, agent write-back via the MCP gateway, the global/project/agent hierarchy. gbrain provides retrieval/synthesis but NOT that scoping-and-injection glue, which you would rebuild on top of it anyway. Migrating costs effort, risks a working subsystem, helps the website zero, and gbrain's fast v0.41 release cadence is a lot of churn for a core subsystem. Do not migrate now.
- **Your own cross-project knowledge/code brain: gbrain is a great fit, separately.** Mature, MIT, maintained by others, git-synced across machines (addresses the durability worry for YOUR knowledge), MCP into Claude Code. Additive and low-risk; a `/setup-gbrain` away; does not touch Sparstrowgen.
- **Future option:** if Sparstrowgen ever outgrows its memory (wants synthesis, a graph, multi-user), adopt gbrain as the backend rather than build more. Later, after the website and Jameel.

---

## 5. The finish list before the Seelin website

The whole gap, nothing more:

1. **Working directory:** wire `project.rootDir` into the run cwd (~5 lines in `run-manager.ts`), OR zero-code, set `agent.cwd` to the site folder on a dedicated build agent.
2. **Backup:** git the vault + the DB to private repos with a daily auto-push (Section 8).
3. **Verify embedder:** confirm the BGE model downloaded (memory page status). Optional; FTS-only is fine if not.

Not a rewrite. Not a cloud migration. Not a new stack. Not a memory overhaul.

---

## 6. Explicitly deferred (do NOT build now)

Postgres / networked DB; job queue (Redis/SQS/Temporal); horizontal scale / distributed leases; cloud execution of agents (containers, remote spawn); durable/distributed event bus + scheduler; vector DB (Qdrant/Pinecone/Weaviate); Postgres + pgvector; incremental indexing; auth / RBAC / multi-tenancy; object storage; streaming replication; in-app artifact browser; Gemini provider.

Revisit any of these only when there is a second machine, a always-on hosting need, or paying multi-user load. Until then they are premature re-architecture.

---

## 7. Backup runbook (do this before a paying client)

Goal: a dead/lost/stolen laptop loses nothing. ~$0, one afternoon.

1. **Back up the vault (human-authored memory):**
   - `cd C:\Sparstrow\memory`
   - `git init`, create a **private** GitHub repo, add it as remote, commit and push.
   - Plain markdown diffs cleanly and versions every change.
2. **Back up the SQLite DB (irreplaceable orchestration state):**
   - The DB holds agents/projects/runs/tasks/messages/pipelines/cron/settings, which the vault does NOT contain.
   - Use the clean snapshot `backupOnStart` writes to `data/backups/` (or stop the core app first so the WAL is checkpointed).
   - Commit that `.db` to a private repo (or a `/backup` subfolder of the vault repo).
3. **Automate:** one Windows Task Scheduler job daily that runs `git -C C:\Sparstrow\memory add -A && commit && push` and the same for the DB-backup repo.
4. **Write down the restore procedure:** clone both repos on a new machine; normal boot auto-applies migrations; drop the backed-up `.db` into `data/`; `scanVault` rebuilds the memory index on first run.

Do NOT back up: `.env` (secret, keep gitignored) or the model cache (reproducible).

---

## 7.1 Multi-machine sync (later, when you have 2-3 laptops)

"Sync everything across laptops" is three separate problems; two are basically free (git).

1. **Code (Sparstrowgen + each app/project repo) → git/GitHub.** Sparstrowgen is a repo; each app it builds is its own repo. Clone on each laptop; commit/push/pull. Standard.
2. **Memory vault (markdown) → git/GitHub** (private repo for `C:\Sparstrow\memory`). Text, diffs/merges cleanly; clone gives a new laptop all memory. Same move as the backup runbook, backup and multi-machine sync are the same substrate.
3. **Operational DB (`sparstrow.db`: agents/runs/tasks/pipelines/cron/settings) → the only hard part.** Binary; git can store but not merge. Depends on usage:
   - **One laptop at a time (realistic solo):** pull-before-start / push-after-stop around the clean DB snapshot (app closed). No concurrent writes = nothing to merge. Simplest. Do this at second-laptop time.
   - **Truly simultaneous use:** one shared cloud DB. Turso/libSQL is the near-drop-in (SQLite-compatible, Drizzle-supported); Postgres is the heavier option. Requires revisiting the single-writer assumption (`sweepOrphans`). Real work; DEFER until multiple machines are actively in use.

**Do NOT:** put the live SQLite DB in Dropbox/OneDrive/iCloud/Syncthing (they corrupt open SQLite files), use git (app stopped) or a hosted DB instead. Vault + code in those tools is fine. Never sync `.env` via git (copy per machine); the embedding model re-downloads (reproducible); tmp artifacts are throwaway.

**Gotcha:** the DB stores ABSOLUTE paths (`agent.cwd`, `project.rootDir`, vault path). They will not match across laptops with different usernames. Standardize the install path on every machine (always `C:\Sparstrow\...`) or store relative paths resolved at runtime. Cheap to decide now, annoying to retrofit.

**Discipline:** the cheap 80% (git the vault + code/projects) IS the backup runbook, so it comes for free. The expensive 20% (shared cloud DB) is a "when you actually run 2-3 laptops at once" upgrade. Don't build it before the website.

---

## 7.2 Multi-user (much later, and probably not the way you'd expect)

Adding human users is NOT a feature; it turns Sparstrowgen from a single-user local-first tool into a hosted multi-user platform. It requires: real accounts + auth, network access (it is bound to 127.0.0.1 today), per-user ownership + RBAC, and a real security model. The audit already flagged this whole cluster (auth/RBAC/multi-tenancy/cloud execution) as DEFER. This is the months-class version.

**Multi-user forces cloud hosting:** a hire (especially remote) cannot use a localhost tool on your laptop, so the service + the CLI agents must run on a server (the execution rewrite). And the "users" command Bash-capable, file-writing agents, so access control here is heavier than normal SaaS RBAC (a hire's agent with shell on a shared box is a real blast radius).

**The simple model for your first hires (do THIS, not the platform):**
- They work in their OWN environment / their own Sparstrowgen instance.
- Collaborate via GitHub: shared repos for code, a shared board (Issues/Projects/Linear) for tasks.
- Sparstrowgen stays YOUR cockpit. No auth, hosting, or RBAC to build.
- Isolation by separate instances is simpler AND safer than RBAC inside one shared instance.
- Most early hires need the code + the tasks, not a login to your orchestrator.

**Forward-looking note (know, don't build):** the memory scope system (global/project/agent) is the right foundation for per-user later, a "user" is just another owner dimension on those scopes. Extend it later; don't rip it out; don't deepen single-user assumptions now.

**Build real multi-user (auth + RBAC + hosting) only if:** (a) Sparstrowgen becomes a product you sell, or (b) a funded team must operate inside one shared instance. Until then: GitHub collaboration + per-person instances. Not before the website, not before revenue.

---

## 8. Strategic note: the pattern to watch

All four concerns were about making the factory bigger and more permanent; none were about the website or the first customer. That is the recurring gravity: building the machine is more fun than shipping the thing customers pay for. The audit's conclusion is the antidote: the factory is ready; the real remaining work is a 5-line change plus an afternoon of backups. Finish it **by using it** on the Seelin website. Let the website be the deadline and the definition of done. Anything the website does not need, defer.

---

## 9. Next step

A focused **verify-and-build** session (not office hours):
1. Boot the service; confirm one trivial run executes (Claude Code spawns, a memory note persists, the UI shows live events).
2. Apply the cwd fix, or create a dedicated build agent with `cwd` = the Seelin site folder.
3. Set up the backup (Section 7).
4. Create the Seelin project + build agent, fire the first real run, and build the website through the tool.

---

## Appendix: key files referenced

- Orchestration: `packages/core/src/orchestrator/run-manager.ts`, `orchestrator/pipeline-executor.ts`, `orchestrator/handoff.ts`, `orchestrator/preamble.ts`
- Providers: `packages/core/src/providers/{types,claude-code,gemini-cli,index}.ts`
- Data: `packages/core/src/db/{schema,connection,migrations}.ts`; `packages/shared/src/constants.ts`; `packages/shared/src/schemas/*.ts`
- Memory: `packages/core/src/memory/{vault,chunker,indexer,embedder,search,search-store,injector,watcher,scopes,agent-memory}.ts`
- Infra: `packages/core/src/{config,lifecycle,index}.ts`, `events/bus.ts`, `ws/handler.ts`, `scheduler/service.ts`, `terminal/manager.ts`, `mcp/http-mcp.ts`
- API: `packages/core/src/api/server.ts`, `api/routes/*.ts`
- UI: `packages/ui/src/routes/pages/*.tsx`, `components/agent-form.tsx`, `components/run-transcript.tsx`, `router.tsx`, `main.tsx`
- Vault location: `C:\Sparstrow\memory` (outside the repo); DB: `data/sparstrow.db`; `.gitignore` excludes `data/`
