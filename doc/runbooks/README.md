# Owner action items

**Open this file when you're wondering "what do I need to go do?"** Everything
here needs you specifically — an account only you control, a dashboard setting,
a secret only you should type in. Nothing here is something an agent can or
should do on your behalf.

Each row is one action. Rows with a guide link to the step-by-step runbook.
Rows without one have nothing to click yet — the note explains why.

| Status | Action | Why it needs you | Guide |
|---|---|---|---|
| 🔲 pending | **Confirm whether Supabase is actually delivering email** — then configure custom SMTP if not | Supabase's built-in mailer only delivers to **members of the project's Supabase org** and is capped at a few messages an hour. Nothing in this repo can see whether a message landed; only you can read the inbox. Sign-**up** does not need email today (see below), but magic links and password resets do. | [email-delivery.md](email-delivery.md) |
| 🔲 pending | **Deploy the web app and record its URL** — then set `SPARSTROW_CLOUD_URL` on each machine and `SPARSTROW_APP_URL` for the desktop shell | Needs a hosting account and the project’s secrets, including the service role key. The code is done: M7 shipped the configuration and a clean fallback, so there is nothing left to build — only somewhere to point it. Until then every daemon defaults to `localhost:3000` and the desktop window loads the local core’s own UI. | [deploy-web-app.md](deploy-web-app.md) |
| 🔲 pending | Register OAuth apps for GitHub and Google, paste the client secrets into Supabase | Social sign-in is built and verified; both providers are currently disabled at the provider level, so the buttons render disabled | [oauth-providers.md](oauth-providers.md) |
| ⛔ blocked | Enable leaked-password protection | Requires Supabase's Pro plan — confirmed 2026-08-10 there is nothing to enable on the current plan. Nothing to do until you upgrade; re-check the box below then. | — |
| ✅ done | Add worktree ports to Authentication → URL Configuration → Redirect URLs | Worktree dev servers each get their own port so parallel sessions don't collide, but Supabase's redirect allow-list is static per-URL and doesn't wildcard ports — without these, any email confirmation/magic-link/reset link opened from a non-3000 worktree silently redirects to the Site URL instead of back to the worktree. **Added 2026-08-16:** `http://localhost:3000/**` through `3100/**` in steps of 10 (11 rows). Allocation of these ports to specific worktrees is now tracked in [`../../.claude/skills/worktree-orchestration/references/port-registry.md`](../../.claude/skills/worktree-orchestration/references/port-registry.md) — if that pool runs out, this row reopens for the next range. | — |

> ℹ️ **Current auth configuration, verified live 2026-08-16.** "Confirm email" is
> **ON** in the Supabase dashboard (confirmed via screenshot, changed since the
> 2026-08-10 note below). Despite that, a brand-new signup on `agent@sparstrow.com`
> still came back fully confirmed and auto-signed-in with no email sent —
> `Created at` / `Confirmed at` / `Last signed in` all identical, no
> `Confirmation sent at`. Root cause not yet found; ruled out so far: stale
> reused account, `service_role` key mistakenly used client-side, a Postgres
> trigger auto-confirming `auth.users`. Investigation and repro steps:
> [`../bug/BUG-2026-08-16-signup-auto-confirms.md`](../bug/BUG-2026-08-16-signup-auto-confirms.md).
>
> <details><summary>Superseded 2026-08-10 note (kept for history)</summary>
>
> "Confirm email" was **OFF** in the Supabase dashboard. Creating an account
> therefore signed you in immediately and sent **no** email at all — a new user
> row came back with `email_confirmed_at` already set and `confirmation_sent_at`
> null. This is why sign-up worked while "email me a link" appeared to do
> nothing. If you switch "Confirm email" back on, sign-up starts depending on
> delivery, so do the SMTP row above first.
>
> </details>

## Not an owner action

[`agent-browser-session.md`](agent-browser-session.md) also lives in this
folder, but it is a procedure an **agent** follows, not something you do. It is
here because it is operational reference that never graduates into code.

**Status legend:** 🔲 pending — do it whenever you're ready · ⛔ blocked — can't
be done yet, the reason is the whole action item · ✅ done — leave completed
rows here for a while rather than deleting; they're proof of what you already
handled if the same question comes up again.

---

## How this stays accurate

When a task or plan produces a step only the owner can do, it gets **one** row
here, and everywhere else that references it points back to this file instead
of repeating the status:

- `doc/tasks/MasterTaskQueue.md`'s "Blocked items" table
- `doc/Deferred.md`, if the item is also parked in principle

If you ever see the same action described differently in two places, that's
drift — the fix is deleting the duplicate, not editing both.
