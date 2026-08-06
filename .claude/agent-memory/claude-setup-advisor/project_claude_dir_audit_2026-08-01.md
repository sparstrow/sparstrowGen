---
name: project_claude_dir_audit_2026-08-01
description: First full .claude/ setup audit (2026-08-01) — gitignore fix in flight, worktree drift, no hooks/settings.json yet, orphaned skill dirs, duplicate-branch worktrees
metadata:
  type: project
---

Full audit of Claude Code setup requested 2026-08-01, owner said "we need to setup claude directory
properly." Findings below were true at that date — **re-verify branch/merge state before reusing**,
since this is exactly the kind of fast-moving state the memory instructions warn decays quickly.

**UPDATE 2026-08-01 (same day, later):** the gitignore fix (`chore/gitignore-admit-claude-config`,
commit `c2e9283`) landed on `origin/staging` via PR #63 from a separate session. Coordinator
fast-forwarded the root repo and the `knowledge-center-tab-0ed4a8` worktree to pick it up, and
committed this agent's own definition + memory files to that worktree's branch
(`Claude-Setup-on-the-repo`, commit `b6e4bb8`). **The "no custom subagent/hook/rule is tracked
anywhere in git" claim below is now stale specifically for `claude-setup-advisor.md` and this
memory directory** — those are tracked as of `b6e4bb8`. The broader point (no hooks/settings.json
exist yet at all — Finding #3 in the delivered audit) was still true as of this update. See
[[stale_worktree_investigation_2026-08-01]] and [[claude_code_hook_mechanics]] for the follow-up
work done same day.

## The core finding: .gitignore fix is mid-flight, unmerged

Root repo (`d:\Sparstrow\Sparstrowgen`) was, at audit time, checked out directly (not via a harness
worktree) on local branch `chore/gitignore-admit-claude-config` (commit `c2e9283`), pushed to
`origin/chore/gitignore-admit-claude-config` but **not merged to `staging` or `main`**. That commit
fixes a real bug: the repo's `.gitignore` had `.claude/*` with only `!.claude/skills/` re-admitted —
`.claude/agents/`, `.claude/commands/`, `.claude/hooks/`, `.claude/rules/`, `.claude/agent-memory/`,
and `.claude/settings.json` were all silently gitignored. Confirmed via `git ls-files .claude` in
the main repo returning **empty** — nothing under `.claude/` was tracked at all, even though
`.claude/skills/curator` and `.claude/skills/listener` show up in `git log -- .claude/skills`
history (from before their 2026-07-26 deletion, per CLAUDE.md).

Practical consequence: any worktree/branch created before `c2e9283` (including the
`knowledge-center-tab-0ed4a8` worktree, branched from `origin/staging` at `19527ad`) still has the
old broken `.gitignore`. In that worktree, `.claude/agents/claude-setup-advisor.md` (the very agent
running this audit) is **still gitignored and uncommittable** — `git check-ignore` confirms it
matches the bare `.claude/*` rule, not the `!.claude/agents/` re-admit line, because that re-admit
line doesn't exist yet in this branch's `.gitignore`. So right now, across the whole repo, **no
custom subagent, hook, or rule file is actually tracked in git anywhere** — they only exist as local
filesystem state in individual worktrees/checkouts. [[claude_setup_findings_2026-08-01]] has the
full recommendation list.

## Worktree hygiene anomaly

`git worktree list` at audit time showed the **same branch** `chore/gitignore-admit-claude-config`
checked out in three places simultaneously: the root repo itself, `.claude/worktrees/memory`, and
`.claude/worktrees/nifty-hellman-c89d00`. Git normally refuses to check out a branch already checked
out elsewhere, so this is either stale/duplicated worktree registration or one of these was created
by a mechanism that bypassed the lock (CLAUDE.md mandates `EnterWorktree`, never `git worktree add` —
worth checking whether `git worktree add` was used somewhere, since that's the documented failure
mode). Also two worktrees (`charming-nightingale-2dc17f`, `supabase-vercel-deployment-a159aa`) were
in **detached HEAD**, last commit 2026-07-13 — ~19 days stale at audit time, likely abandoned.

## No hooks, no settings.json, anywhere

Confirmed zero `hooks` keys in any settings.json (user-level `~/.claude/settings.json`, or any
project-level file — no project `.claude/settings.json` exists at all, only `.claude/settings.local.json`
which is correctly gitignored personal state). No `.claude/hooks/` directory exists or ever existed
(checked full git history). The `c2e9283` commit message itself names this as the reason the
gitignore fix matters: "hooks are declared in settings.json, so deterministic enforcement could not
be committed at all." The prerequisite is now fixed (pending merge); the actual settings.json +
hooks work has not been started.

## Other state worth knowing

- CLAUDE.md is byte-identical between root and this worktree (633 lines, 6376 words) — not stale,
  no drift on that file specifically, only `.gitignore` has diverged.
- `.claude/agents/claude-setup-advisor.md` (this agent) and `.claude/agent-memory/claude-setup-advisor/`
  exist only in the `knowledge-center-tab-0ed4a8` worktree's filesystem — not in root, not in any
  other worktree checked, not in git. If that worktree is ever cleaned up before this gets committed
  (via the gitignore fix branch or a rebase), the agent definition and this memory are lost.
- `.claude/skills/curator` and `.claude/skills/listener` exist in the worktree as **empty
  directories** (no files inside) — filesystem debris left over from their 2026-07-26 deletion
  (CLAUDE.md documents them as deleted, not dormant). Harmless but should be deleted, not resurrected.
- User-level `~/.claude/settings.json` has `"skipDangerousModePermissionPrompt": true` — a global
  (all-projects) setting, not project-controllable. Worth the owner double-checking what "dangerous
  mode" maps to, given CLAUDE.md's explicit "never weaken trust boundaries / no bypassPermissions"
  stance — this setting lives outside CLAUDE.md's jurisdiction entirely since it's user-scope.
