# Runbook — enabling GitHub and Google sign-in

**Status:** the app-side code is complete and verified. Both providers are
**disabled in Supabase**, so the buttons currently return
`Unsupported provider: provider is not enabled`, which the login page renders as
*"That sign-in provider isn't enabled for this project yet."*

Everything below has to be done by a human. Creating an OAuth application is an
action taken as *you* on GitHub and Google, and the client secrets have to be
typed into the Supabase dashboard — neither is something an agent should be
doing on your behalf.

Confirm the current state at any time:

```bash
curl -s -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/settings"
```

`external.github` and `external.google` flip to `true` when this is done.

---

## The one URL both providers need

```
https://pnymngoqseltgigcfevq.supabase.co/auth/v1/callback
```

This is **Supabase's** callback, not the app's. A common mistake is registering
`http://localhost:3000/auth/callback` here — that is where Supabase sends the
browser *afterwards*, and the provider never sees it. If you register the app
URL instead, sign-in fails with a redirect-URI mismatch.

## 1. GitHub

1. <https://github.com/settings/developers> → **OAuth Apps** → **New OAuth App**
   (or an org's Settings → Developer settings for a shared app).
2. Fill in:
   - **Application name:** `Sparstrowgen (staging)`
   - **Homepage URL:** `http://localhost:3000`
   - **Authorization callback URL:** the Supabase callback URL above
3. **Register application**, then **Generate a new client secret**. Copy the
   secret immediately — GitHub shows it once.
4. Supabase → **Authentication → Sign In / Providers → GitHub**: enable, paste
   the Client ID and Client Secret, **Save**.

No scope configuration is needed. Supabase requests `user:email` by default,
which is what the app needs to know who signed in.

## 2. Google

1. <https://console.cloud.google.com/> → create or pick a project.
2. **APIs & Services → OAuth consent screen**. External user type. Fill in the
   app name, support email and developer contact. While the app is in *Testing*
   only accounts you list as test users can sign in — add your own address, or
   publish the app.
3. **Credentials → Create Credentials → OAuth client ID**:
   - **Application type:** Web application
   - **Authorised JavaScript origins:** `http://localhost:3000`
   - **Authorised redirect URIs:** the Supabase callback URL above
4. Copy the Client ID and Client Secret.
5. Supabase → **Authentication → Sign In / Providers → Google**: enable, paste
   both, **Save**.

## 3. Tell Supabase where the app lives

**Authentication → URL Configuration**:

- **Site URL:** `http://localhost:3000`
- **Redirect URLs:** add `http://localhost:3000/**`

Without the wildcard entry, Supabase refuses to bounce the browser back to
`/auth/callback` after a successful provider login and you land on the Supabase
error page instead. Add the production origin here too when there is one.

## 4. Check it

1. `pnpm -F web dev`, open <http://localhost:3000/login>, click **GitHub**.
2. Expect: GitHub consent → back to `/auth/callback?code=…` → the dashboard,
   signed in.
3. **Settings → Account → Profile** should show *Signed in with **GitHub***.
4. Repeat for Google.

If it fails, the message on the login page is the provider's own — the callback
route forwards `error_description` verbatim rather than flattening everything to
"Authentication failed".

## Notes

- **Same email, different provider.** Supabase links identities by verified
  email, so signing in with Google using the address of an existing
  password account attaches to that same account rather than creating a second
  one. This is what you want; it is worth knowing before you test it.
- **First sign-in creates a workspace.** `bootstrap_workspace()` runs on the
  first authenticated request regardless of provider, so an OAuth user gets the
  same one-workspace setup as an email user.
- **Deployment.** When the app moves off localhost, set `NEXT_PUBLIC_SITE_URL`
  so post-auth redirects target the public origin rather than whatever internal
  host the request arrived on. See `apps/web/src/lib/auth/origin.ts`.
