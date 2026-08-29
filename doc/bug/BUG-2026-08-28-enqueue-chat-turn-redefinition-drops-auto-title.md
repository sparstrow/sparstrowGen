# BUG-2026-08-28-enqueue-chat-turn-redefinition-drops-auto-title

**Status:** 🟢 resolved
**Reported by:** agent — found by `T-CS6-02`'s cross-story regression pass, which
re-walks CS1/CS2/CS4 acceptance scenarios after CS6
**Reported:** 2026-08-28

## Symptom

Every chat session created on `band/26-chat-session-and-conversation-ux`
stayed titled "New conversation" — the exact complaint US2 was written to fix,
and which `T-CS2-01` had already shipped and verified as working.

Confirmed against the live staging database, not just the UI:
`chat_sessions.title` was `''` for every session created during this pass.

## Reproduction

1. Create a chat session and send a first message.
2. Read the row: `select title from chat_sessions where id = …` → `''`.

The UI renders `''` as "New conversation", so it looks like nothing happened
rather than like a failure.

## Investigation

`private.chat_auto_title` **existed** in the database. The live
`public.enqueue_chat_turn` body contained no occurrence of the string `title`
at all — so the helper was there and nothing called it.

`public.enqueue_chat_turn` is defined and re-defined by five migrations:

| Migration | What it did to this function |
|---|---|
| `014_chat_turn_dispatch.sql` | created it |
| `016_chat_turn_transcript.sql` | re-created it |
| `022_chat_auto_title.sql` | re-created it **+ added the auto-title block** (US2 works) |
| `024_provider_model_dispatch.sql` | re-created it from an older body — **title block gone** |
| `026_chat_attachments_dispatch.sql` | re-created it from 024's body — still gone |

Each later migration was written by copying an **earlier migration file's**
version of the body and adding to it, rather than starting from the version
actually in the database. `create or replace function` is completely silent
about this: nothing errored, no advisor fired, and both 024 and 026 verified
their own feature and passed honestly.

Grep confirms it mechanically — `024` and `026` contain zero occurrences of
`title`, while `022` is entirely about it.

## Impact

US2 — a whole owner-approved user story, and one of the four this band exists
to deliver — was **non-functional on the band branch** and would have shipped
that way. `T-CS2-01` and `T-CS2-02` were not wrong when they passed; the
feature was silently reverted afterwards by two later tasks in the same band.

The wider lesson is the dangerous part: **any `create or replace function`
in this repo can silently revert an earlier migration's feature**, and no
test, advisor, or typecheck will notice. Only re-walking an earlier story's
acceptance scenario catches it — which is precisely why a band's final
verification task re-walks its predecessors.

## Resolution

`packages/shared/drizzle/policies/027_restore_chat_auto_title.sql` re-creates
026's function verbatim — same 3-arg signature, same attachment insert — with
022's title block restored in its original position, after `last_message_at`
is touched and before dispatch. Signature is unchanged, so no `drop function`
was needed.

Applied to the staging project (`pnymngoqseltgigcfevq`) via the Supabase MCP
`apply_migration`, the same path 022/024/026 used. **The project was verified
to be staging and not the newly-existing `sparstrowgen-prod` before applying.**

Verified after applying:

- `pg_proc` shows the live body now contains **both** `chat_auto_title` and
  `chat_message_attachments`, still `security definer` with
  `search_path=""`, and exactly one overload (`text, text, jsonb`).
- Live: a new session's first message titled it
  *"Summarise the Ardennes field notes and give the ferret…"* — truncated at
  a word boundary with an ellipsis, exactly as 022 designed.
- Live: renaming that session to "Renamed by CS6 verification" and then
  sending another message did **not** overwrite the manual title — the
  `if v_session.title = ''` guard, which is the half most easily lost.
- Live: the same session's attachment row was still written with a correctly
  workspace/session-scoped `storage_path`, so restoring the title block did
  not disturb CS5's insert.

The function's `comment on function` now carries an explicit warning that
anything replacing it must start from the **current database body**, not from
an older migration file. That comment is visible to anyone inspecting the
function before editing it, which the migration files themselves are not.
