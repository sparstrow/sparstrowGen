# T-AM1-04 — Verification

| | |
|---|---|
| **Tag** | `[S]` sequential — needs all of AM1 in place |
| **Depends on** | T-AM1-01, T-AM1-02, T-AM1-03 |
| **Blocks** | — |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

## Objective

Prove the phase for real: a file an agent writes into the outbox ends up in the
bucket, bound to the right message, with the right provenance — and a file it
writes into a project folder does not.

**What this pass cannot reach.** AM1 ships no UI, so nothing here is verified
by looking at the app. Every assertion is checked at the database, the bucket,
or the daemon log. That is correct for a foundational phase and is not a gap —
the owner-visible path is graded by `T-AM2-03`.

**One thing genuinely at risk.** Section A5 (FR-016) needs a `project` chat
bound to a real project with a real `rootDir` on the verifying machine. If no
such project exists, **create one** — do not skip it and do not substitute a
`free` chat, because FR-016 is the requirement this whole spec turns on and the
`project` path is the only one where it can fail.

## A — The technical assertions

- [ ] **A1 — the happy path.** Dispatch a chat turn whose prompt asks the agent
      to write a PNG into the outbox. After it completes:
      - the object exists in `chat-attachments`
      - `storage.foldername(name)` has **exactly two** segments
      - one `chat_message_attachments` row references it
      - that row's `message_id` resolves to a `chat_messages` row with
        `role = 'assistant'`
      - `filename`, `mime_type` and `size_bytes` match the file on disk
- [ ] **A2 — files with no text (FR-004).** A turn that writes a file and
      returns empty text: `chat_turns.status = 'succeeded'`, `error is null`,
      an assistant message exists with `content = ''`, and the attachment is
      bound to it. **This is the assertion that fails if
      `chat-turn.ts:339`'s condition was not changed.**
- [ ] **A3 — partial work survives failure (FR-013).** Force a turn to fail
      after writing a file (kill the provider process, or use a prompt that
      writes then exits non-zero). The turn is `failed` **and** an assistant
      message carrying the file exists.
- [ ] **A4 — the refusal is told, not swallowed (FR-011).** Write an 11 MB file
      into the outbox. No object is created, no row is created, and the reply
      text names the file and says it was too large.
- [ ] **A5 — FR-016, the one that matters.** In a `project` chat bound to a
      real `rootDir`: ask the agent to create and edit files **inside the
      project folder**. Then assert, for that turn:
      - `select count(*) from chat_message_attachments where message_id = <turn's message>` is **0**
      - no new objects under that session's storage prefix
      - the files the agent created still exist in the project folder on disk,
        untouched
- [ ] **A6 — the attachment/produce interaction.** Send a turn that has *both*
      an owner attachment and a request to produce a file. Both work — the
      agent reads the attachment and the produced file is bound. This is the
      `allowedTools: ["Read"]` clamp trap; it passes only if T-AM1-02 added the
      `Write` grant.
- [ ] **A7 — nothing produced costs nothing (SC-005).** A normal
      text-only conversation creates zero rows in `chat_message_attachments`
      and zero objects.

## B — What must NOT have changed

- [ ] CS5's inbound attachments still work end to end: attach a file in the
      composer, the daemon places it, the agent reads it (this is band 26's
      `T-CS6-02` path, re-walked)
- [ ] `enqueue_chat_turn`'s auto-titling still fires on the first message —
      `028` touches the adjacent function and this is the regression band 26
      already suffered once. Send a first message to a fresh session and
      confirm the title changes from `''`
- [ ] A failed turn with no produced files still creates **no** assistant
      message, exactly as before
- [ ] Chat turn `seq` still advances across the terminal call; no turn is left
      `in_progress`

## C — What can be verified today

- [ ] `get_advisors` clean on staging after `028`
- [ ] `select prosrc from pg_proc where proname = 'ingest_chat_turn_reply'`
      contains **both** the auto-title-adjacent behaviour it had before and the
      new produced-file block — the concrete check that `028` was written from
      the live body and not from `024`'s file
- [ ] A foreign-workspace `storagePath` is refused by `sign-upload` with 403

## D — What needs something that doesn't exist yet

**Needs AM2.** Nothing in AM1 can show the owner anything.

- [ ] A produced image is visible in the reply — `T-AM2-03`
- [ ] SC-003 (phone, machine off) — `T-AM3-02`

## E — Regression surface

- [ ] `pnpm -r typecheck` and `pnpm -r test` green
- [ ] `@sparstrow/core`, `@sparstrow/shared` and `apps/web` all build

## On completion

- [ ] Update the phase `README.md` status line and its task table
- [ ] Update the plan's **Status** row
- [ ] **Every unreached assertion written into
      [`../../KnownGaps.md`](../../KnownGaps.md)** with what breaks if the
      assumption is wrong and what closes it
- [ ] No Knowledge Center pass is due for this phase — it ships no user-visible
      behaviour. `AGENTS.md` §3.2's article update belongs to `T-AM2-03`, which
      is where the feature becomes real to a reader. Say so explicitly rather
      than leaving the box unticked and ambiguous

> The queue flip happens once, in the commit that lands
> `band/27-seeing-what-my-agent-made` on `development` — not here.

## Result

<!-- What was actually run, and what it found. -->
