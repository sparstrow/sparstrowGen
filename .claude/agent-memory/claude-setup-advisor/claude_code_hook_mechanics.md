---
name: claude_code_hook_mechanics
description: Verified (and flagged-unverified) facts about current Claude Code hook events, exit codes, and what is/isn't feasible for periodic or worktree-staleness checks
metadata:
  type: reference
---

Researched 2026-08-01 via the `claude-code-guide` subagent (which has live doc-fetch access) while
advising on preventing stale worktrees in Sparstrowgen. Use this to avoid re-researching, but
**re-verify anything below marked uncertain before asserting it as fact** — the guide agent itself
flagged internal inconsistency in its own answer (see "Treat with suspicion" below).

## Confident / safe to reuse

- Standard hook events: `SessionStart`, `PreToolUse`, `PostToolUse`, and others in the same family
  (`Notification`, `Stop`, `SubagentStop`, `PreCompact`, `SessionEnd`, `UserPromptSubmit` — not
  independently re-verified this session but consistent with prior knowledge).
- Exit code semantics: **0 = continue** (stdout, if present, is processed as structured output on
  some hook types); **2 = block the action, stderr surfaces as the blocking reason**; other
  non-zero = non-blocking error.
- `PreToolUse` hooks can match by exact tool name via the `matcher` field — **this includes custom
  environment tools, not just the built-in Bash/Edit/Write set.** Confirmed applicable to this
  environment's `EnterWorktree` tool specifically. This is the mechanically solid path for "warn
  before creating a new worktree if N+ existing ones look abandoned."
- `SessionStart` hooks can run an arbitrary script and feed output back via `additionalContext` in
  JSON stdout — Claude receives it as a system reminder before the first prompt. This makes
  "check `.claude/worktrees/*` for staleness at session start and tell the agent" mechanically
  feasible.
- **No native cron/periodic trigger exists in Claude Code itself.** Every hook fires off a live
  session's lifecycle (a tool call, a prompt, session open/close) — nothing fires on a wall-clock
  schedule independent of a running session. A genuine "check daily whether anyone's touched this"
  requires an OS-level scheduler (Windows Task Scheduler here, since this is a Windows box) invoking
  a script or a `claude` headless run, or this environment's own scheduling layer if one exists
  outside core Claude Code (this session had `CronCreate`/`CronList`/`RemoteTrigger` tools listed as
  available earlier, then reported disconnected mid-session — so their current reliability is
  itself unverified, not a foundation to build a recommendation on without checking availability
  first).

## Treat with suspicion — not independently confirmed, one is self-contradictory

The guide agent's answer also asserted, with stated "Confidence": a `FileChanged` hook, and separate
`WorktreeCreate`/`WorktreeRemove` hook **event types** distinct from `PreToolUse` matching on
`EnterWorktree`/`ExitWorktree` by name. This directly conflicts with its own earlier point that
`PreToolUse` already covers matching those tools by name — if that's true, dedicated
`WorktreeCreate`/`WorktreeRemove` events would be redundant, which is the kind of internal
inconsistency that suggests invention rather than verified fact. **Do not cite these two as real
Claude Code hook events without checking current official docs directly first.** The safer,
already-consistent path is: `PreToolUse` matcher on the tool name (`EnterWorktree`), not a
worktree-specific hook type.

## Practical implication for recommendations

Given the above, the two mechanically solid, doc-consistent building blocks for a
worktree-staleness nudge are: (1) a `PreToolUse` hook matching `EnterWorktree` that runs a
staleness scan before allowing a new worktree, and (2) a `SessionStart` hook that does the same scan
and injects `additionalContext`. Neither is a substitute for genuine periodic/background checking —
that still needs an OS scheduler or a working cron-equivalent tool, confirmed available, before
being recommended as a real solution rather than a sketch.
