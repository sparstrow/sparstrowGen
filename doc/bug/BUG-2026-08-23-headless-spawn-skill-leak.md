# BUG-2026-08-23-headless-spawn-skill-leak

**Status:** 🟡 investigating — fix implemented and unit-tested, live confirmation pending
**Reported by:** agent, while live-verifying M13's chat with the owner — they signed into the
branch's Vercel preview, sent "hi" in a Free chat session, and both providers failed.
**Reported:** 2026-08-23

## Symptom

Every real chat turn dispatched to a real, online, correctly-paired machine failed, on
both providers configured on that machine:

- **antigravity**, model "Gemini 3.5 Flash (High)": `The model failed · 1 attempt` —
  `permission check failed for command "& \"C:\\Users\\<user>\\.claude\\skills\\gstack\\bin\\gstack-slug\"";
  user denied permission to run command: & "C:\Users\<user>\.claude\skills\gstack\bin\gstack-slug"`.
- **claude-code**, model "sonnet": `The model failed · 1 attempt` — `draft turn timed out`
  (the pre-T-M13-05 string; this machine's daemon was running `development`, not this
  branch), i.e. the run silently hit the orchestrator's 120s timeout.

This reproduced for a plain "hi" — no tool use implied by the message itself — and for
both providers, on the owner's own real, previously-paired machine.

## Reproduction

1. Pair a real machine (with working `claude`/`agy` CLI credentials, and a personal
   Claude Code skill installed under `~/.claude/skills` with `preamble-tier: 1`
   frontmatter — see Investigation) against a cloud workspace.
2. Open `/chat`, start a Free session, send any message.
3. **claude-code**: the turn times out at 120s with no reply.
4. **antigravity**: the turn fails immediately with `permission check failed for command
   "...gstack-slug"`.

Not reproducible in this sandbox directly — this sandbox has no real CLI credentials at
all ([`G-31`](../KnownGaps.md)) and no personal skills installed, so the bug only surfaces
on a real machine with both a working CLI *and* a personal preamble-tier skill.

## Investigation

**Ruled out: this is not `G-31`'s "no credentials" gap.** A real CLI process spawned and
took a real action — a permission check against a real command only happens if the CLI
actually launched and actually authenticated. `G-31`'s framing (every prior failure in this
sandbox blamed on missing Anthropic credentials) is a correct diagnosis for *this sandbox*,
but was wrongly generalized as the reason chat turns fail everywhere. This bug is the
real, previously-hidden reason turns fail even with working credentials.

**Root cause: Sparstrowgen's headless CLI spawns inherit the operator's full personal
`~/.claude` configuration, with no isolation.** `packages/core/src/providers/claude-code.ts`
and `antigravity.ts` set `env: { ...opts.extraEnv }` on the spawned child — nothing clears
or redirects `HOME`/`CLAUDE_CONFIG_DIR`, so the subprocess sees the exact same
`~/.claude/skills`, `settings.json`, and `settings.local.json` the operator's own
interactive sessions use.

The specific machine that surfaced this has a personal skill, `gstack`
(`~/.claude/skills/gstack/SKILL.md`), whose frontmatter declares `preamble-tier: 1` — its
"Preamble (run first)" section is a Bash script the skill expects to execute at the start
of *every* session, unconditionally, independent of the user's actual message. Sparstrowgen's
own chat-turn agent (`chatAgent()` in `packages/core/src/chat/service.ts`) deliberately sets
`allowedTools: []`, `permissionMode: "default"` — correct, and consistent with this repo's
"never bypassPermissions" convention everywhere else (`agents/draft-service.ts` explicitly
clamps drafts to prevent self-escalation to it). But `gstack`'s preamble isn't gated by
Sparstrowgen's own allow-list at all — it's the operator's personal skill firing regardless,
requiring a Bash tool permission Sparstrowgen never granted.

That permission can never be satisfied: a headless daemon-dispatched spawn has no TTY.

- **claude-code**, given no `--permission-mode` flag (agent's mode is `"default"`, and
  `claude-code.ts:57` only emits the flag when the mode is non-default) and a tool call
  outside `--allowedTools`, appears to stall waiting on an approval that can never come —
  observed as hitting the orchestrator's 120s timeout with no output.
- **antigravity** resolves the same unanswerable check as an immediate denial instead
  (`permission check failed for command "...gstack-slug"`), which then reads as a generic
  provider failure with no connection back to the actual cause.

Confirmed this is unrelated to the chat turn's own content or Sparstrowgen's own MCP/tool
wiring: `chatAgent()` sets `mcpServers: {}`, and antigravity's own doc comment
(`antigravity.ts`) states it has no MCP wiring of its own for chat. Neither provider's
Sparstrowgen-side configuration references `gstack` anywhere — it is purely an artifact of
what happens to be installed globally on the machine the daemon runs on.

**Confirmed both CLIs ship a purpose-built flag for exactly this**, via `claude --help` /
`agy --help`:
- `claude`: `--disable-slash-commands` — "Disable all skills."
- `agy`: `--disable-slash-commands` — "Disable slash command and skill expansion in print
  mode."

Neither flag is scoped narrowly to "unapproved" or "unrecognized" skills — they disable
skill expansion outright, which is exactly the isolation a headless, unattended spawn
needs: its tool surface should be exactly what `allowedTools`/`disallowedTools` grant,
never anything the machine happens to have installed personally.

## Impact

**This blocked every real chat turn on the one machine this session could test against,
regardless of which provider or model was selected** — not a chat-specific bug, since
`chatAgent()`'s spawn path (`packages/core/src/orchestrator/one-shot.ts`'s `completeOnce`)
is shared with the Agent Creator's draft flow, and the underlying `commonArgs()` /
`buildHeadlessSpawn()` functions are shared by every headless run Sparstrowgen ever makes
— Task Board runs included. Any operator machine with a preamble-tier (or otherwise
always-on) personal skill installed under `~/.claude/skills` would hit this identically,
silently, with an error message (a timeout, or "permission check failed") that gives no
hint the real cause is an unrelated personal skill rather than the chat/task/draft feature
itself. This is very likely the actual, previously-undiagnosed reason M12's and M13's
verification passes — run in a sandbox with no personal skills installed and no real
credentials — never encountered it, while a real operator machine hit it on the very first
real attempt.

## Resolution

Fixed in `packages/core/src/providers/claude-code.ts` (`buildHeadlessSpawn`) and
`antigravity.ts` (`buildHeadlessSpawn`): both now pass `--disable-slash-commands`,
unconditionally, on every headless spawn. `buildInteractiveSpawn` is deliberately
untouched for both providers — an interactive spawn (the Terminals feature) has a real
human at the PTY, where the operator's own personal skills are the point, not a bug.

Pinned with new tests: `claude-code.test.ts` and `antigravity.test.ts` each gained a pair
of tests asserting the flag is present on a headless spawn and absent on an interactive
one. `pnpm typecheck` and the full `packages/core` suite (709+ tests) pass.

**Verification, and its honest limit:** the fix is implemented and unit-tested, but a real
chat turn completing successfully on the machine that surfaced this bug has not yet been
confirmed as of this writing — the daemon was restarted with the fix immediately after
landing it, and the owner was asked to retry. This entry stays 🟡 until that live
confirmation lands; flip to 🟢 with the evidence once it does, per this repo's own
discipline against claiming more than was actually run.

**Not addressed here, and deliberately out of scope:** whether Sparstrowgen should isolate
spawned subprocesses from the operator's personal `~/.claude` config more broadly (e.g. a
scoped `CLAUDE_CONFIG_DIR`) — `--disable-slash-commands` closes the specific mechanism this
bug traced, but a determined personal `settings.json`/hook could in principle still reach a
headless spawn through a different path. Worth a `doc/KnownGaps.md` entry if that surfaces,
not assumed away here.
