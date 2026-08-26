# Runbook — giving an agent a signed-in browser session

**This is the answer to OQ-2**, settled 2026-08-10 during M3.

An agent cannot type a password into a form, so for two milestones the
route-by-route browser pass kept ending up half-done or dependent on a session
that happened to still be alive in the preview browser. That was luck, not a
method, and it cost real defects: M2's browser pass eventually found a
hook-order crash on the first navigation after sign-in, and an entire class of
Tailwind utilities missing from the build — neither visible to any API-level
test.

**Restoring magic-link sign-in solved it.** The Supabase admin API can mint the
same one-time token the app would have emailed, and the app's own
`/auth/confirm` route exchanges it for a session. No password is typed, no
dev-only bypass exists, and nothing about the auth path differs from what a real
user gets.

> Unlike the other runbooks here, this one is **not** an owner action — it is
> the procedure an agent follows on its own. It lives here because it is
> operational reference that does not graduate into code.

## The procedure

Requires `SUPABASE_SERVICE_ROLE_KEY` (already in `apps/web/.env.local`).

**1. Mint a token for a disposable account.**

```bash
node -e '
const { createClient } = require("@supabase/supabase-js");
(async () => {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const email = `uipass-${Date.now()}@sparstrow.test`;
  await admin.auth.admin.createUser({ email, password: require("crypto").randomBytes(24).toString("hex") + "aZ9!", email_confirm: true });
  const { data } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  console.log(JSON.stringify({ email, tokenHash: data.properties.hashed_token }));
})();
'
```

**2. Navigate the browser to the confirm route.**

```
http://localhost:3000/auth/confirm?token_hash=<tokenHash>&type=magiclink&next=/settings
```

The session cookie is set by the route, exactly as it would be for a user who
clicked the link in their inbox. `next` takes you straight to the page under
test.

**3. Do the pass.** The account bootstraps its own empty workspace on first
request, which is usually what you want — a fresh workspace shows empty states
honestly instead of inheriting someone else's data.

**4. Clean up — with this query, and not with the admin API.** Disposable
accounts are cheap but not free; they accumulate in `auth.users` and each one
owns a workspace.

> ⚠️ **`auth.admin.deleteUser` and the dashboard's Authentication → Users list
> do NOT clean up after themselves.** There is no foreign key from
> `public.users.id` to `auth.users.id` — the columns are `text` and `uuid` in
> different schemas — so deleting the auth user leaves its profile row, its
> workspace and its membership behind **permanently**. No RLS policy can reach
> them afterwards, because every policy resolves through the session that no
> longer exists. Eight such trees were found on staging on 2026-08-18:
> [`BUG-2026-08-18-orphaned-account-rows-on-staging`](../bug/BUG-2026-08-18-orphaned-account-rows-on-staging.md).
>
> Use the query below, or call the app's own `delete_own_account()` as that
> user. Both remove everything; nothing else does.

```sql
with victims as (select id::text as tid, id as uid from auth.users where email like '%@sparstrow.test'),
 ws as (delete from public.workspaces where owner_id in (select tid from victims) returning 1),
 pu as (delete from public.users where id in (select tid from victims) returning 1),
 au as (delete from auth.users where id in (select uid from victims) returning 1)
select (select count(*) from ws), (select count(*) from pu), (select count(*) from au);
```

## Getting a browser that actually renders — added 2026-08-20, revised 2026-08-24

The procedure above gives you a *session*. For two milestones that was only half
of what a visual pass needs, because nothing here rendered a frame: `G-12`,
`G-13` and `G-16` all record the same blocker in different words.

**The blocker is the in-app Claude Browser pane specifically, not this
environment.** A page loaded into that pane reports
`document.visibilityState === "hidden"` even on a fresh, foregrounded
navigation, throttled hard enough that React Query never issues its first
fetch — so a page that is working perfectly sits on its loading skeletons
forever and reads as a bug in your own code. `tabs_select` does not change it.
Do not spend an hour debugging a query that is fine. Tracked as
[`BUG-2026-08-24-claude-browser-pane-reports-hidden-visibility`](../bug/BUG-2026-08-24-claude-browser-pane-reports-hidden-visibility.md)
(resolved via the workaround below — the pane itself is harness code, not
something this repo can patch).

**Use the `agent-browser` CLI instead** ([vercel-labs/agent-browser](https://github.com/vercel-labs/agent-browser),
`npm install -g agent-browser` then `agent-browser install` to fetch Chrome for
Testing once). It drives a real Chrome instance over CDP — not an emulated
pane — so `document.visibilityState` reports correctly, and its accessibility
snapshots run ~200–400 tokens instead of Playwright's ~3000–5000 for the same
page. Verified live 2026-08-24 on a fresh `example.com` navigation:
`{"visibilityState":"visible","hidden":false,"hasFocus":true}`.

One capability gap, verified rather than assumed: `network route`'s `--body`
stubs a response but always returns HTTP 200, and there is no delay/hold-open
option — flags like `--status`/`--delay` are silently accepted and ignored
(tested: a routed fetch still came back `200` in 4ms). Playwright's
`page.route().fulfill({status, ...})` and `page.waitForTimeout` inside a route
handler have no `agent-browser` equivalent yet. **Keep the Playwright MCP
around for step 5 below only** — forcing a specific non-2xx status or an
artificially slow response. Everything else in this loop is `agent-browser`.

### The whole loop

1. **Give the worktree an env file.** A fresh worktree has no `apps/web/.env.local`,
   and without it every path 503s behind the app's own "this deployment is not
   configured" guard. Copy it from the main checkout; it is gitignored, so it
   cannot be committed by accident.

   ```
   cp <main-checkout>/apps/web/.env.local apps/web/.env.local
   ```

   `G-16` declined to do this "for a routing check", which was right for a
   routing check and wrong for anything visual.

2. **Start the dev server** through `preview_start` with a `.claude/launch.json`
   entry running `pnpm --filter web dev` on port 3000. Never with the Bash tool
   — this is about supervising the dev server process itself, unrelated to
   which tool later drives the browser.

3. **Mint a token** exactly as above, then point `agent-browser` at the confirm
   route:

   ```bash
   agent-browser open "http://localhost:3000/auth/confirm?token_hash=<tokenHash>&type=magiclink&next=/<page under test>"
   ```

   The session cookie lands in `agent-browser`'s own Chrome profile.

4. **Walk the page.** `agent-browser snapshot -i` for structure (interactive
   elements only; drop `-i` for the full tree), `agent-browser click @ref` /
   `agent-browser fill @ref "text"` / `agent-browser press Enter` for
   interaction, `agent-browser screenshot [--full]` for the record,
   `agent-browser console` for the console-clean assertion, `agent-browser
   errors` for uncaught page errors specifically.

5. **Force the states you cannot wait for, via the Playwright MCP** (the one
   step `agent-browser` cannot do yet — see the gap noted above):

   ```js
   // Error state
   await page.route('**/api/v1/runtimes', r => r.fulfill({
     status: 503, contentType: 'application/json',
     body: JSON.stringify({ error: 'The control plane is not reachable right now.' }),
   }));

   // Loading state — hold the response open long enough to read the skeletons
   await page.route('**/api/v1/runtimes', async r => { await page.waitForTimeout(4000); await r.continue(); });
   ```

   `page.unrouteAll()` between states. Note that `setTimeout` is not defined in
   that evaluation context — use `page.waitForTimeout`. Playwright needs its
   own signed-in session for this step (repeat step 3's token mint, navigated
   in the Playwright browser instead) since it isn't sharing `agent-browser`'s
   profile.

   For anything `agent-browser` *can* mock — a full network failure, or a 200
   response with a different body — use `agent-browser network route <url>
   --abort` or `--body '<json>'` instead and skip Playwright entirely.

6. **Dark mode and mobile**: `agent-browser set media dark` (or `light
   reduced-motion`) plus the app's own `.dark` class, and `agent-browser set
   viewport 375 812`. Assert no sideways scroll by comparing
   `document.documentElement.scrollWidth` with `window.innerWidth` via
   `agent-browser eval` rather than by looking.

### If the pass needs a paired machine

Pair against `localhost:3000` — but **give each machine its own secrets dir**, or
you will overwrite the owner's real pairing in `~/.sparstrow`:

```
SPARSTROW_SECRETS_DIR=<scratch>/secrets-1 \
SPARSTROW_DATA_DIR=<scratch>/data-1 \
SPARSTROW_CLOUD_URL=http://localhost:3000 \
npx tsx src/cli/pair.ts <code> --name build-server --force
```

Mint the codes from the signed-in page itself (`fetch('/api/v1/pairing-codes',
{ method: 'POST' })` inside `browser_evaluate`) rather than passing a session
cookie into a shell script. Several dirs give you several machines, which is
what a populated list at realistic volume needs.

For a genuinely *live* machine — an `active` row, a working per-runtime
settings command — start core with the same env plus a spare port:

```
SPARSTROW_SECRETS_DIR=<scratch>/secrets SPARSTROW_DATA_DIR=<scratch>/data \
SPARSTROW_CLOUD_URL=http://localhost:3000 SPARSTROW_PORT=48760 npx tsx src/index.ts
```

It registers with the control plane in a couple of seconds; the embedder takes
a few more on first run.

**Everything above still needs the cleanup step.** Machines paired to a
disposable workspace disappear with it when the SQL below runs; anything paired
elsewhere does not.

## Why not the alternatives

The options weighed in OQ-2, and why this beat them:

- **Owner signs in and hands over the session** — works, but needs a human at
  the start of every pass and expires after an hour. Fine occasionally,
  unworkable as the standing method.
- **A dev-only sign-in route** — rejected. It is an auth bypass, and "dev-only"
  flags have shipped enabled before. Blast radius: total compromise.
- **Playwright `storageState`** — still the right answer for a real E2E suite,
  and worth building when M5 needs live transcript streaming verified. It does
  not replace this: seeding the state file needs a sign-in too, and this is how
  you get one.

## Constraints

- `%@sparstrow.test` is the convention for disposable accounts. Keep it — the
  cleanup query keys on it.
- Each token works **once** and expires in an hour. Mint a fresh one per pass
  rather than reusing.
- Never do this against production data. Staging only. As of 2026-08-20 the
  `staging`/`development` Supabase project is the only one that exists — a
  separate production project is deliberately not created yet
  ([`deploy-web-app.md`](deploy-web-app.md)) — so `.env.local` satisfies this.
  Re-check before assuming it still does.
- **Give paired machines their own `SPARSTROW_SECRETS_DIR`.** The default is
  `~/.sparstrow`, which holds the owner's real pairing.
