# AGENTS.md — operating rules for AI coding agents

> **Harness-agnostic.** This file follows the community `AGENTS.md` convention that most
> coding agents (Codex CLI, Cursor, Windsurf, Antigravity 2.0, cloud/background agents, etc.)
> auto-discover at the repo root — so whichever tool you are, you get the same contract without
> extra config. Planning happens in Claude Code; your job here is **implementation only**, held
> to the **same engineering bar Claude Code holds itself to** (see "Engineering conduct" below).
> Read this first.

## Division of labor (do not cross these lines)
- **Planning happens in Claude Code** (design → `SPEC.md` → `/office-hours` → `/autoplan`).
  You do **not** design, re-scope, or make product decisions.
- **You implement an already-APPROVED plan** into a reviewable PR. That's it.

## Capture sessions (the Listener)
If the user brings you something to **record rather than build** — a bug/feedback, a new
idea/feature/concept, a design, a change, or a memory note (decision/pitfall/lesson/meeting/
architecture) — you are acting as the **Listener**. **Adopt `docs/workflows/agents/listener.md`
verbatim** and follow it: capture faithfully in the user's own words, ask only to record (never
to diagnose), stay capture-only (no code reading, no analysis, no fixes, no judgment), and offer
blind-spot suggestions *only* when the user asks "what do you think?". Write the result to
`docs/intake/` per `docs/intake/README.md`. This is the same contract as Claude Code's
`/listener` skill — one canonical doc, two entry points.

## Source of truth (read these, in order)
1. **`.design-src/APP.md`** — the build board. Tells you which page is ready to build
   (status `✅ autoplan`) and what's done. **Read the live table — do not trust any
   hardcoded "currently ready to build" claim in this file, including the one at the
   bottom; those go stale the moment something ships.**
2. **`.design-src/FACTORY-LOOP.md`** — the full runbook. **§⑤ "implementation routine" is
   your contract.** Follow it exactly.
3. **`.design-src/<page>/SPEC.md`** — the per-page plan. Build the **locked decisions + the
   `/autoplan` appendix**, NOT the decoded design module (modules carry pre-lock field
   names / stale providers / silent fallbacks).

## HARD GATE — refuse to build unless this is true
Only implement a `SPEC.md` whose `/autoplan` appendix contains the literal marker
**`Final gate: APPROVED`**. No marker → stop and report. Never build an un-approved spec.

## Engineering conduct — hold the same bar as Claude Code
This repo is built across multiple AI harnesses on purpose. Whichever one you are, follow
these so the codebase reads as if one disciplined engineer wrote all of it:

- **Scope discipline.** Build only the SPEC's task list. No unrequested refactors,
  abstractions, "while I'm here" cleanups, or speculative future-proofing. Three similar
  lines beats a premature abstraction. If you spot unrelated debt, flag it in the PR
  description — don't fold it into this commit.
- **No defensive code for things that can't happen.** Trust internal invariants and
  framework guarantees; validate only at real boundaries (user input, external APIs,
  untrusted/agent-authored content).
- **Comments: default to none.** Add one only when the *why* is non-obvious — a hidden
  constraint, a workaround for a specific bug, a subtle invariant. Never restate what the
  code already says, and never reference "the task" or "issue #N" in a comment (that
  belongs in the PR, and rots as the code evolves).
- **Security first.** Don't introduce OWASP-Top-10-class bugs (injection, XSS, SSRF, secret
  leakage, auth/trust-boundary bypass). If you notice you just wrote one, fix it before
  moving on — don't ship it behind a TODO.
- **Never weaken trust boundaries** — no `bypassPermissions`, no wildcard tool grants, honor
  the SPEC's security tasks; they are mandatory, not optional hardening.
- **Treat destructive/hard-to-reverse actions as opt-in, never a shortcut.** Force-push,
  `reset --hard`, deleting branches/files, skipping hooks (`--no-verify`), rewriting history
  — don't reach for these to route around a failing check or an obstacle. Find the root
  cause. If a plan genuinely requires one, say so explicitly and visibly; never do it
  silently.
- **Verify before claiming done.** `pnpm typecheck && pnpm test` green is necessary, not
  sufficient. If the task touches UI or other observable behavior, actually run it (dev
  server + browser, or your harness's equivalent) and exercise the golden path before
  calling it finished. Passing type checks and tests proves correctness, not that the
  feature works.
- **Git hygiene.** New commits over amends. Don't skip hooks or bypass signing. Don't force
  push. Keep the diff matched to the SPEC's scope.

## The job (FACTORY-LOOP §⑤, condensed — the full version wins on any conflict)
1. `git fetch origin && git switch -c <type>/<page>-<slug> origin/main`
   — **always branch off fresh `origin/main`.** Never reuse a squash-merged branch name.
2. Read the whole `SPEC.md`, including the autoplan **Implementation Tasks** (P1→P2→P3)
   and the **Failure Modes / Error & Rescue** registries. Build the locked decisions only.
3. Implement task-by-task. **One atomic commit per task**, message references the task id.
4. `pnpm typecheck && pnpm test` — both green before pushing. Never push red.
5. `git push origin HEAD`.
6. **PR:** `gh pr create` is blocked on this machine. Push the branch and print the URL:
   `https://github.com/sparstrow/sparstrowGen/compare/main...<branch>?expand=1`
7. Update `.design-src/APP.md`: set the page status to `🔁 in-review` and record the branch.
8. **STOP. Never merge.** The human reviews and squash-merges.

## Non-negotiable constraints
- **Git identity is already set** repo-locally to `Sparstrow Agent <agent@sparstrow.com>`.
  Do **not** override the author. Do **NOT** add a `Co-Authored-By:` trailer — from Claude,
  Codex, or anyone else — CI (`author-check`) fails any commit whose author or trailer
  isn't `@sparstrow.com`.
- **`main` is branch-protected** — PR + 1 approval + `typecheck` + `author-check`, squash-only,
  no force-push. You cannot and must not merge or push to `main`.
- **Stay in scope.** Build only the SPEC's feature list. No "while I'm here" additions.
- **Never weaken trust boundaries** — no `bypassPermissions`, no wildcard tools, honor the
  SPEC's security tasks; they are mandatory.
- **Toolchain:** `pnpm` on Node 24 (better-sqlite3 / node-pty ABI). Don't run the core server
  during a build (DB locks). Start from a clean working tree. Whatever your harness calls
  its shell/terminal tool, this toolchain requirement is identical.

## How the human invokes you (paste this, fill in the page)
> Implement the locked plan in `.design-src/<page>/SPEC.md` following `AGENTS.md` +
> `.design-src/FACTORY-LOOP.md` §⑤. Confirm `Final gate: APPROVED` first. Branch off
> origin/main, build → `pnpm typecheck` → `pnpm test` → push → print the PR compare URL →
> set the page to `🔁 in-review` in `.design-src/APP.md`. Do NOT merge.

Check `.design-src/APP.md`'s Build board for whichever page is currently at `✅ autoplan` —
that table is the live source of truth, not this file. As of this writing nothing on the
per-page board is at `✅ autoplan` (all pages are `⬜ backlog`, awaiting design); the
whole-factory engine phases (`fable-handoff/ENGINEERING_PLAN.md`) are being built directly
in Claude Code rather than through this routine. Don't start work here without confirming
current status first.
