# T-AM4-02 — Verification

| | |
|---|---|
| **Tag** | `[S]` sequential — needs all of AM4 in place, and closes the band |
| **Depends on** | T-AM4-01 |
| **Blocks** | — |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

## Objective

Walk US3's two acceptance scenarios, and — because this is the band's last
task — grade the spec's five success criteria as a whole rather than one phase
at a time.

**This is the band's closing verification.** `T-AM1-04`, `T-AM2-03` and
`T-AM3-02` each proved their own phase. This one proves the seams: that the
inline strip, the panel, and the two groups are one coherent feature, and that
a conversation which produced nothing is still untouched by any of it.

## A — The acceptance scenarios

- [ ] **US3 scenario 1** — two attachments and one produced file: all three
      appear, and provenance is clear at a glance
- [ ] **US3 scenario 2** — attachments but nothing produced: the sent items are
      listed and the agent's side says "nothing yet", **not** an error
- [ ] **Independent test** — an attached image and a produced image, clearly
      told apart
- [ ] Both-empty: a fresh conversation still shows the whole-panel empty state
- [ ] Console clean

## A2 — The four states

- [ ] All four, re-walked with both groups present
- [ ] The "at a glance" claim tested honestly: view it in **Mono**, where no
      brand accent is carrying the distinction. If provenance is only legible
      because of colour, the split has failed its one requirement
- [ ] Both themes, desktop panel and phone sheet
- [ ] Keyboard traversal across both groups; Escape closes the sheet

## B — What must NOT have changed

- [ ] `SentAttachmentChip` renders on user messages in the transcript exactly
      as band 26 shipped it — AM4 does not restyle it
- [ ] The inline produced strip from `T-AM2-02` is unaffected
- [ ] A project chat still shows its project card
- [ ] Band 26's session rename, archive, delete and auto-title all still work
- [ ] `enqueue_chat_turn` still auto-titles a fresh session — checked once more
      because `028` redefined its neighbour, and this is the last chance before
      the band merges

## C — The spec's success criteria, graded as a whole

- [ ] **SC-001** — ask for an image, see it, without leaving the conversation
      or touching the machine
- [ ] **SC-002** — no reply claims something the app then fails to show: either
      the item appears, or the reply carries the plain refusal sentence AM1
      appends. Test both halves — an over-limit file, and a reply that mentions
      a file it never produced
- [ ] **SC-003** — phone, machine off, every item still viewable (or the
      substitute `T-AM3-02` recorded, carried forward here)
- [ ] **SC-004** — ten-plus turns, find a named item without scrolling the
      transcript
- [ ] **SC-005** — a conversation that produced nothing is **byte-identical**
      to `development`. Screenshot-compare, and check the DOM for added nodes.
      This has been asserted in three phases; this is where it is signed off
- [ ] **FR-010** — workspace A cannot read workspace B's produced file: a direct
      storage request with A's session against B's path is denied
- [ ] **FR-016** — re-walked once more end to end, in a project chat, because it
      is the requirement this spec turns on and every phase touched code near it

## D — What still needs something that doesn't exist

- [ ] Anything `T-AM3-02` could not reach and recorded — carried forward, not
      re-ticked here without new evidence

## E — Regression surface

- [ ] `pnpm -r typecheck` and `pnpm -r test` green
- [ ] `apps/web`, `@sparstrow/core` and `@sparstrow/shared` all build
- [ ] `get_advisors` clean

## On completion

- [ ] Update the phase `README.md` status line and its task table
- [ ] Update the plan's **Status** row to `✅ Completed <date>` — or name the
      gap that stops it, rather than rounding up
- [ ] Knowledge Center: final pass on `chat-and-inbox.md`, and **re-read the
      four global-claim pages** (`what-is-sparstrowgen.md`,
      `first-run-setup.md`, `limitations.md`,
      `providers-and-execution-modes.md`). `limitations.md` is the likely one:
      it may still say the app cannot show what an agent generates
- [ ] **Every unreached assertion written into
      [`../../KnownGaps.md`](../../KnownGaps.md)**
- [ ] Close the loop on the feedback items this band answers —
      `FB-2026-08-27-chat-missing-file-upload`'s output half, and the
      2026-08-27 media feedback that became `I-16`

## On closing the band

These happen **in the commit that lands `band/27-seeing-what-my-agent-made` on
`development`**, not in any task branch (`AGENTS.md` §2.9):

- [ ] Flip every band 27 row in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
- [ ] Archive band 27 to `CompletedMasterQueue.md` per
      [`../README.md`](../README.md#archiving-a-finished-band)
- [ ] Merge `development` into the band branch first (`AGENTS.md` §2.4)

## Result

<!-- What was actually run, and what it found. -->
