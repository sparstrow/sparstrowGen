# T-M13-04 — the Knowledge Center stops saying chat doesn't work

| | |
|---|---|
| **Tag** | `[P]` parallel — lives entirely in `packages/ui/src/content/knowledge/*.md`, no code. One caveat: the `chat-context-menu-design` worktree also edits `chat-and-inbox.md` — see Traps. |
| **Serves** | **US1** — send a message and get a reply (`AGENTS.md` §3.2 obligation, same PR as the code) |
| **Depends on** | T-M13-01, T-M13-03 — write what shipped, not what was planned |
| **Blocks** | T-M13-05 |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

## Objective

`chat-and-inbox.md` currently tells users, twice, that sending a chat message
"does not work yet". The moment M13 lands that is a user-visible lie of the
overstating-in-reverse kind — and per `AGENTS.md` §3.2 a wrong article is a
defect, not a note. Correct it, and re-read the four global-claim pages for
what M13 changes about them.

## Decisions already made

### 1. Describe whole-message streaming, not token streaming

[`G-30`](../../KnownGaps.md) is explicit that the pipe delivers complete
assistant messages and step updates, and that "M13 should describe it as such
rather than promising something finer." A short answer arrives as one block.
Write "the reply appears as the agent produces it, in complete steps" — not
"streams word by word".

This is the same class of error the article already had to be corrected for on
2026-08-22, when it claimed cost tracking chat never had.

### 2. What is true after M13, and what is still not

Say this much and no more:

| True after M13 | Still not true |
|---|---|
| Sending works in Free, Project and Agent sessions | Team manager chat (`/teams/:id/manager/chat`) — still stubbed, out of the spec's scope |
| A reply needs a paired, online machine | The three specific "nothing can answer" states — **M14** |
| One reply at a time per session | Retry on a *completed* turn, and picking a different model — **M15** |
| A turn survives navigating away and back | Chat still gets no Runs entry, transcript, or cost tracking |

**Do not document M14's or M15's behaviour.** `AGENTS.md` §3.2: "Never document
what is not built or not enabled." The article that promised M5 chat streaming
is the reason this task exists.

### 3. The four global-claim pages are re-read, and the result is recorded either way

`what-is-sparstrowgen.md`, `first-run-setup.md`, `limitations.md` and
`providers-and-execution-modes.md` carry global claims and must be re-read
whenever the product's shape changes. Grep shows none of the first three
mentions chat at all today, and `providers-and-execution-modes.md` mentions it
only incidentally (line 32, "chat-style agents"; line 51, the sync list).

**"I read it and nothing needed changing" is a valid outcome and must be
written into this task's Result** — otherwise the next reader cannot tell the
pages were checked from the pages being missed. Only bump `updated:` on files
whose content actually changed.

## Checklist

- [ ] `chat-and-inbox.md` — the intro paragraph (line ~11) no longer says
      sending "is not available yet"
- [ ] `chat-and-inbox.md` — the first **Known Limitations & Boundaries** bullet
      rewritten: sending works; it needs a paired, online machine; one reply at
      a time per session
- [ ] `chat-and-inbox.md` — the "separate from Runs" and "one agent per
      session" bullets kept; both are still true
- [ ] Streaming described per decision 1
- [ ] `updated:` bumped to the landing date on every file whose content changed
- [ ] The four global-claim pages re-read; changes made where needed, and the
      no-change outcome recorded in Result
- [ ] Every article edited still has its `## Known Limitations & Boundaries`
      section (`AGENTS.md` §3.2 requires one on every article)

## Traps

**`chat-and-inbox.md` is edited in another worktree right now.** The
`chat-context-menu-design-0eb2ff` worktree changes 8 lines of it. Check
`development` before starting; a conflict here is trivial to resolve but easy
to clobber, and clobbering it would silently revert a documented feature.

**The limitation bullet is not deleted, it is replaced.** An article with no
honest boundary on a feature that needs a paired online machine is worse than
one with a stale boundary — the user with no machine gets no explanation at
all. `limitations.md`'s whole job is that this list stays true rather than
short.

**Do not describe the reply as "streaming in".** See decision 1 and `G-30`.

## Verification

- [ ] `grep -rin "does not work yet\|not available yet" packages/ui/src/content/knowledge/`
      returns nothing about chat sending
- [ ] The rendered article is read in the running app at `/knowledge/chat-and-inbox`,
      not just in the markdown source — it is a product surface
- [ ] Every claim in the edited article is checked against the shipped code, per
      `AGENTS.md` §3.2's "verify a capability in the code or schema before
      describing it"

## On completion

- [ ] Tick 18.10 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
- [ ] Update this file's **Status** row and the phase README's task table

## Result

<!-- Filled in when the task lands. Record the four global-claim pages'
     outcome explicitly, including "read, no change needed". -->
