# AGENTS.md — operating rules for AI coding agents

> **Harness-agnostic entry point.** Most coding agents (Codex CLI, Cursor, Windsurf, Antigravity
> `agy`, cloud/background agents) auto-discover this file at the repo root. Whichever tool you are,
> you follow the **same contract** as Claude Code — there is no separate, weaker rulebook for
> "other" harnesses.

## The build contract is `CLAUDE.md` — read it now and follow it exactly

`CLAUDE.md` is the single source of truth, in two halves. **Part I — the code contract:** project
shape and one-way package dependencies, the stack lock (TypeScript everywhere, Vite/React — *no
Go, no Next.js*), the frontend & design contract (shadcn/ui first, production-grade from the first
commit), the Phase 6 invariants for the hosted multi-tenant transition, and the Multica
reference-only boundary. **Part II — the build contract:** the superpowers loop (brainstorm → spec →
plan → worktree → TDD build → review → verify → finish → promote), the skill gate, the iron law of
TDD, the **Definition of Done** gate, the git flow (`staging` as the agents' trunk, `main` as the
owner's release gate, squash to `staging` but a merge commit to `main`, branch hygiene), test
placement, the parallelism rules,
and the engineering conduct bar.

**Read `CLAUDE.md` before doing anything and follow every rule in it.** Do not rely on this file
for the details — it is a pointer, not a divergent contract.

## The methodology is superpowers — with two house rules

Install it for your harness if you don't have it (the plugin supports Claude Code, Codex, Gemini
CLI, Cursor, Copilot CLI, Droid, OpenCode). Then, in this repo:

1. **Ask before invoking any skill.** Name it, say what it would do, ask "use it now, next turn, or
   skip?", and wait. This deliberately overrides the plugin's auto-invoke mandate — superpowers'
   own instruction-priority rule puts `CLAUDE.md` above its skills. Auto-invoking here is a
   violation.
2. **TDD is the iron law.** No production code without a failing test first, and you must have
   *watched* it fail. Code written before its test gets deleted and redone. Exceptions (config,
   generated code, docs-only) need the owner's say-so.

Specs go to `docs/specs/`, plans to `docs/plans/` — this overrides the plugin's
`docs/superpowers/…` defaults. The old Listener/Curator capture flow and `docs/intake/` are
**retired**; don't write there.

## Non-negotiables (the safety net — full contract in `CLAUDE.md`)

- **Nothing merges without passing the Definition of Done** in `CLAUDE.md` (typecheck + tests
  written test-first + a real-artifact usability test — actually run the thing, a canned/echo result
  is a FAIL — plus the design bar, Knowledge Center currency, the architecture contract, and
  evidence for every completion claim).
- **Green tests do not make a change done.** A change that violates Part I of `CLAUDE.md` — package
  boundaries, the stack lock, the design contract, a Phase 6 invariant — is not done, however green.
- **Frontend work starts with shadcn/ui**, and ships all four states (populated, empty, loading,
  error) in both themes, in the same change. Never a polish pass deferred to later.
- **Commit author** is repo-set to `Sparstrow Agent <agent@sparstrow.com>`. Do NOT override it or
  add a `Co-Authored-By:` trailer — CI `author-check` fails otherwise.
- **Never touch `main` directly** — it is branch-protected (PR + approval + checks, no
  force-push). Promotion to `main` uses a **merge commit, never a squash** — see `CLAUDE.md`'s Git
  flow for why squashing two permanent branches manufactures conflicts. Agents branch off fresh `origin/staging`, build, gate, merge to `staging`; the owner
  promotes `staging` → `main`. **Never commit directly on a local `staging`/`main` checkout, for any
  kind of session** — the only commands run there are the squash-merge and its push. With multiple
  agent accounts working concurrently, derive branch names from something unique (the plan or spec
  slug) and check `git ls-remote --heads origin <name>` before pushing a new one — see
  `CLAUDE.md`'s Git flow section for the full rule.
- **Worktrees are harness-owned** at `.claude/worktrees/`. Use your harness's native worktree tool;
  never `git worktree add`, never create `.worktrees/`.
- **Stay in scope** — build only the plan's tasks; no "while I'm here" additions.
- **Never weaken trust boundaries** — no `bypassPermissions`, no wildcard tool grants.
- **Toolchain:** `pnpm` on Node 24 (better-sqlite3 / node-pty ABI). Don't run the core server during
  a build (SQLite locks). Start from a clean working tree.
- **Branch hygiene:** delete your local branch once its upstream shows `[gone]`; never delete a
  branch checked out in another worktree.
