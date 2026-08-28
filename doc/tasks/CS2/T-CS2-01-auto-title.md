# T-CS2-01 — auto-title on first message

| | |
|---|---|
| **Tag** | `[S]` — sole task in this phase |
| **Serves** | `US2` — "new sessions name themselves from what you ask" |
| **Depends on** | — |
| **Blocks** | — |
| **Phase spec** | [README.md](README.md) |
| **Status** | done (2026-08-28) |

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

- [x] New migration `packages/shared/drizzle/policies/022_chat_auto_title.sql`
      (022 was the next free number) with `private.chat_auto_title` and the
      `create or replace` of `public.enqueue_chat_turn` carrying the guarded
      title update above
- [x] Confirmed `v_session.title = ''` is the correct empty check (matches
      `chatSessions.title.notNull().default("")` in `packages/shared/src/db/schema.ts:836`)
- [x] `agent-creator` sessions: confirmed `enqueue_chat_turn` is the plain
      free/project/agent send path — `chat/service.ts`'s `runCreatorTurn`
      (the `Agent: <name>` titling) is the LOCAL SQLite path's own function,
      an entirely separate code path from this cloud RPC. No collision
- [x] Migration's own verify block added at the bottom of the file
- [x] `pnpm --filter web typecheck` and `pnpm --filter web test` green (451
      tests — no TypeScript changed by this task, SQL only)

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

- [x] Migration applied live to the real project
      (`pnymngoqseltgigcfevq`, via `apply_migration`) — this is a shared
      project, so this is genuinely live, not a local-only test
- [x] Migration verify block run live:
      `select private.chat_auto_title('short')` → `'short'`;
      `select private.chat_auto_title(repeat('word ', 20))` → 60 chars,
      ends in `…`, cut exactly at the last full word (`word word … word…`)
- [x] `get_advisors` (security) run after — no new issue introduced;
      `enqueue_chat_turn`'s pre-existing `SECURITY DEFINER`-executable-by-
      `authenticated` warning is unchanged from before this migration (it's
      the same function's existing, intentional RPC-exposure design)
- [x] Live: created a session, sent a first message, confirmed
      `chat_sessions.title` updated immediately (`agent-browser`, disposable
      account)
- [x] Live: sent a long first message on a second session, confirmed the
      title truncated at a word boundary with an ellipsis, not mid-word
- [x] Live: manually renamed a session (CS1's rename), then sent a second
      message in it, confirmed the manual title was NOT overwritten. The
      test workspace has no paired machine, so the first turn stays
      `waiting` forever and blocks a second send (`enqueue_chat_turn`'s own
      conflict guard) — worked around by administratively marking that one
      stuck turn `failed` via direct SQL (a disposable test workspace, not
      real data) so the composer would accept a second message; the guard
      itself (`if v_session.title = ''`) is exactly what was being tested,
      unaffected by that workaround
- [x] Full acceptance-scenario walk in [T-CS2-02](T-CS2-02-verification.md)

## On completion

- [x] `pnpm typecheck` and `pnpm test` green
- [x] Update this file's **Status** row
- [ ] Open the PR into `band/26-chat-session-and-conversation-ux`, then
      `gh pr merge <n> --auto --squash`
- [ ] Update the phase README's task table

> **Do not edit [`../MasterTaskQueue.md`](../MasterTaskQueue.md) from a task
> branch.**

## Result

**2026-08-28 — done.** `022_chat_auto_title.sql` ports the local chat
path's title-on-first-message logic into the cloud `enqueue_chat_turn` RPC,
trimming at a word boundary with an ellipsis rather than the local path's
hard 60-char cut. Applied live to the shared project (`pnymngoqseltgigcfevq`)
via the Supabase MCP's `apply_migration`, not just written to a file —
`get_advisors` clean afterward.

Verified live via `agent-browser` against a disposable account: a short
first message titles the session exactly; a long one truncates at a word
boundary; a manually-renamed session's title survives a second message
(worked around the test workspace having no paired machine — see the
Verification checklist for exactly what that entailed and why it doesn't
weaken what was actually being tested).

`pnpm --filter web typecheck`/`test` green (no TypeScript touched by this
task). Disposable test account cleaned up per the runbook.
