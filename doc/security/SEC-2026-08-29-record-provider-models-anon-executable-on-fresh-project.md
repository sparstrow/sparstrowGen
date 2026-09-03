# SEC-2026-08-29-record-provider-models-anon-executable-on-fresh-project

**Status:** 🟢 resolved
**Severity:** low
**Reported by:** agent — found while setting up the production Supabase project from scratch (`doc/plans/2026-08-29-two-channel-desktop-release.md`, Band C)
**Reported:** 2026-08-29

## What's exposed / what's possible

`public.record_provider_models(...)` is `SECURITY DEFINER` and, by its own header comment in `policies/024_provider_model_dispatch.sql`, trusts its `p_workspace_id` argument entirely with no internal membership check — it's meant to be reachable only from `apps/web`'s own `/api/daemon/providers/discover-models` route (service role, after that route validates a daemon's bearer token). On the freshly created production project, it was directly callable over PostgREST by an unauthenticated (`anon`) caller. Anyone could call `POST /rest/v1/rpc/record_provider_models` with an arbitrary `p_workspace_id` and overwrite that workspace's `provider_model_cache` row with forged model-list data — no login required.

## Who can trigger it

Anonymous internet (`anon` role), before the fix. Not exploitable on `staging` — checked directly (see Evidence) and confirmed staging never had this gap.

## Evidence

`024`'s own migration text runs `revoke execute on function public.record_provider_models(...) from public;` (naming only the `public` pseudo-role, not `anon`/`authenticated` explicitly) — its header even explains why: an earlier draft revoking `from anon, authenticated` directly "looks correct and does NOTHING" because those roles inherit from `PUBLIC`, so revoking from `PUBLIC` was believed sufficient.

Confirmed empirically that this assumption doesn't hold on every Supabase project:

```sql
-- on styichgxhecmatkholvi (prod, created 2026-08-08), before the fix:
select has_function_privilege('anon', 'public.record_provider_models(text,text,jsonb,boolean,text)', 'execute');
-- true

-- on pnymngoqseltgigcfevq (staging, created 2026-08-09), same query:
-- false
```

Both projects ran the identical `024` migration text. The difference is a project-level default-privilege template Supabase applies at project creation — evidently prod's (newer) template grants `EXECUTE` on new `public`-schema functions directly to `anon`/`authenticated`, independent of the `PUBLIC` pseudo-role grant that `024`'s revoke targets. `public.rls_auto_enable()` — a pre-M1 legacy function `005_harden_legacy_functions.sql` expected to already exist and revoke from — showed the same pattern: it didn't exist on prod when `005` ran (no-op, confirmed by that statement erroring "does not exist"), then turned up later as a Supabase-platform-seeded function, anon/authenticated-executable, once other DDL had run.

## Impact

Low: the only capability gained is writing fabricated entries into `provider_model_cache`, a read-only-to-members cache table with no cascading trust (CS4's model picker treats it as an advisory hint, not an authorization source). No access to any other table, no RLS bypass beyond this one function. Exploitable today on any Supabase project whose default-privilege template resembles prod's — which, per this finding, is not reliably predictable from staging's behavior alone.

## Resolution

Applied explicit `revoke execute on function public.record_provider_models(...) from public, anon, authenticated;` and the equivalent for `rls_auto_enable()` directly to `styichgxhecmatkholvi`. Verified closed by re-running the same `has_function_privilege` checks — both `anon` and `authenticated` now return `false` — and by re-running `get_advisors(type: "security")`, which no longer flags either function.

**Follow-up recommended, not done in this pass:** `policies/024_provider_model_dispatch.sql`'s own text still only revokes `from public`. The next time that file is touched, its revoke should name `anon, authenticated` explicitly too (matching `008`/`009`/`014`'s more defensive pattern), so a future fresh Supabase project doesn't silently reopen this gap. Left as-is here rather than rewriting an already-applied historical migration file.
