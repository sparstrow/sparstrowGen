# Auth completeness — 2026-08-10

| | |
|---|---|
| **Status** | Done, except provider enablement (owner action) |
| **Trigger** | Owner review after M2: no logout, no account deletion, OAuth buttons decorative, login page off-design |
| **Depends on** | M2 |
| **Touches** | `apps/web/src/{app/auth,app/login,components/auth,lib/auth,utils/supabase}`, `packages/ui/src/lib/account.tsx`, `packages/shared/drizzle/policies/007_delete_own_account.sql` |

## What was wrong

The auth surface was a sign-in form and nothing else. Six defects, in rough
order of severity:

1. **The app shell crashed on the first navigation after signing in.**
   `AppShell` called `React.useEffect` after an early `return` for `/login`, so
   the number of hooks depended on the URL. Going `/login → /` — the one
   transition every user makes — threw *"rendered more hooks than during the
   previous render"*.

2. **An entire class of Tailwind utilities generated no CSS.** Tailwind v4
   skips `node_modules`, and the web app reaches `@sparstrow/ui` through a
   workspace symlink, so any class used *only* inside the shared package was
   dropped from the build with no error. `bg-popover`, `bg-accent` and
   `bg-destructive` were all dead: every dropdown, tooltip, select and command
   palette rendered with a transparent background, and destructive buttons had
   no red. It hid because the common tokens (`bg-card`, `bg-background`,
   `bg-muted`) also appear in `apps/web` files and so kept working.

3. **No way to sign out.** The menu item existed but was hard-disabled with the
   tooltip "No account to sign out of — everything runs locally", left over
   from the pre-cloud single-user design.

4. **No way to delete an account**, and no safe way to build one:
   `public.users.id` is a plain `text` column with **no foreign key** to
   `auth.users`, so deleting the auth row orphans the workspace, the
   membership, and everything hanging off them — permanently invisible to RLS.

5. **OAuth was decorative.** Both providers are disabled in Supabase, and
   `signInWithOAuth` does not report that: it returns no error and navigates
   the browser to Supabase's `/authorize`, which answers a bare JSON blob. The
   user ended up on `supabase.co` staring at `{"code":400,...}` with no way
   back.

6. **The middleware could not be trusted.** It fell back to a hardcoded project
   ref and an empty anon key when env was missing, so a misconfigured deploy
   still "worked" — silently authenticating against a project nobody
   configured, presenting as a 401 that looked like a session bug.

Plus the smaller ones: no password reset at all, `next` unvalidated on the
callback (open redirect), the query cache not cleared on sign-out (the next
user saw the previous one's data from cache), and sign-up telling everyone to
check their inbox even when it had already returned a session.

## Decisions

**Deletion is one SQL function, not a sequence of REST calls.** Same reasoning
as `004` and `006`: PostgREST cannot span statements, and a half-deleted
account is the worst outcome available — auth row gone, app rows stranded
behind an id no policy will ever match. `public.delete_own_account()` does the
whole thing in one transaction, including the `auth.users` row.

**It takes no arguments.** `SECURITY DEFINER` is unavoidable (nothing else can
reach `auth.users`), so the mitigation is that there is no parameter to abuse:
the target is always `auth.uid()`. A service-role route taking a user id would
have put "delete any user" one missing check away from being reachable over
HTTP.

**Owning a shared workspace blocks deletion.** There is no ownership-transfer
flow. The alternatives were cascading (destroying co-members' data because one
person left) or orphaning the workspace behind an owner nobody holds. Refusing,
with a message that says why, is the only one of the three that isn't a bug.

**The account is resolved on the server.** The root layout builds the snapshot
and passes it down. Deriving it in a client effect made the server render
"Local workspace" while the client rendered the email, which aborted hydration
for the whole shell.

**The shared UI learns about accounts through context, defaulting to `null`.**
`@sparstrow/ui` serves both the web app (Supabase accounts) and the local
desktop build (no accounts at all). `null` means "this host has no concept of
accounts", so the desktop build keeps precisely the behaviour it had — the
affordances present but disabled, with a tooltip explaining why.

**The login page asks which providers exist before offering them.** Since a
disabled provider can only be discovered by navigating away and reading JSON on
someone else's domain, the page reads `/auth/v1/settings` up front and disables
what it cannot honour. Enabling a provider in the dashboard lights the button
up on the next page load, with no code change.

**Sign-out is a POST that runs on the server, with `scope: "global"`.** The
cookies are server-set, so a client-side `signOut()` leaves the middleware
still seeing a valid user on the next full page load — you appear to log out
and are silently logged back in. POST-only because a GET sign-out can be fired
by any `<img>` tag on any site. Global because signing out is what you do on a
machine you no longer trust.

## Verified

Against live staging, with real sessions:

- **24/24** auth-route behaviours: the guard (page → 302 with `next`, API →
  401 JSON), callback and confirm error paths, three open-redirect payloads
  refused, sign-out clearing cookies and revoking the token, delete-account
  rejecting unauthenticated / wrong-email / missing-confirmation
- **17/17** delete-account semantics: sole-member workspace fully cascaded,
  shared-workspace owner refused, co-member detached without touching anyone
  else's data, `auth.users` row confirmed gone **over SQL** — PostgREST does
  not expose the `auth` schema, so asserting through it passes vacuously
- **7/7** delete-account over the real HTTP route, including case-insensitive
  email confirmation and cookie clearing
- **16/16** pages render with a session, no console errors, no hydration
  warnings
- 582 tests green (479 core · 59 shared · 19 ui · 17 web · 8 desktop, 4
  skipped); `pnpm -r typecheck` clean across all 7 packages

## Left for the owner

- **Enable GitHub and Google** — [`doc/runbooks/oauth-providers.md`](../runbooks/oauth-providers.md).
  Requires creating OAuth apps under your own accounts and pasting client
  secrets into the dashboard.
- **Enable leaked password protection** — Authentication → Sign In / Providers
  → Email. Confirmed still off on 2026-08-10 by signing up with `password123`
  and receiving a session.
- **Decide what happens to `auto_confirm_user()` before production.** It marks
  every signup's email as confirmed; with the "Create one" button live, anyone
  who can reach the app can make a working account without controlling the
  address.

## Follow-ups (not blocking)

- Degradation copy: `/terminals` and the dashboard PR card don't say the
  feature needs the local daemon; the PR card's red "Could not load" reads as a
  bug.
- Next 16 deprecates the `middleware` file convention in favour of `proxy`.
- Ownership transfer, which would turn the shared-workspace deletion refusal
  into a real choice.
