# T-AM1-03 — upload, bind, and the reply that is only files

| | |
|---|---|
| **Tag** | `[S]` sequential — edits `chat-turn.ts` after T-AM1-02, and writes the second definition of `ingest_chat_turn_reply` (corrected 2026-08-29 — see the phase README's finding 6 correction; it is not the three-times-clobbered function `enqueue_chat_turn` is) |
| **Serves** | **foundational** — unblocks AM2 (US1) |
| **Depends on** | T-AM1-01, T-AM1-02 |
| **Blocks** | T-AM1-04, and all of AM2 |
| **Phase spec** | [README.md](README.md) |
| **Status** | ✅ done except a live-daemon check → `G-55` (2026-08-29) |

## Objective

Get the swept files into the bucket, bind a row to the assistant message, and
make FR-004 and FR-013 true — a turn that produced files gets a reply whether
or not it wrote text, and whether or not it ultimately failed.

## Decisions already made

**The contract carries descriptors, not bytes.** Correcting this task's own
earlier draft: `ChatTurnResultPayload` is a plain TypeScript interface in
`packages/shared/src/cloud.ts` (line ~808), not a zod schema in
`schemas/chat.ts` — that file holds the *local SQLite* session model
(`free`/`project`/`agent`/`agent-creator` kinds), a different, older system.
Validation of the wire body happens by hand in
`apps/web/src/lib/daemon/chat-transcript.ts`'s `parseChatResult`, not through
zod at all. Both places need the new field:

```ts
// packages/shared/src/cloud.ts, ChatTurnResultPayload
export interface ChatTurnResultPayload {
  seq: number;
  replyText: string;
  status: "succeeded" | "failed";
  error?: string | null;
  /** AM1 (T-AM1-03). Already uploaded by the time this is posted -- see
   *  chat-turn.ts's upload step. Optional, not `.default([])`'d (this is a
   *  plain interface, not zod): an older daemon's payload simply omits the
   *  field, and `parseChatResult` treats a missing key as `[]`. */
  produced?: Array<{ storagePath: string; filename: string; mimeType: string; sizeBytes: number }>;
}
```

`parseChatResult` gains hand-rolled validation for `produced`, following the
exact style already used there for `events`/`replyText` — reject the whole
batch on a malformed entry (same DD-8 "strict whole-batch parse" discipline
the file's own header cites), default to `[]` when the key is absent entirely.

**Upload first, then post the result.** The daemon uploads each kept file via
`sign-upload` + `uploadToSignedUrl`, then posts `postResult` with the
descriptors. If an upload fails, that file becomes a refusal sentence (phase
decision 4) and the turn still completes — a storage hiccup must not lose the
agent's text.

**`029_chat_produced_files.sql` — the second definition (`014` is the only
prior one), written from the live body anyway, on principle.** See the phase
README's trap; this is the task it applies to. `029` because staging already
has an *applied but unmerged* `028` from an unrelated branch — see the phase
README's finding 6 correction.

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

- [x] `produced` on `ChatTurnResultPayload` in `packages/shared/src/cloud.ts`
      (optional field, not zod — see Decisions correction)
- [x] `parseChatResult` in `apps/web/src/lib/daemon/chat-transcript.ts` accepts
      and validates it, defaulting to `[]` when absent
- [x] Daemon: upload each kept file, collect descriptors, convert upload
      failures into refusals
- [x] `chat-turn.ts` status/error condition per the snippet above
- [x] `029_chat_produced_files.sql`, **starting from `select prosrc from pg_proc
      where proname = 'ingest_chat_turn_reply'`**, not from `014`'s file
- [x] The result route passes `p_produced` through to the RPC
- [x] `comment on function ingest_chat_turn_reply` warning that any replacement
      must start from the current database body — matching `027`'s precedent
      on its neighbour
- [x] Apply `029` to staging via the Supabase MCP `apply_migration`; run
      `get_advisors` and record it clean
- [x] Tests, at the daemon/TypeScript layer (see Result for what could and
      could not be proven at the SQL layer without a live daemon): files-only
      turn is `succeeded` with `produced` populated and `error: null`
      (FR-004); a turn that errors after producing still reports the file in
      `produced` alongside `status: failed` (FR-013); a turn with neither text
      nor a produced file is still `failed` (unchanged pre-existing
      behavior); an old payload with no `produced` field still parses to `[]`
- [x] `pnpm typecheck` and `pnpm test` green across `shared`, `core`, `web`

## Traps

**Copying `014`'s function body instead of the live one, on the assumption
nothing has drifted.** `ingest_chat_turn_reply` itself has no clobber history
(corrected in the phase README's finding 6 — it is not the three-times-hit
function), but the adjacent `enqueue_chat_turn` already cost this repo a
shipped feature exactly this way —
[`BUG-2026-08-28-enqueue-chat-turn-redefinition-drops-auto-title`](../../bug/BUG-2026-08-28-enqueue-chat-turn-redefinition-drops-auto-title.md).
`create or replace function` reverts silently: no error, no advisor, and the
task that does it verifies its own feature honestly and passes. Dump the live
body first regardless of which function it is — that is the actual habit
worth keeping, not "this specific function is dangerous."

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

- [x] `pnpm test` green, all ingest cases above (at the daemon/route layer)
- [ ] Against staging: dispatch a real turn that writes a PNG into the outbox;
      confirm the object exists at a two-segment path and
      `select * from chat_message_attachments` shows a row bound to an
      `assistant` message — **not reachable in this environment: no paired
      daemon**, same limitation `G-55` already records. Fabricating the
      required workspace/session/turn rows directly against shared staging
      (with a real `auth.users` foreign key on `workspaces.owner_id`) was
      judged riskier than the check was worth; see Result and `G-55`'s
      extension
- [x] `get_advisors` clean after `029` — confirmed, no new advisory; grants
      verified `f, f` (service-role only), signature verified single-row,
      `pronargs = 7`
- [x] The full owner-visible path is **not** proved here — nothing renders yet.
      T-AM1-04 grades this phase; AM2 makes it visible

## On completion

- [x] `pnpm typecheck` and `pnpm test` green
- [x] Update this file's **Status** row
- [x] Add the orphan-object case to `G-53` in
      [`../../KnownGaps.md`](../../KnownGaps.md)
- [ ] Open the PR into `band/27-seeing-what-my-agent-made`, then
      `gh pr merge <n> --auto --squash`

> **Do not edit [`../MasterTaskQueue.md`](../MasterTaskQueue.md) from a task
> branch.**

## Result

**Two corrections made before writing any code, both worth keeping visible
rather than silently fixed** — full detail in the phase README's finding 6
and the Decisions section above:

1. `ingest_chat_turn_reply` has no clobber history; the three-times-hit
   function is the adjacent `enqueue_chat_turn`. This is the function's
   *second* definition, not a fourth.
2. Staging already had an **applied but unmerged** migration numbered `028`
   (from an unrelated branch, no PR, touching prod too per its own commit
   message) — this migration is `029` instead.

**The contract.** `ChatTurnResultPayload` gained an optional `produced?:
ChatTurnProducedFile[]` in `packages/shared/src/cloud.ts` — this is a plain
interface, not a zod schema; the task's own draft named the wrong file
(`schemas/chat.ts`, which is the unrelated local-SQLite session model) and
that's corrected in the Decisions section too. `parseChatResult` validates
each entry by hand, matching the file's existing `parseChatEventBatch`
discipline (reject the whole body on one bad entry, cap the count at
`MAX_CHAT_PRODUCED_PER_REQUEST`).

**The daemon.** `chat-turn.ts` gained `uploadKeptFiles`: for each swept
outbox file, mint a signed upload URL (`sign-upload`, from `T-AM1-01`),
`PUT` the bytes with a `content-type` header, and collect descriptors. An
upload failure becomes a refusal sentence via the same `refusalNote`
treatment a sweep-time refusal already gets — a storage hiccup does not lose
the turn's text. The status condition changed exactly as planned:
`result.isError || (!result.text && !producedSomething)`, and the paired
`error` line no longer claims "the model returned no output" for a turn that
in fact produced something.

**The migration.** `029_chat_produced_files.sql` adds `p_produced jsonb
default '[]'::jsonb`, dropping the old 6-arg signature first (the exact fix
`026`'s header prescribes for this situation, applied here even though this
function had no live drift to worry about) so PostgREST never sees two
overloads. The message-creation guard widened from `p_status = 'succeeded'`
to `p_status = 'succeeded' or jsonb_array_length(coalesce(p_produced,
'[]'::jsonb)) > 0`, and each produced file is bound via the same
`jsonb_array_elements` + explicit `::integer` cast pattern `026` already
established for inbound attachments. Applied to staging
(`pnymngoqseltgigcfevq`) via the Supabase MCP `apply_migration`. Verified
directly, not assumed:
- `select proname, pronargs from pg_proc where proname =
  'ingest_chat_turn_reply'` → exactly one row, `pronargs = 7` — the old
  6-arg overload is genuinely gone, not left alongside the new one
- `has_function_privilege` for `anon`/`authenticated` → `f, f` — still
  service-role only, matching `014`'s original lockdown
- `get_advisors(type: security)` → no new finding; the pre-existing WARN
  entries are unrelated RPCs this task didn't touch

**What could not be proven, and why the honest answer is "didn't try" rather
than "couldn't test it".** The task's own Verification asks for dispatching a
real turn against staging. This environment has no paired daemon — same
limitation as `G-55`. I considered proving the SQL function's behavior
directly instead, by inserting synthetic `workspaces`/`chat_sessions`/
`chat_turns` rows in a reversible transaction and calling the function by
hand. `workspaces.owner_id` is a NOT NULL foreign key into `auth.users`, and
fabricating an auth user on **shared staging** (not a disposable sandbox) to
exercise one function call was judged more risk than the check was worth —
unlike a disposable test *account* (the established pattern elsewhere in
this repo, e.g. `cs6verify-*@sparstrow.test`), a fabricated row inside
`auth.users` itself is a different order of intrusion. Extended `G-55`
rather than opening a new gap, since it's the same root cause (no daemon)
wearing a different hat.

**What this leaves for AM2 to know about, not solve.** A `failed` turn now
creates a `chat_messages` row (FR-013), which nothing downstream has ever
had to render before — the phase README's own trap. Whatever currently shows
a `failed` turn's error will now also see an attachment-bearing message sit
alongside it; AM2's rendering work should check this explicitly rather than
assume it inherited a blank slate.

**Tests.** 31/31 in `chat-turn.test.ts` (6 new: upload+bind happy path, the
two-segment storage path assertion, an upload failure becoming a refusal,
FR-004's status fix, FR-013's error-with-produced-files case, and the
unchanged no-text-no-files-still-failed case). Verified the FR-004 test is
load-bearing the same way `T-AM1-01` verified its own path-shape test:
reverted the status-condition fix, watched exactly that test go red, restored
it. 8 new tests in `chat-transcript.test.ts` for `produced` validation. 5 new
tests in a from-scratch `route.test.ts` for the result route — this route had
**zero** prior test coverage of any kind; the camelCase→snake_case mapping to
`p_produced` is exactly the kind of thing that fails silently if reversed,
so it gets its own regression test now.

`pnpm --filter @sparstrow/shared test`: 334/334. `pnpm --filter @sparstrow/core
test`: 776/780 (4 pre-existing skips, unrelated). `pnpm --filter web test`:
498/498. All three packages' `typecheck` clean.
