# T-AM1-03 — upload, bind, and the reply that is only files

| | |
|---|---|
| **Tag** | `[S]` sequential — edits `chat-turn.ts` after T-AM1-02, and writes the fourth definition of `ingest_chat_turn_reply` |
| **Serves** | **foundational** — unblocks AM2 (US1) |
| **Depends on** | T-AM1-01, T-AM1-02 |
| **Blocks** | T-AM1-04, and all of AM2 |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

## Objective

Get the swept files into the bucket, bind a row to the assistant message, and
make FR-004 and FR-013 true — a turn that produced files gets a reply whether
or not it wrote text, and whether or not it ultimately failed.

## Decisions already made

**The contract carries descriptors, not bytes.** `packages/shared/src/schemas/chat.ts`'s
turn-result payload gains:

```ts
produced: z.array(z.object({
  storagePath: z.string(),   // already uploaded by the time this is posted
  filename: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
})).default([]),
```

`.default([])` matters: an older daemon posting a payload without the field
must keep working, because the daemon and the web app deploy independently.

**Upload first, then post the result.** The daemon uploads each kept file via
`sign-upload` + `uploadToSignedUrl`, then posts `postResult` with the
descriptors. If an upload fails, that file becomes a refusal sentence (phase
decision 4) and the turn still completes — a storage hiccup must not lose the
agent's text.

**`028_chat_produced_files.sql` — the fourth definition, written from the live
body.** See the phase README's first trap; this is the task it applies to.

The function gains a `p_produced jsonb default '[]'::jsonb` parameter and two
changes inside:

```sql
-- 1. The message is created when the turn succeeded OR when it failed having
--    produced something (FR-013 -- partial work is not thrown away).
if p_status = 'succeeded' or jsonb_array_length(p_produced) > 0 then
  insert into public.chat_messages (...) returning id into v_message_id;

  -- 2. Bind each produced file to that message. `role` on the message is
  --    already 'assistant', which is what tells produced from attached --
  --    there is deliberately no uploader_type column (plan, Decision 2).
  insert into public.chat_message_attachments
    (id, workspace_id, message_id, storage_path, filename, mime_type, size_bytes)
  select ..., v_message_id, ...
  from jsonb_to_recordset(p_produced) as f(...);
end if;
```

The turn's own `status` and `error` are untouched by this: a failed turn stays
failed and keeps its error. The message is additional, not a re-classification.

**`chat-turn.ts`'s status condition changes to account for produced files:**

```ts
// Was: result.isError || !result.text ? "failed" : "succeeded"
// A turn that handed something back did work, even with no text (FR-004).
const producedSomething = kept.length > 0;
status: result.isError || (!result.text && !producedSomething) ? "failed" : "succeeded",
```

Note the `error` line below it must change with it — a `succeeded` turn must
not carry `"the model returned no output"`.

**Empty `content` is allowed and is not padded.** The assistant message's
`content` is exactly what the model wrote, which may be `''`. Phase decision 3
and the plan's Decision 4: no synthesised text.

## Checklist

- [ ] `produced` on the result payload in `packages/shared/src/schemas/chat.ts`,
      with `.default([])`
- [ ] `parseChatResult` in `apps/web/src/lib/daemon/chat-transcript.ts` accepts
      and validates it
- [ ] Daemon: upload each kept file, collect descriptors, convert upload
      failures into refusals
- [ ] `chat-turn.ts` status/error condition per the snippet above
- [ ] `028_chat_produced_files.sql`, **starting from `select prosrc from pg_proc
      where proname = 'ingest_chat_turn_reply'`**, not from `024`'s file
- [ ] The result route passes `p_produced` through to the RPC
- [ ] `comment on function ingest_chat_turn_reply` warning that any replacement
      must start from the current database body — matching `027`'s precedent
- [ ] Apply `028` to staging via the Supabase MCP `apply_migration`; run
      `get_advisors` and record it clean
- [ ] Tests: files-only turn is `succeeded` with empty content and one
      attachment; failed-with-files creates a message and keeps `failed`;
      failed-without-files creates no message (unchanged); an old payload with
      no `produced` field still parses
- [ ] `pnpm typecheck` and `pnpm test` green across `shared`, `core`, `web`

## Traps

**Copying `024`'s function body.** The phase README's first trap, and the one
that already cost this repo a shipped feature once —
[`BUG-2026-08-28-enqueue-chat-turn-redefinition-drops-auto-title`](../../bug/BUG-2026-08-28-enqueue-chat-turn-redefinition-drops-auto-title.md).
`create or replace function` reverts silently: no error, no advisor, and the
task that does it verifies its own feature honestly and passes. Dump the live
body first. There is no shortcut here that is not this bug again.

**`jsonb_array_length` throws on a non-array.** `p_produced` defaulting to
`'[]'::jsonb` is what keeps an old daemon's omitted field from erroring the
whole ingest — but a daemon sending `null` explicitly would still throw. Use
`coalesce(p_produced, '[]'::jsonb)`.

**A `failed` turn now creates a message, and something downstream renders every
message.** Check what the transcript does with an assistant message whose turn
failed before assuming this is invisible — FR-013 wants the file *and* the
failure both visible, which is a rendering question AM2 inherits. Note it in
this task's Result for AM2 to pick up rather than solving it here.

**Uploading before the message exists means an orphan on failure.** If
`postResult` never lands (its own header calls this loss "real"), the objects
are in the bucket with no row pointing at them. That is the same exposure
`G-53` already records for CS5's session deletes — do not invent a reaper here;
add the case to `G-53`'s entry so one gap covers both.

## Verification

- [ ] `pnpm test` green, all four ingest cases above
- [ ] Against staging: dispatch a real turn that writes a PNG into the outbox;
      confirm the object exists at a two-segment path and
      `select * from chat_message_attachments` shows a row bound to an
      `assistant` message
- [ ] `get_advisors` clean after `028`
- [ ] The full owner-visible path is **not** proved here — nothing renders yet.
      T-AM1-04 grades this phase; AM2 makes it visible

## On completion

- [ ] `pnpm typecheck` and `pnpm test` green
- [ ] Update this file's **Status** row
- [ ] Add the orphan-object case to `G-53` in
      [`../../KnownGaps.md`](../../KnownGaps.md)
- [ ] Open the PR into `band/27-seeing-what-my-agent-made`, then
      `gh pr merge <n> --auto --squash`

> **Do not edit [`../MasterTaskQueue.md`](../MasterTaskQueue.md) from a task
> branch.**

## Result

<!-- Filled in when the task lands. -->
