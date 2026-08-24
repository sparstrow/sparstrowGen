# T-M15-01 — retry affordance on succeeded and failed turns, with a model picker

| | |
|---|---|
| **Tag** | `[S]` — edits `chat.tsx`; same file-contention note as T-M14-01 applies (`chat-context-menu-design-0eb2ff`, unmerged as of this decomposition — check `development` first) |
| **Serves** | US3 — scenarios 1, 2 |
| **Depends on** | M12 (dispatch spine — `retry_chat_turn` already supports both source statuses and an optional override), M14 (done — this task's `failed` branch sits next to T-M14-01's `TurnExpiredNotice`/`TurnErrorBanner` split) |
| **Blocks** | T-M15-03 |
| **Phase spec** | [README.md](README.md) |
| **Status** | 🟢 done 2026-08-23 |

## The scenarios this satisfies

> **US3 — Retry a turn** ([spec](../../specs/2026-08-23-chat-message-sending.md))
>
> 1. **Given** a turn that failed partway through, **When** the owner presses
>    retry, **Then** the same message is resent and a fresh reply attempt
>    starts, without retyping.
> 2. **Given** a completed reply the owner wants redone with a different
>    model, **When** they retry and pick a different model, **Then** the new
>    reply uses that model and the original reply stays visible in history.

## Objective

Add a retry affordance to a **succeeded** turn — today there is none; retry
only exists on the `TurnErrorBanner`/`TurnExpiredNotice` failure paths
(T-M12/T-M14) — and give retry, wherever it appears, a way to pick a
different model before firing, closing scenario 2 for real rather than via
the `TurnErrorBanner` `fallback` field, which decision 1 below explains is
dead on the cloud path.

## Decisions already made

**1. No backend or contract work — this is a rendering change only, exactly
like M14.** `retry_chat_turn` (`packages/shared/drizzle/policies/014_chat_turn_dispatch.sql:499-566`)
already accepts `p_provider`/`p_model` overrides, already works from either
`succeeded` or `failed` source status (line 524:
`if v_original.status not in ('succeeded', 'failed') then raise ... SPG19`),
and already creates a new turn + new `chat_messages` row rather than
touching the original (so "the original reply stays visible in history" —
scenario 2 — is already true at the schema layer, not something this task
builds). `POST /chat/sessions/:id/retry` (`apps/web/src/lib/api/handlers/chat.ts:296-335`)
already forwards `body.provider`/`body.model` straight to the RPC. The
`useRetryChatTurn` hook and `retry()` in `chat.tsx` already exist and
already accept `{ provider, model }`. Nothing here needs a migration, a
route change, or a schema change.

**2. `TurnErrorBanner`'s existing `onRetrySecondary`/`error.fallback` path
is effectively unreachable on the cloud path and this task does not try to
revive it.** `turnErrorFromState` (`chat.tsx`) always sets `fallback: null`
— the cloud turn shape has no secondary-model suggestion to carry (T-M13-02's
Result already noted this cost). Scenario 2's "pick a different model" needs
its own picker, not a resurrection of a field that cloud turns never
populate. `TurnErrorBanner`'s primary "Retry" button is untouched by this
task; only the picker is new, and it applies uniformly to succeeded and
failed turns rather than being special-cased per status.

**3. The picker reuses the composer's existing provider/model
`GhostSelect`s, not a new component.** `chat.tsx` already imports
`KNOWN_MODELS`, `PROVIDER_KINDS`, `CLI_PROVIDERS`, and has a working
`GhostSelect` used identically for the composer's own model controls
(lines ~433-537). The retry picker is the same two `GhostSelect`s,
defaulting to the session's current `provider`/`model`, feeding into
`retry({ provider, model })` instead of the composer's send path.

**4. Retry only ever targets the session's LATEST turn — `retry_chat_turn`
resolves it server-side from the session, not from a turn id the client
sends.** This means a retry affordance only ever makes sense attached to
`turn` (the live/most-recent turn state `chat.tsx` already tracks), never
to a historical row inside `messages`. There is no such thing as "retry this
older reply" in the current contract — only "retry the last one." The UI
must not imply otherwise (e.g. by rendering a retry control next to every
past assistant message in `messages.map(...)`).

**5. New component, in `chat.tsx` alongside the M14 Notice functions, not in
`chat-bits.tsx`.** `chat-bits.tsx`'s `ChatTurnView`/`TurnErrorBanner` are
shared with `agent-create.tsx`, which stays on the separate,
non-`ChatTurnState`, synchronous `draftTurn` path (M13 plan's Scope
boundaries) and is out of scope for M15 exactly as it was for M14 — the
`RetryControls` component below belongs with `chat.tsx`'s other
`ChatTurnState`-specific pieces, not the shared file:

```tsx
function RetryControls({
  provider,
  model,
  busy,
  onRetry,
}: {
  provider: ProviderId;
  model: string;
  busy: boolean;
  onRetry: (override: { provider: string; model: string }) => void;
}) {
  const [p, setP] = React.useState(provider);
  const [m, setM] = React.useState(model);
  return (
    <div className="spg-turn flex items-center gap-1.5">
      <Button
        size="sm"
        variant="ghost"
        disabled={busy}
        onClick={() => onRetry({ provider: p, model: m })}
        className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <RefreshCw className="size-3.5" /> Retry
      </Button>
      <GhostSelect
        title="Provider"
        width="w-auto"
        value={p}
        onValueChange={(v) => {
          const next = v as ProviderId;
          setP(next);
          setM(KNOWN_MODELS[next]?.[0] ?? "");
        }}
      >
        {CLI_PROVIDERS.map((cp) => (
          <SelectItem key={cp} value={cp}>
            {cp}
          </SelectItem>
        ))}
      </GhostSelect>
      <GhostSelect title="Model" width="w-auto" value={m} onValueChange={setM}>
        {(KNOWN_MODELS[p] ?? []).map((mm) => (
          <SelectItem key={mm} value={mm}>
            {mm}
          </SelectItem>
        ))}
      </GhostSelect>
    </div>
  );
}
```

  Rendered only when `turn?.status === "succeeded"`, right after the
  existing succeeded-turn `ChatTurnView`/reply block — a persistent small
  row under the last reply, not a hover-reveal (nothing else in this file
  uses hover-reveal actions; the existing `TurnErrorBanner` retry button is
  persistent too, and DESIGN.md's iconography rule is "functional, never
  ornament," which a persistent small control satisfies without inventing a
  new interaction pattern this codebase doesn't otherwise use).

  Defaults to `session.provider`/`session.model` — falling back to
  `draftProvider`/`draftModel` only matters for the composer's own pre-send
  state, not here, since a `succeeded` turn only exists once a session (and
  therefore `session.provider`/`session.model`) already exists.

## Checklist

- [x] Add `RetryControls` to `chat.tsx` (decision 5)
- [x] Render it when `turn?.status === "succeeded"`, passing
      `session.provider`/`session.model` as defaults and `retry(override)`
      as `onRetry`. Implemented with `turn.provider`/`turn.model` preferred
      over `session.provider`/`session.model` (the turn's own actual values
      are more authoritative than the session's, which can be stale after a
      model switch mid-session), falling back to `"claude-code"` /
      `KNOWN_MODELS["claude-code"][0]` only in the never-expected case both
      are null.
- [x] `TurnErrorBanner`'s primary Retry stays wired to plain `retry()` (no
      override) exactly as today — only a NEW picker is added, not a
      replacement of the existing one-click retry
- [x] `TurnExpiredNotice` (T-M14-01) keeps its own plain retry button,
      unchanged — a model picker on an expired turn is not one of US3's two
      scenarios and is not added here (see Traps)
- [x] `packages/ui` typecheck and tests green

## Traps

**Don't add a model picker to `TurnExpiredNotice`.** US3's two scenarios are
about a *failed* turn and a *succeeded* turn the owner wants redone — an
*expired* turn retrying with a different model is a plausible future
nice-to-have, not something the spec asks for, and adding it now is exactly
the over-engineering AGENTS.md §9 forbids. `TurnExpiredNotice`'s existing
plain retry (wired in T-M14-01) is enough.

**Don't render `RetryControls` for every historical message.** Per decision
4, retry only ever targets the session's latest turn. A control attached to
`messages.map(...)` would imply retrying an arbitrary past reply, which the
backend does not support and would fail with `SPG19` the moment a newer
turn exists.

**`RetryControls`'s local `p`/`m` state must reset per turn, not persist
across turns.** If the owner retries turn A with model X, and later
succeeds again on turn B, `RetryControls` re-mounting fresh for B (new
`turn` object, no stable key forcing remount) is what keeps the picker
defaulting to B's actual model rather than remembering X. Verify this
rather than assuming React's default behavior does the right thing here —
if `RetryControls` doesn't remount (e.g. because it sits in a stable
position in the tree with the same component type across turns), add a
`key={turn.id}` to force it.

## Verification

- [x] A succeeded turn shows `RetryControls`; changing the model picker and
      clicking Retry sends `{ provider, model }` matching the new selection
      (confirm via the network request body, not just the UI)
- [x] A failed turn's plain Retry (no override) still works exactly as
      before — T-M14-01/T-M13's existing behavior, unchanged
- [x] After a successful retry, the ORIGINAL reply is still visible above
      the new one, in `messages` — never overwritten in place
- [~] Retrying twice in a row (retry, wait for the new succeeded turn, retry
      again with a different model) — not exercised: the verification
      workspace has no genuinely online provider (same constraint T-M14-03
      hit), so the retried turn never actually reaches a second `succeeded`
      state to retry again from. `RetryControls`'s `key={turn.id}` remount
      guarantee was reasoned through in code review rather than observed
      twice in sequence — see Result.

## On completion

- [x] Tick 18.16 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
- [x] Update this file's **Status** row
- [x] Update [`M15/README.md`](README.md)'s task table

## Result

Built and verified live against **staging** (`pnymngoqseltgigcfevq`),
through this branch's own local dev server plus the Playwright MCP, reusing
the same disposable `%@sparstrow.test` account M14's verification used.

**End-to-end proof, not just a rendered card:** inserted a real `succeeded`
turn (`ct_c56142f3858dfa7f`, provider `claude-code`, model `sonnet`)
directly, loaded it, changed the picker to `opus`, clicked Retry, then
**read the resulting row back from the database** rather than trusting the
UI alone: a new turn (`ct_6fe9e897c7cd41ea`) was created with
`provider: claude-code`, `model: opus` (exactly the picker's selection,
not the original's), `retry_of_turn_id` pointing at the original, and
`attempt: 2`. The original turn was untouched (`status: succeeded`, still
`sonnet`). This confirms the full path — `RetryControls` → `retry(override)`
→ `useRetryChatTurn` → `POST /retry` → `retry_chat_turn` RPC — carries the
picker's selection correctly, not just that the button click didn't error.

Also confirmed live: the original assistant reply stays visible in the
conversation, unchanged, once the new (retried) turn starts — screenshot
shows both "hi" sends and the original "Hello! How can I help you today? ·
claude-code · sonnet" reply still present above the new turn's own state.
The new turn correctly landed in `waiting`/`all_runtimes_offline` (this
disposable workspace has a paired-but-never-online test runtime left from
M14's verification) — which is itself a small bonus confirmation that
M14's cards are unaffected by this change (regression item B in
T-M15-03).

A failed turn's plain `TurnErrorBanner` retry was checked separately (a
synthetic `failed`/`waiting_reason: null` turn) and renders identically to
before — no picker, same red-toned card, same single Retry button.

**Not reached:** retrying twice in sequence to observe `RetryControls`
correctly resetting its local provider/model state between two DIFFERENT
succeeded turns (the Traps section's stated risk). No genuinely-online
provider was available in this pass to produce a second real completion —
same constraint T-M14-03 documented for scenario 2b. The `key={turn.id}`
prop (forcing a fresh mount, and therefore fresh `useState` initial values,
per turn) is a standard, low-risk React pattern rather than a novel one,
so this is judged low-risk to leave unobserved rather than worth its own
`KnownGaps.md` entry — but it is exactly the kind of thing T-M15-03's live
pass should still walk once a real second completion is available.
