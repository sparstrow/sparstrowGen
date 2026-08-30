# T-CS3-03 — the `providers.discover_models` dispatch, end to end

| | |
|---|---|
| **Tag** | `[S]` — needs T-CS3-01's provider method and T-CS3-02's table to compile against |
| **Serves** | foundational — unblocks CS4 |
| **Depends on** | T-CS3-01, T-CS3-02 |
| **Blocks** | T-CS3-04 |
| **Phase spec** | [README.md](README.md) |
| **Status** | done (2026-08-28) |

## Objective

Wire the full loop: a Postgres function inserts a `providers.discover_models`
`runtime_commands` row targeting an online `antigravity`-capable runtime; the
daemon's `dispatch()` picks it up, calls the provider's `discoverModels()`
(T-CS3-01), posts the result into `provider_model_cache` (T-CS3-02) through a
new RPC, and acks the command.

## Decisions already made

Phase decision 3, refined significantly — this task's own plan carried a
placeholder (`current_workspace_ids() limit 1`) explicitly flagged as
unverified for both functions, on two DIFFERENT wrong assumptions:

**`request_model_discovery` is called from the browser**, not a daemon.
`apps/web`'s server actions already resolve one unambiguous
`ctx.workspaceId` per call (`actionContext()`), the same way every other
action in `chat/actions.ts` does — there is no "which workspace" ambiguity
to solve inside Postgres. The function takes `p_workspace_id` as an
explicit argument (matching every other action's `.eq("workspace_id",
ctx.workspaceId)` pattern) and validates it against
`current_workspace_ids()` as defense in depth, exactly the shape
`enqueue_chat_turn` already uses for its session row.

**`record_provider_models` is called from a DAEMON, which has no
`auth.uid()` at all** under the token scheme `/api/daemon/*` routes use
(confirmed reading `apps/web/src/lib/daemon/auth.ts`'s own header
comment — a daemon token is deliberately NOT a `workspace_members` row, on
purpose, per M3 decision 1). `current_workspace_ids()` — and Band 25's
`current_daemon_scope()`, which resolves the *Realtime-specific* Supabase
Auth identity, a completely different daemon auth mechanism — both find
nothing for this caller. The actual, already-proven pattern (confirmed by
reading `apps/web/src/app/api/daemon/chat/turns/[id]/result/route.ts`):
`authenticateDaemon(request)` validates the bearer token and returns
`{workspaceId, runtimeId}`; the route passes those explicitly to a
service-role RPC call. `record_provider_models` follows this exactly — it
is never called via PostgREST RPC by any client, only from a new
`/api/daemon/providers/discover-models` route.

```sql
create or replace function public.request_model_discovery(p_workspace_id text, p_provider text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_runtime_id text;
begin
  if p_workspace_id not in (select private.current_workspace_ids()) then
    raise exception 'Not a member of that workspace.';
  end if;
  v_runtime_id := private.pick_runtime_for(p_workspace_id, p_provider, null);
  if v_runtime_id is null then
    return; -- CS4 reads the existing cache row (possibly none/stale) and says so
  end if;
  insert into public.runtime_commands (id, workspace_id, runtime_id, kind, payload, status, idempotency_key)
  values (
    'cmd_' || pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 16),
    p_workspace_id, v_runtime_id, 'providers.discover_models',
    pg_catalog.jsonb_build_object('provider', p_provider), 'pending',
    'providers.discover_models:' || p_workspace_id || ':' || p_provider || ':' || pg_catalog.now()::text
  );
end;
$$;

create or replace function public.record_provider_models(
  p_workspace_id text, p_provider text, p_models jsonb, p_live boolean, p_detail text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.provider_model_cache (workspace_id, provider, models, live, detail, checked_at)
  values (p_workspace_id, p_provider, p_models, p_live, p_detail, pg_catalog.now())
  on conflict (workspace_id, provider) do update
    set models = excluded.models, live = excluded.live, detail = excluded.detail, checked_at = excluded.checked_at;
end;
$$;
```

**The idempotency key intentionally includes a timestamp** (unlike
`chat.turn`'s, which is keyed on a stable turn id) — repeated discovery
requests are expected and each should dispatch fresh, not `on conflict do
nothing` against a prior request from minutes ago.

**A real, live-caught security gap, twice**: `revoke ... from anon,
authenticated` on `record_provider_models` and no grant at all on
`request_model_discovery` both LOOKED correct in the migration text and
did nothing. Postgres grants `EXECUTE` to `PUBLIC` by default on every new
function, and `anon`/`authenticated` inherit from `PUBLIC` — revoking only
from the named roles leaves the `PUBLIC` grant standing, and
`has_function_privilege` confirmed live that `authenticated` could still
execute `record_provider_models` after the "revoke" ran. Without the
`... from public` fix below, any signed-in user could have called
`record_provider_models` directly via PostgREST RPC and overwritten ANY
workspace's cache with a forged result — not even limited to their own,
since the function trusts `p_workspace_id` entirely once past the
(nonexistent) grant check. Fixed and reverified live (`has_function_privilege`
returning `false` for both `anon` and `authenticated` on
`record_provider_models`, and `false` for `anon` /`true` for `authenticated`
on `request_model_discovery`, matching `enqueue_chat_turn`'s own established
lockdown shape in `014_chat_turn_dispatch.sql`).

## Checklist

- [x] `request_model_discovery` and `record_provider_models` added in
      `024_provider_model_dispatch.sql`, with the corrected auth model above
      (not the plan's placeholder)
- [x] `runtimeCommands.kind` comment updated (also filled in a pre-existing
      gap: `settings.set` was missing from that comment too)
- [x] `CommandKind` (packages/shared) also needed the new member — the plan
      only named `runtimeCommands.kind`'s DB comment, not this separate
      TypeScript union `commands.ts`'s switch is typed against; caught by
      `tsc`, not missed silently
- [x] `packages/core/src/cloud/commands.ts`'s `dispatch()` gets the new case,
      delegating to a new `discoverProviderModels()` in a new
      `provider-discovery.ts` (matching this directory's one-file-per-
      capability convention — `chat-turn.ts`, `bindings.ts`, etc.), not
      inlined in `commands.ts` itself
- [x] `discoverProviderModels()` POSTs to a new `/api/daemon/providers/discover-models`
      route via `cloudFetch` — NOT a direct `record_provider_models` RPC call,
      per the corrected daemon-auth model above
- [x] `apps/web` gets `requestModelDiscoveryAction` in `chat/actions.ts`,
      following the exact pattern `deleteChatSessionAction` already
      established — CS4 wires the actual UI trigger
- [x] `pnpm typecheck` and `pnpm test` green across `@sparstrow/shared`,
      `@sparstrow/core`, and `web`

## Traps

- **The `PUBLIC`-grant default is not obvious from reading a `revoke ...
  from anon, authenticated` line** — it looks complete and isn't. Always
  verify with `has_function_privilege(role, function, 'execute')` after
  applying, live, for every role that must NOT be able to call a function —
  this is exactly how both gaps above were actually caught, not by reading
  the SQL a second time.
- **A runtime with no `antigravity` capability must not be picked** by
  `pick_runtime_for` — confirmed live: the real scratch daemon paired for
  this task's verification correctly reported `["claude-code",
  "antigravity"]` as capabilities, and `pick_runtime_for` selected it
  correctly for the `antigravity` provider.
- **Don't call `record_provider_models` via `ctx.supabase.rpc(...)` from
  `apps/web` "for consistency with `request_model_discovery`."** They have
  deliberately different callers and deliberately different auth models —
  unifying them would either break the daemon path (no `auth.uid()`) or
  reopen the cross-workspace write hole the `revoke ... from public` fix
  just closed.

## Verification

- [x] **Full live, real end-to-end pass** — not mocked, not simulated:
      paired a real scratch daemon (isolated `SPARSTROW_SECRETS_DIR`/
      `DATA_DIR`) against this worktree's own dev server, confirmed it
      reported `active` with `antigravity` capability (the real `agy`
      install), then called `request_model_discovery` as the real signed-in
      owner of that workspace (via a JWT-claims-impersonated SQL session,
      since CS4's UI doesn't exist yet to click). Result: a real
      `runtime_commands` row → claimed and completed by the real daemon
      within seconds → `provider_model_cache` populated with the real,
      live, current 14-model `antigravity` list, `live: true`. Confirmed by
      querying the table directly, not by trusting the ack.
- [x] Confirmed a non-member (no workspace JWT claim) is refused with "Not a
      member of that workspace" — the defense-in-depth check actually
      defends, not just compiles.
- [x] Unit tests added to `commands.test.ts`: dispatches
      `providers.discover_models`, calls the provider, POSTs the result,
      acks done; and a provider with no `discoverModels` (e.g. `claude-code`)
      acks done without posting, not failed — "not this machine's fault."
- [x] Disposable workspace + scratch daemon cleaned up afterward (workspace
      delete cascaded `provider_model_cache`/`runtime_commands` correctly,
      confirmed by re-querying both as empty)
- [ ] Idempotency-key-doesn't-collide-on-repeat specifically not
      independently re-tested this pass (the mechanism is identical in
      shape to `chat.turn`'s own proven idempotency key construction, just
      with a timestamp component) — full walk in
      [T-CS3-04](T-CS3-04-verification.md)

## On completion

- [x] `pnpm typecheck` and `pnpm test` green (all three affected packages)
- [x] Update this file's **Status** row
- [ ] Open the PR into `band/26-chat-session-and-conversation-ux`, then
      `gh pr merge <n> --auto --squash`
- [ ] Update the phase README's task table

> **Do not edit [`../MasterTaskQueue.md`](../MasterTaskQueue.md) from a task
> branch.**

## Result

**2026-08-28 — done, both auth models corrected from plan, and two real
security gaps caught live.** The plan's `current_workspace_ids() limit 1`
placeholder was wrong for both functions in different ways: browser calls
already have an unambiguous `ctx.workspaceId` to pass explicitly (no
resolution needed inside Postgres), and daemon calls have no `auth.uid()`
at all under this app's daemon-token scheme (confirmed by reading
`apps/web/src/lib/daemon/auth.ts`'s own header, which explicitly warns
against trusting anything but the authenticated scope for exactly this
reason). `record_provider_models` is now reached only via a new
`/api/daemon/providers/discover-models` route, matching every other
daemon-to-cloud write in this codebase.

Both functions also had a live, real `PUBLIC`-default execute grant that a
plausible-looking `revoke ... from anon, authenticated` line did not
actually close — caught by `has_function_privilege`, not by re-reading the
SQL. Before the fix, any signed-in user could have called
`record_provider_models` directly via PostgREST RPC and overwritten any
workspace's cache with a forged "live" result.

Proved with a genuine live end-to-end pass: a real paired scratch daemon
(real `agy` install, reported `antigravity` capability correctly),
`request_model_discovery` called as the real workspace owner, a real
`runtime_commands` row claimed and completed by that daemon within
seconds, and `provider_model_cache` populated with antigravity's real,
current 14-model list — queried directly from the database, not inferred
from an ack. `pnpm typecheck`/`test` green across `@sparstrow/shared`,
`@sparstrow/core` (757 tests, +2 new), and `web`. Disposable workspace and
scratch daemon fully cleaned up afterward.
