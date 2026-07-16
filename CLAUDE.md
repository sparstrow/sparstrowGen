# CLAUDE.md — Sparstrowgen

Sparstrowgen is a local-first, single-user **agent factory**: a Fastify core on
`127.0.0.1:48750`, React/Vite UI, better-sqlite3 + Drizzle, Electron desktop shell, packaged
as an always-on Windows app with notify-only self-update. pnpm + turbo monorepo:
`packages/{core, ui, shared, memory-cli, memory-mcp, desktop}`.

**This file is the single source of truth for how Sparstrowgen gets built.** Every coding agent
— Claude Code, `agy` (Antigravity), any harness — follows the SAME rules here. There is **no
per-tool carve-out and no conversational-mode exemption**: the gate below applies to Claude Code
exactly as it applies to `agy`, whether you plan-and-build in one session or implement a handed-off
plan. `AGENTS.md` points here; never maintain divergent build rules anywhere else.

## Do NOT read these (frozen history — off the read-path)

- `.design-src/APP.md`, `fable-handoff/ENGINEERING_PLAN.md`, `.design-src/*/SPEC.md` — the
  page-by-page and P1–P10 engine work, all shipped and banner-frozen. Never read them for current
  state, never update them. Reading them wastes tokens on finished work.
- **Live** captured work → `docs/intake/`. **Approved** plans → `docs/planned/`. Shipped intake →
  `docs/intake/done/`.

## Build & verify

- `pnpm typecheck && pnpm test` — Node 24 (better-sqlite3 / node-pty native ABI).
- Don't run the core server during a build (SQLite locks). Start from a clean working tree.
- Package the desktop app: `pnpm --filter @sparstrow/ui build && pnpm --filter @sparstrow/memory-mcp build && pnpm --filter @sparstrow/memory-cli build && pnpm --filter @sparstrow/desktop dist`.

## The loop

`CAPTURE → PLAN → BUILD (parallel) → VERIFY → PROMOTE → SHIP`

1. **Capture** — `/listener` writes one intake doc per item to `docs/intake/` in the owner's
   words. Capture only: no analysis, no code reading, no fixes.
2. **Plan** — `/curator` (analysis + real office-hours dialogue), then the planning skills
   (`/office-hours`, `/plan-ceo-review`, `/plan-eng-review`, `/plan-devex-review`, `/autoplan`)
   produce a **phased plan**. Each phase is tagged **parallel-safe or serial** and declares the
   **files/modules it owns**.
3. **Build** — one worktree per parallel phase (Claude Code or `agy`), branched off `staging`.
   One atomic commit per task.
4. **Verify** — the Definition of Done below. Non-negotiable, same for every agent.
5. **Promote** — the owner reviews the **running app on `staging`** and promotes `staging` → `main`.
6. **Ship** — CI on a `main` tag builds + publishes; the packaged app shows a notify-only
   "update available".

**Intake lifecycle is mandatory bookkeeping:** when a change ships, set its intake doc to
`status: done` + `resolution: shipped` + the PR link and move it to `docs/intake/done/`. (This was
silently skipped for 0001/0002/0004 — don't skip it.)

## Definition of Done — the gate (all green, before any merge)

Green typecheck+test proves correctness, not that the feature works. A change is **not done** until:

1. **`pnpm typecheck`** — clean.
2. **`pnpm test`** — green, PLUS new tests for what you built (bug fix → regression test; new
   surface → golden-path coverage).
3. **Real-artifact usability test** — drive the actual running thing, never a mock:
   - UI/backend → boot the dev server or packaged app and exercise the flow in a real browser
     (the Browser-pane preview, in-app Chrome, or `agy`'s browser); observe it work.
   - CLI/integration → send a real input and read the real output. A canned/echo reply is a **FAIL**
     (e.g. the Antigravity chat returning "I'm the Antigravity agent…" instead of answering).
   - Packaging/artifact → build AND boot the artifact (the boot test that caught the 0004 installer
     is a required step, not luck).
   - If it's broken, fix it and re-verify before it counts as done.
4. **Design/UI bar** — frontend is **top-level, not deferred**: match the design system, handle
   empty / loading / error states, not just "it renders".

## Git flow

`staging` is **live** (created 2026-07-14). Branch off fresh `origin/staging`, build, pass the
gate, merge to `staging`.

- **`staging` = the agents' trunk.** Branch off fresh `origin/staging`, build, **pass the gate**,
  then merge to `staging`. Agents may **auto-merge to `staging` only after the gate is green**.
- **`main` = the owner's release gate.** The owner reviews `staging` and promotes `staging` → `main`
  — the only human merge. `main` stays release-quality, so the always-on app never updates from
  unseen code. CI ships on `main` tags.
- **Squash-merge, always** (both levels). One clean commit per feature; agent working commits are
  disposable scaffolding.
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

## Parallelism

The plan tags two phases parallel-safe **only when their file/module ownership is disjoint** — else
concurrent worktrees collide on `staging`. Assign each parallel phase its own worktree + agent
account (you have 2 Claude + 1 `agy`). Serial phases (shared-file or dependency-ordered) run one at
a time. The plan is the coordination artifact that makes concurrent agents safe.

## Engineering conduct — hold this bar (identical for every harness)

Build so the codebase reads as if one disciplined engineer wrote all of it.

- **Scope discipline.** Build only the plan's task list. No unrequested refactors, abstractions,
  "while I'm here" cleanups, or speculative future-proofing. Three similar lines beat a premature
  abstraction. Flag unrelated debt in the PR, don't fold it in.
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
- **Stay in scope** — build only the plan's tasks.

## Skill routing

When a request matches a skill, invoke it via the Skill tool. When in doubt, invoke it.

- **Capture** — a bug/feedback, a new idea/feature/concept, a design, a change, or a memory note
  ("log this", "note this", "remember this decision") → **/listener** (capture only).
- **Review / classify / route a capture** — "is this the right mode", "where does this go", "plan
  this", or right after a `/listener` capture → **/curator**.
- **Shape a concept / brainstorm** → **/office-hours**. **Strategy/scope** → **/plan-ceo-review**.
  **Architecture** → **/plan-eng-review**. **Developer experience** → **/plan-devex-review**.
  **Full auto-review of a plan** → **/autoplan**.
- **Bugs / root cause** → **/investigate**. **QA a running surface** → **/qa**. **Ship a PR** →
  **/ship**. **Land + deploy** → **/land-and-deploy**.

**Deferred — do not route to these now:** Memory Archivist, Pipeline Suggester. The *ideas* become
Sparstrowgen product features later; they are not build-process steps.
