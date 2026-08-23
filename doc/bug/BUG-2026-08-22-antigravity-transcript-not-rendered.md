# BUG-2026-08-22-antigravity-transcript-not-rendered

**Status:** 🟢 resolved
**Reported by:** agent — found during T-M11-02 (M11 live verification against `staging.sparstrow.com`), watching a live antigravity-provider run on `/runs/<id>`
**Reported:** 2026-08-22

## Symptom

A run dispatched to the `antigravity` provider produces real, distinct,
progressively-arriving transcript events — confirmed durable in both the
cloud (`GET /api/v1/runs/:id/events`) and the paired machine's local SQLite,
matching counts and `seq` values exactly. But `/runs/<id>`'s **Transcript**
card shows nothing at all: while the run is executing it displays only the
generic "running…" pulse indicator, and after the run completes the card
shows no content and not even the empty-state text ("No transcript
events.") — it renders as though the `<h2>Transcript</h2>` heading has an
empty body, both live and after a reload.

## Reproduction

1. Create an agent with `provider: "antigravity"` (both the cloud agent row
   and a matching local agent on the paired machine, since M4's agent
   resolution requires a local row by slug — see `resolve.ts`).
2. `POST /api/v1/runs` with that agent's id and any prompt.
3. Open `/runs/<id>` while it executes.
4. **Expected:** narration/text content appears progressively as the agent
   works, the way it does for a `claude-code` run (system/assistant/tool
   bubbles).
5. **Observed:** the Transcript card never shows any content, even though
   `GET /api/v1/runs/<id>/events` returns real events the entire time, e.g.:

   ```json
   { "seq": 0, "type": "raw", "payload": "I am starting by listing the contents of the current working directory…" }
   { "seq": 1, "type": "raw", "payload": "I will search for `package.json` files…" }
   { "seq": 2, "type": "raw", "payload": "I will list the contents of the main project directory…" }
   ```

   Confirmed against staging with a real run (`run_060caf1a12fb416f`,
   agent `M11 Verification Agent (agy)`, model `Gemini 3.5 Flash (Low)`):
   3 events, `seq` 0/1/2, identical count and `seq` set in the cloud
   (`run_events`) and the paired machine's local SQLite. The run reached
   `succeeded` and its `resultText` (shown separately, in the **Result**
   card) contained the same three lines — so the data path is completely
   intact; only the Transcript card's rendering is empty.

## Investigation

`packages/core/src/providers/antigravity.ts:108-111` — the antigravity
provider's `parseLine` does not attempt structured parsing of `agy`'s
stdout (unlike `claude-code`'s `--output-format stream-json`); every
non-blank line becomes a generically-typed event:

```ts
parseLine(line: string): NormalizedEvent[] {
  if (line.trim().length === 0) return [];
  return [{ type: "raw", payload: line }];
}
```

`packages/ui/src/components/run-transcript.tsx`'s `EventRow` switches on
`event.type` and has cases for `"system"`, `"assistant"`, `"user"`,
`"result"`, and `"stderr"` — **no case for `"raw"`**, so it falls through to
`default: return null`. Every antigravity event is silently dropped from
render.

Confirmed `agy --print --output-format stream-json` is a real CLI option
(seen in `agy --help`'s `--output-format` description: `text, json,
stream-json`); `buildHeadlessSpawn` in `antigravity.ts:65-88` never passes
`--output-format`, so `agy` defaults to plain `text` — which is why
`parseLine` has nothing structured to parse in the first place. The gap is
two-layered: the provider doesn't ask `agy` for structured output, and even
if raw lines are the best available, the UI has no fallback renderer for
them either.

## Impact

**Any run dispatched to the `antigravity` provider is, from the Runs page,
indistinguishable from a run producing no transcript at all** while it
executes and after it completes — the single piece of evidence a user has
that something is happening. `resultText` (shown in the separate Result
card once the run finishes) does carry the content, so the run is not a
total black box, but the live-watching experience — the specific thing
US3 scenario 2 and `G-13` are about — does not exist for this provider.

`claude-code` runs are unaffected: its provider emits proper `system` /
`assistant` / `tool_use` / `result` events that `EventRow` already handles.
This is provider-specific, not a defect in the transcript pipeline (M5)
itself — the cloud/local durable event path, dedup-by-`seq`, and count
consistency all worked correctly for antigravity too, which is what
isolates the bug to rendering rather than delivery.

## Resolution

Both candidate fixes landed, not just the floor.

**Fix 1 — structured events from `agy`, empirically verified against a real
process.** `agy` turned out to already be installed in the agent's
environment (`C:\Users\gsrih\AppData\Local\agy\bin\agy.exe`, v1.1.18), so
this was verified against real output, not just `agy --help` text.
`packages/core/src/providers/antigravity.ts`'s `buildHeadlessSpawn` now adds
`--output-format stream-json` (before `--print`, since `--print` must stay
last — it consumes the next argv token as the prompt). Two real captures —
`agy --model "Gemini 3.5 Flash (Low)" --output-format stream-json --print
"What is 2 plus 2? Reply with just the number."` and a second prompt that
exercised tool calls (`view_file`, `find_by_name`, `list_dir`, `run_command`,
including one that failed with a permission error) — showed the NDJSON shape
is `{"event": "init"|"step_update"|"result", ...}`:

- `init` → carries `init.model`.
- `step_update` → `step_type` of `"user_input"`/`"checkpoint"` (no visible
  content), `"agent_response"` (incremental `text_delta` chunks, not
  accumulated text), or `"tool"` (an `ACTIVE` line when the call starts,
  carrying `tool_name`/`tool_info.parameters`, then a `DONE` or `ERROR` line
  when it finishes, carrying `tool_info.output` or `tool_info.error.message`).
- `result` → terminal event, `status: "SUCCESS"|"ERROR"`, `response`,
  optional `error`, `num_turns`.

`parseLine` now maps these into the same `NormalizedEvent` shapes
`claude-code`'s provider produces (`system`/`assistant`/`user`/`result`), so
`run-transcript.tsx`'s existing renderers apply unmodified: `init` → a
`system`/`init` event, `agent_response` deltas → `assistant` text blocks,
`tool` `ACTIVE` → an `assistant` `tool_use` block, `tool` `DONE`/`ERROR` → a
`user` `tool_result` block, `result` → a `result` event. `extractResult` was
rewritten to prefer the terminal `result` event's `response` text (falling
back to the accumulated assistant deltas, and further back to the old
raw-stdout-join path for any line that isn't valid JSON — e.g. if `agy` is
ever invoked without `--output-format stream-json`), and now surfaces a real
`isError` + `errorMessage` from `result.status`/`result.error` instead of
only detecting empty stdout.

One deliberate limitation, noted in `parseLine`'s doc comment: `agy` streams
narration as incremental deltas, and the provider instance is a shared
singleton across concurrent runs (`packages/core/src/providers/index.ts`) —
`parseLine` has no per-run state to accumulate deltas across lines into one
bubble per reasoning step. Each delta becomes its own small `assistant` text
block instead. This still satisfies the "progressive" requirement (US3
scenario 2 / G-13) — text appears as it streams — just in finer-grained
pieces than `claude-code`'s per-turn messages.

**Fix 2 — the UI floor.** `packages/ui/src/components/run-transcript.tsx`'s
`EventRow` now has a `"raw"` case (plain muted text, matching the "narration"
register) instead of falling through to `default: return null`. This is the
floor under fix 1's own fallback path (an unparseable or unrecognized line)
and under any future provider that only ever emits raw output.

**Verification:**

- Unit tests in `packages/core/src/providers/antigravity.test.ts`, using the
  real captured NDJSON lines as fixtures (not hand-guessed from `--help`):
  `--output-format stream-json` is present in the spawn args before
  `--print`; `parseLine` mapping for `init`, `agent_response` deltas
  (including the empty-delta and bookkeeping-step drop cases), `tool`
  `ACTIVE`/`DONE`/`ERROR`, the terminal `result` event (both `SUCCESS` and
  `ERROR`), non-JSON fallback, and an unrecognized `event` field; and
  `extractResult` preferring the structured `result.response`, falling back
  to accumulated deltas, surfacing the structured error, and preserving the
  legacy raw-stdout-join path when no `result` event is present.
- `pnpm -r typecheck` and `pnpm -r test` run clean (see PR).
- **Not verified**: a live antigravity run against staging end-to-end through
  `/runs/<id>` (i.e. confirming the Transcript card itself renders correctly
  in the browser). The `agy` process output was captured and verified
  directly at the CLI, and the mapping was written and tested against those
  real captures, but the full pipeline (spawn → parseLine → durable event
  store → live SSE → RunTranscript) was not re-walked end-to-end in a
  browser. If this needs closing, follow
  `doc/runbooks/agent-browser-session.md`'s scratch-machine pairing
  procedure to dispatch a real antigravity run and watch `/runs/<id>`.
