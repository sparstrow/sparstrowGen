# Deploying the web app, and pointing the desktop shell at it

**Why this needs you:** it needs a hosting account and the project's secrets.
Nothing in this repo can create either.

**What is already done:** the code. `SPARSTROW_APP_URL` exists and works
(M7 / T-M7-02); the desktop shell reads it, falls back cleanly when it is unset,
and shows a native screen naming the URL when it cannot be reached. There is
nothing left to build — only somewhere to point it.

---

## What "not deployed" currently means

The app runs locally and is verified on staging Supabase, but it has never been
published to a URL. Two consequences, both invisible until you look for them:

- **Every daemon defaults to `http://localhost:3000`.** `config.cloudUrl` says
  so, with the comment "Set `SPARSTROW_CLOUD_URL` once the app is deployed".
  Pairing a machine works today only because the app happens to be running on
  the same box.
- **The desktop window falls back to the local core's own UI.** That is
  deliberate and is a working product — but it is not the hosted app, so the
  version-skew argument behind settled decision 4 is not yet being collected.

## 1 — Deploy

Any Node host that runs Next 16 works. Vercel is the path of least resistance
because the app is a stock Next App Router project with no custom server.

Environment variables the app needs — take them from `apps/web/.env.local`,
which already has the working staging values:

| Variable | Where it comes from | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API | Safe to expose |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same page | Safe to expose |
| `SUPABASE_SERVICE_ROLE_KEY` | same page | **Server-only.** Never prefix `NEXT_PUBLIC_` — it bypasses every RLS policy in the database |

> ⚠️ The service role key is what `/api/daemon/*` authenticates daemons with. If
> it is ever exposed to a browser, every workspace's data is readable by anyone
> who opens devtools. It is the single most sensitive value in this project.

## 2 — Tell Supabase the new URL exists

Supabase rejects auth redirects to hosts it does not know, so sign-in will fail
on the deployed app until this is done.

**Supabase → Authentication → URL Configuration:**

- **Site URL** → your deployed origin, e.g. `https://app.example.com`
- **Redirect URLs** → add `https://app.example.com/auth/callback` and
  `https://app.example.com/auth/confirm`

Leave the existing `localhost:3000` entries in place; local development still
needs them.

If you have already done the OAuth runbook, re-read
[`oauth-providers.md`](oauth-providers.md) — the callback URL people get wrong
is Supabase's, not the app's, so a new app URL does **not** change it.

## 3 — Point the daemons at it

On each paired machine, set:

```
SPARSTROW_CLOUD_URL=https://app.example.com
```

Then restart core. A machine that was paired against `localhost:3000` keeps its
token — the token is scoped to a workspace and a runtime, not to a hostname — so
it reconnects without re-pairing.

## 4 — Point the desktop shell at it

```
SPARSTROW_APP_URL=https://app.example.com
```

Unset, the desktop window loads the local core's UI, exactly as it does today.
Set, it loads the hosted app.

**Keep these two variables separate even though they name the same host.** One
is where this machine's daemon reports to; the other is what the window
displays. Splitting them is what lets you point a window at staging while the
daemon keeps reporting to production, without a code change.

## 5 — Check it

- [ ] Sign in on the deployed app in an ordinary browser
- [ ] A paired machine shows as **online** in Settings → Machines
- [ ] Start a run from the deployed app and watch it execute on the machine
- [ ] Open the desktop app with `SPARSTROW_APP_URL` set — it loads the hosted
      app and sign-in works inside the window
- [ ] Stop the deployment (or point the variable at a dead port) and confirm the
      desktop window shows the native offline screen with a working retry

The last two are sections C and D of
[`../tasks/M7/T-M7-04-verification.md`](../tasks/M7/T-M7-04-verification.md),
which cannot be completed until this runbook has been.

## What this does NOT unblock

Terminals, git operations and local file browsing stay unavailable in the hosted
app — including inside the desktop window. That is by design: the window talks
to the cloud, and the cloud reaches this machine's daemon through commands. See
`doc/tasks/M7/README.md` decision 5.
