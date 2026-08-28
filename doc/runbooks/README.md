# Owner action items

**Open this file when you're wondering "what do I need to go do?"** Everything
here needs you specifically — an account only you control, a dashboard setting,
a secret only you should type in. Nothing here is something an agent can or
should do on your behalf.

Each row is one action. Rows with a guide link to the step-by-step runbook.
Rows without one have nothing to click yet — the note explains why.

| Status | Action | Why it needs you | Guide |
|---|---|---|---|
| ✅ done | ~~Apply **`018` (re-run), `019` and `020`** from `packages/shared/drizzle/policies/`~~ | **Done 2026-08-28.** Applied to `pnymngoqseltgigcfevq` (sparstrowgen-staging) with the CLI and MCP server both authorized. `018`'s re-run was a confirmed no-op (same 6 rows); `019` produced exactly the expected ten `pg_policies` rows; `020`'s guard verified both halves live, in a rolled-back transaction (a daemon identity refused `42501`, a genuinely new human user still provisions normally). `get_advisors` afterward flagged one new item — an unindexed FK on `daemon_identities.workspace_id` — fixed in a new `021_daemon_identities_workspace_index.sql`, re-verified clean. Full account: `KnownGaps.md` `G-49`. | [`../tasks/DI/T-DI-02-daemon-identity-schema.md`](../tasks/DI/T-DI-02-daemon-identity-schema.md) |
| ✅ done | ~~Check **Project Settings → Realtime → "Allow public access"**~~ — **ruled out, not the cause** | **Checked and disabled by the owner 2026-08-28.** Reconnected both the daemon and the browser fresh afterward — symptom unchanged, still blocked. Not this row's fault; see the next row for where the investigation went. | [`../bug/BUG-2026-08-28-private-broadcast-channels-not-relaying.md`](../bug/BUG-2026-08-28-private-broadcast-channels-not-relaying.md) |
| 🔲 pending | Raise **"Database connection pool size"** (currently `2`) on [the project's Realtime Settings](https://supabase.com/dashboard/project/pnymngoqseltgigcfevq/realtime/settings), or file a Supabase support ticket if that doesn't fix it | **Added 2026-08-28, `T-DI-05`, after the toggle above was ruled out.** Using Supabase's own Realtime Inspector, joining the exact private topic as `postgres` (superuser) works fully — presence events and a self-sent broadcast both round-trip instantly. Joining as `authenticated`, impersonating the real, correctly-RLS-authorized daemon identity, the join itself reports success but **the same connection never hears its own self-sent broadcast** — not RLS, not this repo's code, not external delivery specifically. The connection pool description reads *"Realtime Authorization uses this database pool to check client access"* — 2 connections is small for a check that appears to succeed but leave something incomplete. **An agent typing into that field was blocked by the safety classifier** as a live production settings change, same as the toggle above was before you flipped it yourself. Full diagnosis and reproduction: [`doc/bug/BUG-2026-08-28-private-broadcast-channels-not-relaying.md`](../bug/BUG-2026-08-28-private-broadcast-channels-not-relaying.md). Until this clears, `T-DI-05` cannot complete, and — if the same pattern affects `010`/`015`'s identical `private: true` usage — run transcripts and chat turn deltas may be silently non-live in production today too. | [`../bug/BUG-2026-08-28-private-broadcast-channels-not-relaying.md`](../bug/BUG-2026-08-28-private-broadcast-channels-not-relaying.md) |
| ✅ done | ~~Re-export **`SUPABASE_JWT_SIGNING_KEY`**~~ — **the variable no longer exists** (removed by `T-DI-03`, 2026-08-27) | **Added 2026-08-26 (T-M16-02); superseded 2026-08-27, confirmed live with the owner in the Supabase dashboard.** This row used to ask you to re-export the current ES256 signing key's private half as JSON from **Project Settings → API → JWT Keys**. Walked that screen together: the "Key Details" modal only ever shows the *public* key set (`key_ops: ["verify"]`, no `d`), and a freshly created standby ES256 key showed the identical public-only shape at the moment of creation — no export, no one-time reveal, anywhere. This is not a dashboard-permissions issue; Supabase's asymmetric JWT Signing Keys are designed so the private half never leaves their infrastructure. **There is nothing to paste in here** — `mintRealtimeToken()`'s whole approach (read the project's own private key from an env var, sign with it ourselves) needs redesigning, not a corrected value. Tracing this also found a second, independent blocker in the RLS itself: see `doc/KnownGaps.md` `G-48` and [`doc/bug/BUG-2026-08-27-daemon-realtime-token-cannot-pass-terminal-channel-rls.md`](../bug/BUG-2026-08-27-daemon-realtime-token-cannot-pass-terminal-channel-rls.md). **Nothing for you to do on this row, ever** — `T-DI-03` deleted the variable, its `.env.example` entry and its `turbo.json` declaration on 2026-08-27. A daemon's Realtime credential is now a real Supabase session minted through the Auth admin API, so this app holds no signing key at all. You may safely delete `SUPABASE_JWT_SIGNING_KEY` from Vercel's Preview and Development environments. Superseded by the "Apply `018`/`019`/`020`" row above. | — |
| ✅ done | ~~**Confirm whether Supabase is actually delivering email**~~ | **Confirmed 2026-08-16.** A sign-up confirmation and a magic link both arrived in a real inbox and both signed you in — the first time the built-in mailer had ever been exercised (every earlier link was minted with the admin API, which sends no mail). Closed `G-11`. Needed [`policies/011_drop_auto_confirm.sql`](../../packages/shared/drizzle/policies/011_drop_auto_confirm.sql) first, because a trigger was confirming every signup and so skipping the send entirely. | [email-delivery.md](email-delivery.md) |
| ⏸️ parked | Configure **custom SMTP** | Deliberately deferred — see [`../Deferred.md`](../Deferred.md) **D-14**. The built-in mailer serves you today because both accounts are members of the project's Supabase org; it delivers to **nobody else**, silently, and is capped at a few messages an hour. Unparks when anyone outside the org needs mail, or the app deploys publicly — whichever comes first. | [email-delivery.md](email-delivery.md) |
| ✅ done | Deploy the web app (`staging` + `development`) | **Added 2026-08-16.** Vercel auto-deploys `staging`→`staging.sparstrow.com` and `development`→`development.sparstrow.com` (DNS at Hostinger); both share one fully configured Supabase project, including Auth redirect URLs. `main`→`sparstrow.com`'s Vercel/DNS wiring is also live, but `main` itself is still dummy code — see the pending rows below. | [deploy-web-app.md](deploy-web-app.md) |
| ✅ done | ~~**Point a paired machine's `SPARSTROW_CLOUD_URL` and the desktop shell's `SPARSTROW_APP_URL` at `staging.sparstrow.com`**~~ | **Done 2026-08-22, for M11's purposes.** A scratch machine (its own `SPARSTROW_SECRETS_DIR`/`SPARSTROW_DATA_DIR`, never the owner's own `~/.sparstrow`) was paired live against `staging.sparstrow.com` — see [`T-M11-01`](../tasks/M11/T-M11-01-machine-on-staging.md). Both machine states were forced and timed correctly, a real run was dispatched and executed (`T-M11-02`), and host-local refusals were confirmed. **The owner's own day-to-day machine is still unpointed** — that switch is a separate, deliberate step whenever the owner wants their real machine reporting to staging instead of `localhost:3000`; nothing in this phase required it, and nothing here does it for them. | [deploy-web-app.md](deploy-web-app.md) |
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

It grew a second half on 2026-08-20: **how to get a browser that actually
renders**. Three `KnownGaps.md` entries had recorded "nothing composites frames
here" as a fact about this environment; it is a fact about the in-app Browser
pane only, and the Playwright MCP renders normally. M8 used it for the first
fully rendered verification pass in this repo and found four defects a green
typecheck and 1044 passing tests could not see.

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
