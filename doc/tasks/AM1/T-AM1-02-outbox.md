# T-AM1-02 — the outbox a turn hands files back through

| | |
|---|---|
| **Tag** | `[S]` sequential — T-AM1-03 uploads what this produces; both edit `chat-turn.ts` |
| **Serves** | **foundational** — unblocks AM2 (US1) |
| **Depends on** | T-AM1-01 |
| **Blocks** | T-AM1-03 |
| **Phase spec** | [README.md](README.md) |
| **Status** | ✅ done except a live-daemon check → `G-55` (2026-08-29) |

## Objective

Give every chat turn a directory the agent can write into, tell the agent it
exists, and collect what is left there when the turn ends. This is the whole
hand-back mechanism — phase decision 1 explains why it is a directory and not
an MCP tool.

## Decisions already made

**One outbox per turn, always outside any project root.**

```ts
// Created for EVERY turn, not only attachment turns: an agent may produce
// something on a turn where the owner attached nothing.
const outboxDir = fs.mkdtempSync(path.join(config.tmpDir, "chat-outbox-"));
```

`config.tmpDir` is recreated with `mkdirSync(..., { recursive: true })` first,
for the reason `T-CS6-02` documented at
[`chat-turn.ts:308`](../../../packages/core/src/cloud/chat-turn.ts) — a
long-lived daemon outlives `ensureDirs()` and a Linux `/tmp` reaper removes the
directory underneath it.

**FR-016 is satisfied structurally, not by filtering.** The outbox is a fresh
`mkdtemp` directory under the daemon's own tmp root. In a `project` session the
agent's `cwd` remains the project root and is never swept. There is no rule to
get wrong at sweep time, because the sweep only ever reads one directory that
by construction contains nothing the agent did not deliberately put there.

**The agent is granted write access to exactly that path.** Two changes, and
the second is the one that is easy to miss:

```ts
// 1. The agent can see the directory at all.
addDirs: [...agent.addDirs, outboxDir]

// 2. The attachment clamp grows a Write grant. Without this, a turn WITH an
//    attachment can read the attachment and produce nothing, silently --
//    `allowedTools: ["Read"]` forbids the Write the outbox needs.
effectiveAgent = { ...agent, cwd: attachmentTempDir, allowedTools: ["Read", "Write"] };
```

The `Write` grant is not a widening of what an attachment turn may touch: the
agent's `cwd` is still the scratch directory and `--add-dir` still bounds
reachable paths. It converts "may look at the attachment" into "may look at the
attachment and answer with a file", which is the entire point.

**The prompt note is appended the same way the attachment note already is.**
`attachmentPromptNote(placed)` sets the precedent at
[`chat-turn.ts:320`](../../../packages/core/src/cloud/chat-turn.ts); the outbox
note joins it in the same concatenation. Text, kept short because it is paid
for on every single turn:

> Anything you produce for the user — an image, a chart, a document — write it
> as a file into `<outboxDir>`. Files left there are shown to the user with
> your reply. Do not put working notes or intermediate files there. Do not copy
> files that already live somewhere on this machine.

The last sentence is load-bearing for FR-016: it stops an agent in a project
chat from helpfully copying a file it just edited into the outbox.

**The preamble is NOT the place for this.** `orchestrator/preamble.ts` is
prepended to **runs**, which have no outbox. Putting it there would advertise a
directory that does not exist for the majority of its readers — the exact
"advertised ≢ available" failure that file's own header (line 39) says it
filters for. The note goes in the chat turn's prompt only.

**The sweep is non-recursive and happens before `postResult`.** Top-level files
only: a subdirectory an agent creates is ignored rather than walked, which
keeps "produced a file" from accidentally meaning "produced a node_modules".
Each swept file is checked against `CHAT_PRODUCED_MAX_BYTES` and
`CHAT_PRODUCED_ALLOWED_TYPES`; refusals are collected, not thrown.

**MIME type comes from the extension, not from sniffing.** The daemon has the
file on disk and `mime.lookup`-style extension mapping is what
`CHAT_PRODUCED_ALLOWED_TYPES` is keyed on. An unmapped extension is a refusal
with a distinct reason, not a fallback to `application/octet-stream`.

## Checklist

- [x] Create the per-turn outbox in `executeChatTurn`, unconditionally
- [x] Add it to `addDirs`; extend the attachment clamp to `["Read", "Write"]`
- [x] Append the outbox note to the prompt, alongside `attachmentNote`
- [x] `sweepOutbox(dir)` — non-recursive, returns `{ kept, refused }` where
      `refused` carries the filename, the size and the reason
- [x] Remove the outbox in the `finally` block, synchronously, exactly as
      `attachmentTempDir` already is
- [x] Refusal sentences appended to the reply text before the result is posted
      (phase decision 4) — `kept` is not consumed yet; T-AM1-03 does that
- [x] Tests: a turn with no outbox writes sweeps to empty; a turn with two
      files returns both; an oversized file lands in `refused` and never in
      `kept`; a subdirectory is ignored; the outbox is gone after the turn
- [x] **A test for the clamp interaction** — a turn with an attachment resolves
      `allowedTools` containing `Write`. This is trap 3 of the phase README and
      no manual pass will find it
- [x] `pnpm --filter @sparstrow/core typecheck` and tests green

## Traps

**Creating the outbox only when attachments exist.** The natural place to put
this is inside the existing `if (payload.attachments.length > 0)` block,
because that is where the temp-directory code already lives. That would mean an
agent can only hand a file back on turns where the owner attached one — which
is close to the opposite of the feature.

**`config.tmpDir` may not exist.** Same ENOENT that
`BUG-2026-08-28`-adjacent work hit in `T-CS6-02`; recreate before `mkdtemp`.

**The `finally` block runs on the failure path too, and must.** A turn that
throws still has to remove its outbox — but T-AM1-03 needs the *swept* files to
survive that cleanup, so the sweep happens before `postResult`, not in
`finally`. Sweeping inside `finally` is a plausible-looking arrangement that
loses every file on the FR-013 path specifically.

**An agent that writes nothing must cost nothing.** SC-005 requires a
conversation that produced nothing to look exactly as it does today. An empty
sweep must produce no rows, no upload calls, and no change to the reply text.

## Verification

- [x] `pnpm --filter @sparstrow/core test` green, all sweep cases above
- [ ] Manually: run a chat turn against a real daemon with a prompt asking for
      a file; confirm from the daemon log that the sweep found it and that the
      outbox directory no longer exists after the turn — **not reachable in
      this environment: no paired daemon.** Recorded as `G-55` in
      `../../KnownGaps.md`
- [x] The refusal sentence appears in the reply for an oversized file — checked
      by writing an 11 MB file into the outbox from a test double, not by
      persuading a model to generate one
- [x] Binding and upload are **not** proved here — that is T-AM1-03 (confirmed:
      `kept` is computed and typed but deliberately unused past a `void kept;`
      marker until that task wires it up)

## On completion

- [x] `pnpm typecheck` and `pnpm test` green
- [x] Update this file's **Status** row
- [ ] Open the PR into `band/27-seeing-what-my-agent-made`, then
      `gh pr merge <n> --auto --squash`

> **Do not edit [`../MasterTaskQueue.md`](../MasterTaskQueue.md) from a task
> branch.**

## Result

Added the outbox lifecycle to `executeChatTurn` in `packages/core/src/cloud/chat-turn.ts`:
created unconditionally for every turn (`chat-outbox-` mkdtemp prefix, same
`config.tmpDir` re-creation defense `T-CS6-02` already established for
`attachmentTempDir`), added to `effectiveAgent.addDirs` regardless of which
branch built `effectiveAgent`, and announced via `outboxPromptNote` appended
after `attachmentNote`. The existing attachment clamp changed from
`allowedTools: ["Read"]` to `["Read", "Write"]` — without this a turn with
both an attachment and a request to produce something back would silently
produce nothing, exactly the phase README's trap 3.

`sweepOutbox` is non-recursive (a subdirectory is ignored, tested explicitly)
and classifies each top-level file by extension against
`CHAT_PRODUCED_ALLOWED_TYPES` (inverted to an extension→mimeType map), refusing
anything over `CHAT_PRODUCED_MAX_BYTES` or of an unrecognized type. Refusals
are turned into plain sentences and appended to the reply text before
`postResult`; `kept` is computed, typed, and deliberately left unconsumed
(`void kept;`) — this task's own scope boundary, since `T-AM1-03` is what adds
the schema field and upload call that actually use it.

**The sweep runs before `postResult`, and the outbox is removed only in
`finally`, after that** — the ordering the phase README's own trap calls out:
sweeping inside `finally` would lose every file on the FR-013 (partial
success) path, since `finally` also runs when `completeOnce` throws.

Added 8 tests to `chat-turn.test.ts`'s new `describe("outbox", …)` block, and
updated one existing assertion (`allowedTools` was pinned to `["Read"]`; now
`["Read", "Write"]`, with a comment explaining why). Total suite: 25/25 in
this file, 770/774 in the full `@sparstrow/core` suite (4 pre-existing skips,
unrelated to this change).

`pnpm --filter @sparstrow/core typecheck`: clean.
`pnpm --filter @sparstrow/core test`: 770 passed, 4 skipped.

**One item genuinely could not be reached**, named up front rather than
rounded up: running a real chat turn against a live, paired daemon. This
environment has no daemon pairing available. Recorded as
[`G-55`](../../KnownGaps.md) — what it would cost if wrong, and what closes
it.

No UI surface exists after this task either — still correctly nothing to
verify in a browser.
