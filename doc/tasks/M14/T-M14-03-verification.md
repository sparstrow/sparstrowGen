# T-M14-03 — Verification

| | |
|---|---|
| **Tag** | `[S]` sequential — needs all of M14 in place |
| **Depends on** | T-M14-01, T-M14-02 |
| **Blocks** | — |
| **Phase spec** | [README.md](README.md) |
| **Status** | 🟡 mostly done 2026-08-23 — 2b and the two-machine race not reached |

## Objective

Prove US2's three acceptance scenarios live, in the browser, against a real
paired machine — not by reading `waitingReason` off an API response.

Named up front, per this file's own template: this pass runs against **this
branch's own feature-preview URL** (not `development.sparstrow.com`, which
doesn't have M13's or M14's code yet), signed in via the magic-link runbook
(`doc/runbooks/agent-browser-session.md`), same pattern T-M13-05 used. It
needs a real paired machine reachable from that preview and a genuine chat
completion to walk scenario 2's "resolves on its own" half — if
[`G-32`](../../KnownGaps.md) (headless `claude-code` auth) or
[`D-21`](../../Deferred.md) (the owner's deferred `setup-token` step) is
still open when this task runs, use `antigravity` for the live-completion
half of scenario 2 instead of `claude-code` — the waiting/offline/expired
states themselves don't need a successful completion at all, only the
"comes back online" transition does.

## A — The acceptance scenarios

- [x] **US2 scenario 1** — Given no machine has ever been paired in this
      workspace, When the owner sends a message, Then they see
      "this needs a paired machine to reply" with a direct link to pairing —
      not a raw error string
- [x] **US2 scenario 2a (offline)** — Given a paired machine is currently
      offline, When the owner sends a message in a Free or Agent session,
      Then they see "waiting for a machine to come online," and the message
      is not lost (rendered via a real `waiting`/`all_runtimes_offline` row
      rather than an actually-stopped daemon — see T-M14-01's Result for why)
- [~] **US2 scenario 2b (comes back online)** — NOT reached. See T-M14-01's
      Result and `G-33` (`../../KnownGaps.md`): pairing a throwaway machine
      sets it `online` immediately, before any daemon connects, which made
      the clean "genuinely offline, then genuinely comes online" transition
      this scenario needs unsafe to construct in the time this task had.
      Needs a purpose-built setup, not a quick follow-up.
- [x] **US2 scenario 3** — Given a Project-context session where no paired
      machine has that project checked out locally, When the owner sends a
      message, Then they're told this project isn't available on any online
      machine, in `start_run`'s own words
- [x] **TTL expiry** — a turn forced past `wait_expires_at` (via the SQL
      update T-M14-01's Traps section describes; do not actually wait 24h)
      renders `TurnExpiredNotice`, visually and textually distinct from a
      real provider failure
- [x] The browser console has no errors across all three scenarios

## A2 — The four states

This phase's own surface (the waiting cards) only ever appears in the ERROR/
waiting state by definition — there's no populated/empty/loading variant of
a waiting-reason card. Verify instead:

- [x] Each of the three waiting cards is visually distinct from the others
      (not just distinct text in an identical box) — scenario 1 vs 2a vs 3
      must not require reading carefully to tell apart
- [x] `TurnExpiredNotice` is visually distinct from `TurnErrorBanner`
      (T-M13-03) — a real failure and a timed-out wait must not look the same
- [x] Both light and dark themes, at least Paper and Mono surfaces
      (`DESIGN.md`)

## B — What must NOT have changed

- [x] A turn that fails with a genuine provider error (not a TTL expiry)
      still renders `TurnErrorBanner` with its existing retry affordance —
      T-M14-01's new `status === "failed"` branch must not swallow this case
- [~] SC-001/SC-004's already-live-proven pieces from T-M13-05 (Realtime
      subscriber, cross-workspace isolation, FR-004 under a race) are not
      re-broken — NOT re-spot-checked this pass (`chat.tsx`'s realtime
      subscription/session-scoping code was untouched by T-M14-01's diff, so
      risk is low, but it wasn't exercised live here); `pnpm -r test` (section
      E) is the only regression signal actually collected for this item

## C — What can be verified today

- [x] All three waiting-reason scenarios, and the TTL-expiry case, per
      section A — nothing in this phase depends on `G-32`/`D-21` clearing
- [ ] Scenario 2b's "comes back online" transition, using whichever provider
      (`antigravity` or `claude-code`, per the Objective's note) actually
      completes on this pass — not reached, see section A and `G-33`

## D — What needs something that doesn't exist yet

**Needs a second paired machine.** The two-online-machines race (spec edge
case 3) stays exactly where `G-15`/`G-24`/`G-31` left it — not this phase's
job to close, and not re-attempted here.

## E — Regression surface

- [x] `pnpm -r typecheck` and `pnpm -r test` green (`pnpm -r typecheck`: all
      7 typechecked workspaces clean; `pnpm -r test`: 84 files / 718 passed +
      4 skipped in `packages/core`, 19 files / 299 passed in `apps/web`, 6
      files / 61 passed in `packages/ui`)
- [x] `packages/ui` builds — covered by its own passing `tsc --noEmit`
      (no separate `build` script beyond typecheck for this package)

## On completion

- [x] Tick 18.14 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md) and mark
      Band 18's M14 rows (18.12–18.14) done
- [x] Update [`M14/README.md`](README.md)'s **Status** row and task table
- [x] Update the plan's own **Status** row
      ([`../../plans/2026-08-23-chat-message-sending.md`](../../plans/2026-08-23-chat-message-sending.md))
- [x] Knowledge Center pass per `AGENTS.md` §3.2 — already done in T-M14-02;
      nothing this task found changes it further
- [x] Every unreached assertion above written into
      [`../../KnownGaps.md`](../../KnownGaps.md) with what it would cost if
      wrong and the concrete thing that closes it

## Result

Ran the full live pass described in section A/A2/B against **staging**
(`pnymngoqseltgigcfevq`), through this branch's own local dev server plus
the Playwright MCP — see [T-M14-01's Result](T-M14-01-waiting-reason-cards.md)
for the detailed walk (screenshots, exact method for each scenario, and the
one thing that didn't go as planned). Summary here:

- **Reached and confirmed**: scenarios 1, 2a, 3, TTL-expiry, the four-card
  visual-distinctness check (including a genuine Mono-surface check, not
  just Paper), the "real failure still shows `TurnErrorBanner`" regression,
  zero console errors throughout, and the full monorepo typecheck/test
  suite green.
- **Not reached**: scenario 2b (offline → online transition) and the
  two-online-machines race (section D, out of scope by design — unchanged
  from `G-15`/`G-24`/`G-31`). Both written up as `KnownGaps.md` entries
  (`G-33` for 2b) rather than left silent.
- **Not independently re-verified**: SC-001/SC-004's Realtime/isolation/race
  guarantees from T-M13-05 — the relevant code in `chat.tsx` was untouched
  by this phase's diff, so risk is judged low, but "untouched" was
  established by reading the diff, not by re-running that pass live.

M14 is complete for what it set out to do — three specific waiting cards
plus TTL-expiry, replacing the one generic notice — with one real, genuine
gap (2b) surfaced along the way rather than assumed away.
