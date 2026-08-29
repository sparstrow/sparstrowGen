# Provenance — agy-customizations

Vendored verbatim from Google Antigravity's own built-in skill, shipped with
the locally-installed `agy` CLI at
`~/.gemini/antigravity/builtin/skills/agy-customizations/` (captured against
agy v1.1.22, 2026-08-29).

## Why it's here

This is the doc that actually explains a load-bearing decision in this
repo's `antigravity` provider: `agy`'s native customization discovery walks
`.agents/skills/` (or `.agent/`, `_agents/`, `_agent/`) from CWD up to the
repo root — **not** `.claude/skills/`, Claude Code's own convention, which is
what this repo actually uses (`AGENTS.md` §1). Left alone, a headless `agy`
agent working on this repo would never discover this repo's own 16 project
skills.

That gap is why [`orchestrator/preamble.ts`](../../../packages/core/src/orchestrator/preamble.ts)
manually lists `.claude/skills/*/SKILL.md` (via
[`agents/local-skills.ts`](../../../packages/core/src/agents/local-skills.ts)'s
`discoverProjectSkills`) into the in-band preamble for antigravity runs,
instead of pointing `agy` at `.claude/skills` through its own native
`skills.json` registration (see `docs/json_configs.md` in this skill) — every
headless spawn already passes `--disable-slash-commands`, which agy's own
`--help` documents as "Disable slash command **and skill expansion** in
print mode" ([`BUG-2026-08-23-headless-spawn-skill-leak.md`](../../../doc/bug/BUG-2026-08-23-headless-spawn-skill-leak.md)
— a real operator machine's personal, always-on `~/.claude/skills` skill
leaked into a headless run and denied the whole turn). Native skill
expansion is deliberately OFF for every headless spawn, so a `skills.json`
pointing at `.claude/skills` would be silently ignored too; the manual
preamble listing is the only channel that still works under that
constraint, because it's a `Read`-a-file instruction, not skill expansion.

## Keeping it current

Re-fetch from the same local path (or the live docs it points to) if the
installed `agy` CLI is upgraded and its own builtin skill changes; there's no
automated sync.
