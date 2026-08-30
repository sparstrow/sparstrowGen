# BUG-2026-08-27-header-badge-shows-offline-with-active-machine

**Status:** 🔴 open
**Reported by:** owner, screenshot of `/machines`
**Reported:** 2026-08-27

## Symptom

The connection badge in the top-right of the app header (`apps/web/src/components/layout/app-shell.tsx`) reads **"offline"** in red, at the same time the Machines page below it lists a paired machine (`tdi05-verify-machine`) as **"active"** with a green status dot and a heartbeat-derived state. The two indicators, visible on screen simultaneously, contradict each other.

## Reproduction

1. Pair a machine and leave core running on it so its heartbeat keeps landing.
2. Open the hosted app and navigate to `/machines`.
3. Observe: the machine's own tile shows a green dot and "active"; the header badge (visible on every page, not just `/machines`) shows a red "offline" pill.

Screenshot on file in this conversation shows both states side by side. Reproduces on every load of `/machines` (and, per Investigation below, on any page that never opens a run or chat Realtime channel) — not intermittent.

## Investigation

The header badge is `useWsConnected()` in [`app-shell.tsx:29`](../../apps/web/src/components/layout/app-shell.tsx#L29), which reads `useLiveEvents().isConnected`. In the hosted app that source is `RealtimeLiveEventSource` ([`realtime-live-events.ts`](../../apps/web/src/lib/realtime-live-events.ts)), and its `connected` flag is `false` until `.subscribe()` on a **run transcript** or **chat turn** Supabase Realtime channel reports `SUBSCRIBED` (see `subscribeRun`/`subscribeChat`, both calling `setConnected(status === "SUBSCRIBED")`). Nothing else ever flips it.

The Machines page opens no such channel — it has no run or chat view — so `isConnected` simply never becomes `true` there, regardless of whether core is reachable. The badge is not measuring "can this workspace reach any of its machines"; it is measuring "is a run/chat live-events channel currently subscribed on *this specific page*". Its label ("live"/"offline") and its tooltip ("Connected to core service" / "Core service unreachable" — `app-shell.tsx:238`) both claim something broader than what it checks.

Machine reachability is a completely separate, correctly-working code path: `RuntimeRow` in [`machines.tsx:266`](../../apps/web/src/app/machines/machines.tsx#L266) derives `state` via `machineState(runtime.status, runtime.lastHeartbeat)`, which is what correctly rendered "active" in the screenshot. The header badge shares no data source with it.

Ruled out: this is not the Realtime auth/subscribe races fixed in `BUG-2026-08-28-realtime-connect-races-channel-subscribe-auth` or the private-channel relay issue in `BUG-2026-08-28-private-broadcast-channels-not-relaying` — those affect whether a channel that *is* opened successfully subscribes/relays. This bug is that the channel is never opened at all on most pages, by design, so `isConnected` has no path to `true` there.

## Impact

Every page except one with an open run transcript or chat session shows a permanent, misleading "offline"/"Core service unreachable" badge — including the one page (`/machines`) whose entire job is to tell the user whether their machines are reachable, where it now visually contradicts the correct per-machine status directly below it. This erodes trust in both indicators: a user has no way to tell, from the header alone, whether "offline" means "your machine is actually down" or "you're just not looking at a live run right now" (it is always the latter on `/machines`).

Separately — and the reason a fix here should be a redesign, not a one-line relabel — **the badge is also structurally wrong for the product's own shape.** A workspace can pair multiple machines (the "Pair a machine" flow on this same page), each independently online/offline/draining. A single global pill can only ever answer "is at least one thing connected", which is not the question a user with several machines actually has ("which of my machines is up?").

## Recommendation (not yet built)

Two changes, either of which alone would resolve the visible contradiction, but together address both the mislabeling and the multi-machine gap:

1. **Stop overloading the connection badge with machine reachability.** Rename/rescope it to what it actually measures — Realtime live-stream connectivity for the page currently open (e.g. "live" only where a transcript/chat channel exists; hide it entirely on pages with no such channel, rather than defaulting to a red "offline" that was never true or false to begin with).
2. **Add a real per-machine status indicator to the header**, sourced from the same `machines`/heartbeat query `machines.tsx` already uses (not from `useLiveEvents`):
   - Aggregate pill showing `n/total online` (e.g. "1/1 online" or "2/3 online") using the same `active`/`draining`/`unreachable` vocabulary and `DOT_TONE` colours already defined in `machines.tsx`, so the header and the Machines page never disagree by construction.
   - Click/hover opens a small popover listing each paired machine by name with its own status dot — reusing `MachineTile`'s dot treatment — so "which machine is down" is answerable without navigating to `/machines`.
   - Zero machines paired stays a neutral/muted state ("no machines paired"), not red, since that isn't a failure.

This is a UI/data-source redesign, not a one-line fix — filing here rather than opening a task directly, per AGENTS.md §8 (park until scoped) combined with the note in `doc/Ideas.md` I-15 that captures the redesign shape above for whoever picks this up.

## Resolution

<!-- unresolved -->
