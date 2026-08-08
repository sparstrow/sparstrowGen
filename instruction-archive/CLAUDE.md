# CLAUDE.md — Sparstrowgen

Sparstrowgen is a local-first **agent factory**: a Fastify core on `127.0.0.1:48750`, React/Vite UI,
better-sqlite3 + Drizzle, Electron desktop shell, packaged as an always-on Windows app with
notify-only self-update. pnpm + turbo monorepo: `packages/{core, ui, shared, memory-cli, memory-mcp,
desktop}`. It is **in transition to hosted multi-tenant** — see Phase 6 below.

**How Sparstrowgen gets built is governed by two documents with separate, non-overlapping jobs.**

- **`.specify/memory/constitution.md` — what must be true.** The principles a spec, plan, or change
  can *violate*: the stack lock, verification, the owner's gates, the frontend bar, security and
  trust boundaries, scope discipline, and the Definition of Done. Spec-kit reads it and checks every
  plan against it.
- **`CLAUDE.md` — this file — how to work here.** The loop, the commands, the paths, the project
  map, the git flow. Procedure, not principle.

Neither restates the other. **A conflict between them is a defect to fix, not a precedence puzzle**
— but if one must be picked in the moment, the document that owns the domain wins: principles
there, procedure here. Both outrank any skill or template default.

Every coding agent follows both — Claude Code, `agy` (Antigravity), any harness. There is **no
per-tool carve-out and no conversational-mode exemption.** `AGENTS.md` points at both; never
maintain divergent build rules anywhere else.

---

# Part I — the code contract

## Read-path — what is authoritative

- **`.specify/memory/constitution.md`** — the principles. Read it first.
- **`CLAUDE.md`** — this file. Procedure and project map.
- **`PRODUCT.md`** — product purpose, users, register. **`DESIGN.md`** — the live token set and UI bar.
- **`specs/<NNN>-<slug>/`** — the artifacts for each unit of work: `spec.md`, `plan.md`, `tasks.md`,
  and whatever else that feature needed (`research.md`, `data-model.md`, `contracts/`,
  `checklists/`). Written by the spec-kit commands. **This is the only artifact home for new work.**
- **`docs/planned/`** — architecture specs that predate spec-kit. Everything left in it is live.
  `phase6-hosted-foundation.md` is the **active architecture**; `multi-tenancy-access-architecture.md`
  is its vision parent — *considered, never built from*; `verification-agent-gym-app.md` is an
  approved design **still waiting on a plan** — it reads like history and is not.
- **`docs/deferred/`** — the freezer; one file per deferred item, written at the moment the
  deferral is made (constitution VII).
- **`packages/ui/src/content/knowledge/`** — the shipped in-app Knowledge Center.

**Frozen, not authoritative:** `docs/specs/` and `docs/plans/` hold the artifacts of the
pre-spec-kit loop. Read them for history; never add to them. **`docs/archive/`** is finished and
superseded material — open it only to investigate why something is the way it is, never to adopt a
method found there.

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

Dependency direction and the stack lock are constitution IV. The reasoning behind each locked
decision is in `docs/planned/phase6-hosted-foundation.md` §1.1 — read it before re-proposing
anything, because re-proposing burns a review cycle and reaches the same answer.

## Frontend mechanics

The *bar* is constitution V. What follows is how to meet it in this repo.

**Order of work, before writing a component:**

1. Read `DESIGN.md` (tokens, motion, component vocabulary) and `PRODUCT.md`'s register.
2. Invoke the **`/shadcn` skill** and use the **Shadcn UI MCP** — `list_components` /
   `get_component` / `get_component_demo` for primitives, `list_blocks` / `get_block` for a
   composite surface (dashboard, settings, sidebar, form layout). Check for an existing block
   before composing a page from scratch.
3. Only then write code.

**Vendoring a shadcn component.** The shadcn CLI is **not** wired here — there is no
`components.json`, and `packages/ui/src/components/ui/` is vendored by hand. Do not run the CLI or
scaffold a config for it. Take the canonical source from the MCP and adapt it:

- Place it at `packages/ui/src/components/ui/<name>.tsx`, kebab-case.
- `cn` from `@/lib/utils`; `cva` for variants; `React.forwardRef` + `displayName`.
- Semantic tokens only — `bg-background`, `text-muted-foreground`, `border`, `ring-ring`. Never the
  registry's default palette or radius; our scale is pure-neutral OKLCH with `--radius: 0.625rem`.
- Add any new `@radix-ui/*` dependency to `packages/ui/package.json`.
- lucide icons only: `size-4` in controls, `size-3.5` in metadata rows.

**Vendored primitives do not need their own tests.** They are registry-generated source adapted to
repo conventions, and their real risk is visual and accessibility behaviour a unit test cannot
catch — the design bar and the real-artifact verification are what cover them. This is narrow: it
covers the vendored file itself, never a consumer built on top of it, and never a primitive
carrying repo-specific logic beyond styling and prop plumbing.

## Phase 6 — the hosted transition

Spec: `docs/planned/phase6-hosted-foundation.md`. Its security and tenancy invariants are
constitution VI and bind now. The rest is architecture context:

- **One axis per phase.** 6a–6f ship in order and the app works after each. Never combine the
  database swap with tenancy. Every phase before 6e has a rollback point; **6e is the first
  one-way door.**
- **Run events are never one row each in Postgres.** Four channels: Realtime Broadcast (live,
  ephemeral), gzipped transcript in Storage, ~70 structured metric rows, one summary row.
- **There is no sync layer.** Supabase is the system of record; desktop and web are both clients.
  Never build conflict resolution or offline reconciliation.
- **Source code never lives in Supabase.** Git syncs code; Supabase syncs metadata and pointers.

> **Parked (2026-08-05).** There are features to build before the hosted migration resumes, and
> whether this material belongs here, in the constitution, or nowhere is undecided. Treat the
> section as live until that decision is made.

## Multica (`D:\Sparstrow\multica-main`) — reference only

A **parts donor, never a fork base**, and never a source of code to copy. Read it only to answer a
specific "how did they handle X"; cite their migration number in the PR when a conclusion is
adopted.

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

## The loop

```
WORKTREE  →  entry decision  →  [ spec → review → clarify → plan → tasks ]  →
BUILD  →  VERIFY  →  SHIP  →  CLEANUP  →  PROMOTE
```

### 1. Worktree

Every unit of work starts in its own worktree off `staging` — including chat-lane work, including
docs-only sessions. Nothing is ever committed on a local `staging` or `main` checkout.

```bash
git checkout staging && git pull
```

Then create it with the harness's **`EnterWorktree` tool**. Never `git worktree add` — that creates
phantom state the harness cannot see. Worktrees live at `.claude/worktrees/` and are harness-owned;
do not create `.worktrees/` and do not add either path to `.gitignore`.

`worktree.baseRef` is set to `head` in `.claude/settings.json`, so a new worktree branches from your
current local HEAD — which is why the sync above is mandatory. The default, `fresh`, would branch
from `origin/main`, because `main` is the repo's default branch.

**Naming: `WT<feature-number>-<slug>`.** The number is spec-kit's sequential feature number, so the
branch and its spec directory share one identity — `WT012-hosted-postgres` ↔
`specs/012-hosted-postgres/`. It is monotonic and never reused. Before creating it:

```bash
git ls-remote --heads origin "WT012-*"
```

Anything returned means another agent already claimed that number. Push the branch as soon as it
exists, to claim it yourself.

### 2. Entry decision

**Would a user of Sparstrowgen notice this change?**

- **Yes** — a new surface, an API route, a schema migration, changed behaviour, a Knowledge Center
  page describing a user-facing flow. Run the spec-driven chain below.
- **No** — repo, CI, tooling, dependency bumps, governance, documentation about how we build. Work
  in regular chat. No spec, no plan, no tasks.

When it is genuinely unclear, ask. When it is clear, don't.

### 3. Spec → tasks

Once the entry decision says yes, the chain runs without asking at each step:

| Command | Output |
| --- | --- |
| `/speckit.specify` | `specs/<NNN>-<slug>/spec.md` |
| **owner review** | open questions, accept or reject — the one gate in the chain |
| `/speckit.clarify` | up to 5 targeted questions, answers written back into `spec.md` |
| `/speckit.plan` | `plan.md` (+ `research.md`, `data-model.md`, `contracts/` as needed) |
| `/speckit.tasks` | `tasks.md` |
| `/speckit.analyze` | cross-artifact consistency check across spec, plan, and tasks |

`/speckit.checklist` generates a review checklist when the feature warrants one; the Definition of
Done requires it to be complete before merge. `/speckit.constitution` amends the constitution.
`/speckit.converge` is the recovery path — it compares the codebase against the artifacts and
appends the unbuilt remainder to `tasks.md`.

**`/speckit.tasks` must place verification tasks in the Integration and Polish phases, never in a
Tests-first phase.** The template's default ordering is test-first; this repo verifies the built
artifact instead (constitution I).

### 4. Build

**Do not use `/speckit.implement`.** Work `tasks.md` directly:

- Phases in order; respect declared dependencies; same-file tasks run sequentially.
- **Tick `[X]` in `tasks.md` as each task completes.** `/speckit.converge` reads that state to work
  out what is left — skip the ticking and the recovery path goes blind.
- Halt on failure rather than continuing past it.
- **Do not create or edit ignore files** (`.gitignore`, `.prettierignore`, `.eslintignore`) unless a
  task says to. `/speckit.implement` does this automatically, which is one reason it is not used.

### 5. Verify

Constitution I: drive the real artifact, cover every area the change touches, one change at a time.
Then the full Definition of Done — constitution, Quality Gates.

### 6. Ship

```bash
gh pr create --base staging --title "..." --body "..."
```

```bash
gh pr merge --merge --auto
```

`staging` requires a PR with `test` and `typecheck` green, and zero approvals — so the agent that
opens the PR also merges it. GitHub holds the merge until the checks pass. **Merge commit, never
squash**, at this level and at promotion.

### 7. Cleanup

Before removing anything, confirm all three:

```bash
gh pr view <n> --json state,mergedAt,headRefName
```

```bash
gh run list --branch staging --limit 1 --json status,conclusion,headSha
```

- the PR reads `MERGED`,
- the **post-merge** CI run on `staging` is green — GitHub deletes the head branch at merge time and
  does not wait for this run, so a gone branch is not evidence the merge was healthy,
- the head branch is gone.

Then `ExitWorktree { action: "remove" }`. Because the feature merge is a merge commit, your commits
are ancestors of `staging` and the tool removes cleanly without `discard_changes`. **Never**
`git worktree remove` or delete the directory by hand — that leaves registry entries behind.

**Stale worktrees are a defect.** A session that crashes before cleanup leaves one behind; sweep
periodically by comparing `git worktree list` against merged PRs.

### 8. Promote

The owner reviews the running app on `staging` and merges `staging` → `main`. That is the only human
merge, and the only merge an agent must never perform. CI on a `main` tag builds and publishes; the
packaged app then shows a notify-only "update available".

## Concurrency

Agents work **concurrently**: several units of work in flight at once, each in its own worktree off
`staging`, each with its own branch and PR. Work whose file ownership overlaps another in-flight
unit runs after it, not beside it — judged against the Project shape in Part I.

Parallelism proper — deliberately splitting one unit across agents — is **not in use** and will be
reconsidered once a feature has shipped end to end under this loop. Phases 6a–6f are serial by
definition; nothing in that sequence is parallel-safe.

`staging`'s required checks do not require branches to be up to date before merging, so two PRs can
each pass against an older `staging` and produce a red post-merge run when combined. That is why
cleanup waits on the post-merge run. A merge queue is the eventual fix and is not set up yet.

## Testing

The rule is constitution I. The map is here:

| What is tested | Location |
| --- | --- |
| Server behaviour — orchestrator, providers, memory, api | `packages/core/src/**/*.test.ts` |
| Policy resolution, schemas, shared pure logic | `packages/shared/src/*.test.ts` |
| Every schema migration | `packages/core/src/db/migration-<nnnn>.test.ts` |
| UI logic — render predicates, formatting, state rules | `packages/ui/src/**/*.test.ts` |

Frontend testing works best by keeping the decision separate from the markup: extract the rule into
a pure function under `packages/ui/src/lib/` and test that — no DOM, no harness ceremony.
`lib/chat-pending.ts` is the worked example, five lines and five tests, while `chat.tsx` just calls
it. Reach for a component-rendering harness only when the behaviour genuinely lives in the markup.

### What CI actually enforces

| Check | `staging` | `main` |
| --- | --- | --- |
| `typecheck` | on push + PR — **required** | on push + PR — **required** |
| `test` | on push + PR — **required** | on push + PR — not required |
| `author-check` | — | PR — **required** |

`main` additionally requires 1 approval and is merge-commit only; `staging` requires 0 approvals and
is merge-commit only. Everything else in the Definition of Done is yours to run — the real-artifact
verification, the design bar, checklist completeness, Knowledge Center currency, and the
architecture contract have no automation behind them and never will. **A green PR is not a passed
gate.**

## Skills

Skills are invoked on the agent's judgment. There is no ask-first gate — that rule was retired along
with the superpowers loop on 2026-08-05.

- **`/shadcn` is mandatory for all frontend work** (constitution V). It is an obligation, not a
  preference.
- **`/speckit.*`** — the loop above.
- **`/qa`** — QA a running surface.

**Retired:** the superpowers skills, and the `/autoplan`, `/plan-ceo-review`, `/plan-eng-review`,
`/plan-devex-review` review lenses — see `docs/deferred/2026-08-05-plan-review-lenses.md` for what
that costs and what revives it. The `/listener`, `/curator` and `/pipeline-suggester` skills were
**deleted** on 2026-07-26 — recover from git if ever needed.

## Asking the owner

Constitution III carries the rule: the owner's knowledge profile, the eight-point decision brief on
every technical **decision-making** question, and the blind-spot duty. Read it before asking
anything.

Real examples from this repo of what the blind-spot duty is for. Every one of them passes
`typecheck` and `test`:

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
  promotion conflict on every file. PR #53 did this and the next promotion hit 10 phantom conflicts.
- **Green is not verified.** Adding `@sparstrow/shared` to `packages/desktop` typechecks clean,
  tests clean, and fails only at startup inside the packaged app.

## Engineering conduct

The rules are constitution VII. Two operational notes:

- **Explain, don't just execute.** The owner is learning these domains while the product is built,
  so the reasoning is part of the deliverable, not a courtesy. Say what you did, why that way, and
  what the alternative would have cost. A correct change the owner cannot evaluate leaves them less
  able to direct the next one.
- **Git hygiene.** New commits over amends. Don't skip hooks or bypass signing. Never force-push,
  `reset --hard`, or delete a branch to route around a check.

## Non-negotiables

- **Commit author** is repo-set to `Sparstrow Agent <agent@sparstrow.com>`. Do NOT override it or
  add a `Co-Authored-By:` trailer — CI `author-check` fails otherwise.
- **`main` is branch-protected** — PR + 1 approval + `typecheck` + `author-check`, merge-commit only,
  no force-push. You cannot and must not merge it.
- **Both contracts stay current.** When a change alters a rule, update the document that owns it —
  principles in the constitution, procedure here — in the same PR, with the reason. The archived
  design docs rotted because nobody did; don't repeat it.
