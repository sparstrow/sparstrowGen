# SEC-2026-09-03-server-mints-user-jwts-for-access-token-clients

**Status:** 🟢 built, and the security property was verified at runtime rather than assumed
**Severity:** medium (design-time trust-boundary change; the alternative was high)
**Reported by:** agent — filed while building restructure Phase 4's desktop sign-in, because it adds a second way to authenticate to the human API
**Reported:** 2026-09-03

> Not a discovered vulnerability. A deliberate boundary change, recorded so the
> reasoning survives outside a chat log — this folder's standing rule.

## What changed

`server/` now accepts **two** credentials on `/api/v1/*`:

| Client | Credential | Path |
|---|---|---|
| `apps/web` | Supabase access token (JWT) | verified by `auth.getUser()` |
| desktop, CLI | **personal access token** | resolved against `access_tokens`, then exchanged for a freshly minted JWT |

The second is new. A desktop app has no browser, no cookie, and no Supabase
session to forward, so it authenticates with the same person-scoped PAT the
daemon already uses ([`SEC-2026-09-02-daemon-credential-widened-to-person-scope`](SEC-2026-09-02-daemon-credential-widened-to-person-scope.md)).

## The decision that matters, and the one that was rejected

PostgREST does not know what a PAT is. A PAT-authenticated request has no
`auth.uid()`, so **every RLS policy denies it**. There were two ways out:

**Rejected — serve those requests with the service-role key.** It is the
obvious move and it is the dangerous one: the service role bypasses RLS
entirely. Every workspace-scoping policy in
`packages/shared/drizzle/policies/` would have stopped being enforced for
exactly the client we were adding, and the only thing left between two people's
data would be ~50 handlers each remembering `.eq("workspace_id", …)` forever.
It would also have quietly inverted [`G-35`](../KnownGaps.md)'s premise.

The failure mode is what condemns it: it has **no symptom**. Everything works,
nothing errors, and the boundary is simply gone.

**Built — mint a short-lived JWT for the resolved user.** Supabase documents
this: a token carrying `sub`, `role: "authenticated"` and `exp`, signed with the
project's JWT secret, is accepted by PostgREST, and `auth.uid()` reads `sub`.
RLS then applies to a PAT-authenticated request **exactly as it does to a
browser session** — which is the property that makes a second client safe to
add at all.

## Verified, not assumed

The whole design rests on "RLS still applies", so that was measured against the
running local stack rather than reasoned about:

| Credential | `GET /rest/v1/workspaces` |
|---|---|
| minted JWT, real user | `[{"id":"d2085eb9-…"}]` — their own workspace |
| minted JWT, user id that owns nothing | **`[]`** |
| service-role key (the rejected path, for contrast) | `[{"id":"d2085eb9-…"}]` |

The middle row is the test. Had the minted token been bypassing RLS, it would
have returned the workspace too. It returned nothing.

## What this widens, honestly

**Not the principal.** A PAT already acts as the person — `SEC-2026-09-02`
states that plainly and the owner accepted it.

**The surface, yes.** The same token now reaches the human API in addition to
`/api/daemon/*`. Someone holding a leaked PAT could previously impersonate a
machine; they can now also read and write that person's workspace content
through `/api/v1`. Given the existing model (a PAT *is* the person, and
[`G-35`](../KnownGaps.md) means any member has full access anyway), this is a
smaller step than it first sounds — but it is a step, and it is the reason this
file exists.

## Controls this depends on

- **Revocation is checked per request.** `resolvePersonalAccessToken` selects
  `revoked_at` rather than filtering on it, so a revoked token is refused *and
  is known to be revoked* — and revoking a token takes effect on the next call,
  not on the next token expiry.
- **`last_used_at` is maintained**, fire-and-forget, so an owner can tell a live
  credential from a forgotten one when deciding what to revoke. That is what
  makes a person-scoped token safe to hand out at all.
- **Minted tokens live 5 minutes** and never leave the process — created per
  request, handed to a Supabase client, dropped. A long life would buy nothing
  and widen the window if one were ever captured in a log or heap dump.
- **The role is pinned to `authenticated`**, asserted by a test whose comment
  says why: `service_role` there would reintroduce the rejected design with no
  symptom whatsoever.
- **Half-configured must not half-work.** Without *both* the service-role key
  and the JWT secret, `server/` refuses access tokens outright rather than
  falling back to anything. `supportsAccessTokens` is the single place that
  decides, and it is tested.

## New secret

`server/` now needs `SUPABASE_JWT_SECRET` alongside `SUPABASE_SERVICE_ROLE_KEY`.
Both are server-only and neither may reach a client. Locally it comes from
`supabase status -o env`; for the shared project it is an owner action —
Dashboard → Settings → API → JWT Secret.

⚠️ **If the shared project uses asymmetric signing keys rather than a legacy
shared secret, this needs the asymmetric variant** (`alg`/`kid` headers and the
private key) instead. That has not been checked against the deployed project,
because Phase 4 runs against local Supabase. Whoever first points `server/` at
the shared project must confirm which scheme it uses before assuming PAT auth
works there.
