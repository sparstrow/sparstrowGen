# Docs archive consolidation — implementation plan

Spec: [`../specs/2026-08-01-docs-archive-consolidation-design.md`](../specs/2026-08-01-docs-archive-consolidation-design.md)
Branch: `chore/docs-archive-consolidation` off `origin/staging` (`8e579a1`)
PR: _filled in when the work ships_

Docs-only. No production logic changes, so no RED→GREEN cycles: the iron law's docs exception
applies, with the owner's say-so on record. The 6 source-file edits are comment text only, and
`pnpm typecheck && pnpm test` is what proves it.

Clean baseline recorded before any edit: **typecheck 6/6, 443 tests passed / 4 skipped, 62 files.**

## Task 1 — commit the spec and this plan

- [x] Write `docs/specs/2026-08-01-docs-archive-consolidation-design.md`
- [x] Write `docs/plans/2026-08-01-docs-archive-consolidation.md`
- [x] Commit both before any file moves

## Task 2 — the moves

`git mv` throughout, so history follows and `git log --follow` keeps working.

- [x] `git mv docs/reference docs/archive`
- [x] `git mv .design-src docs/archive/design-src`
- [x] `git mv fable-handoff docs/archive/fable-handoff`
- [x] `git mv docs/intake docs/archive/intake`
- [x] `git mv docs/planned/factory-workflow-v2.md docs/archive/superseded/`
- [x] `git mv docs/planned/curator-office-hours-parity.md docs/archive/superseded/`
- [x] `git mv docs/project-delete-plan.md docs/deferred/2026-07-08-project-delete-trash-restore.md`
- [x] Prepend the freezer header to the moved project-delete plan (source / project / size / date /
      links, then **What** / **Why deferred** / **Revisit when**) per `docs/deferred/README.md`
- [x] `git status` — all 44 changes registered as renames (`R`), zero delete+add pairs

**Correction to the plan as written.** It claimed the 6 untracked PNGs in `docs/intake/assets/`
would follow the move automatically. They did not, and could not: a worktree contains only tracked
files, so those PNGs exist solely in the main checkout. After this merges, the main checkout will
have a leftover `docs/intake/assets/` directory holding them. Left for the owner rather than
resolved here — they chose to keep untracked files untracked, and moving them is their call.
Flagged in the PR body.

## Task 3 — source comments (6 files, comment text only)

Rewrite `fable-handoff/…` → `docs/archive/fable-handoff/…`:

- [x] `packages/core/src/db/schema.ts:542`
- [x] `packages/core/src/db/migrations.ts:418`
- [x] `packages/core/src/goap/dag.ts:11`
- [x] `packages/core/src/agents/instances.ts:15`
- [x] `packages/core/src/goap/engine-comparison.test.ts:7`
- [x] `packages/shared/src/schemas/goal.ts:6`
- [x] `git diff --stat` — 6 files, one line each, no logic touched

## Task 4 — `.gitignore`

- [x] `.design-src/**/decoded/` → `docs/archive/design-src/**/decoded/`
- [x] `git status --porcelain | grep decoded` returns nothing (still ignored, not newly untracked)

## Task 5 — inbound links

- [x] `docs/planned/README.md:4` — `../reference/` → `../archive/`
- [x] `docs/deferred/legacy-freezer.md:89` — `docs/reference/audits/…` → `docs/archive/audits/…`
- [x] `docs/archive/shipped-plans/agent-git-automation.md:2` — `.design-src/APP.md` →
      `../design-src/APP.md`
- [x] `docs/archive/shipped-plans/p8.1-antigravity-provider-plan.md:2` — same
- [x] `docs/archive/shipped-plans/team-workspace-northstar.md:2` and `:12` — same
- [x] `docs/archive/design-src/APP.md:7` — names `docs/intake/` as the "current work queue"; false
      regardless of this move. Correct to `docs/specs/` + `docs/plans/`
- [x] `docs/archive/design-src/APP.md:90` — `../docs/reference/shipped-plans/…` →
      `../shipped-plans/…` (now a sibling)
- [x] `PRODUCT.md:3-4` — provenance blockquote citing `docs/intake/0001+0002` and `.design-src/APP.md`
- [x] `AGENTS.md:38` — "`docs/intake/` are retired; don't write there" → new path

## Task 6 — `docs/archive/README.md`

- [x] Add `intake/`, `design-src/`, `fable-handoff/` to the subfolder table
- [x] State the names-preserved rule so the convention survives the next addition
- [x] Fix the stale claim that `.design-src/APP.md` is "the single source of truth" for what shipped
      — `CLAUDE.md` says do not read it
- [x] Say plainly that the whole directory is off the read-path

## Task 7 — `CLAUDE.md` read-path (same PR, per the non-negotiable)

Line numbers are `origin/staging`'s, confirmed in the worktree:

- [x] **Line 36** — `docs/planned/` description: note the two superseded plans moved out
- [x] **Line 43** — the `docs/intake/` retired-history paragraph → `docs/archive/intake/`
- [x] **Lines 48–50** — the "Do NOT read these" list → new paths, plus a sentence that
      `docs/archive/` as a whole is off the read-path

`.specify/memory/constitution.md` needs no amendment — verified it contains zero path references,
so no rule stated there changes.

## Task 8 — verification (the Definition of Done)

- [x] `pnpm typecheck` — clean
- [x] `pnpm test` — green, no regression from the 443/4 baseline
- [x] `pnpm --filter @sparstrow/ui build` — succeeds
- [x] `git log --follow docs/archive/fable-handoff/ENGINEERING_PLAN.md` — history survived
- [x] Link sweep returns zero hits on `docs/reference`, `.design-src`, bare `fable-handoff/`,
      `docs/intake` outside `docs/archive/`
- [x] `ls` at root and in `docs/` matches the spec's target structure

Results, run in this worktree:

| Check | Result |
| --- | --- |
| `pnpm typecheck` | 6/6 successful. `core` and `shared` **re-ran** (not cache replays) — they hold the edited files |
| `pnpm test` | 62 files, **443 passed / 4 skipped** — identical to the pre-edit baseline |
| `pnpm --filter @sparstrow/ui build` | ✓ built in 16.52s |
| `git log --follow` on `ENGINEERING_PLAN.md` | traverses into pre-move history (`b350bfe`, `f49eb7e`) |
| `git check-ignore` new path | matched by `.gitignore:24` |
| `git check-ignore` old path | exit 1 — correctly no longer ignored |
| Link sweep outside `docs/archive/` | zero hits |

The `graph-engine: install failed` WARN lines in the core suite are pre-existing failure-path test
fixtures (`download-failed`, `extract-failed`, `health-failed` are the cases under assertion). Test
counts match baseline exactly, and comment-only edits cannot change runtime behaviour.

## Task 9 — land it

- [ ] `git push -u origin chore/docs-archive-consolidation`
- [ ] `gh pr create --base staging` — body flags the two out-of-scope items
- [ ] CI green (`typecheck`, `test`)
- [ ] `gh pr merge --squash --delete-branch`
- [ ] `ExitWorktree`; delete the local branch once its upstream shows `[gone]`
