# BUG-2026-08-25-network-failure-during-a-server-action-is-an-unhandled-rejection

**Status:** 🟢 resolved
**Reported by:** agent — found while answering the owner's question *"when we
bundle this into the Electron app, will it work as we expect? Does it work
offline for just viewing?"*
**Reported:** 2026-08-25

## Symptom

When the connection drops while a converted button is in flight, the app shows
a full-screen **Runtime TypeError: Failed to fetch** overlay instead of telling
the person what happened. The dialog is unchanged behind it, and nothing says
whether the write landed.

Before band 22's conversion this was a line of text: React Query's `onError`
caught transport failures alongside server ones, so a dropped connection
rendered a message in the same place a 400 did.

**This is a regression introduced by the conversion**, and it affects every
Server Action — so all 21 files band 22 converts would have inherited it.

## Why it matters more than it first looks

The desktop shell is a `BrowserWindow` that `loadURL`s a **remote** host
(`SPARSTROW_APP_URL` — see `packages/desktop/src/urls.ts`). It bundles no
server and serves no local UI. So every button in the Electron app is one
dropped connection away from this path, and `did-fail-load` does not help:
that fires for main-frame *navigations*, and a Server Action is a `fetch`.
The offline screen never appears; the overlay does.

## Reproduction

1. Sign in and open `/teams`.
2. Click **New team**, type a name.
3. Abort requests to the page's own path — a Server Action POSTs there:
   ```
   agent-browser network route "http://localhost:3000/teams" --abort
   ```
4. Click **Create team**.

**Expected:** a message in the dialog saying the app could not be reached.

**Observed:** `Runtime TypeError: Failed to fetch` as a full-screen overlay.

Reproduced on demand against localhost with real Supabase credentials.

## Investigation

`ActionResult` (write-conversion plan DD-3) covers failures the action
**returns** — a 400 with a field message, a `Not Found`, the signed-out
refusal. It cannot cover a **transport** failure, because there is no
invocation to return anything: the `fetch` underlying the action rejects.

The call sites awaited the action directly inside `useTransition`:

```ts
startTransition(async () => {
  const created = await createTeamAction({ ... });   // rejects; nothing catches
  if (!created.ok) { setError(created.error); return; }
```

An async function passed to `startTransition` that rejects surfaces as an
unhandled rejection, which React's dev overlay renders as a Runtime error.

**This is a gap in DD-3 as written, not a mistake against it.** DD-3 correctly
identified that an uncaught throw becomes a redacted digest in production and
built `ActionResult` to prevent it — but it reasoned only about failures
*inside* the action, and a transport failure never gets that far. The
distinction did not exist under React Query, where one `onError` handled both.

**Ruled out:** not the middleware (unrelated to
`BUG-2026-08-24-expired-session-turns-a-server-action-into-a-runtime-error`,
which was a redirect, not a rejection). Not specific to `createTeamAction` —
every call site had the same shape.

## Fix

New `apps/web/src/lib/call-action.ts`. `callAction()` wraps an action call and
turns a transport failure into the same `ActionResult` shape the caller already
handles:

```ts
const r = await callAction(() => createTeamAction(input));
if (!r.ok) { setError(r.error); return; }
```

Three things it gets right that a bare `try/catch` at each call site would not:

- **One message, written once** — *"Couldn't reach Sparstrowgen, so nothing was
  saved. Check your connection and try again."* It names the app rather than
  the network, following the reasoning the desktop shell's own offline screen
  records, and it says the write did not land — a failed write whose outcome is
  ambiguous is worse than one that plainly did not happen.
- **Next.js control flow is re-thrown.** `redirect()` and `notFound()` signal by
  throwing a tagged error; swallowing one would make the navigation silently
  never happen. Detected by `digest`, not `instanceof`, because the error
  crosses a bundle boundary.
- **It lives in a client-safe module.** `action-result.ts` imports server-only
  Supabase helpers, so a client component importing from it would pull those
  into the browser bundle. `call-action.ts` imports only the *type*, which is
  erased at compile time.

Applied to all seven `teams` call sites. Recorded in
[`doc/tasks/WA/README.md`](../tasks/WA/README.md) as a phase convention, and
added to `T-WA-09`'s sweep, so the seven sibling tasks use it rather than
rediscovering this.

## Resolution

Fixed in `T-WA-01`, 2026-08-25. Verified by re-running the reproduction: the
dialog shows the message, no overlay appears. Typecheck clean, 365 tests green.

**What this does not fix:** the app still does not work offline for viewing,
and never did — that is [`D-24`](../Deferred.md)'s accepted online-only
posture, not a defect. This only makes the failure legible.
