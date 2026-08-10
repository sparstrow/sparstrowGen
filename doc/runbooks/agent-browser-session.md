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

**4. Clean up.** Disposable accounts are cheap but not free; they accumulate in
`auth.users` and each one owns a workspace.

```sql
with victims as (select id::text as tid, id as uid from auth.users where email like '%@sparstrow.test'),
 ws as (delete from public.workspaces where owner_id in (select tid from victims) returning 1),
 pu as (delete from public.users where id in (select tid from victims) returning 1),
 au as (delete from auth.users where id in (select uid from victims) returning 1)
select (select count(*) from ws), (select count(*) from pu), (select count(*) from au);
```

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
- Never do this against production data. Staging only.
