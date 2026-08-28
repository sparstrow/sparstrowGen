# CS3 — Foundational: live model discovery for `antigravity`

| | |
|---|---|
| **Plan** | [`../../plans/2026-08-27-chat-session-and-conversation-ux.md`](../../plans/2026-08-27-chat-session-and-conversation-ux.md) (CS3) |
| **Kind** | **foundational** — blocks CS4, demos to nobody |
| **Spec** | [`../../specs/2026-08-27-chat-session-and-conversation-ux.md`](../../specs/2026-08-27-chat-session-and-conversation-ux.md) |
| **Depends on** | — |
| **Blocks** | CS4 |
| **Status** | not started |
| **Open questions** | none |

## Tasks

| Task | Tag | Serves | Depends on | Status |
|---|---|---|---|---|
| [T-CS3-01 — `agy models` discovery in the provider](T-CS3-01-antigravity-discover.md) | `[P]` | foundational — unblocks CS4 | — | done (2026-08-28) |
| [T-CS3-02 — `provider_model_cache` table + RLS](T-CS3-02-cache-table.md) | `[P]` | foundational — unblocks CS4 | — | not started |
| [T-CS3-03 — the `providers.discover_models` dispatch, end to end](T-CS3-03-dispatch.md) | `[S]` | foundational — unblocks CS4 | T-CS3-01, T-CS3-02 | not started |
| [T-CS3-04 — verification](T-CS3-04-verification.md) | `[S]` | foundational | T-CS3-01, T-CS3-02, T-CS3-03 | not started |

T-CS3-01 (touches only `packages/core/src/providers/antigravity.ts` and its
test) and T-CS3-02 (touches only `packages/shared/src/db/schema.ts` and a new
migration) share no files — genuinely `[P]`, hand to two workers with zero
coordination. T-CS3-03 needs both landed first: it wires the provider
capability from -01 to the cache table from -02.

## Objective

Give `antigravity` a real, live model list, dispatched to an online runtime
and cached workspace-wide — the plumbing US3's picker (CS4) reads from.
`claude-code` needs none of this (plan Decision, "What the spec asks for
that isn't obvious" — its aliases are stable, not dated snapshots).

## The shape of what was found

- **Correction found building T-CS3-01, replacing this plan's own
  assumption**: `agy models` does NOT follow `healthCheck()`'s
  `execFile(..., "--version", ...)` pattern despite looking like the same
  shape of one-off call. It requires a real TTY (renders an animated
  spinner via ConPTY cursor control before printing) and **hangs
  indefinitely** on a plain pipe — confirmed live, not assumed; the process
  has to be killed by Node's own timeout, `signal: 'SIGTERM'`, never a clean
  exit. `--version` and the real headless agent-run spawn are unaffected;
  this is specific to the `models` subcommand's listing UI. Fixed with
  `node-pty` (already a dependency here for Terminals,
  `packages/core/src/terminal/manager.ts`) instead of `execFile` — full
  writeup in `T-CS3-01`'s own "The shape of what was found".
- `KNOWN_MODELS.antigravity`'s own comment
  (`packages/shared/src/constants.ts:23`) already confirms `agy models`
  is a real, working subcommand — hand-copied from it at CLI v1.1.0 — so
  this is wiring up a command already known to exist, not guessing at one.
- `CliProvider` (`packages/core/src/providers/types.ts:52`) has no discovery
  method today; `DirectApiProvider` does (`discoverModels(): Promise<string[]>`,
  used by `anthropic-api` — not reachable from chat, see the plan). This
  phase adds an **optional** method to `CliProvider` rather than touching
  the required interface, so `claude-code` implements nothing new.
- `runtime_commands` (`packages/shared/src/db/schema.ts:299`) has no result
  column — only `status`/`error`. The existing async-command pattern
  (`chat.turn`) posts its actual result through a **separate** RPC
  (`ingest_chat_turn_reply`, referenced in
  `016_chat_turn_transcript.sql`'s header), not through the command row
  itself. This phase follows the same shape: the daemon acks the command
  (done/failed) AND separately calls a small RPC to record the discovered
  list into the new cache table.

## Definition of done

- `antigravity.ts` exposes live model discovery, degrading to
  `listModels()` on failure, in the same `{ models, live, detail }` shape
  `packages/core/src/api/routes/providers.ts`'s existing
  `POST /providers/discover-models` already returns for direct-API
  providers (consistency, not reuse — that route is local-only and not part
  of this path).
- A `providers.discover_models` command dispatched to an online,
  `antigravity`-capable runtime results in a fresh `provider_model_cache`
  row for that workspace within the same latency budget a chat turn already
  accepts (a few seconds, poll-bound).
- `pnpm typecheck` and `pnpm test` stay green.

**Not in this phase:** any UI. CS4 is the only consumer of this plumbing,
and lands separately.

---

## Decisions already made

### 1. `CliProvider.discoverModels` is optional, and antigravity-only for now

```ts
// packages/core/src/providers/types.ts, CliProvider
discoverModels?(): Promise<{ models: string[]; live: boolean; detail: string | null }>;
```

`claude-code` does not implement it. Any caller must check for its presence
before calling — do not assume every `CliProvider` has it.

### 2. Discovery is dispatched, not run in-process from the cloud

The cloud control plane never runs a CLI itself — it dispatches to a paired
runtime through `runtime_commands`, the same as every other capability.
`providers.discover_models` is a new `kind`, added to the comment at
`packages/shared/src/db/schema.ts:309` alongside the existing five.

### 3. The daemon posts its result through a new RPC, not the command row

`runtime_commands` carries no generic result payload (confirmed above), and
adding one would touch every other command kind's contract for one new
consumer. A new `public.record_provider_models(p_provider text, p_models
jsonb, p_live boolean, p_detail text)` function, callable only by an
authenticated runtime identity (same auth posture Band 25's `DI` work gave
every daemon — confirm the exact caller-identity check against
`private.current_workspace_ids()`'s daemon-identity equivalent before
writing this, per that band's own RLS pattern), upserts into
`provider_model_cache` keyed on `(workspace_id, provider)`.

## Files

| Path | Change |
|---|---|
| `packages/core/src/providers/types.ts` | edit: optional `discoverModels` on `CliProvider` |
| `packages/core/src/providers/antigravity.ts` | edit: implement `discoverModels()` via `node-pty` (not `execFile` — see "what was found"), plus the exported `parseAgyModelsOutput` helper |
| `packages/shared/src/db/schema.ts` | edit: `runtimeCommands.kind` comment; new `providerModelCache` table |
| `packages/shared/drizzle/policies/0NN_provider_model_cache.sql` | new: table DDL, RLS, `record_provider_models` function, dispatch function for `providers.discover_models` |
| `packages/core/src/cloud/commands.ts` | edit: new `case "providers.discover_models"` in `dispatch()` |

## Traps

- **`agy models`'s exact stdout shape is unverified.** No fixture exists
  because this capability has never been built — `KNOWN_MODELS.antigravity`
  was hand-copied by a human reading the output, not parsed by code. Write
  the parser defensively (one model per non-empty line, trimmed) and
  sanity-check it against the current static list on a real `agy` install
  before shipping; if the real format turns out to be structured (JSON,
  a table with extra columns), the parser needs to match that, not this
  note's guess.
- **A daemon with no `antigravity` capability at all must not be picked** for
  this dispatch — reuse whatever capability-matching `chat.turn`'s
  `private.pick_runtime_for(workspace_id, provider, …)` already does
  (`016_chat_turn_transcript.sql`), don't reinvent it.
- **Don't block the picker UI on this dispatch's latency.** CS4 reads
  whatever is already cached and triggers a refresh in the background — this
  phase's job is only to make that refresh possible, not to make it
  synchronous with opening the picker.

## Verification

Full procedure in [T-CS3-04 — verification](T-CS3-04-verification.md).
