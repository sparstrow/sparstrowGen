# T-CS3-03 — the `providers.discover_models` dispatch, end to end

| | |
|---|---|
| **Tag** | `[S]` — needs T-CS3-01's provider method and T-CS3-02's table to compile against |
| **Serves** | foundational — unblocks CS4 |
| **Depends on** | T-CS3-01, T-CS3-02 |
| **Blocks** | T-CS3-04 |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

## Objective

Wire the full loop: a Postgres function inserts a `providers.discover_models`
`runtime_commands` row targeting an online `antigravity`-capable runtime; the
daemon's `dispatch()` picks it up, calls the provider's `discoverModels()`
(T-CS3-01), posts the result into `provider_model_cache` (T-CS3-02) through a
new RPC, and acks the command.

## Decisions already made

Phase decision 3. New Postgres pieces, modeled on `enqueue_chat_turn` /
`assign_or_park_chat_turn`'s shape (`014_chat_turn_dispatch.sql`,
`016_chat_turn_transcript.sql`):

```sql
create or replace function public.request_model_discovery(p_provider text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id text := (select private.current_workspace_ids() limit 1); -- confirm the correct single-workspace resolution helper this app actually uses for an action call, not a chat dispatch, before copying
  v_runtime_id text;
begin
  v_runtime_id := private.pick_runtime_for(v_workspace_id, p_provider, null);
  if v_runtime_id is null then
    return; -- CS4 reads the existing cache row (possibly none/stale) and says so; no error surface needed here
  end if;
  insert into public.runtime_commands (id, workspace_id, runtime_id, kind, payload, status, idempotency_key)
  values (
    'cmd_' || pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 16),
    v_workspace_id, v_runtime_id, 'providers.discover_models',
    pg_catalog.jsonb_build_object('provider', p_provider),
    'pending',
    'providers.discover_models:' || v_workspace_id || ':' || p_provider || ':' || pg_catalog.now()::text
  );
end;
$$;

create or replace function public.record_provider_models(
  p_provider text, p_models jsonb, p_live boolean, p_detail text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id text := (select private.current_workspace_ids() limit 1); -- must resolve to the CALLING RUNTIME's workspace, not an arbitrary one — confirm against how Band 25's daemon identity resolves this elsewhere before trusting this helper name
begin
  insert into public.provider_model_cache (workspace_id, provider, models, live, detail, checked_at)
  values (v_workspace_id, p_provider, p_models, p_live, p_detail, pg_catalog.now())
  on conflict (workspace_id, provider) do update
    set models = excluded.models, live = excluded.live, detail = excluded.detail, checked_at = excluded.checked_at;
end;
$$;
```

**The idempotency key intentionally includes a timestamp** (unlike
`chat.turn`'s, which is keyed on a stable turn id) — repeated discovery
requests are expected and each should dispatch fresh, not `on conflict do
nothing` against a prior request from minutes ago.

## Checklist

- [ ] `request_model_discovery` and `record_provider_models` added in a new
      migration file, with `private.current_workspace_ids()`'s actual
      single-workspace-resolution behavior confirmed against how an
      **action-context** call (not a chat-turn RPC, which already has a
      session row to read `workspace_id` from) resolves it elsewhere in this
      codebase — do not ship the placeholder above unverified
      (`chat_sessions`-style APIs simply return the row instead of relying on
      this helper; this new function has no row to resolve `workspace_id`
      from except the caller's own JWT claims, and Band 25's daemon-identity
      work is the most likely precedent to read first)
- [ ] `runtimeCommands.kind` comment updated to include `providers.discover_models`
- [ ] `packages/core/src/cloud/commands.ts`'s `dispatch()` gets a new case:

      ```ts
      case "providers.discover_models": {
        const { provider } = command.payload as { provider: string };
        const p = getProvider(provider as never);
        if (p.kind !== "cli" || !p.discoverModels) {
          await ackResult(command, { ok: false, failure: { reason: "unsupported_provider", error: `no live discovery for ${provider}` } });
          return;
        }
        const result = await p.discoverModels();
        await recordProviderModels(provider, result.models, result.live, result.detail); // new cloud client call
        await ackResult(command, { ok: true });
        return;
      }
      ```
- [ ] A new small client function (alongside the existing ones in
      `packages/core/src/cloud/client.ts` or `chat-turn.ts`) that RPCs
      `record_provider_models`, following whatever auth pattern those
      existing calls already use
- [ ] `apps/web` gets a thin caller for `request_model_discovery` (a server
      action, following the existing `chat/actions.ts` pattern) — CS4 wires
      the actual UI trigger, this task only needs the callable action to
      exist
- [ ] `pnpm typecheck` and `pnpm test` green

## Traps

- **`private.current_workspace_ids()` resolving to the wrong workspace (or
  more than one) breaks the whole cache** — this function is called with no
  row to anchor on, unlike every other RPC in this file which resolves
  `workspace_id` from a session/turn row it already looked up. Confirm this
  explicitly rather than assuming it behaves like the chat functions.
- **A runtime with no `antigravity` capability must not be picked** by
  `pick_runtime_for` for this dispatch — same trap the phase README already
  names; don't reinvent capability matching here.
- **`getProvider(provider as never)`** — the `as never` cast matches this
  codebase's existing pattern at `providers.ts:42`; don't "fix" it into a
  different cast that changes behavior on an unknown provider id.

## Verification

- [ ] Call `request_model_discovery('antigravity')` against a workspace with
      an online, `antigravity`-capable paired runtime; confirm a
      `runtime_commands` row appears, gets claimed, and `provider_model_cache`
      gets a fresh row within the same poll-bound latency chat turns already
      accept
- [ ] Call it with no online runtime available; confirm it returns cleanly
      with no error and no stale cache row overwritten
- [ ] Confirm a second call shortly after does NOT collide on the
      idempotency key (dispatches again, doesn't silently no-op)
- [ ] Full walk in [T-CS3-04](T-CS3-04-verification.md)

## On completion

- [ ] `pnpm typecheck` and `pnpm test` green
- [ ] Update this file's **Status** row
- [ ] Open the PR into `band/26-chat-session-and-conversation-ux`, then
      `gh pr merge <n> --auto --squash`
- [ ] Update the phase README's task table

> **Do not edit [`../MasterTaskQueue.md`](../MasterTaskQueue.md) from a task
> branch.**

## Result

<!-- Filled in when the task lands. -->
