# Owner action items

**Open this file when you're wondering "what do I need to go do?"** Everything
here needs you specifically — an account only you control, a dashboard setting,
a secret only you should type in. Nothing here is something an agent can or
should do on your behalf.

Each row is one action. Rows with a guide link to the step-by-step runbook.
Rows without one have nothing to click yet — the note explains why.

| Status | Action | Why it needs you | Guide |
|---|---|---|---|
| ✅ done | ~~**Confirm whether Supabase is actually delivering email**~~ | **Confirmed 2026-08-16.** A sign-up confirmation and a magic link both arrived in a real inbox and both signed you in — the first time the built-in mailer had ever been exercised (every earlier link was minted with the admin API, which sends no mail). Closed `G-11`. Needed [`policies/011_drop_auto_confirm.sql`](../../packages/shared/drizzle/policies/011_drop_auto_confirm.sql) first, because a trigger was confirming every signup and so skipping the send entirely. | [email-delivery.md](email-delivery.md) |
| ⏸️ parked | Configure **custom SMTP** | Deliberately deferred — see [`../Deferred.md`](../Deferred.md) **D-14**. The built-in mailer serves you today because both accounts are members of the project's Supabase org; it delivers to **nobody else**, silently, and is capped at a few messages an hour. Unparks when anyone outside the org needs mail, or the app deploys publicly — whichever comes first. | [email-delivery.md](email-delivery.md) |
| ✅ done | Deploy the web app (`staging` + `development`) | **Added 2026-08-16.** Vercel auto-deploys `staging`→`staging.sparstrow.com` and `development`→`development.sparstrow.com` (DNS at Hostinger); both share one fully configured Supabase project, including Auth redirect URLs. `main`→`sparstrow.com`'s Vercel/DNS wiring is also live, but `main` itself is still dummy code — see the pending rows below. | [deploy-web-app.md](deploy-web-app.md) |
| 🔲 pending | Point a paired machine's `SPARSTROW_CLOUD_URL` and the desktop shell's `SPARSTROW_APP_URL` at `staging.sparstrow.com` | No machine points at a deployed URL yet — every daemon still defaults to `localhost:3000`, and the desktop window still loads the local core's own UI. Agent/local testing is unaffected and should stay on localhost. **Updated 2026-08-16: this now blocks a whole phase.** [`M11`](../tasks/M11/README.md) — walking US3–US5 against staging, and closing `G-12`/`G-13`/`G-16` — cannot start at all until it's done. Two environment variables and a restart on one machine. | [deploy-web-app.md](deploy-web-app.md) |
| ✅ done | ~~**Run the orphan-row cleanup on staging**~~ | **Done by the owner 2026-08-18** — verified after: 0 orphaned rows, 1 auth user, 1 profile, 1 workspace, 1 membership, live account untouched. M9's apply session found **8 orphaned account trees** on staging — profile rows, workspaces and memberships for auth users that no longer exist, unreachable by any RLS policy forever. An agent tried to delete them and the harness safety classifier refused, correctly, because it is a destructive `DELETE`. It needs a human to run it. **Proved zero-loss first:** the 7 dead workspaces contain 0 runs, 0 tasks, 0 agents, 0 projects, 0 runtimes, 0 daemon tokens and 0 memory notes, and the predicate keys on *no member is a live auth user* so a shared workspace cannot be caught. The exact statement is in the bug file; expect `7, 8`. Prevention has already landed — the agent runbook now says never to use `auth.admin.deleteUser` alone. | [`../bug/BUG-2026-08-18-orphaned-account-rows-on-staging.md`](../bug/BUG-2026-08-18-orphaned-account-rows-on-staging.md) |
| ✅ done | ~~**Re-enter your display name and workspace name on staging**~~ | **Done 2026-08-18** — owner chose `Sri Hari` / `Sparstrow`; written to `public.users`, to auth metadata (`full_name` + `name`, which is what the sidebar reads), and to `workspaces`. The workspace slug moved `personal-…` → `sparstrow` on this first real naming and is now frozen, which incidentally proved `T-M9-02`'s slug rule against live data. Original note: not a defect — this is FR-019 working. `012_no_invented_names.sql` cleared the names the database had invented, so on staging your profile name (`domains`, taken from your email) and your workspace name (`Personal Workspace`) are both now `''`. **Only you can choose what they should be**, which is the whole point. Cosmetic and non-blocking. Until M10 ships the setup form there is no UI for it, so today it is two API calls — `PATCH /api/v1/me {"name": "…"}` and `PATCH /api/v1/workspace {"name": "…"}`. This row closes on its own when [`M10`](../tasks/M10/README.md) lands, since walking its setup guide *is* doing this. **Note** the sidebar will still show a name derived from your email until [`BUG-2026-08-18-shell-invents-name-from-email`](../bug/BUG-2026-08-18-shell-invents-name-from-email.md) is fixed in `T-M10-04`. | — |
| ⏸️ parked | Create a new Supabase project for `main` and connect it | Deliberately deferred — see [`../Deferred.md`](../Deferred.md) **D-15**. `main` has no env vars and no Supabase project yet; the plan is to promote `staging`'s code into `main` first, and only then create and connect a dedicated production project. | [deploy-web-app.md](deploy-web-app.md) |
| ⏸️ parked | Register OAuth apps for GitHub and Google, paste the client secrets into Supabase | Deliberately deferred — see [`../Deferred.md`](../Deferred.md) **D-8**. Reconfirmed 2026-08-16: not using GitHub or Google sign-in right now. App-side code is complete and verified; both providers report disabled at the provider level today, so the buttons render disabled and will light up on their own once enabled — no code change needed to unpark. | [oauth-providers.md](oauth-providers.md) |
| ⛔ blocked | Enable leaked-password protection | Requires Supabase's Pro plan — confirmed 2026-08-10 there is nothing to enable on the current plan. Nothing to do until you upgrade; re-check the box below then. | — |
| ✅ done | Add worktree ports to Authentication → URL Configuration → Redirect URLs | Worktree dev servers each get their own port so parallel sessions don't collide, but Supabase's redirect allow-list is static per-URL and doesn't wildcard ports — without these, any email confirmation/magic-link/reset link opened from a non-3000 worktree silently redirects to the Site URL instead of back to the worktree. **Added 2026-08-16:** `http://localhost:3000/**` through `3100/**` in steps of 10 (11 rows). Allocation of these ports to specific worktrees is now tracked in [`../../.claude/skills/worktree-orchestration/references/port-registry.md`](../../.claude/skills/worktree-orchestration/references/port-registry.md) — if that pool runs out, this row reopens for the next range. | — |

> ℹ️ **Current auth configuration, as of 2026-08-16.** "Confirm email" is **ON**
> and now actually takes effect. Until today it did not: a `BEFORE INSERT`
> trigger on `auth.users` (`on_auth_user_created_auto_confirm`) confirmed every
> new row, so the setting was a **no-op** — the dashboard and GoTrue's
> `/auth/v1/settings` both reported it enforced while the database overrode it.
> Dropped by [`policies/011_drop_auto_confirm.sql`](../../packages/shared/drizzle/policies/011_drop_auto_confirm.sql);
> verified gone. Account:
> [`../security/SEC-2026-08-16-auth-users-auto-confirm-trigger.md`](../security/SEC-2026-08-16-auth-users-auto-confirm-trigger.md).
>
> **Signup therefore now depends on email actually arriving** — which was
> confirmed working the same day (top row of this table; `G-11` closed). That
> holds for **members of the project's Supabase org only**: the built-in mailer
> silently drops everyone else, which is what the parked custom-SMTP row is for.
> If a confirmation mail ever fails to turn up, the account exists but cannot be
> confirmed — recover by confirming it by hand in **Authentication → Users**. Do
> **not** re-apply the dropped trigger.
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
be done yet, the reason is the whole action item · ⏸️ parked — deliberately
deferred with a recorded trigger for picking it back up, tracked in
[`../Deferred.md`](../Deferred.md) · ✅ done — leave completed rows here for a
while rather than deleting; they're proof of what you already handled if the
same question comes up again.

---

## How this stays accurate

When a task or plan produces a step only the owner can do, it gets **one** row
here, and everywhere else that references it points back to this file instead
of repeating the status:

- `doc/tasks/MasterTaskQueue.md`'s "Blocked items" table
- `doc/Deferred.md`, if the item is also parked in principle

If you ever see the same action described differently in two places, that's
drift — the fix is deleting the duplicate, not editing both.
