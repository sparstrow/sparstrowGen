# BUG-2026-08-22-antigravity-transcript-not-rendered

**Status:** 🔴 open
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

<!-- Open. Two candidate fixes, not mutually exclusive: (1) have
     buildHeadlessSpawn pass --output-format stream-json to agy and parse it
     into the same NormalizedEvent shapes claude-code produces where agy's
     JSON has an equivalent, or (2) give RunTranscript's EventRow a case for
     "raw" that renders the line as plain narration text (lower-fidelity but
     at least visible) as a floor under any future provider that only ever
     emits raw output. -->
