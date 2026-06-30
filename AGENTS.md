# AGENTS.md — operating rules for external coding agents

> For any coding agent driving this repo from outside Claude Code — **Antigravity 2.0
> (Opus / Sonnet / Gemini), Cursor, Windsurf, a cloud agent, etc.** Planning is done
> elsewhere (Claude Code); your job here is **implementation only**. Read this first.

## Division of labor (do not cross these lines)
- **Planning happens in Claude Code** (design → `SPEC.md` → `/office-hours` → `/autoplan`).
  You do **not** design, re-scope, or make product decisions.
- **You implement an already-APPROVED plan** into a reviewable PR. That's it.

## Source of truth (read these, in order)
1. **`.design-src/APP.md`** — the build board. Tells you which page is ready to build
   (status `✅ autoplan`) and what's done.
2. **`.design-src/FACTORY-LOOP.md`** — the full runbook. **§⑤ "implementation routine" is
   your contract.** Follow it exactly.
3. **`.design-src/<page>/SPEC.md`** — the per-page plan. Build the **locked decisions + the
   `/autoplan` appendix**, NOT the decoded design module (modules carry pre-lock field
   names / stale providers / silent fallbacks).

## HARD GATE — refuse to build unless this is true
Only implement a `SPEC.md` whose `/autoplan` appendix contains the literal marker
**`Final gate: APPROVED`**. No marker → stop and report. Never build an un-approved spec.

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
  Do **not** override the author. Do **NOT** add a `Co-Authored-By:` trailer — CI
  (`author-check`) fails any commit whose author or trailer isn't `@sparstrow.com`.
- **`main` is branch-protected** — PR + 1 approval + `typecheck` + `author-check`, squash-only,
  no force-push. You cannot and must not merge or push to `main`.
- **Stay in scope.** Build only the SPEC's feature list. No "while I'm here" additions.
- **Never weaken trust boundaries** — no `bypassPermissions`, no wildcard tools, honor the
  SPEC's security tasks; they are mandatory.
- **Toolchain:** `pnpm` on Node 24 (better-sqlite3 / node-pty ABI). Don't run the core server
  during a build (DB locks). Start from a clean working tree.

## How the human invokes you (paste this, fill in the page)
> Implement the locked plan in `.design-src/<page>/SPEC.md` following `AGENTS.md` +
> `.design-src/FACTORY-LOOP.md` §⑤. Confirm `Final gate: APPROVED` first. Branch off
> origin/main, build → `pnpm typecheck` → `pnpm test` → push → print the PR compare URL →
> set the page to `🔁 in-review` in `.design-src/APP.md`. Do NOT merge.

Currently ready to build: **Agents Teams Pass 2** — `.design-src/agents/SPEC.md` §"Pass 2
(Teams F4/F5)" (flat membership + List view only; see its autoplan appendix).
