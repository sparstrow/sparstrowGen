# BUG-2026-08-20-setup-workspace-error-never-settles

**Status:** 🟢 resolved 2026-08-20
**Reported by:** agent — found while verifying `/setup`'s error state for T-M10-05
**Reported:** 2026-08-20

## Symptom

On `/setup`, blocking `/api/v1/workspace` (to test the guide's `unknown` step
state, per the four-states table) left the page showing its loading skeletons
**forever**. The workspace step's "couldn't check this — retry" UI — the thing
scenario 5 exists to prove — was never reachable. Dashboard (`/`) and
Settings → Workspace, tested the same way with the same query blocked, both
correctly settled into their error UI within ~2 seconds.

## Reproduction

1. Sign in, land on `/setup`.
2. `page.route('**/api/v1/workspace', r => r.fulfill({ status: 503, ... }))`,
   then reload.
3. **Expected:** within a couple of seconds, the loading skeletons give way to
   the step list, with the workspace step showing "couldn't check this" and a
   retry button — the other two steps (profile, machine) unaffected.
4. **Actual:** the three skeleton bars stayed on screen indefinitely.
   `/api/v1/workspace` kept receiving requests roughly once per second,
   continuing past 6+ seconds and 150+ attempts in the longest run — not the
   two attempts `retry: 1` should produce.

100% reproducible on `/setup` specifically. The same block on `/` (dashboard)
or `/settings` (Workspace tab) settled at exactly 2–4 requests and stopped,
every time.

## Investigation

Added a temporary diagnostic logging `workspaceQ.status` / `fetchStatus` /
`isPending` on every render. It showed the query cycling
`pending → error → pending → error → …` roughly once per second, indefinitely.
In react-query v5, `status` does not revert to `'pending'` on an ordinary
background refetch after a query has already settled — only fetch**Status**
toggles. Seeing `status` itself flip back to `'pending'` meant the query was
being torn down and recreated, not merely retried.

Ruled out: `retry` misconfiguration (the client's default is `retry: 1`
everywhere, unchanged) and simple multi-observer duplication (`/` mounts
`SetupCard` + `WorkspaceSwitcher` — two `useWorkspace()` observers on the same
key — and settles correctly; `/settings`'s Workspace tab mounts `WorkspaceForm`
+ `WorkspaceSwitcher`, also two observers, also settles correctly).

**Root cause: a feedback loop specific to `/setup`'s own structure.**
`setup.tsx` gated its whole step-list render behind
`loading = profileQ.isLoading || workspaceQ.isLoading || runtimesQ.isLoading`.
The workspace step auto-expands whenever its state is `unknown` (by design —
a failed step should show why, not stay collapsed) — and expanding it mounts
`<WorkspaceForm variant="inline">`, which carries its *own* `useWorkspace()`
call. That mount is gated by `loading` being `false` — but mounting a *new*
observer on an already-errored query itself triggers a refetch. If that
refetch's outcome (or just the observer churn) flips `workspaceQ.isLoading`
back to `true` even momentarily, the step list unmounts — including the
`WorkspaceForm` that just triggered the refetch — dropping back to skeletons,
which then re-settle, re-expand the step, re-mount the form, and repeat. The
loop is self-sustaining because the very act of leaving the loading state
creates the condition that re-enters it.

Neither `/` (no form mounts there) nor `/settings` (`WorkspaceForm` is mounted
unconditionally, not gated by the query it also observes) has this structural
coupling, which is why they were both immune.

## Impact

**Who:** anyone who reaches `/setup` while `/workspace` (or, by the same
mechanism, any query a step's inline form also observes) is genuinely down.
**What breaks:** the error state — the one T-M10-05 calls "load-bearing" in
the phase README, because it is what prevents someone from being told to redo
work they already did — was silently unreachable. The page reads as "stuck
loading forever" instead of "here's what failed and here's a retry", which is
a materially worse failure mode than the one the `unknown` state was designed
to prevent. No data was ever at risk; this was a rendering/query-lifecycle
defect only.
**Severity:** would not have been caught by any unit test — `setupSteps()`'s
own tests are pure-function and correctly assume `undefined`/`null` are
delivered once, not toggling. Only forcing the error live, in a browser,
surfaced it.

## Resolution

Fixed in `packages/ui/src/routes/pages/setup.tsx`: `loading` is now a
**latch** rather than a live re-derivation of `isLoading`. Once every query has
settled at least once (success or error), an `everSettled` state flips to
`true` via a `useEffect` and never flips back for the page's lifetime,
regardless of how many background refetches happen afterward or what they do
to any individual query's live `isLoading` value:

```ts
const currentlySettled = !profileQ.isLoading && !workspaceQ.isLoading && !runtimesQ.isLoading;
const [everSettled, setEverSettled] = React.useState(currentlySettled);
React.useEffect(() => {
  if (currentlySettled) setEverSettled(true);
}, [currentlySettled]);
const loading = !everSettled;
```

This breaks the loop at its structural cause — a form's mount/unmount can no
longer be coupled to the very query state its own mounting affects — rather
than papering over the symptom (e.g. hiding the retry button, or not
auto-expanding failed steps, both of which would have quietly reintroduced
the scenario-5 failure the design exists to prevent).

**Verified fixed**: re-ran the identical `page.route` block-and-reload test.
Requests settle at exactly 4 (two observers × two attempts each) within
~2.6 seconds and stop. The workspace step correctly shows "Couldn't check
this. Simulated failure for verification." with a working Retry button;
clicking it re-fetches and the page returns to "You're all set." Screenshots
taken during the pass (not retained in the repo — Playwright artifacts,
cleaned up after).

`SetupCard` (`packages/ui/src/components/setup-card.tsx`) was left unchanged:
it never mounts a form of its own, so it has no equivalent feedback loop —
confirmed by the same block-and-reload test against `/`, which settled
correctly both before and after this fix.
