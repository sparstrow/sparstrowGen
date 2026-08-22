# Deploying the web app, and pointing the desktop shell at it

**Why this needs you:** hosting accounts, a purchased domain, and the
project's secrets. Nothing in this repo can create any of those.

**What is already done:** the code, **and** the deployment. `SPARSTROW_APP_URL`
exists and works (M7 / T-M7-02); the desktop shell reads it, falls back
cleanly when it is unset, and shows a native screen naming the URL when it
cannot be reached. The three environments below are live. What is left is
pointing machines at one of them — see "What's still open".

---

## The three environments

**2026-08-16.** Vercel watches three branches and auto-deploys each to its
own subdomain of `sparstrow.com` (purchased and DNS-managed at Hostinger):

| Branch | URL | DNS routing | Supabase project |
|---|---|---|---|
| `main` | `sparstrow.com` | A records, root domain → Vercel | **none yet** — dummy placeholder code, no env vars |
| `staging` | `staging.sparstrow.com` | CNAME → Vercel | shared project (see below) |
| `development` | `development.sparstrow.com` | CNAME → Vercel | shared project (see below) |

**`staging` and `development` share one Supabase project** — same backend,
same database — but that did not mean the same env vars were actually set on
both. As of 2026-08-20 they are: Vercel's env vars were scoped to `Preview
(staging)` only (`development` served its own "not configured" guard until
this was caught and fixed — see the update note below). That project's
Authentication → URL Configuration has the Site URL set to the staging
domain, and Redirect URLs cover both `staging.sparstrow.com` and
`development.sparstrow.com`, plus the 11 `localhost:3000`–`3100` entries
already tracked in [`README.md`](README.md)'s worktree-ports row.

**`main` gets its own, separate Supabase project later — deliberately not
yet.** The plan: once the `staging` build is solid, its code and config get
promoted into `main`, and a *new* production Supabase project is created and
connected at that point, not before. Until then `main` deploys dummy
placeholder content to `sparstrow.com` — the Vercel/DNS wiring is real, but
there is nothing behind it. Tracked as [`../Deferred.md`](../Deferred.md)
**D-15**.

`staging.sparstrow.com` and `development.sparstrow.com` are live but not
publicized — they're for the owner's own testing right now, not a public
launch.

## What's still open

- **The owner's real machine still isn't pointed at a deployed URL.**
  `SPARSTROW_CLOUD_URL`/`SPARSTROW_APP_URL` are unset on the owner's own
  paired machine, so it still defaults to `http://localhost:3000` /the local
  core UI. Pairing *against* a deployed URL is proven (see below); switching
  the owner's day-to-day machine over is a separate, deliberate step.
- **Agent/local testing is unaffected and should stay on localhost** — the 11
  redirect URLs above exist for exactly this; nothing here changes how an
  agent worktree tests auth.
- **Running a real job from the deployed app, and the desktop shell's
  online/offline behavior**, are still unexercised — steps 3's third and
  fourth checklist items. Only pairing/sign-in/remove have been proven live.

> **Update 2026-08-20.** Two blockers, previously undiscovered, stood between
> this runbook and actually being followed:
>
> 1. **Vercel Deployment Protection** gated both `staging.sparstrow.com` and
>    `development.sparstrow.com` behind a Vercel account login, in front of
>    the app's own sign-in — nobody without Vercel project access could reach
>    either host at all. Disabled project-wide: `vercel project protection
>    disable sparstrowgen --sso`. Was [`OQ-5`](../OpenQuestions.md), closed.
> 2. **`development`'s env vars were never actually set.** This file's "same
>    env vars... fully configured on both branches" claim was wrong —
>    `vercel env ls` showed all five vars (`DATABASE_URL`,
>    `NEXT_PUBLIC_SUPABASE_URL`, the anon key, the service role key,
>    `NODE_ENV`) scoped to `Preview (staging)` only. `development` had none,
>    and served its own "this deployment is not configured" guard. Owner
>    added the same values scoped to `development` too.
>
> With both fixed, the full pairing flow was run **live against
> `development.sparstrow.com`, for the first time**: sign in (via the
> `agent-browser-session.md` magic-link procedure, no password typed) → pair
> a machine → confirm it reads **active** with real OS/hostname/provider
> badges → remove it → confirm plain re-pair is correctly refused
> ("already paired") → confirm `--force` re-pairs successfully. Every step
> matched what `machines.md` documents, including the `--force` requirement
> from [`BUG-2026-08-20-remove-machine-doesnt-clear-local-pairing`](../bug/BUG-2026-08-20-remove-machine-doesnt-clear-local-pairing.md).
> No new friction surfaced beyond that already-fixed doc gap. Cleaned up
> after: disposable `@sparstrow.test` account deleted, scratch core process
> stopped, scratch secrets/data dirs removed — nothing paired against this
> workspace was left behind.

## 1 — Point a machine at staging (when ready to test this)

```
SPARSTROW_CLOUD_URL=https://staging.sparstrow.com
```

Then restart core. A machine that was paired against `localhost:3000` keeps
its token — the token is scoped to a workspace and a runtime, not to a
hostname — so it reconnects without re-pairing.

## 2 — Point the desktop shell at it

```
SPARSTROW_APP_URL=https://staging.sparstrow.com
```

Unset, the desktop window loads the local core's UI, exactly as it does
today. Set, it loads the hosted app.

**Keep these two variables separate even though they may name the same
host.** One is where this machine's daemon reports to; the other is what the
window displays. Splitting them is what lets you point a window at staging
while the daemon keeps reporting to production, without a code change.

## 3 — Check it

- [ ] Sign in on `staging.sparstrow.com` in an ordinary browser
- [ ] A paired machine shows as **online** in Settings → Machines
- [ ] Start a run from the deployed app and watch it execute on the machine
- [ ] Open the desktop app with `SPARSTROW_APP_URL` set — it loads the hosted
      app and sign-in works inside the window
- [ ] Stop the deployment (or point the variable at a dead port) and confirm
      the desktop window shows the native offline screen with a working retry

The last two are sections C and D of
[`../tasks/M7/T-M7-04-verification.md`](../tasks/M7/T-M7-04-verification.md),
which cannot be completed until this has been.

## When `main` goes live

Repeat steps 1–2 against `sparstrow.com`, once: `main` has real code, a
dedicated production Supabase project is connected, and that project's own
Authentication → URL Configuration has been set (Site URL → `sparstrow.com`,
Redirect URLs → `sparstrow.com/auth/callback` and `/auth/confirm`) — it starts
from scratch, it does not inherit the staging project's settings.

## What this does NOT unblock

Terminals, git operations and local file browsing stay unavailable in the
hosted app — including inside the desktop window. That is by design: the
window talks to the cloud, and the cloud reaches this machine's daemon through
commands. See `doc/tasks/M7/README.md` decision 5.
