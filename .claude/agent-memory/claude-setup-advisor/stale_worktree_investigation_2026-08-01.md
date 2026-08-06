---
name: stale_worktree_investigation_2026-08-01
description: Read-only verdicts on the two detached-HEAD stale worktrees found in the 2026-08-01 audit — both confirmed safe to discard, with the method used to prove it
metadata:
  type: project
---

Follow-up to [[project_claude_dir_audit_2026-08-01]]. The audit flagged two worktrees under
`.claude/worktrees/` as detached HEAD, ~19 days stale, but didn't open them. Coordinator asked for
a read-only inspection with a clear per-worktree verdict. Both turned out to be **safe to discard —
their unique content already landed in `origin/staging` under a different SHA** (expected, since
this repo's git flow squash-merges feature branches, so "same work, different commit hash" is the
normal outcome for anything that shipped).

## Method (reusable for future stale-worktree checks)

For a worktree in detached HEAD with a stale-looking last commit:
1. `git -C <worktree> log -1` — get the HEAD SHA and message.
2. `git -C <worktree> status --short --ignored` — confirm no uncommitted/untracked work sitting in
   the working tree (both worktrees here were clean — only expected ignored harness/build state).
3. `git merge-base <sha> origin/staging` — find where this worktree's history and current staging
   last shared an ancestor.
4. `git log --oneline <merge-base>..<sha>` — list what's unique to the worktree beyond that point.
5. For each unique commit, `git diff --stat <merge-base> <sha>` and compare against
   `git diff --stat <candidate-squash-commit>^ <candidate-squash-commit>` for any squash-merge on
   staging with a matching/similar message — an identical file list and line-count diffstat is
   strong evidence it's the same work, landed. Confirm by checking the actual files exist in
   `origin/staging` (`git show origin/staging:<path>`).

## Verdicts

**`charming-nightingale-2dc17f`** — HEAD `2adfa83`, "feat: unified session-chat architecture for
Messages + Agent Creator", 2026-07-13. Diffstat (26 files, 4137 insertions/472 deletions) is
byte-identical to squash-commit `003588a` ("...(#47)"), which **is** an ancestor of
`origin/staging`. `packages/ui/src/routes/pages/chat.tsx` and `packages/core/src/chat/service.ts`
confirmed present in `origin/staging` right now. **Verdict: safe to discard, nothing to rescue.**

**`supabase-vercel-deployment-a159aa`** — HEAD `0823bd3`, "Capture always-on packaged desktop +
self-update plan (intake 0004)", 2026-07-13, single-file commit adding
`docs/intake/0004-always-on-packaged-desktop-self-update-2026-07-13.md`. That file exists in
`origin/staging` too, at `docs/archive/intake/done/0004-...md` (moved during the docs-archive
consolidation, PR #62) — and staging's version is **more complete**: `status: done`,
`resolution: shipped`, a link to the PR that shipped it (`#51`), and a followup-doc pointer, none of
which the worktree's draft had. **Verdict: safe to discard, nothing to rescue** — the worktree holds
a strictly earlier draft of a doc that has since been finished.

Neither worktree had any local branch pointer (both detached HEAD) and neither SHA exists under any
other local branch — the only reason they weren't orphaned garbage was that both were still checked
out as worktrees, which keeps a commit reachable. Once exited/removed, both are safe to garbage-collect.
