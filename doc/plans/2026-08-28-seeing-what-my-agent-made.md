# Seeing what my agent made — 2026-08-28

| | |
|---|---|
| **Spec** | [`doc/specs/2026-08-28-seeing-what-my-agent-made.md`](../specs/2026-08-28-seeing-what-my-agent-made.md) — ✅ Owner-reviewed 2026-08-28, accepted |
| **Status** | Draft |
| **Trigger** | Owner, 2026-08-28: an agent replied *"I've generated a picture of a man for you!"* and the screen stayed empty |
| **Depends on** | **CS5 — already built**, and merged onto `band/26-chat-session-and-conversation-ux` (PRs #164–#167), not yet on `development`. Its bucket and attachments table are what this extends rather than duplicates. See Decision 1 and Sequencing |
| **Touches** | `packages/shared/src/db/schema.ts`, `packages/shared/src/constants.ts`, `packages/shared/src/schemas/chat.ts`, `packages/shared/drizzle/`, `packages/core/src/cloud/chat-turn.ts`, `packages/core/src/orchestrator/preamble.ts`, `packages/core/src/providers/`, `apps/web/src/components/chat/`, `apps/web/src/app/chat/chat.tsx` |
| **Tasks** | not decomposed yet — blocked, see Sequencing |
| **Open questions** | none blocking. The spec's two `[NEEDS CLARIFICATION]` limits are answered as Decisions 5 and 6 |

## Summary

Give agents a way to hand a file back during a chat turn, keep what they hand
back, and show it — in the reply that produced it and in a per-session list.
Nothing here invents a storage layer: CS5 is already building the private
bucket, the attachments table and the workspace-scoped policies for the
owner's *inbound* attachments, and this is the same road travelled in the
opposite direction.

## What the spec asks for that isn't obvious

**The role of the bound message already records who produced the file.** The
comparable system carries an explicit `uploader_type IN ('member','agent')`
column. We do not need one: CS5's `chat_message_attachments.message_id` points
at a `chat_messages` row whose `role` is already `user` or `assistant`. The
owner's attachments hang off user messages, an agent's off assistant messages.
One join answers "who made this", and the spec's US3 requirement to tell them
apart falls out for free. Adding a column would give us two sources of truth
that can disagree.

**"Produced" is defined by absence of another home, not by file type.** FR-016
is the load-bearing requirement, not a footnote: anything the agent writes
inside a bound project folder is out of scope and must never be copied. The
implementation therefore needs a positive act by the agent ("hand this back")
rather than any form of directory watching — a watcher pointed at a project
would violate FR-016 by construction. See Decision 2.

**The reply must be created by files alone.** FR-004 changes a control-flow
assumption in `cloud/chat-turn.ts`: today a turn with empty `replyText` is a
degenerate case, and after this it is a legitimate one.

## Work breakdown

### Foundational — blocks all stories

| Work | Why it can't be seen |
|---|---|
| Extend CS5's `chat_message_attachments` and bucket path convention to carry agent-produced files | Schema and policy; nothing renders |
| An agent-facing way to hand a file back mid-turn, and the preamble text that tells agents it exists | The mechanism has no UI |
| Daemon buffers handed-back files, then uploads and binds them after the reply lands | Invisible until something renders it |
| `chat-turn.ts` creates an assistant message when a turn produced files but no text (FR-004) | Enables a case nothing yet displays |
| Turn result and message payloads carry their attachments (`packages/shared/src/schemas/chat.ts`) | Contract only |

### Per story

| Story | Work | Ends in |
|---|---|---|
| **US1** | An `img` override in the chat markdown map; an attachment strip under an assistant turn — images as pictures, other files as named rows; an enlarged view | Ask for an image, see it in the reply |
| **US2** | The preview pane's placeholder replaced by a per-session list grouped by turn; reachable below `xl` | Find a thing from three days ago without scrolling |
| **US3** | The same list also renders user-message attachments, visually distinguished | One place answers in and out |

## Decisions

**1 — Extend CS5's table and bucket; do not create a second set.**
CS5 (`T-CS5-01`) creates the private `chat-attachments` bucket, the
`chat_message_attachments` table, and workspace-scoped storage RLS with a
`<workspace_id>/<session_id>/…` prefix. Produced files are the same kind of
object with the same tenancy rules.
*Rejected:* a separate `produced_items` table and bucket. It would duplicate
the RLS surface, and `013_storage_images.sql`'s header — quoted in CS5's own
phase README — warns specifically against per-feature bucket sprawl. The cost
of this decision is the hard dependency in the header.

**2 — The agent hands a file back explicitly; nothing watches a directory.**
Agents already have an app-facing tool surface described in
`orchestrator/preamble.ts` (`mcp__sparstrow-memory__*` for memory, task
creation and messaging), so this is an addition to an established channel
rather than a new one. The preamble gains a short instruction telling agents
to use it for anything they produce that the owner should see.
*Rejected:* watching the working directory for new files. It cannot satisfy
FR-016 — in a project chat every edit would look like a produced artifact —
and it would sweep up temp files, caches and build output.
*Rejected:* parsing file paths out of the reply text. Guessy, and silently
wrong when the agent writes a path it did not create.

**3 — Buffer on the machine, upload and bind after the reply lands.**
The daemon holds handed-back files locally for the duration of the turn. When
`postResult` reports the terminal result, the cloud creates the assistant
message; the daemon then uploads each file under the session's path prefix and
inserts its attachment row against that message id.
*Rejected:* uploading each file the moment it is produced, which is what the
comparable system does. That requires `message_id` to be nullable, a
task-scoped binding step, and a reaper for attachments whose turn never
completed — real machinery whose only benefit is that a thumbnail appears a
few seconds sooner.
**This knowingly relaxes one line of the approved spec**: the Loading state
says produced items "appear as they arrive rather than all at the end". Under
this decision they appear together, when the turn ends. No acceptance scenario
depends on progressive arrival. Flagged rather than absorbed silently — if the
owner wants the streaming behaviour, it is Decision 3's rejected alternative
and costs the nullable column plus the reaper.

**4 — A turn that produced files and no text still creates a reply.**
`cloud/chat-turn.ts` currently treats empty `replyText` as nothing to record.
It gains "…unless the turn handed something back".
*Rejected:* synthesising placeholder text like "Here is the file you asked
for." Putting words in the agent's mouth is exactly the dishonesty SC-002
exists to prevent.

**5 — Maximum kept size: 10 MB per file (answers the spec's FR-011).**
CS5 sets `CHAT_ATTACHMENT_MAX_BYTES` at 2 MB, which is right for what a person
drags into a composer and wrong for what a model emits — a generated PNG
routinely exceeds it. A sibling `CHAT_PRODUCED_MAX_BYTES` at 10 MB keeps one
constant family with two honest values.
*Rejected:* one shared limit. Either it is 2 MB and normal generated images
fail, or it is 10 MB and the composer invites 10 MB paste-ins.
Over the limit, the file is refused and the owner is told in the reply — never
dropped silently (FR-011).

**6 — Retention: the life of the conversation, with no time window (answers
FR-015).** `message_id`'s cascade already deletes attachment rows with the
conversation; the storage objects are removed alongside, which also satisfies
FR-012.
*Rejected:* a fixed expiry window now. It adds a scheduled job and a "this
expired" state to design, for a cost nobody has yet measured. Revisit when the
bucket passes 1 GB — recorded as the trigger so it is not simply forgotten.

**7 — Images render through the existing markdown component, not a new one.**
`apps/web/src/components/chat/markdown.tsx` already renders assistant turns
with GFM and highlighting and has no `img` override, so images currently
render unstyled. That override is needed under every design and is worth
landing first.

## Phases

**AM1 — foundational.** Schema extension, the hand-back mechanism and preamble
text, daemon buffer/upload/bind, `chat-turn.ts`'s empty-text case, contract
changes. Demos to nobody. **Blocked on CS5.**

**AM2 — serves US1.** `img` override, the attachment strip under an assistant
turn, the enlarged view. Ends in: ask for an image, see it.

**AM3 — serves US2.** The preview pane becomes a per-session list grouped by
turn, reachable on a phone. Ends in: find a thing from three days ago.

**AM4 — serves US3.** User attachments folded into that list, visually
distinguished. Ends in: one place answers in and out.

### Sequencing, and why tasks are not written yet

**CS5 is built.** `chat_message_attachments`, the private `chat-attachments`
bucket and its workspace-scoped RLS all landed on
`band/26-chat-session-and-conversation-ux` as PRs #164–#167, and `T-CS6-01`
(#168) built the composer attachment UI on top. The shipped table was read
directly off that branch, not from its task file — the task files in some
working copies still read `not started`, which is stale.

So this plan's foundation exists; it exists **on a band branch that has not
reached `development`**. That is what blocks decomposition, and it is a real
dependency rather than a procedural one: AM1's first task edits
`chat_message_attachments` and `constants.ts`, both of which band 26 is
currently the only source of. Tasks written against `development` today would
describe a table that is not there.

Two branches are live as of 2026-08-28, and they are not equivalent:

- **`band/26-chat-session-and-conversation-ux`** — carries the dependency.
  Merging it to `development` is what unblocks this plan, and it is close:
  CS1–CS5 and CS6-01 have landed.
- **`task/T-DI-05-live-verification`** — unrelated to this work, and **stuck on
  an external platform issue**, not on effort:
  [`BUG-2026-08-28-private-broadcast-channels-not-relaying`](../bug/BUG-2026-08-28-private-broadcast-channels-not-relaying.md)
  has a filed Supabase support ticket. It could stay open indefinitely.

That second one matters for planning: treating "drain to zero branches" as the
trigger would make this plan hostage to a third-party ticket. The trigger that
actually matters here is **band 26 merging to `development`**.

**Parallelism, once decomposition is possible:** AM1 is a true pipeline and
will be `[S]` throughout, like CS5 for the same reason. AM2 and AM3 are
genuinely parallel — different files, different surfaces, both depending only
on AM1 — and are the natural place to fork two agents. AM4 touches AM3's list
component and must be `[C]` against it, not `[P]`.

## Scope boundaries

- **Files an agent changes inside a project folder** — out, by FR-016.
  Elaborated as [`I-17`](../Ideas.md); the viewing half has an owner-accepted
  home in `reaching-my-machine` US1.
- **Media as input to a model** — CS5/CS6's work, not this.
- **Editing, regenerating or versioning** produced items — out.
- **Runs and issues that also produce files** — out; revisit once chat proves
  the shape.
- **The `[NEEDS CLARIFICATION]` markers** are answered by Decisions 5 and 6;
  the spec keeps its markers as the record of what was open at review.

## Verification

| Criterion | Check |
|---|---|
| **SC-001** | Ask an agent for an image in a fresh chat; it appears in the reply. Live, `agent-browser`, against the band branch's Vercel preview |
| **SC-002** | Two cases: a file over the limit is refused *and said so*; a turn claiming a file it never handed back shows text only, with no placeholder. Both scripted |
| **SC-003** | Sign in on a second device with the producing machine powered off; every item still loads. Needs a real second device — if unavailable, a signed-out-then-in session on a different browser plus a stopped daemon, recorded as partial in `KnownGaps.md` |
| **SC-004** | Seed a session with items across ten turns; find a named one from the panel without scrolling the transcript |
| **SC-005** | A conversation that produced nothing renders byte-identically to today — no new containers. Visual diff before/after |
| FR-010 | Workspace A cannot read workspace B's produced file: direct storage request with A's session against B's path, expect denial. `get_advisors` clean |
| FR-016 | In a project chat, have the agent edit a file in the project folder; confirm no attachment row and no stored object result |

Per `AGENTS.md` §2.3 the live pass runs on the band branch's own Vercel
preview, not on `development`.

## Result

<!-- Filled in as phases land. -->
