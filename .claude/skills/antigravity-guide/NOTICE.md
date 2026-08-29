# Provenance — antigravity-guide

Vendored verbatim (no rewrites — this is a reference doc, not a rule
catalogue) from Google Antigravity's own built-in skill, shipped with the
locally-installed `agy` CLI at
`~/.gemini/antigravity/builtin/skills/antigravity_guide/` (captured against
agy v1.1.22, 2026-08-29).

## Why it's here

This repo's `antigravity` provider ([`packages/core/src/providers/antigravity.ts`](../../../packages/core/src/providers/antigravity.ts))
spawns `agy` headless to run agents. Claude Code (this repo's own coding
agent) has no built-in knowledge of Antigravity's CLI flags, customization
system, or surfaces — this skill gives it the same reference material `agy`
itself ships to explain itself, so questions about `agy`/Antigravity CLI
behavior, flags, or configuration get answered from the vendor's own docs
instead of guessed.

See [`agy-customizations`](../agy-customizations/SKILL.md) for the deeper,
more directly load-bearing sibling guide — how `agy` discovers skills, rules,
plugins, hooks, and MCP servers, which is what actually explains why
[`orchestrator/preamble.ts`](../../../packages/core/src/orchestrator/preamble.ts)
manually advertises `.claude/skills/*` to headless `agy` runs rather than
relying on its native discovery.

## Keeping it current

Re-fetch from the same local path (or the live docs it points to —
`https://antigravity.google/docs`) if the installed `agy` CLI is upgraded and
its own builtin skill changes; there's no automated sync.
