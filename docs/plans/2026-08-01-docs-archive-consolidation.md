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

- [ ] `git mv docs/reference docs/archive`
- [ ] `git mv .design-src docs/archive/design-src`
- [ ] `git mv fable-handoff docs/archive/fable-handoff`
- [ ] `git mv docs/intake docs/archive/intake`
- [ ] `git mv docs/planned/factory-workflow-v2.md docs/archive/superseded/`
- [ ] `git mv docs/planned/curator-office-hours-parity.md docs/archive/superseded/`
- [ ] `git mv docs/project-delete-plan.md docs/deferred/2026-07-08-project-delete-trash-restore.md`
- [ ] Prepend the freezer header to the moved project-delete plan (source / project / size / date /
      links, then **What** / **Why deferred** / **Revisit when**) per `docs/deferred/README.md`
- [ ] `git status` — the 6 untracked pngs followed `docs/intake/assets/` and are still untracked

Expected: `git status` shows renames, not delete+add pairs.

## Task 3 — source comments (6 files, comment text only)

Rewrite `fable-handoff/…` → `docs/archive/fable-handoff/…`:

- [ ] `packages/core/src/db/schema.ts:542`
- [ ] `packages/core/src/db/migrations.ts:418`
- [ ] `packages/core/src/goap/dag.ts:11`
- [ ] `packages/core/src/agents/instances.ts:15`
- [ ] `packages/core/src/goap/engine-comparison.test.ts:7`
- [ ] `packages/shared/src/schemas/goal.ts:6`
- [ ] `git diff --stat` — 6 files, one line each, no logic touched

## Task 4 — `.gitignore`

- [ ] `.design-src/**/decoded/` → `docs/archive/design-src/**/decoded/`
- [ ] `git status --porcelain | grep decoded` returns nothing (still ignored, not newly untracked)

## Task 5 — inbound links

- [ ] `docs/planned/README.md:4` — `../reference/` → `../archive/`
- [ ] `docs/deferred/legacy-freezer.md:89` — `docs/reference/audits/…` → `docs/archive/audits/…`
- [ ] `docs/archive/shipped-plans/agent-git-automation.md:2` — `.design-src/APP.md` →
      `../design-src/APP.md`
- [ ] `docs/archive/shipped-plans/p8.1-antigravity-provider-plan.md:2` — same
- [ ] `docs/archive/shipped-plans/team-workspace-northstar.md:2` and `:12` — same
- [ ] `docs/archive/design-src/APP.md:7` — names `docs/intake/` as the "current work queue"; false
      regardless of this move. Correct to `docs/specs/` + `docs/plans/`
- [ ] `docs/archive/design-src/APP.md:90` — `../docs/reference/shipped-plans/…` →
      `../shipped-plans/…` (now a sibling)
- [ ] `PRODUCT.md:3-4` — provenance blockquote citing `docs/intake/0001+0002` and `.design-src/APP.md`
- [ ] `AGENTS.md:38` — "`docs/intake/` are retired; don't write there" → new path

## Task 6 — `docs/archive/README.md`

- [ ] Add `intake/`, `design-src/`, `fable-handoff/` to the subfolder table
- [ ] State the names-preserved rule so the convention survives the next addition
- [ ] Fix the stale claim that `.design-src/APP.md` is "the single source of truth" for what shipped
      — `CLAUDE.md` says do not read it
- [ ] Say plainly that the whole directory is off the read-path

## Task 7 — `CLAUDE.md` read-path (same PR, per the non-negotiable)

Line numbers are `origin/staging`'s, confirmed in the worktree:

- [ ] **Line 36** — `docs/planned/` description: note the two superseded plans moved out
- [ ] **Line 43** — the `docs/intake/` retired-history paragraph → `docs/archive/intake/`
- [ ] **Lines 48–50** — the "Do NOT read these" list → new paths, plus a sentence that
      `docs/archive/` as a whole is off the read-path

`.specify/memory/constitution.md` needs no amendment — verified it contains zero path references,
so no rule stated there changes.

## Task 8 — verification (the Definition of Done)

- [ ] `pnpm typecheck` — clean
- [ ] `pnpm test` — green, no regression from the 443/4 baseline
- [ ] `pnpm --filter @sparstrow/ui build` — succeeds
- [ ] `git log --follow docs/archive/fable-handoff/ENGINEERING_PLAN.md` — history survived
- [ ] Link sweep returns zero hits on `docs/reference`, `.design-src`, bare `fable-handoff/`,
      `docs/intake` outside `docs/archive/`
- [ ] `ls` at root and in `docs/` matches the spec's target structure

## Task 9 — land it

- [ ] `git push -u origin chore/docs-archive-consolidation`
- [ ] `gh pr create --base staging` — body flags the two out-of-scope items
- [ ] CI green (`typecheck`, `test`)
- [ ] `gh pr merge --squash --delete-branch`
- [ ] `ExitWorktree`; delete the local branch once its upstream shows `[gone]`
