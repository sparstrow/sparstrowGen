# CLAUDE.md — Sparstrowgen

Sparstrowgen is a local-first **agent factory**: a Fastify core on `127.0.0.1:48750`, React/Vite UI,
better-sqlite3 + Drizzle, Electron desktop shell, packaged as an always-on Windows app with
notify-only self-update. pnpm + turbo monorepo: `packages/{core, ui, shared, memory-cli, memory-mcp,
desktop}`. It is **in transition to hosted multi-tenant** — see Phase 6 invariants below.

**This file is the single source of truth for how Sparstrowgen gets built.** Every coding agent
— Claude Code, `agy` (Antigravity), any harness — follows the SAME rules here. There is **no
per-tool carve-out and no conversational-mode exemption**: the gate below applies to Claude Code
exactly as it applies to `agy`, whether you plan-and-build in one session or implement a handed-off
plan. `AGENTS.md` points here; never maintain divergent build rules anywhere else.

The file has two halves. **Part I — the code contract** (shape, stack, frontend, Phase 6
invariants) is what the codebase is. **Part II — the build contract** (the superpowers loop, the
skill gate, **how to ask the owner a question**, TDD, the Definition of Done, git flow, conduct) is
how work moves. A change must satisfy both; green tests only satisfy the second.

**The build methodology is the superpowers plugin, with two standing house rules:** every skill
invocation is asked for first (never auto-invoked), and TDD is the iron law.

**Precedence: where this file and a skill disagree, this file wins.** Skills ship generic defaults;
this repo has specific ones. Follow the skill for everything this file doesn't speak to.

---

# Part I — the code contract

## Read-path — what is authoritative

- **`CLAUDE.md`** — this file. Both contracts, and it outranks any skill it contradicts.
- **`PRODUCT.md`** — product purpose, users, register. **`DESIGN.md`** — the live token set and UI bar.
- **`docs/specs/`** — approved designs, one per topic (`YYYY-MM-DD-<topic>-design.md`).
  **`docs/plans/`** — implementation plans (`YYYY-MM-DD-<feature>.md`). Both are written by the
  superpowers skills; see Part II.
- **`docs/planned/`** — architecture specs that predate the superpowers flow.
  `phase6-hosted-foundation.md` is the **active architecture**;
  `multi-tenancy-access-architecture.md` is its vision parent — *considered, never built from*.
- **`docs/deferred/`** — the freezer; one file per deferred item. **Every deferral is written here,
  at the moment it is made** — see the no-silent-scope-drop rule in Part II.
- **`packages/ui/src/content/knowledge/`** — the shipped in-app Knowledge Center.

`docs/intake/` is **retired history** — the Listener/Curator capture flow it served is replaced by
superpowers. It takes no new entries; anything still open there is revived as a fresh spec under
`docs/specs/` when its time comes. `docs/workflows/` and the root `DEFERRED_SCOPE.md` are gone —
the freezer moved to `docs/deferred/`, and the retired agent specs are recoverable from git.

### Do NOT read these (frozen history — off the read-path)

- `.design-src/APP.md`, `fable-handoff/ENGINEERING_PLAN.md`, `.design-src/*/SPEC.md` — the
  page-by-page and P1–P10 engine work, all shipped and banner-frozen. Never read them for current
  state, never update them. Reading them wastes tokens on finished work.

## Project shape

- **`packages/core/`** — Fastify server. `orchestrator/` (run-manager, tool-loop, handoff, one-shot,
  child-env, preamble, untrusted), `providers/` (claude, antigravity), `terminal/` (node-pty),
  `mcp/`, `memory/`, `goap/`, `graph/`, `scheduler/`, `taskboard/`, `projects/`, `agents/`,
  `secrets/`, `db/` (Drizzle schema + numbered migrations), `api/`, `ws/`, `events/`.
- **`packages/ui/`** — Vite + React 18 + TanStack Router + Tailwind v4 + shadcn/ui.
  `components/ui/` is the primitive layer; `content/knowledge/` is the Knowledge Center.
- **`packages/shared/`** — types, zod schemas, and the security spine `tool-policy.ts`.
- **`packages/desktop/`** — Electron shell; hosts the core process.
- **`packages/memory-cli/`, `packages/memory-mcp/`** — memory surfaces for external agents.

**Dependency direction is one-way:** `ui`, `core`, `desktop`, `memory-*` → `shared`. `shared`
imports none of them. Logic the server and the UI must agree on — policy resolution, schemas,
event shapes — lives in `shared` and is **never duplicated on both sides**.

## Stack lock — settled, do not relitigate

Full rationale in `docs/planned/phase6-hosted-foundation.md` §1.1. Re-proposing any of these burns a
review cycle; the reasons below are the answer.

- **TypeScript everywhere. No Go.** A polyglot boundary buys an entire defensive API-compatibility
  discipline we never pay for while `@sparstrow/shared` spans every tier.
- **Vite + React 18 + TanStack Router. No Next.js.** The UI must run identically in an Electron
  renderer and in a browser; one SPA artifact serves both. SSR is unusable in Electron, and adopting
  it forces two shells — the exact cost we are avoiding. Seeing "Supabase + Vercel" is not a reason
  to propose Next.js.
- **Postgres via Drizzle (`pgTable`), pgvector, `fastembed` local in the daemon.** Embeddings compute
  free on-device; only the vector crosses the wire. No embedding API is ever paid for.
- **Electron desktop, unchanged** — it now also hosts the daemon.

Net change from today is two lines: SQLite → Postgres, plus hosted auth. This is a database and
tenancy project, **not a stack migration**. Treat any proposal that widens it as out of scope.

## Frontend & design contract

**Frontend is a first-class deliverable, designed from the first commit — never a polish pass bolted
on at the end.** "It renders" is not a finished surface. Production-grade and user-friendly are
entry conditions for design work, not a later cleanup task.

### Order of work — do this before writing a component

1. **Read `DESIGN.md`** (tokens, motion, component vocabulary) and **`PRODUCT.md`**'s register.
   The design system is decided; you are applying it, not inventing one.
2. **Reach for shadcn/ui before building anything.** Invoke the **`/shadcn` skill** and use the
   **Shadcn UI MCP** — `list_components` / `get_component` / `get_component_demo` for primitives,
   `list_blocks` / `get_block` for a composite surface (dashboard, settings, sidebar, form layout).
   Check for an existing block before composing a new page from scratch.
3. **Only then write code.** Never hand-roll a primitive shadcn already ships — that is how a second
   component vocabulary and a second set of accessibility bugs enter the codebase.

### Vendoring a shadcn component

The shadcn CLI is **not** wired here — there is no `components.json`, and the components in
`packages/ui/src/components/ui/` are vendored by hand. Do not run the CLI or scaffold a config for
it. Take the canonical source from the MCP and adapt it to repo conventions:

- Place it at `packages/ui/src/components/ui/<name>.tsx`, kebab-case.
- `cn` from `@/lib/utils`; `cva` for variants; `React.forwardRef` + `displayName`.
- **Semantic tokens only** — `bg-background`, `text-muted-foreground`, `border`, `ring-ring`.
  Never a hardcoded Tailwind color, never the registry's default palette or radius. Our scale is
  pure-neutral OKLCH with `--radius: 0.625rem`.
- Add any new `@radix-ui/*` dependency to `packages/ui/package.json`.
- lucide icons only: `size-4` in controls, `size-3.5` in metadata rows.

### The bar every surface meets in the same change that ships it

- **All four states, always: populated, empty, loading, error.** Empty states *teach* the surface —
  what it is plus the primary action — never "nothing here". Loading uses `Skeleton` in the shape of
  the real content, not a spinner. Errors name what failed and offer the next action.
- **Both themes are first-class.** Verify light and dark; the toggle is not decorative.
- **Keyboard and focus work.** Radix primitives give you this — hand-rolling loses it. Visible
  `focus-visible:ring-ring`, labelled controls, real hit targets.
- **Overflow is deliberate.** Long text, truncation, wrapping, scroll containers, and alignment are
  decided, not discovered. Nothing makes the page scroll sideways.
- **No new vocabulary.** No second component library, no second icon set, no framer-motion — plain
  CSS keyframes, 150–250 ms, ease-out, motion conveys state only.
- **Verified in a real browser**, per the Definition of Done. A screenshot of the working surface is
  the proof.

## Phase 6 invariants

Spec: `docs/planned/phase6-hosted-foundation.md`. These bind from the **first line of 6a code** —
cheap now, expensive to retrofit. They also describe failure modes that pass typecheck, pass tests,
and boot fine, so the gate alone will not catch them.

- **One axis per phase.** 6a–6f ship in order and the app works after each. Never combine the
  database swap with tenancy. Every phase before 6e has a rollback point; **6e is the first
  one-way door.**
- **The daemon executes; the control plane decides.** `orchestrator/`, `providers/`, `terminal/`,
  `mcp/`, and device-only `secrets/` stay local. Planning (`goap/`, `graph/`), scheduling, memory
  writes, and policy resolution move up. Nothing moves the other way without a spec change.
- **The daemon never resolves its own policy.** `effective_tools` is resolved server-side and written
  **service-role only**; user JWTs — including the daemon's — read it and never write it. Resolved at
  claim, immutable thereafter.
- **`tool-policy.ts` semantics are locked.** Deny wins absolutely; an empty allow-list means
  inherit/default, **never** deny-all; resolution is order-independent. The "empty allow on a shared
  runtime imposes no ceiling" hazard is fixed at *configuration* time — a runtime cannot be made
  shared until it declares an explicit allow-list — **never by changing these semantics.**
- **Tenancy is enforced by RLS, not by application filtering.** Every shared-record table carries
  `workspace_id`. Never let a hand-written per-workspace `WHERE` clause be the access control.
- **RBAC permissions carry a scope qualifier**: `resource:action:scope`, scope ∈
  `own | derived | base | all`; a bare permission defaults to `own`. A holder of `role:manage` may
  only grant permissions they themselves hold.
- **Secrets never cross the wire in plaintext.** The `{present, hint, length}` shape from
  `getSecretMeta` extends to the API boundary. Personal secrets bind to the **task initiator**, never
  to the runtime or the agent owner. `child-env.ts` builds run env from the resolved grant through
  its existing enumerated allowlist — **never spread `process.env`.**
- **Run events are never one row each in Postgres.** Four channels: Realtime Broadcast (live,
  ephemeral), gzipped transcript in Storage, ~70 structured metric rows, one summary row.
- **There is no sync layer.** Supabase is the system of record; desktop and web are both clients.
  Never build conflict resolution or offline reconciliation.
- **Source code never lives in Supabase.** Git syncs code; Supabase syncs metadata and pointers.
- **Failure is honest.** An unavailable local directory **parks** (`waiting_local_directory`) with
  the blocking machine named. An interrupted run is `interrupted` and the owner picks resume or
  restart — never auto-retry. Agent side effects (branches, PRs, deploys, comments) live outside the
  database, so the database must not unilaterally decide to repeat them.

## Multica (`D:\Sparstrow\multica-main`) — reference only

A **parts donor, never a fork base**, and never a source of code to copy. Sparstrowgen is the
product. Read it only to answer a specific "how did they handle X"; cite their migration number in
the PR when a conclusion is adopted.

**Adopted:** deny-by-default agent invocation with stacking allow-lists; admins never bypass owner
privacy (learned from a real incident in their system); runtimes owned and private from the first
migration; `waiting_local_directory` as a first-class status; task-scoped working directories.

**Deliberately not adopted:** Next.js and their two-shell web/desktop split; a Go backend;
single-flag runtime sharing with no declared policy — safe only because they have no capability
policy to declare, while our daemons hold keys, credentials, and private checkouts.

---

# Part II — the build contract

## Build & verify

- `pnpm typecheck && pnpm test` — Node 24 (better-sqlite3 / node-pty native ABI).
- Don't run the core server during a build (SQLite locks). Start from a clean working tree.
- Package the desktop app: `pnpm --filter @sparstrow/ui build && pnpm --filter @sparstrow/memory-mcp build && pnpm --filter @sparstrow/memory-cli build && pnpm --filter @sparstrow/desktop dist`.

## The loop — superpowers

The build methodology is the **superpowers** plugin. It replaces the old Listener/Curator capture
flow; that flow and its `docs/intake/` are retired.

`WORKTREE → BRAINSTORM → SPEC → (review) → PLAN → TDD BUILD → REVIEW → VERIFY → FINISH → PROMOTE`

1. **Worktree first** — `using-git-worktrees`, pinned settings in the git flow below. This comes
   **before** brainstorming, not after: the spec and the plan are committed artifacts, and the git
   flow forbids committing anything on a local `staging`. The branch has to exist before the first
   commit of the work, and the spec is the first commit.
2. **Brainstorm** — `brainstorming`. Questions one at a time, 2–3 approaches with a recommendation,
   design presented in sections for approval. **Hard gate: no code, no scaffolding, no
   implementation skill until the owner approves the design.**
3. **Spec** — the approved design is written to **`docs/specs/YYYY-MM-DD-<topic>-design.md`** and
   committed. Self-review for placeholders, contradictions, ambiguity and scope, then the owner
   reviews the written spec.
4. **Review the spec (optional)** — `/plan-ceo-review` (strategy and scope), `/plan-eng-review`
   (architecture), `/plan-devex-review` (developer experience), or `/autoplan` for all of them.
   Superpowers has no equivalent lens; these are kept for that reason. Ask first, per the skill gate.
   `brainstorming` hands off to `writing-plans` directly, so this step is the **owner's** to start —
   if the owner doesn't ask for it, go straight to the plan.
5. **Plan** — `writing-plans`. Bite-sized tasks, 2–5 minutes each, exact file paths, complete code,
   exact commands with expected output, **no placeholders**. Every task is RED → verify-fail →
   GREEN → verify-pass → commit. Saved to **`docs/plans/YYYY-MM-DD-<feature>.md`**.
6. **Build** — `subagent-driven-development` (fresh subagent per task, two-stage review) or
   `executing-plans` (batched, with checkpoints). Every task obeys `test-driven-development`.
7. **Review** — `requesting-code-review` between tasks; `receiving-code-review` when responding.
   Critical issues block progress.
8. **Verify** — `verification-before-completion`, then the Definition of Done below. Evidence
   before assertions, always.
9. **Finish** — `finishing-a-development-branch`, pinned to this repo's git flow below.
10. **Promote** — the owner reviews the **running app on `staging`** and promotes `staging` → `main`.
    CI on a `main` tag builds + publishes; the packaged app shows a notify-only "update available".

Spec and plan paths override the skills' `docs/superpowers/…` defaults.

**Spec and plan bookkeeping is mandatory.** A spec is committed before planning starts; a plan is
committed before building starts. When the work ships, tick the plan's remaining checkboxes and note
the PR link at the top of the plan file. A plan whose checkboxes don't match reality is worse than
no plan.

**Small changes still run the loop, at proportional depth.** A one-line fix gets a two-sentence spec
and a three-task plan — not a skipped spec. What scales is length, never the sequence.

## The skill gate — ask before invoking

**Every skill invocation is the owner's call. Name the skill, say what it would do, and ask whether
to use it *this turn*, *next turn*, or *not at all*. Wait for the answer.**

> `brainstorming` covers this — it would refine the idea through questions and produce a spec.
> Use it now, next turn, or skip?

This is a **deliberate override** of the superpowers auto-invoke mandate ("if a skill applies you
MUST invoke it"). Superpowers' own instruction-priority rule ranks CLAUDE.md above its skills, so
the override is legitimate: in this repo, an agent that auto-invokes a skill without asking is
violating this file. The single exception is `using-superpowers`, which loads at session start.

Asking is not a licence to skip the work. If the owner defers or declines a skill, say plainly what
that costs — no spec, no plan, no red test — and proceed under that stated choice.

**How to ask is governed separately.** The skill gate says *when* to ask; the decision brief below
says *how*. A skill-gate question is a technical question and carries the full brief like any other.

### The skills

The loop above is the order they run in. Reach for them off-sequence when the trigger fires:

- `brainstorming` — before *any* creative work; hands off only to `writing-plans`.
- `writing-plans` — a spec exists, work is multi-step, before touching code.
- `using-git-worktrees` — starting feature work.
- `subagent-driven-development` — the default executor: fresh subagent per task, two-stage review.
- `executing-plans` — the alternative executor: batches with human checkpoints.
- `dispatching-parallel-agents` — 2+ genuinely independent tasks, no shared state, no ordering.
- `test-driven-development` — implementing anything, before the implementation code.
- `systematic-debugging` — any bug, test failure, or surprise, **before** proposing a fix.
- `verification-before-completion` — about to claim done, fixed, or passing.
- `requesting-code-review` / `receiving-code-review` — finishing a task; responding to feedback.
- `finishing-a-development-branch` — implementation complete, tests green.
- `writing-skills` — creating, editing, or verifying a skill.
- `using-superpowers` — loads at session start; not an invocation choice.

**Kept alongside superpowers** (no superpowers equivalent): `/plan-ceo-review`, `/plan-eng-review`,
`/plan-devex-review`, `/autoplan` for spec review; `/qa` for QA-ing a running surface; **`/shadcn`
for all frontend work**, per the design contract in Part I.

**Retired:** `/office-hours` (→ `brainstorming`), `/investigate` (→ `systematic-debugging`),
`/ship` and `/land-and-deploy` (→ `finishing-a-development-branch` + the git flow below). The
`/listener`, `/curator` and `/pipeline-suggester` skills and their `docs/workflows/` specs were
**deleted** on 2026-07-26 — not dormant, gone. Recover from git if ever needed. Memory Archivist and
Pipeline Suggester survive as *product* ideas in `docs/deferred/`, not as build steps.

## Asking the owner — the decision brief

### The owner's knowledge profile — assume this, always

The owner directs this product and writes its requirements, but is **not** an infrastructure or
release engineer, and is learning those domains *while* Sparstrowgen is being built.

**Solid ground:** application development, running things on localhost, Git and GitHub for source
control.

**Not solid ground — explain from first principles, every time, however basic it feels:** CI/CD and
what actually triggers a pipeline; release engineering (tags, versioning, artifacts, signing,
channels); desktop distribution and auto-update; production-grade and zero-downtime deployment;
database administration, migrations, backups and rollback; hosting, networking and infrastructure;
operational multi-tenancy. Phase 6 is *entirely* inside this list.

**The consequence that matters, and it is not optional to handle:** when a question arrives in
unfamiliar vocabulary, the owner cannot evaluate it and will answer *"go with your recommendation"*
to keep the work moving. **That is not consent to the technical choice — it is a signal that the
question failed.** Treat it as feedback on the question, never as approval of the answer: re-ask in
plain language with a scenario, or state the assumption you are proceeding under so it can be
corrected later.

The same applies to any answer that dodges the discrimination the question was asking for —
selecting nearly every option, "both", "whatever you think". Stop, say plainly what that answer
would imply, and re-frame.

### Every technical question carries a decision brief

No exceptions, including questions that feel small. A question without this is not ready to be
asked.

1. **What is actually being decided** — plain language, no jargon. Name the concrete thing that will
   be different afterwards.
2. **A scenario** — walk through what happens in the real app under each option. *"You click
   Publish; within 30 minutes the app already open on your machine shows a banner"* beats *"the
   updater polls the feed"*.
3. **Pros** — per option.
4. **Cons** — per option.
5. **Blast radius** — if this choice is wrong: what breaks, who sees it, how far it spreads, how
   long before anyone notices, and how it would be discovered. State plainly whether it is
   reversible or a **one-way door**.
6. **Caveats** — what is assumed, unverified, or uncertain. Anything not personally checked in this
   session is named as unchecked.
7. **A score out of 10** for each option, and what would make it a 10.
8. **The recommendation** — one option, and the reasoning for it.

Define every term of art inline, at first use. If an option cannot be explained without a term the
profile above marks unfamiliar, then explaining that term **is part of the question**, not a
prerequisite the owner is expected to bring.

Never manufacture a choice. If one option is clearly correct, say so and proceed — asking is for
genuine forks, and a fake fork spends the owner's attention for nothing.

### Blind-spot duty

The owner cannot ask about a risk they have never encountered. Surfacing those unprompted is the
agent's job. **Silence here is not neutrality — it is a decision taken on the owner's behalf.**

Real examples from this repo. Every one of them passes `typecheck` and `test`:

- **The tag is not the version.** `electron-updater` compares the installed app against the version
  inside `packages/desktop/package.json`, not the git tag. Tagging `v0.2.0` while that file says
  `0.1.0` publishes a feed every client reads as "already up to date" — a release that appears to
  succeed and ships nothing.
- **A published release is not a released release.** `electron-builder` leaves the GitHub Release as
  a **draft**, and `electron-updater` cannot see drafts. Without a human clicking Publish, a
  perfectly good build reaches nobody.
- **Silence is not health.** The updater suppressed check errors while idle, so a feed that had
  *never once worked* looked identical to one with no new version. It failed every 30 minutes,
  invisibly, for as long as the app had been installed.
- **Squash is not always safe.** Squashing `staging` → `main` severs ancestry and makes every later
  promotion conflict on every file. PR #53 did exactly this and the next promotion hit 10 phantom
  conflicts. Squash is right for feature branches and wrong for permanent ones.
- **Green is not verified.** Adding `@sparstrow/shared` to `packages/desktop` typechecks clean,
  tests clean, and fails only at startup inside the packaged app — the worst failure mode available.

When work touches anything on the unfamiliar list, also say what the **standard industry practice**
is and why, not merely what this repo happens to do. The owner is calibrating against a field they
have not worked in, and cannot tell a local convention from a universal one unless told.

## Test-driven development — the iron law

```
NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST
```

**Write the test. Watch it fail. Write the minimal code to pass. Watch it pass. Refactor green.**
If you didn't watch it fail, you don't know it tests the right thing.

- Wrote code before the test? **Delete it and start over.** Not kept as reference, not "adapted"
  while writing tests. Delete means delete.
- Verify RED is mandatory: the test must *fail*, not error, and fail because the feature is missing
  — not because of a typo. A test that passes immediately is testing existing behaviour; fix the test.
- Verify GREEN is mandatory: the new test passes, every other test still passes, and the output is
  pristine — no stray errors or warnings.
- **Bugs get a failing regression test that reproduces them first.** Never fix a bug without one.
- Tests use real code. Mocks only when genuinely unavoidable — a test that asserts on a mock's call
  count is testing the mock, not the system.
- **Exceptions need the owner's say-so**, and are limited to config files, generated code, and
  docs-only changes. "Too simple to test", "I'll test after", "I already checked it manually", and
  "I'm being pragmatic" are rationalizations, not exceptions.
- **Standing exception, granted 2026-07-27: vendored shadcn/ui primitives in
  `packages/ui/src/components/ui/`.** They are registry-generated source adapted to repo
  conventions, not logic we authored, and the real risk in them is visual and accessibility
  behaviour that a unit test does not catch — the Design/UI bar and the real-artifact test in the
  Definition of Done are what actually cover them. This exception is **narrow**: it covers the
  vendored file itself, never a consumer built on top of it, and never a primitive carrying
  repo-specific logic beyond styling and prop plumbing. A primitive that grows real behaviour
  leaves the exception and needs tests like anything else.

## Definition of Done — the gate (all green, before any merge)

Green typecheck+test proves correctness, not that the feature works. A change is **not done** until:

1. **`pnpm typecheck`** — clean.
2. **`pnpm test`** — green, and **every new test was written first and watched to fail** per the
   iron law above. New tests exist for everything you built: bug fix → the regression test that
   reproduced it; new surface → golden-path coverage. Placement per Testing below. Tests added
   after the code are not TDD and do not satisfy this item. The only way past this is the iron
   law's own exception list (config, generated code, docs-only) with the owner's say-so — a
   docs-only change satisfies this item by having built no production code, not by skipping it.
3. **Real-artifact usability test** — drive the actual running thing, never a mock:
   - UI/backend → boot the dev server or packaged app and exercise the flow in a real browser
     (the Browser-pane preview, in-app Chrome, or `agy`'s browser); observe it work.
   - CLI/integration → send a real input and read the real output. A canned/echo reply is a **FAIL**
     (e.g. the Antigravity chat returning "I'm the Antigravity agent…" instead of answering).
   - Packaging/artifact → build AND boot the artifact (the boot test that caught the 0004 installer
     is a required step, not luck).
   - If it's broken, fix it and re-verify before it counts as done.
4. **Design/UI bar** — the Frontend & design contract in Part I, in full: shadcn first, all four
   states, both themes, keyboard and focus, deliberate overflow. Frontend is top-level, not deferred.
5. **Knowledge Center currency** — the in-app Knowledge Center
   (`packages/ui/src/content/knowledge/`) documents every surface, and its promise is that docs
   ship in the same change as the features they describe. After any update or change, update the
   Knowledge Center **if the change touches something it describes or adds a user-facing
   surface/workflow** (new page, new flow, renamed concept, changed behavior). Internal-only
   changes with no user-visible effect don't need it — but decide explicitly, don't skip by
   default.
6. **Architecture contract** — the change respects Part I: Project shape, Stack lock, Frontend &
   design contract, Phase 6 invariants. **A change that violates one is not done, however green.**
   If the work genuinely requires changing a rule, change the rule *in this file, in the same PR*,
   with the reason — never route around it silently.
7. **Evidence, not assertion** — `verification-before-completion`. Every "done", "fixed", "passing"
   claim is backed by a command you ran and output you read *in this session*. Report failures with
   the output; say plainly when a step was skipped and why.

## Testing

**Tests come first — see the iron law above.** Tests live beside the code they cover, in the package
that owns the logic:

| What is tested | Location |
| --- | --- |
| Server behaviour — orchestrator, providers, memory, api | `packages/core/src/**/*.test.ts` |
| Policy resolution, schemas, shared pure logic | `packages/shared/src/*.test.ts` |
| Every schema migration | `packages/core/src/db/migration-<nnnn>.test.ts` |
| UI logic — render predicates, formatting, state rules | `packages/ui/src/**/*.test.ts` |

**The iron law covers the frontend.** "It's UI" is not an exception — it never was, but the table
had no UI row and `packages/ui` had no harness, which made the rule unenforceable in practice. Both
are fixed: vitest runs in `packages/ui` and `pnpm test` picks it up.

Frontend TDD works best by keeping the decision separate from the markup. Extract the rule into a
pure function under `packages/ui/src/lib/` and test that — no DOM, no harness ceremony, and the
component keeps only the rendering. `lib/chat-pending.ts` is the worked example: the "should the
optimistic bubble show" rule is five lines and five tests, while `chat.tsx` just calls it. Reach for
a component-rendering harness only when the behaviour genuinely lives in the markup.

- Logic that lives in `shared` is tested in `shared` — never re-tested through a `core` caller as a
  substitute for its own test.
- **Every migration gets its own numbered test.** The existing `migration-0004`…`0013` series is the
  pattern; the Phase 6 tenancy and RLS migrations continue it.
- Tests must never execute the owner's real agent CLIs or consume real quota. Pass a test-created
  fake or missing executable path to agent subprocess code. *Debugging* may invoke a real CLI when
  there is no other way to learn its contract — that is how intake 0009 was found — but it is a
  deliberate, narrated step, never something a test does on its own.

### What CI actually enforces

Know the difference between what the gate asks of you and what a machine checks:

| Check | `staging` | `main` |
| --- | --- | --- |
| `typecheck` | on push + PR | on push + PR — **required** |
| `test` | on push + PR | on push + PR — not yet required |
| `author-check` | — | PR — **required** |

**Everything else in the Definition of Done is yours to run.** The real-artifact usability test, the
design bar, Knowledge Center currency, and the architecture contract have no automation behind them
and never will. Do not read a green PR as a passed gate.

Wiring `test` as a required check on `main` is the owner's one-time ruleset change, once the job has
proven green on `staging`.

## Git flow

`staging` is **live** (created 2026-07-14). Branch off fresh `origin/staging`, build, pass the
gate, merge to `staging`.

- **`staging` = the agents' trunk.** Branch off fresh `origin/staging`, build, **pass the gate**,
  then merge to `staging`. A green gate is what *permits* the merge to `staging` — it is not what
  triggers it. `finishing-a-development-branch` still presents merge / PR / keep / discard and the
  owner still chooses, consistent with the skill gate. Never merge on a green gate alone.
- **Never commit directly on a local `staging` (or `main`) checkout — no exceptions, including
  chat/doc-only sessions.** Every unit of work, whatever kind, gets its own branch off fresh
  `origin/staging` first. The *only* commands run against a local `staging` checkout are the
  squash-merge itself and the push that lands it — never an `Edit`/`Write` followed by a commit.
- **Branch-naming collision guard (multi-account safety).** With multiple accounts (agents)
  branching off `staging` concurrently, two agents picking the same generic name (`fix/bug`,
  `feat/update`) can collide on push. Always derive the branch name from something unique to the
  work — normally the spec or plan slug (`feat/hosted-postgres-6a`), otherwise a short, specific
  slug that wouldn't plausibly collide with concurrent work. Before pushing a new branch, check it
  doesn't already exist on the remote (`git ls-remote --heads origin <name>`) — if it does,
  that's a signal another account already claimed that name or that work, not a name to fight over.
- **`main` = the owner's release gate.** The owner reviews `staging` and promotes `staging` → `main`
  — the only human merge. `main` stays release-quality, so the always-on app never updates from
  unseen code. CI ships on `main` tags.
- **Merge method differs by level, and the difference is load-bearing.**
  - **Feature branch → `staging`: squash.** One clean commit per feature; agent working commits are
    disposable scaffolding. Safe because the branch is deleted straight after — its orphaned
    ancestry never matters again.
  - **`staging` → `main`: a real merge commit. Never squash.** Squashing two *permanent* branches
    writes main a new commit holding staging's content with **no ancestry link to it**. The merge
    base stays frozen before the split, so the next promotion replays every staging commit against
    a `main` that already has that content under a different SHA — conflicting on every file
    touched before and after. It compounds each time. This is not hypothetical: PR #53 was squashed
    and the next promotion hit 10 conflicts, every one of them a phantom.
  - `main`'s ruleset must therefore keep **"Merge commit" among the allowed merge methods**.
    Squash-only on a release branch is a feature-branch rule applied where it does the opposite of
    what it's for.
- **Never** merge, force-push, `reset --hard`, or otherwise touch `main` (or `staging`) directly to
  route around a check. Never touch `main` from an agent at all.
- **Never reuse a squash-merged branch name** — re-pushing recreates it with diverged history.
- **`main` and `staging` are permanent — never delete either, under any circumstance.** This
  includes the `staging` → `main` promotion PR itself: in that one PR, `staging` is the *head*
  branch, which would make "auto-delete head branches" remove it like any throwaway agent branch
  if it weren't protected. `staging` must carry a GitHub branch-protection rule with "restrict
  deletions" (owner-set, one-time) precisely so that promotion never deletes it. The local branch-
  hygiene rule below is about ephemeral agent/feature branches only — it never applies to `main`
  or `staging`, regardless of what any `[gone]` marker might say.
- **Branch hygiene (yours to run, ephemeral branches only):** `fetch.prune=true` is set (dead
  remote-tracking refs auto-clear) and GitHub auto-deletes remote branches on merge. **You delete
  the local branch once its upstream shows `[gone]`.** Squash-merge hides merges from
  `git branch -d`, so `[gone]` is the safe signal. Never delete a branch checked out in another
  worktree, and never `main` or `staging` (see above).

### Pinning the superpowers git skills

Both git skills ship generic defaults that are wrong here. **This section wins over the skill text.**

**`using-git-worktrees`:**
- This harness has a **native worktree tool (`EnterWorktree`) — use it.** Never `git worktree add`;
  that creates phantom state the harness cannot see.
- Worktrees live at **`.claude/worktrees/`** and are **harness-owned**. Do not create `.worktrees/`
  or `worktrees/`, and do not add either to `.gitignore`.
- Branch off **fresh `origin/staging`**, never `main`, never the current branch.
- Its Step 4 clean baseline is **`pnpm typecheck && pnpm test`** on Node 24 — not `npm test`. Its
  Step 3 setup is `pnpm install`, and the core server must not be running (SQLite locks).

**`finishing-a-development-branch`:**
- Its Step 3 probes `main`/`master` for the base branch. **The base is always `staging`.** Never
  offer, and never perform, anything that targets `main` — that merge is the owner's alone.
- Option 1 "merge back locally" means **squash-merge to `staging`**, only after the full Definition
  of Done is green. One clean commit per feature.
- Option 2 "push and create a PR" means a PR **targeting `staging`**.
- Option 4 "discard" still requires the typed confirmation, and still may not delete `main`,
  `staging`, or a branch checked out in another worktree.
- Its cleanup step must **never remove a `.claude/worktrees/` worktree** — the harness owns those.
  Its own provenance check already says so; honour it.

## Parallelism

`writing-plans` produces tasks, not the parallel-safe-tagged phases the old flow used. **When work
is split across concurrent agents, the split happens at the spec level** — one spec, one plan, one
worktree, one branch, one agent — and two specs may run concurrently **only when their file/module
ownership is disjoint**, judged against the Project shape in Part I. Otherwise concurrent worktrees
collide on `staging`. Dependency-ordered work runs one at a time. You have 2 Claude + 1 `agy`.

`subagent-driven-development` runs its subagents inside **one** worktree on **one** branch — that is
task-level concurrency and needs no ownership split. `dispatching-parallel-agents` and multi-account
work do: same disjointness test, one worktree and one branch each.

**Phases 6a–6f are serial by definition** — one axis at a time is the whole point of the sequencing.
Nothing in that sequence is parallel-safe.

## Engineering conduct — hold this bar (identical for every harness)

Build so the codebase reads as if one disciplined engineer wrote all of it.

- **Think before coding.** State assumptions explicitly. If two readings of the request exist,
  present both — don't pick silently. If a simpler approach exists, say so; push back when
  warranted. If something is unclear, stop and name what's confusing rather than guessing. When that
  means putting a question to the owner, it carries the decision brief above.
- **Explain, don't just execute.** The owner is learning these domains while the product is built,
  so the reasoning is part of the deliverable, not a courtesy. Say what you did, why that way, and
  what the alternative would have cost. A correct change the owner cannot evaluate leaves them less
  able to direct the next one.
- **Scope discipline.** Build only the plan's task list. No unrequested refactors, abstractions,
  "while I'm here" cleanups, speculative future-proofing, or configurability nobody asked for.
  Three similar lines beat a premature abstraction. Flag unrelated debt in the PR, don't fold it in.
  The test: every changed line traces to the plan.
- **Surgical changes.** Don't "improve" adjacent code, comments, or formatting. Match existing
  style even where you'd do it differently. Remove imports and variables *your* change orphaned;
  leave pre-existing dead code alone and mention it instead.
- **Simplest thing that works.** If you wrote 200 lines and it could be 50, rewrite it. Would a
  senior engineer call this overcomplicated? Then it is.
- **No silent scope-drop — every deferral is written down.** The moment you defer, cut, or say
  "later", "out of scope", "not now", or "a follow-up", **write a file in `docs/deferred/`** before
  moving on: `YYYY-MM-DD-<slug>.md`, with what, why deferred, and the condition that should revive
  it. This applies to any feature we choose not to build — cut during design, dropped mid-build, or
  parked by a review. A deferral that exists only in a chat message is lost. Reviving an item means
  writing a fresh spec in `docs/specs/`, not resuming the frozen entry in place.
- **No defensive code for things that can't happen.** Trust internal invariants and framework
  guarantees; validate only at real boundaries (user input, external APIs, untrusted/agent-authored
  content).
- **Comments: default to none.** Add one only when the *why* is non-obvious (a hidden constraint, a
  bug workaround, a subtle invariant). Never restate the code; never reference a task/issue number.
- **Security first.** No OWASP-Top-10-class bugs (injection, XSS, SSRF, secret leakage, trust-boundary
  bypass). If you write one, fix it before moving on — never behind a TODO.
- **Never weaken trust boundaries** — no `bypassPermissions`, no wildcard tool grants; the plan's
  security tasks are mandatory, not optional.
- **Destructive/hard-to-reverse actions are opt-in, never a shortcut.** Force-push, `reset --hard`,
  deleting branches/files, `--no-verify`, history rewrites — find the root cause instead. If a plan
  genuinely needs one, say so visibly; never do it silently.
- **Verify before claiming done** — the Definition of Done above. typecheck+test green is necessary,
  not sufficient.
- **Git hygiene.** New commits over amends. Don't skip hooks or bypass signing.

## Non-negotiables

- **Commit author** is repo-set to `Sparstrow Agent <agent@sparstrow.com>`. Do NOT override it or add
  a `Co-Authored-By:` trailer (from Claude, Codex, anyone) — CI `author-check` fails otherwise.
- **`main` is branch-protected** — PR + 1 approval + `typecheck` + `author-check`, squash-only, no
  force-push. You cannot and must not merge it.
- **This file stays current.** When a change alters a rule here — a boundary moves, a stack decision
  changes, a Phase 6 invariant is superseded — update `CLAUDE.md` in the same PR. The frozen design
  docs rotted because nobody did; don't repeat it.
