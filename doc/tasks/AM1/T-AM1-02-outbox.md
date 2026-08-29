# T-AM1-02 — the outbox a turn hands files back through

| | |
|---|---|
| **Tag** | `[S]` sequential — T-AM1-03 uploads what this produces; both edit `chat-turn.ts` |
| **Serves** | **foundational** — unblocks AM2 (US1) |
| **Depends on** | T-AM1-01 |
| **Blocks** | T-AM1-03 |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

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

- [ ] Create the per-turn outbox in `executeChatTurn`, unconditionally
- [ ] Add it to `addDirs`; extend the attachment clamp to `["Read", "Write"]`
- [ ] Append the outbox note to the prompt, alongside `attachmentNote`
- [ ] `sweepOutbox(dir)` — non-recursive, returns `{ kept, refused }` where
      `refused` carries the filename, the size and the reason
- [ ] Remove the outbox in the `finally` block, synchronously, exactly as
      `attachmentTempDir` already is
- [ ] Refusal sentences appended to the reply text before the result is posted
      (phase decision 4) — `kept` is not consumed yet; T-AM1-03 does that
- [ ] Tests: a turn with no outbox writes sweeps to empty; a turn with two
      files returns both; an oversized file lands in `refused` and never in
      `kept`; a subdirectory is ignored; the outbox is gone after the turn
- [ ] **A test for the clamp interaction** — a turn with an attachment resolves
      `allowedTools` containing `Write`. This is trap 3 of the phase README and
      no manual pass will find it
- [ ] `pnpm --filter @sparstrow/core typecheck` and tests green

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

- [ ] `pnpm --filter @sparstrow/core test` green, all sweep cases above
- [ ] Manually: run a chat turn against a real daemon with a prompt asking for
      a file; confirm from the daemon log that the sweep found it and that the
      outbox directory no longer exists after the turn
- [ ] The refusal sentence appears in the reply for an oversized file — checked
      by writing an 11 MB file into the outbox from a test double, not by
      persuading a model to generate one
- [ ] Binding and upload are **not** proved here — that is T-AM1-03

## On completion

- [ ] `pnpm typecheck` and `pnpm test` green
- [ ] Update this file's **Status** row
- [ ] Open the PR into `band/27-seeing-what-my-agent-made`, then
      `gh pr merge <n> --auto --squash`

> **Do not edit [`../MasterTaskQueue.md`](../MasterTaskQueue.md) from a task
> branch.**

## Result

<!-- Filled in when the task lands. -->
