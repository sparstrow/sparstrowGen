# Phase 6 Foundation — Hosted Multi-Tenant Architecture

> **Status: planned, activated.** This is the buildable foundation for the transition described
> in [`multi-tenancy-access-architecture.md`](./multi-tenancy-access-architecture.md). That
> document remains the *vision* (cloud transition, RBAC intent, Deep-Fork workflow); this one is
> the *architecture and sequencing* for the substrate it needs. It supersedes nothing.
>
> Phases here are lettered **6a–6f** so they never collide with the factory's existing Phase 1–5
> build numbering or with autoplan's review phases.
>
> Design session: 2026-07-26. Decisions below were made by the owner at each gate.

---

## 1. Context and premise

Sparstrowgen is a single-user, local-first agent factory: Fastify core + SQLite + Vite/React +
Electron, with a capability governance model (tool cascade, memory scopes) that is the product's
main technical asset.

The owner has decided to go **multi-workspace and multi-user**, deployed on **Supabase + Vercel**.
This document specifies how, and in what order.

### 1.1 Stack decisions

| Component | Decision | Rationale |
| --- | --- | --- |
| Backend language | **Stay TypeScript.** No Go. | Vercel and Supabase are TypeScript-native. A Go backend needs a third host, breaking the deployment plan, and reintroduces a polyglot type boundary. Multica pays for that boundary with an entire defensive API-compatibility discipline (`parseWithFallback`, malformed-response tests, no casting network JSON). All-TypeScript means `@sparstrow/shared` spans every tier and that tax is never paid. |
| Database | **Postgres via Supabase.** | Forced by hosted multi-user. Drizzle carries over: `sqliteTable` → `pgTable`. |
| Vector search | **pgvector**, replacing `sqlite-vec`. | Same 384 dimensions, same cosine distance, same query shape. |
| Embeddings | **`fastembed` stays local, in the daemon.** | BGE-small-en-v1.5, ONNX on CPU. Embedding happens free on the daemon; only the vector reaches Postgres. No embedding API is ever paid for. |
| Frontend framework | **Stay Vite + React 18 + TanStack Router.** No Next.js. | The UI must run identically in an Electron renderer and in a browser. A Vite SPA is one artifact for both. Next.js's value is server rendering, which Electron cannot use, so adopting it forces two shells — exactly what Multica maintains (`next` in `apps/web`, `react-router-dom` in `apps/desktop`). Multica's shared views are deliberately framework-neutral, so their interface is portable to Vite without adopting their framework. Reaffirms the constraint set in intake `0012`. |
| Desktop | **Electron**, unchanged. | Now hosts the daemon. |
| Auth | **Supabase Auth + RLS.** | |

**Net change: two lines.** SQLite → Postgres, and the addition of hosted auth. Everything the
codebase is built on stays. This is a database and tenancy project, not a stack migration.

### 1.2 Cost reality

The plan must not rest on "free":

- **Vercel Hobby prohibits commercial use.** An internal company tool qualifies. Budget Pro
  (~$20/mo/member).
- **Supabase free permits commercial use** but pauses after 7 days idle, caps at 500 MB, and has
  no backups. Pro is $25/mo.
- Expect **~$45/mo** once real. Memory volume (pgvector + HNSW index against 500 MB shared RAM) is
  the limit most likely to be crossed first — before run data or storage.

---

## 2. Tier architecture

```
┌─ Control plane ─────────────────────────────────────┐
│  Vercel:   UI + server-secret routes (cron, webhooks,│
│            OAuth callbacks) as plain functions        │
│  Supabase: Postgres + Auth + Realtime + RLS + Storage │
│  owns:     all durable state, policy resolution       │
└──────────────────────┬──────────────────────────────┘
                       │ Supabase client (user JWT, RLS-scoped)
                       │ + register / heartbeat / claim
┌──────────────────────┴──────────────────────────────┐
│  Local daemon (Node, hosted by Electron)            │
│  owns:  execution only — spawn, stream, terminals    │
│  holds: the user's device-only credentials           │
└─────────────────────────────────────────────────────┘
```

### 2.1 Module placement

| Stays in the daemon | Moves to the control plane |
| --- | --- |
| `orchestrator/` — run-manager, tool-loop, handoff, one-shot, child-env, preamble, untrusted | `goap/`, `graph/` — planning, not execution |
| `providers/` — claude, antigravity | `scheduler/`, `cron` — must fire with no daemon awake |
| `terminal/` — node-pty | `memory/` write path — scoping must be server-enforced |
| `mcp/`, `agent-gateway` | `taskboard`, `projects`, `agents`, `skills`, `teams`, `goals` |
| `secrets/` — device-only tier | `settings` → split into workspace and user scopes |

### 2.2 Two decisions that make this work

**The daemon is a first-class Supabase client.** It authenticates with the user's own JWT; RLS
enforces workspace scoping in the database. There is no bespoke API layer to keep in sync. This is
a structural advantage over hand-written backends, where per-workspace filtering is enforced by
developer discipline rather than by the engine.

**Effective-tools resolution moves server-side.** Today `resolveRunEffectiveTools` runs in-process.
A daemon that resolves its own policy can widen its own permissions — acceptable when a user can
only attack themselves, unacceptable once daemons are shared. The control plane resolves the
cascade and writes the snapshot; the daemon reads it as given. See §5.

---

## 3. Data model, storage, and sync

### 3.1 There is no sync layer

Once Supabase is the system of record, the desktop app is a **client**, not a local-first replica.
So is the web app. Both read and write the same Postgres and receive pushes over Supabase Realtime.
A task created in Electron is inserted and appears in the web app in roughly 100 ms.

No sync engine, no conflict resolution, no offline reconciliation. Avoiding that problem class is a
substantial part of the value of the tier split.

### 3.2 Storage classes

| Class | Contents | Location | Rationale |
| --- | --- | --- | --- |
| **A. Shared record** | Projects, agents, tasks, runs, skills, teams, goals, memory notes, pipelines, settings | Supabase Postgres | Both clients need it; RLS scopes it |
| **B. Device only** | Working trees, `device_only` credentials, `node-pty` sessions, repo checkouts | Local disk / OS keychain | Too large, too sensitive, or meaningless off-machine |
| **C. Machine-scoped binding** | Where a project lives on a given machine | Supabase, keyed by runtime | Shared fact, machine-specific value |

### 3.3 Source code is never stored in Supabase

Postgres is not a source-tree store. Supabase holds the **project record** (name, slug, directives,
tool policy, execution profile, staging branch) plus **typed resource pointers**.

- **Git syncs code.** GitHub is the durable, shareable copy.
- **Supabase syncs metadata.** Ownership, policy, history.

**Project resource types — two, not three:**

| Type | Bytes live | Who can execute against it |
| --- | --- | --- |
| `git_repo` | GitHub, plus clones per machine | **Any daemon** — clones on demand |
| `local_directory` | Specific machines' disks | Only daemons with a bound path |

A `managed_files` type was considered and **rejected**: versioned text artifacts are simply
`git_repo` projects whose contents are documents, and the binary cases that motivated it are run
artifacts (§3.5), not project content. It may return later as an additive third type if a genuinely
binary-content project appears; nothing here precludes it.

### 3.4 `projects.rootDir` must be split

Today `projects.rootDir` holds a single absolute path (e.g. `D:\Sparstrow\Sparstrowgen`). It is
meaningless on another machine and in a browser, and cannot survive multi-user.

```
projects.git_remote                                    → shared, in Supabase
runtime_project_paths(runtime_id, project_id, path)    → per-machine binding
```

A task targeting a `local_directory` on a machine that lacks it **parks**, and does not fail. See
§6.4.

### 3.5 Run data — four channels

`run_events` is append-only and high volume. Roughly 5,000 events per run at ~500 bytes is ~2.5 MB
per run; at 20 runs/day that exhausts a 500 MB database in about ten days. Persisting every event as
a row is not viable hosted.

| Channel | Contents | Destination | Serves |
| --- | --- | --- | --- |
| **1. Live** | Full-fidelity event stream | Supabase Realtime **Broadcast** (ephemeral, not persisted) | Watching a run now, from either client |
| **2. Transcript** | Complete run transcript, gzipped | Supabase **Storage** | Forensics; **the nightly dream-cycle signal pass** |
| **3. Metrics** | Structured, typed facts | Postgres | Dashboards, periodic reports, active flagging |
| **4. Summary** | One row per run | Postgres | List views |

**Metrics tables** — the analysis substrate required by intake `0007`:

```
run_metrics      (1 per run)    tokens in/out, duration, outcome, retries, cost
run_tool_calls   (1 per call)   tool, ok/error, error_class, duration, seq
run_errors       (1 per error)  error_class, tool, recoverable, recovery_taken
run_decisions    (1 per point)  decision, chosen_path, transcript_offset
```

A run with ~5,000 raw events yields roughly 70 structured rows — a ~70× reduction that preserves
exactly what cross-run analysis needs, while remaining fully queryable in SQL. At ~14 KB/run and 20
runs/day, 500 MB lasts years.

This division keeps the existing `dream-cycle` working unchanged: it is a batch nightly pass, and
batch jobs reading transcript files instead of table rows is a non-issue. Live dashboards and
threshold flagging read the metrics tables.

**Run artifacts** are stored alongside transcripts in Supabase Storage, keyed by `run_id`, and carry
a `kind`:

- `evidence` — QA screenshots, logs. Subject to retention.
- `deliverable` — a PDF, image, or media file the user asked the agent to produce. **Never
  auto-deleted.**

### 3.6 Write frequency

| Data | Frequency | Destination |
| --- | --- | --- |
| Task / project / agent CRUD | Per user action | Postgres, immediate + Realtime |
| Run lifecycle | ~3–5 writes per run | Postgres, immediate |
| Memory notes | Per agent write | Postgres, immediate — governance requires server-side |
| Terminal I/O | Keystroke-level | **Local only, never persisted** |
| Run output events | Thousands per run | Realtime Broadcast + transcript file |

### 3.7 Tenancy

Every Class-A table gains `workspace_id`. RLS scopes all reads and writes to the caller's
memberships, so the daemon, the web app, and the desktop app are constrained identically regardless
of which client has a bug.

New tables: `workspaces`, `users`, `memberships`, `runtimes`, `runtime_project_paths`,
`workspace_settings`, `user_settings`, plus the metrics tables in §3.5.

**Naming collision to avoid.** `memberships` is *workspace* membership — which humans belong to which
workspace, with which role group. It is unrelated to the existing `teams` / `teamMembers` tables,
which model agent teams (the factory's equivalent of Multica's squads) and are a product concept, not
an access-control one. The two must not be merged: a person's workspace role governs permissions; an
agent team governs work routing.

**Existing groundwork:** cross-cutting rule 3 (decision C7 → D6) already places a nullable, indexed
`user_id` on every new table from migration `0004` onward in anticipation of this. Phase 6b is
correspondingly cheaper than a cold start.

---

## 4. Permission model — three orthogonal axes

Conflating these is how the model becomes unmaintainable. They are separate systems.

| Axis | Question answered | Scope |
| --- | --- | --- |
| **1. RBAC** | What may this *person* **do** in the product? | CRUD on agents, projects, skills, settings |
| **2. Invocation** | Which *agents* may this person **trigger**? | Per-agent allow-list, deny-by-default |
| **3. Capability** | What may an *agent* **do** when it runs? | Tool cascade plus clamps |

### 4.1 Axis 1 — RBAC

Permissions are `resource:action` strings checked per mutation:

```
agent:create   agent:update   agent:delete   agent:read
project:create project:update project:delete project:read
skill:*   task:*   pipeline:*   memory:*
runtime:register   runtime:share
secret:write:workspace   secret:write:project
member:invite   member:remove   role:manage
```

**Permissions require scope qualifiers, not just verbs.** The vision document specifies that `staff`
cannot access *base* agents, *global* factory memory, or *base parent* repos — restrictions on
which instances, not which actions. `agent:update` alone cannot express this.

The permission string is therefore `resource:action:scope`, where `scope` ∈ {`own`, `derived`,
`base`, `all`}:

- `own` — instances the actor created
- `derived` — instances belonging to a fork/subproject (non-null `parentProjectId`)
- `base` — root instances with no parent; the factory's own agents, memory and repos
- `all` — unrestricted

So `staff` receives `agent:update:derived` and `project:deploy:derived` but never `agent:update:base`
or `memory:read:base`. A permission granted without a scope suffix defaults to `own`.

**Role groups:**

- `owner` — all permissions; **not editable or deletable**, so a workspace cannot be locked out of
  itself.
- `admin`, `member`, `staff`, `viewer` — seeded with defaults, fully editable.
- The owner may create custom groups with any permission subset.

**Escalation guardrail (required):** a holder of `role:manage` may only grant permissions **they
themselves hold**. Without this rule, `role:manage` is silently equivalent to `owner` — the holder
creates a group containing everything and assigns it to themselves.

**Enforcement split:**

- **RLS enforces tenancy** — whether you may see a workspace's rows at all. Database-level, identical
  for every client.
- **RBAC enforces actions** — a Postgres `has_permission(user, workspace, 'agent:delete')` function
  called from RLS policies on writes.

Expressing full RBAC purely in RLS becomes unreadable; keeping tenancy in RLS and permissions in a
helper function keeps both tractable.

### 4.2 Axis 2 — invocation permission

Adopted from Multica's model, which was built in response to a real privacy incident in their
system: an admin invoked another user's private agent and reached that agent's connected accounts.

- `agent.permission_mode` ∈ {`private`, `public_to`}; **default `private`** (deny-by-default)
- `private` — only the agent's owner may invoke it. **Workspace admins do not bypass this.**
- `public_to` — an owner-configured allow-list; target types `workspace`, `member`, `team`. Targets
  stack; a caller matching **any** target is admitted.

### 4.3 Axis 3 — capability

The existing cascade is unchanged in semantics. `tool-policy.ts` locks three rules that this design
does not violate: **deny-wins is absolute**; **empty allow means inherit/default, not deny-all**; and
resolution is order-independent for the effective set.

Changes:

1. **`Global` becomes `Workspace`.** The `settings`-backed global policy becomes workspace-scoped.
   Cascade: `Workspace → Agent → Project → Task`.
2. **A runtime clamp is added**, for shared daemons.

```
effective = resolve( workspace → agent → project → task )
          ∩ parent_run_snapshot     (delegation — existing)
          ∩ runtime_policy          (shared daemons — new)
→ written to tasks.effective_tools   [service-role write only]
```

**No actor capability clamp.** Decided: capability is bound to the *agent*, access is bound to the
*person*. The invocation allow-list (§4.2) is the actor control. An agent runs at its configured
capability regardless of who invoked it.

**The empty-allow trap.** `intersectEffectiveTools` resolves "one side empty → the other side's
allow-list." That is correct for delegation but means **a shared runtime with no configured policy
imposes no ceiling at all** — the most dangerous state, reached by doing nothing. Resolved without
altering the locked semantics:

> A runtime with `visibility = private` needs no policy. A runtime **cannot be made shared** until it
> declares an explicit allow-list. The UI blocks the transition.

One semantic everywhere; the security question is answered at configuration time rather than
resolution time.

**Tamper resistance.** The cascade runs in TypeScript in a Vercel or Supabase Edge function, reusing
`resolveEffectiveTools` from `@sparstrow/shared` unchanged — not ported to plpgsql, which would fork
the security spine into a second language. The result is written to `tasks.effective_tools` with a
**column-level grant restricting writes to the service role**. User JWTs, including the daemon's, may
read it and may not write it. The existing guarantee — resolved once at start, immutable thereafter —
survives and now holds against a modified daemon.

**Memory scopes** receive identical treatment: workspace-scoped, resolved server-side, snapshotted
onto the task, clamped by runtime. Because memory writes route through the control plane, RLS
enforces scope at the database.

---

## 5. Secrets

> **Organizational secrets go up. Personal secrets stay with the person.**

| Level | Examples | Shareable | Stored | Set by |
| --- | --- | --- | --- | --- |
| **Workspace** | Org API key, shared MCP token, GitHub App install | Yes | Supabase, encrypted | `secret:write:workspace` |
| **Project** | Deploy key, staging DB URL, project test keys | Yes, project-scoped | Supabase, encrypted | `secret:write:project` |
| **Agent** | The agent's own service connections | Yes, **with a warning** | Supabase, encrypted | Agent owner only |
| **User** | Personal API key, personal SSH key, CLI login | **Not shareable** | See §5.1 | The person only |

### 5.1 User credentials carry a storage mode

| Mode | Location | Works with |
| --- | --- | --- |
| `device_only` *(default)* | OS keychain (Windows Credential Manager / macOS Keychain) | That user's own local daemon |
| `synced` | Supabase, encrypted, RLS self-only | Any of their devices, and cloud runtimes |

`synced` exists because a cloud runtime has no access to a desktop keychain. Without it, cloud
execution with personal credentials is impossible.

**Four protections govern `synced`:**

1. **Only the owning user can read it.** RLS scopes to `auth.uid()` with no admin bypass. The
   workspace owner must not be able to read a member's personal credentials.
2. **Encrypted with a key not in the database** (Supabase Vault / pgsodium, or app-level encryption
   with the key in platform env). A database dump alone must not yield credentials.
3. **Personal credentials bind to the initiating actor, not to the runtime or the agent.** The
   control plane resolves a run's secret grant as: workspace secrets from the workspace, project
   secrets from the project, agent secrets from the agent, and personal secrets **from the user who
   created the task**. If one member's task runs on another member's always-on machine, it uses the
   *initiator's* credentials. Without this rule, a shared runtime silently becomes a way to spend
   another person's quota.
4. **Never returned in plaintext.** The existing `getSecretMeta` shape — `{present, hint, length}` —
   extends to the API boundary. Values never cross the wire.

### 5.2 Agent secrets are coupled to invocation permission

An agent's credentials are effectively lent to everyone who can invoke it. This is precisely the
incident that produced §4.2. The UI must state it plainly when a credential is added to an agent:
**"anyone who can invoke this agent can use this credential."**

### 5.3 Three enforcement mechanisms

1. **Run environment comes from the control plane, not the machine.** `child-env.ts` already builds
   agent process env from an enumerated allowlist rather than spreading `process.env` — its header
   documents the exfiltration channel that motivated it. The change is that `extraEnv` is populated
   from the resolved secret grant for that task, never from the daemon owner's ambient environment.
2. **Task-scoped working directories.** A daemon's machine holds checkouts other members cannot
   access. A task must execute in a directory containing only that project's resources. This is also
   the mechanism that enforces "staff cannot access base parent repos" from the vision document —
   one mechanism satisfying two requirements. **Built in the foundation, not deferred.**
3. **Never return plaintext** — §5.1(4).

---

## 6. The claim protocol

### 6.1 Four exchanges

**Register.** The daemon announces machine name, OS, discovered agent CLIs, and which projects it has
local paths for. Receives a `runtime_id`. A runtime is `private` by default and can only take its
owner's tasks until explicitly shared with a declared allow-list (§4.3).

**Claim.** A Postgres `SECURITY DEFINER` function called by the daemon with its own user JWT,
performing atomically:

```sql
SELECT ... FROM tasks
 WHERE eligible_for(runtime_id)
 ORDER BY priority, created_at
 FOR UPDATE SKIP LOCKED
 LIMIT 1
```

`SKIP LOCKED` makes concurrent daemons safe with no advisory locks and no possibility of
double-execution. **In the same call**, the function resolves the capability snapshot and writes
`tasks.effective_tools`. Resolving at claim preserves the existing "resolved at start, immutable
thereafter" semantics while placing resolution somewhere the daemon cannot forge. The claim response
carries the snapshot.

**Stream.** Per §3.5 — Broadcast live, transcript and artifacts to Storage, metrics to Postgres.

**Finish.** Terminal status, metrics rows, transcript pointer.

### 6.2 Wakeup and liveness

- **Realtime push** notifies the daemon on task insert — immediate pickup.
- **A ~60 s poll runs underneath as a floor.** A dropped WebSocket that nobody notices otherwise
  means work sits forever.
- **Heartbeat** every 30 s; **90 s** stale threshold. A runtime missing the window is marked offline
  and its in-flight tasks become recoverable.

### 6.3 Interrupted runs

When a daemon dies mid-run — closed laptop, crash, network loss — the task is marked **`interrupted`**
and surfaced with its transcript and changed files. The owner chooses **resume** or **restart**.

Rationale: agent side effects live outside the database — git branches, pull requests, deployed
changes, posted comments. The task table cannot know what has already happened externally, so it must
not unilaterally decide to do it again. Automatic retry trades a rare convenience for an unbounded
class of duplicated external actions.

**Deferred escape hatch:** a per-agent `auto_retry` flag, enabled only for agents whose work is
provably idempotent (read-only analysis, report generation). Safe default, opt-in exception. Not in
the foundation.

### 6.4 Unavailable projects

A task targeting a `local_directory` on a machine that is off **parks in `waiting_local_directory`**,
is shown as such on the board with the specific blocking machine named, and notifies whoever can
unblock it.

Failing the task would be dishonest — the cause is unrelated to the work. Parking silently is worse,
because the board would misrepresent what is actually queued. Surfacing it also creates natural
pressure toward giving that project a git remote, which is the real fix.

---

## 7. Sequencing

**Governing principle: change one axis at a time, and keep the application working after every
phase.** Combining the database swap with multi-tenancy makes every failure ambiguous and removes
every rollback point.

**Phase 6-pre — full frontend redesign.** *(Scope revised by the owner 2026-07-27. This previously
read "focused frontend pass … not a comprehensive redesign", scoped to fixing surfaces with real
complaints captured as `docs/intake/` items. Both premises are gone: `docs/intake/` is retired, and
the pass is now a deliberate, design-led redesign rather than a complaint-driven patch.)*

The reason for the change is a finding, not a preference. The UI adopted the shadcn/ui *look*
without the shadcn/ui *components* — there was no shadcn MCP or CLI wired at the time, so the
primitive layer was hand-approximated while attention went to the backend. Sparstrowgen ships **18
primitives**; Multica, on the same design system, ships **60 plus 12 shared common components**.
The gap is not cosmetic: there is no `empty`, no `alert`, no toast, and no form/field primitive, so
the Definition of Done's "all four states, always" cannot actually be satisfied on any surface —
the components it presumes do not exist.

Scope: all 24 pages under `packages/ui/src/routes/pages/`, on real shadcn primitives sourced through
the shadcn MCP per `CLAUDE.md`'s Frontend & design contract, held to production-grade UI/UX —
user-friendly, no AI slop, deliberate hierarchy, spacing, overflow and motion. Multica's frontend is
a reference to mine for patterns worth adopting, on the same parts-donor terms as everywhere else:
adopt the conclusion, never the Next.js shell.

It still precedes 6a, and now for a second reason as well as the original one — 6a is the longest
stretch in which success means nothing looks different, and redesigning on top of a migrating data
layer would confuse two unrelated classes of failure.

| Phase | Ships | True on completion | Effort |
| --- | --- | --- | --- |
| **6a. Postgres** | SQLite → Postgres (local), `sqliteTable` → `pgTable`, `sqlite-vec` → `pgvector`, `fastembed` unchanged | Single-user, local, no auth. Behaviour **identical**. | L |
| **6b. Tenancy schema** | `workspaces`, `users`, `memberships`, `runtimes`, `runtime_project_paths`; `workspace_id` throughout; settings split; `rootDir` split per §3.4 | One seeded workspace and user. Shape only, no enforcement. | M |
| **6c. Auth + RLS + RBAC** | Supabase Auth, RLS policies, permission strings with scope qualifiers, role groups, `has_permission()` | Still one user; enforcement machinery live and testable. | M |
| **6d. Extract the daemon** | Process split; register / heartbeat / claim; server-side `effective_tools`; task-scoped working directories | Everything still local. Protocol proven before hosting variables exist. | L |
| **6e. Go hosted** | Postgres → Supabase, UI → Vercel, four-channel run data, `interrupted` and `waiting_local_directory` statuses | Remote, single-user. | M |
| **6f. Multi-user** | Invitations, invocation permission, runtime sharing with mandatory allow-list, runtime clamp, `synced` personal secrets | Real teammates on local daemons. | M |

**Why 6a is isolated.** The `better-sqlite3` → Postgres synchronous-to-asynchronous ripple is the
highest-risk mechanical change in the plan and is orthogonal to everything else. `better-sqlite3` is
synchronous — `tool-resolution.ts` calls `getDb().select()...get()` inline with no `await` — and every
such call site becomes async, propagating upward through callers. Isolating it means every failure in
6a has exactly one possible cause.

**Why schema precedes auth.** Getting `workspace_id` and the runtime model wrong is cheap to fix with
one user and expensive with five.

**Why 6d and 6e are separate.** 6d proves the claim protocol with no network latency and no hosting
variables. 6e adds latency and deployment to a protocol already known to work.

**Rollback points.** After 6a, a local app on a different database. After 6b, the schema is additive.
After 6c, RLS can be disabled per table. After 6d, the monolith still runs. **The first one-way door
is 6e.**

### 7.1 Prerequisite for staff onboarding

The vision document's users are **sales and marketing staff, not developers**. They will not install
Electron and authenticate agent CLIs. Therefore:

> **Cloud runtimes are a named prerequisite for onboarding staff**, not open-ended future scope.

The owner and any developers work on local daemons through 6a–6f. The first staff user cannot be
onboarded until cloud execution exists. The foundation does not preclude it: `runtime` is a
first-class owned entity from 6b, and local-versus-cloud is a mode on it.

---

## 8. Out of scope

Each of the following is deliberately excluded from this specification and requires its own spec:

- **Deep-Fork workflow** — repository clone plus deep copy of agents and memory, isolated per client.
  Depends on tenancy, RBAC, memory scoping and project lineage existing first. The foundation must
  not preclude it: the memory model and project lineage are to be fork-aware, and the existing
  `projects.parentProjectId` and `projects.isSandbox` columns are the intended hooks.
- **Cloud runtimes** — required before staff onboarding (§7.1); needs a third host and per-run cost
  controls.
- **`managed_files`** project resource type (§3.3).
- **Per-agent `auto_retry` flag** (§6.3).
- **Platform-level deny rail** above workspaces — a deny-list only, above the workspace cascade level.
- **Porting Squads and Autopilots** from Multica into the factory's Teams and Pipelines.
- **Upstream-watch process** — tracking Multica releases and triaging which features to adopt.

---

## 9. Relationship to Multica

Multica is treated as a **reference implementation and parts donor**, not a base to fork. Sparstrowgen
remains the product. The two systems have complementary strengths:

| | Multica | Sparstrowgen |
| --- | --- | --- |
| Invocation gate | Deny-by-default, stacking allow-lists | Absent — **adopted here** (§4.2) |
| Capability clamp | Absent; the `agent.tools` column is vestigial and read by no server code | 4-level cascade, snapshot at spawn, transitive delegation clamp |

Specific conclusions adopted, rather than their starting points:

- **Deny-by-default invocation permission** with stacking allow-lists (their migration `130`).
- **Admins do not bypass owner privacy** — learned from a real incident in their system.
- **Runtimes are owned and private by default** from the first migration. Multica added `owner_id` at
  migration `032` and was still separating visibility from authorization at `130`.
- **`waiting_local_directory`** as a first-class task status (their migration `109`).
- **Task-scoped working directories** (their `execenv` task-home pattern).

Explicitly **not** adopted: single-flag runtime sharing with no policy declaration. That is safe only
because Multica has no capability policy to declare. Sparstrowgen's daemons hold keys, credentials and
private checkouts.
