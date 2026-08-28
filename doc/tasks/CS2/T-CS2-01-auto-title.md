# T-CS2-01 — auto-title on first message

| | |
|---|---|
| **Tag** | `[S]` — sole task in this phase |
| **Serves** | `US2` — "new sessions name themselves from what you ask" |
| **Depends on** | — |
| **Blocks** | — |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

## The scenario this satisfies

1. **Given** a brand-new session still titled "New conversation", **When**
   the owner sends their first message, **Then** the title updates to
   reflect that message shortly after.
2. **Given** a session already renamed by hand, **When** more messages are
   sent, **Then** the manual title is never overwritten.
3. **Given** the first message is very long or topic-less, **When** the
   title is generated, **Then** it stays short and readable.

## Objective

Add title-on-first-message to `public.enqueue_chat_turn`
(`packages/shared/drizzle/policies/014_chat_turn_dispatch.sql:439`), the
function the browser's `/chat` actually calls, mirroring
`packages/core/src/chat/service.ts`'s already-proven local logic but
truncating at a word boundary (phase decision 1) instead of a hard cut.

## Decisions already made

Exact insertion point — after the `last_message_at` update, before
`assign_or_park_chat_turn` is invoked, guarded on the session's title being
the column's own default empty string:

```sql
  update public.chat_sessions set last_message_at = pg_catalog.now() where id = v_session.id;

  if v_session.title = '' then
    update public.chat_sessions
    set title = private.chat_auto_title(p_content)
    where id = v_session.id;
  end if;

  perform private.assign_or_park_chat_turn(v_turn_id);
```

New helper function, in the same migration file, so the truncation logic is
unit-testable in isolation and not duplicated if a second call site ever
needs it:

```sql
create or replace function private.chat_auto_title(p_content text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_max constant int := 60;
  v_trimmed text := trim(p_content);
  v_cut text;
  v_last_space int;
begin
  if length(v_trimmed) <= v_max then
    return v_trimmed;
  end if;
  v_cut := substr(v_trimmed, 1, v_max);
  v_last_space := length(v_cut) - position(' ' in reverse(v_cut)) + 1;
  if v_last_space > 1 then
    v_cut := substr(v_cut, 1, v_last_space - 1);
  end if;
  return v_cut || '…';
end;
$$;
```

## Checklist

- [ ] New migration file `packages/shared/drizzle/policies/0NN_chat_auto_title.sql`
      (next free number after the highest existing `0NN_*.sql` — check before
      naming it) with `private.chat_auto_title` and the `create or replace`
      of `public.enqueue_chat_turn` carrying the guarded title update above
- [ ] Confirm `v_session.title = ''` is the correct empty check (matches the
      column default in `packages/shared/src/db/schema.ts:836` — re-confirm
      against the live schema, not just this note, before shipping)
- [ ] `agent-creator` sessions are excluded from this path already (they use
      a different title-setting flow — `chat/service.ts`'s
      `runCreatorTurn`, `title: Agent: ${turn.draft.name}`) — confirm
      `enqueue_chat_turn` is not the function `agent-creator` sessions call,
      or if it is, that this guard doesn't fight that path
- [ ] Migration's own verify block (see Verification) added at the bottom of
      the file, per this repo's SQL migration convention (every other file
      in `policies/` ends with one)
- [ ] `pnpm typecheck` and `pnpm test` green

## Traps

- **Don't duplicate the 60-char/word-boundary logic in TypeScript too.**
  This is a cloud-only, Postgres-only path — the local `postChatTurn` stays
  exactly as it is (a different, already-working implementation for a
  different chat surface). Touching `packages/core/src/chat/service.ts` in
  this task is out of scope and risks regressing the local/Electron chat
  path for no benefit.
- **`security definer` + `set search_path = ''`** is load-bearing on this
  function (matches every other function in this file) — a new helper
  function must carry the same `set search_path = ''` or it becomes a
  privilege-escalation surface, per the `supabase-postgres-best-practices`
  skill.
- **`reverse()` in Postgres works on text, not bytea** — confirm the exact
  built-in name/behavior against the target Postgres version before
  shipping; the snippet above is the intent, not a copy-paste guarantee.

## Verification

- [ ] Migration verify block:
      ```sql
      select private.chat_auto_title('short'); -- expect 'short'
      select private.chat_auto_title(repeat('word ', 20)); -- expect ≤61 chars, ends in '…', no mid-word cut
      ```
- [ ] Live: create a session, send a first message, confirm `chat_sessions.title`
      updates within the same request (no extra poll needed — it's
      synchronous inside `enqueue_chat_turn`)
- [ ] Live: rename a session (CS1), then send a message in it; confirm the
      manual title is unchanged
- [ ] Full acceptance-scenario walk in [T-CS2-02](T-CS2-02-verification.md)

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
