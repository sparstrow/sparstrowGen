# Multica's chat, compared to ours

**Read:** 2026-08-28
**Subject:** [`multica-ai/multica`](https://github.com/multica-ai/multica) — Go
server (Chi + Postgres 17), Next.js web / Electron / React Native clients,
local daemon running 23 agent CLIs. Same problem shape as ours: a cloud control
plane dispatching work to agent CLIs on a user's own machine.
**Why:** the owner asked how they built chat, and whether we should adopt,
keep, or improve on it — raised off the back of
[`I-16`](../Ideas.md) (media as a chat artifact).

## How to read the evidence here

Migrations were returned as verbatim SQL and are quoted as fact. Behavioural
claims drawn from Go source and test files came back through a summarising
fetch layer rather than as raw source, so they are **reported behaviour, not
read code** — flagged inline as such. Anything we would build on should be
re-read against the source first. Our own side was read directly.

## The one-line answer

Their message *storage* is the same as ours and slightly poorer. Their
**media** model is better than either option `I-16` was weighing, and worth
adopting more or less wholesale. Their **auto-titling** is better than what our
own spec currently asks for. Their **session continuity** is worse for our
product, and we should keep ours — but the cost we pay for it is real and
under-acknowledged.

## 1. Message storage — keep ours

Multica, `033_chat.up.sql` (verbatim):

```sql
CREATE TABLE chat_message (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_session_id UUID NOT NULL REFERENCES chat_session(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    task_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Ours ([`schema.ts:854`](../../packages/shared/src/db/schema.ts:854)) is the
same shape and carries more: a `meta jsonb`, and a `turn_id` FK with a
deliberate `SET NULL` so message history outlives an administratively removed
turn.

**Verdict: keep.** One cheap thing to steal — their `role` has a `CHECK (role
IN ('user','assistant'))`; ours is unconstrained `text`. Whether that is worth
a migration on its own is a judgement call, not a finding.

**The correction this forces on `I-16`:** I framed our text-only `content`
column as one of four layers blocking media. Multica has *the same column* and
renders media fine. The column was never the obstacle.

## 2. Media in chat — adopt their model

This is the important section, and it answers `I-16` better than `I-16` does.

**What they do** (reported behaviour, from `chat_attachment_reply_test.go` and
the `attachment` table):

1. An `attachment` table with `uploader_type TEXT CHECK (uploader_type IN
   ('member','agent'))` — **an agent is a first-class uploader**, alongside
   `filename`, `url`, `content_type`, `size_bytes`.
2. While a chat task runs, the agent uploads files scoped to that task —
   `task_id` and `chat_session_id` set, `chat_message_id` still null. Only the
   task's assigned agent may upload against that task.
3. On task completion, every task-scoped attachment is **bound to the assistant
   message** that completion creates, by setting `chat_message_id`.
4. An assistant message is created **even when the text output is empty**, if
   attachments exist. A reply can be just an image.
5. Attachments never enter `content`. They hang off the message by FK.
6. Unbound leftovers are reaped by cascade when the session is deleted.

**Why this is better than either option `I-16` was weighing.** `I-16` framed
the choice as inline transcript rendering versus a filesystem-shaped folder
view, and leaned toward the folder because CLI agents write files rather than
returning bytes. Multica shows the framing was too narrow: media is neither
inline text nor a directory listing — it is **a row related to the message**,
uploaded at the moment it is produced. The folder view then becomes a query
over those rows, not a filesystem browse.

Three consequences for us, each of which shrinks the work:

- **It dissolves `I-16`'s hardest open decision.** That decision asked what
  "the output folder" refers to for a `free` session with no project and no
  cwd. Under this model the answer is that it never refers to a directory at
  all — artifacts are scoped to the *task*, which every session kind has.
- **It removes the `host-fs` / live-channel dependency from the storage
  path.** `I-16` reasoned this needed the M16/M17 runtime channel because
  `host-fs` is loopback-only and stubbed in the cloud app. Under an upload
  model the daemon pushes to cloud storage instead — the same direction of
  travel as CS5's attachment upload. The live channel stays relevant for
  *browsing* a machine (`I-11`), not for showing what a turn made.
- **We are better placed to do the permission check than when `I-16` was
  written.** Their control is "only the assigned agent may upload for this
  task." Band 25 (DI) just gave each daemon a real Supabase Auth identity,
  which is the exact primitive that check needs. A year ago we would have had
  to invent it.

Multica has a *second*, different media path worth not confusing with this
one: `internal/channelmedia` embeds attachments into markdown bodies with an
HTML-comment provenance marker (`<!-- multica:channel-media:{uuid} -->`,
extracted in document order by `MarkedIDs()`), so externally-ingested media can
be told apart from a human's deliberate edit. That is for issues and comments,
not chat. Useful pattern if we ever ingest from an external channel; not the
chat answer.

## 3. Our render layer — I got this wrong in `I-16`

`I-16` says grep found no media handling under `app/chat`. Literally true, and
misleading — the renderer lives one directory over.

Assistant turns are already rendered through
[`markdown.tsx`](../../apps/web/src/components/chat/markdown.tsx):
`react-markdown` with `remark-gfm` and `rehype-highlight`, with a `components`
map covering paragraphs, headings, lists, links, blockquotes, tables, and
fenced code. User turns are plain `whitespace-pre-wrap` text
([`chat-bits.tsx:50`](../../apps/web/src/components/chat/chat-bits.tsx:50)).

**There is no `img` override in that map.** So `![alt](url)` in an assistant
turn does not fail — it falls through to react-markdown's default `<img>` and
renders today, unstyled: no `max-width`, no rounding, no lazy loading, no
broken-image state. The render layer is not a wall, it is an unfinished
surface. That is a materially cheaper starting position than `I-16` implied,
and it is the layer to fix first regardless of which media model we choose,
because an `img` override is needed under all of them.

## 4. Auto-titling — adopt theirs, ours is specified worse

Multica (`internal/chattitle/title.go`, `handler/chat_title.go` — reported):

- A deterministic `Derive` runs **first and synchronously**: first non-empty
  line, strip markdown fences/marks, links reduced to their display text,
  whitespace collapsed, 30 characters, truncating at 29 with an ellipsis.
- That title is committed immediately, so a chat is never untitled.
- An LLM pass then *optionally* improves it in the background — non-blocking,
  silent on failure, 20-second timeout — and writes back with
  **compare-and-swap so it cannot clobber a manual rename**.
- There is a media-derived fallback for a chat opened with only an image.

Our spec's US2 asks for auto-rename from the first prompt, with an error state
of "if auto-naming fails, the session simply keeps 'New conversation'."

Theirs is better on three counts and none is expensive: the title exists
instantly rather than after a round trip; failure degrades to a decent title
rather than to no title; and the CAS is the non-obvious detail that stops an
async improvement from silently overwriting a rename the owner just typed —
which is a live risk for us precisely because US1 adds manual rename in the
same band.

**Not acted on here.** Band 26 is in flight and `AGENTS.md` §2.9 keeps task
branches out of its spec and queue. This is a note for whoever finishes CS2.

## 5. Session continuity — keep ours, but know what it costs

Multica's `chat_session` carries `session_id TEXT` (the CLI's own session id)
and `work_dir TEXT`, and routes later messages back to that session so the CLI
keeps its own history.

We deliberately do the opposite, and it is documented at
[`schema.ts:820`](../../packages/shared/src/db/schema.ts:820):

> Turns replay history rather than resuming a provider session id […] so a
> conversation carries no machine-local state and ANY online runtime can
> continue a `free` or `agent` session.

**That is the right call for this product** and should not be traded away.
Multica's `session_id` + `work_dir` binds a chat to the machine that started
it; ours is machine-independent by construction, which is what makes a
multi-machine workspace work at all.

The cost is real though, and worth stating plainly rather than leaving implicit
in a schema comment: history is replayed through `buildTranscriptPrompt` under
a 24,000-byte budget
([`service.ts:39`](../../packages/core/src/chat/service.ts:39)), and for
antigravity that prompt travels **in argv**, against Windows' ~32KB
command-line limit
([`antigravity.ts:27`](../../packages/core/src/providers/antigravity.ts:27)).
A long conversation silently loses its early turns; theirs does not.

**Where we could go from better to best.** The provider layer already supports
resume and the chat path simply doesn't use it —
[`claude-code.ts:89`](../../packages/core/src/providers/claude-code.ts:89)
passes `--resume`, `extractResult` returns the provider's `session_id`, and
`types.ts` carries `resumeSessionId`. Antigravity opts out explicitly
(`sessionId: null, // --conversation resume is out of scope`). So a chat turn
could resume *when it happens to land on the same runtime that produced the
last turn*, and replay otherwise — keeping portability as the guarantee and
treating resume as an optimisation. That is strictly better than either
system's current behaviour. It is an idea, not a decision, and it is not
scoped here.

## Verdict summary

| Dimension | Them | Us | Call |
|---|---|---|---|
| Message row | `content TEXT`, role CHECK | same + `meta`, `turn_id` | **Keep ours.** Steal the role CHECK if convenient |
| Agent-produced media | attachment rows bound to the message on task completion | nothing | **Adopt** — reshapes `I-16` and shrinks it |
| Media render | — | markdown already renders; no `img` override | **Improve ours first** — needed under every model |
| Auto-title | deterministic now, LLM later, CAS-safe | spec says LLM-or-nothing | **Adopt** — note left for CS2 |
| Session continuity | CLI `session_id` + `work_dir`, machine-bound | replay, runtime-portable | **Keep ours.** Cost is bounded history; resume-as-optimisation is the best-of-both |
| Download auth | 60s signed capability URL for credential-less native downloads | n/a | Not applicable since `D-24` made desktop a window on the hosted app |

## What this changed

- `I-16` corrected on two points (the text column was never the blocker; the
  renderer already renders markdown) and re-shaped around task-scoped
  attachment binding.
- No code changed. Nothing here is a decision — `I-16`'s open questions stay
  open, and the CS2 note is for band 26 to accept or reject.
