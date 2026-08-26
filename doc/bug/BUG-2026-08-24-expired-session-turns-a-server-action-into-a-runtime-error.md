# BUG-2026-08-24-expired-session-turns-a-server-action-into-a-runtime-error

**Status:** 🟢 resolved
**Reported by:** agent — found by `T-WA-01`'s verification walk, testing plan
DD-4 (an action must authorize itself rather than inherit the page's guard)
**Reported:** 2026-08-24

## Symptom

When a signed-in person's session ends while a form is open, submitting that
form no longer reports anything useful. Instead of a message in the dialog,
the app shows a **Runtime Error** overlay reading:

> Uncaught Error: An unexpected response was received from the server.

The write does not happen, and nothing on screen says why — not "you're signed
out", not "session expired", nothing actionable. Before band 22's conversion
the same situation produced a legible message in the dialog, because the failed
`POST /api/v1/*` returned a 401 that React Query's `onError` rendered.

**This affects every Server Action in the app**, not just the team ones — it is
a property of how the middleware handles the request, so every page band 22
converts inherits it.

## Reproduction

1. Sign in and open `/teams`.
2. Click **New team** and type a name.
3. Delete the Supabase session cookie without navigating (a real expiry does the
   same thing; this just makes it immediate):
   ```
   agent-browser eval "document.cookie.split(';').map(c=>c.split('=')[0].trim()).filter(n=>n.startsWith('sb-')).map(n=>{document.cookie=n+'=; Max-Age=0; path=/'; return n})"
   ```
4. Click **Create team**.

**Expected:** the dialog shows a refusal — the `Not signed in.` message
`actionContext()` returns.

**Observed:** a Next.js Runtime Error overlay, "An unexpected response was
received from the server." The dialog is unchanged; the team is not created.

Reproduced on demand, 2/2 attempts, against localhost with real Supabase
credentials.

## Investigation

The dev server log is unambiguous — the action was never invoked:

```
GET /api/v1/tasks/attention/queue  401 in 28ms
POST /login?next=%2Fteams          200 in 37ms
[browser] Uncaught Error: An unexpected response was received from the server.
    at TeamsPage (src\app\teams\page.tsx:170:7)
```

Every successful action in the same session logs its own line
(`└─ ƒ createTeamAction({...})`). There is no such line here. The POST was
answered by `/login` with a 200 and a page of HTML.

**Cause:** `apps/web/src/utils/supabase/middleware.ts` redirects any
unauthenticated non-public request to `/login`. A Server Action arrives as a
`POST` to the *page's own path* (`POST /teams`), which is not `/api/`, so it
takes the redirect. React's action dispatch then receives HTML where it
expected an RSC action response and throws.

**The middleware already knows this is wrong** — for API routes. Its own
comment, written long before Server Actions existed in this app:

> *"API routes authenticate themselves … They must NOT be redirected here: an
> unauthenticated `fetch()` would follow the 302 to `/login` and resolve with a
> 200 page of HTML, so the caller sees 'success' and then fails trying to parse
> it. A 401 is the honest answer to a program."*

A Server Action is the same kind of caller: a programmatic POST whose response
is parsed, not rendered. The carve-out was correct and simply predates the
thing it now also needs to cover. Band 22 turns every write in the app into one
of these, which is what promotes this from a latent edge case to something the
owner would hit.

**Ruled out:** not a defect in `actionContext()` or `ActionResult` — neither
ran. Not specific to `createTeamAction`; the same happens for every action on
the page.

## Fix

`apps/web/src/utils/supabase/middleware.ts` — extend the existing
authenticate-yourself carve-out to Server Action requests, identified by the
`Next-Action` header that Next.js sets on every action dispatch:

```ts
const isServerAction = request.method === "POST" && request.headers.has("next-action");
if (pathname.startsWith("/api/") || isServerAction) {
  return supabaseResponse;
}
```

The action then runs, `actionContext()` finds no session, and the caller gets
`{ ok: false, error: "Not signed in." }` — which the dialog renders.

**This does not weaken the guard.** It moves it, deliberately, to where plan
DD-4 already said it belongs: *"a Server Action is a public HTTP endpoint with
an unguessable name; it is not protected by the fact that the page rendering it
did an auth check."* Every action calls `actionContext()` as its first
statement and refuses without a session, and RLS remains the boundary
underneath. What changes is that the refusal is now legible instead of
arriving as a redirect the client cannot interpret.

An action that forgot its `actionContext()` call would now reach Supabase
unauthenticated — and be refused by RLS, because every action uses the caller's
supabase-js client and never the service role (`AGENTS.md` §4). The convention
is enforced by `T-WA-09`'s sweep as well.

## Resolution

Fixed in `T-WA-01`, 2026-08-24, in the same change that found it. Verified by
re-running the reproduction above: the dialog now shows **"Not signed in."**
and no runtime overlay appears.

Recorded as a phase-level decision in
[`doc/tasks/WA/README.md`](../tasks/WA/README.md) so the seven sibling tasks
inherit it rather than each rediscovering it.
