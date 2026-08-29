# AM1 — the machinery for handing a file back

| | |
|---|---|
| **Plan** | [`../../plans/2026-08-28-seeing-what-my-agent-made.md`](../../plans/2026-08-28-seeing-what-my-agent-made.md) (AM1) |
| **Kind** | **foundational** — blocks AM2/AM3/AM4, demos to nobody |
| **Spec** | [`../../specs/2026-08-28-seeing-what-my-agent-made.md`](../../specs/2026-08-28-seeing-what-my-agent-made.md) |
| **Depends on** | CS5/CS6 (band 26) — **landed on `development` 2026-08-29** via [#174](https://github.com/sparstrow/sparstrowGen/pull/174) |
| **Blocks** | AM2, AM3, AM4 |
| **Status** | not started |
| **Open questions** | none |

## Tasks

Run order and concurrency live in [`../MasterTaskQueue.md`](../MasterTaskQueue.md).

| Task | Tag | Serves | Depends on | Status |
|---|---|---|---|---|
| [T-AM1-01 — the produced-file contract](T-AM1-01-produced-contract.md) | `[S]` | foundational → AM2 | — | ✅ done 2026-08-29 |
| [T-AM1-02 — the outbox a turn hands files back through](T-AM1-02-outbox.md) | `[S]` | foundational → AM2 | T-AM1-01 | ✅ done except `G-55` (2026-08-29) |
| [T-AM1-03 — upload, bind, and the reply that is only files](T-AM1-03-bind-and-reply.md) | `[S]` | foundational → AM2 | T-AM1-02 | not started |
| [T-AM1-04 — verification](T-AM1-04-verification.md) | `[S]` | foundational | T-AM1-01–03 | not started |

Every task is `[S]`. This phase is a pipeline in the strict sense: 01 defines
the constants and the storage path that 02's sweep produces and 03's upload
consumes. There is no honest `[P]` in it, for the same reason CS5 had none.

## Objective

Give a chat turn a way to hand a file back, keep what comes back, and attach it
to the reply — so that AM2 has something to render. Nothing in this phase is
visible to the owner.

## The shape of what was found

Six things established by reading the shipped code that change the work from
what the plan assumed. The code wins in each case.

### 1. A chat turn has no MCP tools at all, and the plan's Decision 2 assumed it did

The plan says agents "already have an app-facing tool surface described in
`orchestrator/preamble.ts` (`mcp__sparstrow-memory__*` …), so this is an
addition to an established channel rather than a new one."

That is true of **runs** and false of **chat turns**.
[`one-shot.ts:72`](../../../packages/core/src/orchestrator/one-shot.ts) passes
`runId: ""` with the comment *"no run context → provider skips memory-MCP +
run-scoped tools"*, and
[`claude-code.ts:45`](../../../packages/core/src/providers/claude-code.ts)
wires the MCP server only `if (runId)`. `executeChatTurn` calls `completeOnce`,
so **a chat turn today gets zero MCP tools**.

The `antigravity` provider is worse: it has no MCP wiring of any kind — its
only run-context handoff is a `SPARSTROW_RUN_ID` environment variable.

An MCP hand-back tool would therefore mean (a) inventing a run-scoped identity
for chat turns, (b) standing up the `/mcp` server on a path that has never used
it, and (c) still not working for `antigravity` at all. See decision 1 below
for what replaced it.

### 2. `chat_message_attachments` needs no change whatsoever

The plan's work breakdown says "Extend CS5's `chat_message_attachments` and
bucket path convention to carry agent-produced files." Reading
[`schema.ts:889`](../../../packages/shared/src/db/schema.ts) — the shipped
table already carries `messageId`, `storagePath`, `filename`, `mimeType`,
`sizeBytes`, `workspaceId` and both indexes. A produced file needs exactly
those columns and nothing else.

The plan's own insight is what makes this work: provenance comes from the bound
message's `role`, not from a column. That was written as "we don't need
`uploader_type`"; the stronger form is that **AM1 adds no columns at all.**

### 3. …but the storage policy caps the path at exactly two segments

[`025_chat_attachments_storage.sql:72`](../../../packages/shared/drizzle/policies/025_chat_attachments_storage.sql)
requires `array_length(storage.foldername(name), 1) = 2` on both SELECT and
INSERT. A `<workspace_id>/<session_id>/produced/chart.png` path is **three**
segments and would be denied to the very member who owns it — silently, as an
empty image rather than an error.

So the plan's "bucket path convention" extension inverts: produced files stay
at the same two-segment depth, and nothing about storage RLS changes. See
decision 2.

### 4. An empty reply is not "not recorded" — it is recorded as **failed**

The plan's Decision 4 says `chat-turn.ts` "currently treats empty `replyText`
as nothing to record". [`chat-turn.ts:339`](../../../packages/core/src/cloud/chat-turn.ts)
is sharper than that:

```ts
status: result.isError || !result.text ? "failed" : "succeeded",
error: result.isError ? (result.errorMessage ?? "the model returned no output") : null,
```

A turn with no text is marked **failed**. So FR-004 is not "also insert a row"
— it is "stop calling this a failure when the turn handed something back."

### 5. The assistant message is inserted by a SQL function, in one place, only on success

`ingest_chat_turn_reply` is *"the ONLY place that ever happens"*
([result route header](../../../apps/web/src/app/api/daemon/chat/turns/[id]/result/route.ts)),
and `chat_messages`' own insert policy is restricted to `role = 'user'`
([025's header](../../../packages/shared/drizzle/policies/025_chat_attachments_storage.sql)),
so no other caller can create an assistant row.

That makes FR-004 **a migration**, not a TypeScript change — and it drags
FR-013 in with it: a `failed` turn creates no message, so there is nothing for
a partially-produced file to hang off. Decision 3 settles that.

### 6. `ingest_chat_turn_reply` has the exact clobber hazard that just cost band 26 a feature

It is defined **three times** — `014_chat_turn_dispatch.sql`,
`016_chat_turn_transcript.sql`, `024_provider_model_dispatch.sql`. This is the
same pattern that silently reverted US2's auto-titling on band 26
([`BUG-2026-08-28-enqueue-chat-turn-redefinition-drops-auto-title`](../../bug/BUG-2026-08-28-enqueue-chat-turn-redefinition-drops-auto-title.md)):
a later migration copied an older migration's body and dropped a block, with no
error and no advisor. See the trap below — this phase writes a fourth
definition and is therefore directly exposed.

## Definition of done

- An agent running a chat turn can hand a file back, and the daemon has it
- That file is stored under the conversation's existing two-segment prefix and
  an attachment row binds it to the assistant message for that turn
- A turn that hands back a file and writes no text is recorded `succeeded`,
  with an assistant message that carries the file and no invented text
- A turn that fails *after* producing a file still yields a message the file is
  attached to (FR-013)
- A file over `CHAT_PRODUCED_MAX_BYTES` is refused and the owner is told in the
  reply, never dropped silently (FR-011)
- **In a `project` chat, nothing the agent writes inside the project folder is
  uploaded or recorded** (FR-016) — proved, not assumed
- `pnpm typecheck` and `pnpm test` stay green
- **AM2 is unblocked**: a produced image exists in the database and in the
  bucket, ready for something to render it

**Not in this phase:** any rendering at all. No `img` override, no strip, no
panel — those are AM2 and AM3. A reviewer who cannot see anything in the app
after this phase is looking at a correct outcome.

---

## Decisions already made

### 1. The hand-back is a per-turn outbox directory, not an MCP tool

The agent is given one directory it does not otherwise use, told about it in
the prompt, and anything it leaves there is what it handed back. The daemon
sweeps that directory when the turn ends.

This keeps the plan's Decision 2 intact — the hand-back is still **a positive
act by the agent**, and nothing watches a project or working directory — while
surviving finding 1. It works identically for `claude-code` and `antigravity`,
because writing a file is the one capability every CLI agent has.

*Rejected: an MCP tool.* Finding 1 — it does not exist on this code path, and
building it would still leave `antigravity` unable to hand anything back.
Reconsider if and when chat turns gain a run-scoped MCP surface for other
reasons; the outbox is not in the way of that.

*Rejected: watching the working directory* — the plan already rejected this and
it is still right. FR-016 is the reason: in a `project` chat the working
directory **is** the owner's repository
([`chat-turn.ts:305`](../../../packages/core/src/cloud/chat-turn.ts) sets
`placeInProjectRoot` and leaves `agent.cwd` alone), so every edit would look
like a produced artifact.

The distinction that makes the outbox safe and a watcher unsafe: the outbox is
**never** the project folder, under any session kind.

### 2. Produced files keep the two-segment path; provenance lives in the row

`<workspace_id>/<session_id>/<opaque-id>-<filename>`, exactly as CS5's
attachments do. Finding 3 is the hard constraint; decision 2 of the plan
("`role` already records who produced the file") is why nothing is lost by it.

*Rejected: a `produced/` path segment.* Denied by
`025_chat_attachments_storage.sql`'s two-segment check, and the failure mode is
the worst kind — a member's own file 404s for them with no error anywhere.

*Rejected: relaxing the policy to allow three segments.* It buys legibility in
a storage browser nobody uses and widens a policy that is currently exact. If a
future feature genuinely needs sub-prefixes, that is its migration to justify.

### 3. A failed turn that produced files still gets a message

`ingest_chat_turn_reply` gains: create the assistant message when the turn
`succeeded` **or** when it failed with `p_produced_count > 0`. The message
carries whatever text the agent actually wrote — which may be empty — and the
turn keeps its `failed` status and its error.

This is what FR-013 requires and it is the only way to satisfy it, per finding
5. The alternative is to drop partial work on the floor, which the spec
explicitly forbids ("partial work is not thrown away").

*Rejected: synthesising placeholder text.* Inherited from the plan's Decision 4
and unchanged — putting words in the agent's mouth is what SC-002 exists to
prevent. An empty `content` with attachments is honest; "Here is your file!" is
not.

### 4. The size refusal is told to the owner in the reply text, appended by the daemon

A file over the limit is not uploaded and its name and size are appended to the
reply as a plain sentence before `postResult` is called. FR-011 requires the
owner be told; the reply is the only surface AM1 can reach, since AM1 ships no
UI.

*Rejected: a dedicated `refusals` field on the result payload.* It would need a
column, a contract change, and a renderer that does not exist until AM2 — for
information that is one sentence long. Revisit if refusals turn out to be
common enough to deserve their own treatment.

---

## Files

| Path | Change |
|---|---|
| `packages/shared/src/constants.ts` | edit — `CHAT_PRODUCED_MAX_BYTES`, `CHAT_PRODUCED_ALLOWED_TYPES`, `producedStoragePath()` |
| `packages/shared/src/schemas/chat.ts` | edit — the turn result payload carries produced-file descriptors |
| `apps/web/src/app/api/daemon/chat/attachments/sign-upload/route.ts` | new — mints a signed **upload** URL for the daemon |
| `apps/web/src/app/api/daemon/chat/turns/[id]/result/route.ts` | edit — passes produced files to the RPC |
| `packages/shared/drizzle/policies/028_chat_produced_files.sql` | new — `ingest_chat_turn_reply`, fourth definition |
| `packages/core/src/cloud/chat-turn.ts` | edit — outbox lifecycle, sweep, upload, the `!result.text` status condition |
| `packages/core/src/orchestrator/preamble.ts` | edit — the sentence telling an agent the outbox exists |

## Traps

**`ingest_chat_turn_reply` must be written from the CURRENT DATABASE BODY, not
from `024`'s file.** Finding 6. Band 26 lost a shipped feature to exactly this
last week, and both tasks involved verified their own work honestly — the
regression was invisible from either side. Before writing `028`, dump the live
definition (`select prosrc from pg_proc where proname =
'ingest_chat_turn_reply'`) and start from that text. `027_restore_chat_auto_title.sql`'s
`comment on function` says the same thing for its neighbour; this is the same
hazard on the adjacent function.

**The outbox must not be the agent's `cwd` in a `project` session.** FR-016 is
the load-bearing requirement of this whole spec, and
[`chat-turn.ts:305`](../../../packages/core/src/cloud/chat-turn.ts) already
places attachments *inside the project root* for that session kind. Reusing
that directory for the outbox would upload the owner's repository one file at a
time. The outbox is always its own directory outside any project root.

**An attachment already clamps the agent to `allowedTools: ["Read"]`.**
[`chat-turn.ts:323`](../../../packages/core/src/cloud/chat-turn.ts) — when the
owner attaches a file to a non-project chat, the agent is restricted to `Read`
in a scratch dir. An agent so clamped **cannot write to the outbox**, so "send
a picture and ask for one back" silently produces nothing. The clamp must grow
a `Write` grant scoped to the outbox path, and this interaction needs a test —
it is invisible in every single-feature manual check.

**A signed URL is not a durable URL.** CS5's browser-side reads mint 300-second
signed URLs (`chat-bits.tsx:42`). Anything AM2 renders as `<img src>` inherits
that expiry. Not AM1's problem to solve, but AM1 must not store a signed URL in
`storagePath` — only the durable object path, exactly as CS5 does.

**`seq` still must advance across the terminal call.** Unchanged from M12 and
still the way to leave a turn stuck `in_progress` forever. If the upload step
is inserted before `postResult`, it must not reset or reuse the counter.

## Verification

Full procedure in [T-AM1-04 — verification](T-AM1-04-verification.md).

1. A produced file arrives in the bucket at a two-segment path and a row binds
   it to the assistant message
2. A files-only turn is `succeeded`, not `failed`, and its message has empty
   `content` and at least one attachment
3. A turn that fails after producing still yields a message carrying the file
4. An over-limit file is refused, named in the reply, and absent from storage
5. A `project` chat's file edits produce **no** rows and **no** objects
6. `get_advisors` clean after `028`
