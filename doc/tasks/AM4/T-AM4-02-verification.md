# T-AM4-02 — Verification

| | |
|---|---|
| **Tag** | `[S]` sequential — needs all of AM4 in place, and closes the band |
| **Depends on** | T-AM4-01 |
| **Blocks** | — |
| **Phase spec** | [README.md](README.md) |
| **Status** | ✅ done except `G-55` |

## Objective

Walk US3's two acceptance scenarios, and — because this is the band's last
task — grade the spec's five success criteria as a whole rather than one phase
at a time.

**This is the band's closing verification.** `T-AM1-04`, `T-AM2-03` and
`T-AM3-02` each proved their own phase. This one proves the seams: that the
inline strip, the panel, and the two groups are one coherent feature, and that
a conversation which produced nothing is still untouched by any of it.

## A — The acceptance scenarios

- [~] **US3 scenario 1** — two attachments and one produced file: all three
      appear, and provenance is clear at a glance. **Not reachable**: no
      daemon exists anywhere in this environment, so nothing can populate the
      agent side. Proven at the unit-test layer only (`conversation-items.test.ts`,
      "both non-empty" case). Tracked in `G-55`.
- [x] **US3 scenario 2** — attachments but nothing produced: the sent items are
      listed and the agent's side says "nothing yet", **not** an error.
      Live-verified (`T-AM4-01`'s own session: real sent file + "Nothing yet.")
- [~] **Independent test** — an attached image and a produced image, clearly
      told apart. **Half reached**: the attached image is real and live
      (a genuine signed Storage URL, confirmed via `naturalWidth`/`naturalHeight`);
      the produced image side has no live counterpart for the same reason as
      scenario 1.
- [x] Both-empty: a fresh conversation still shows the whole-panel empty
      state. Live-verified (a real session with zero attachments and zero
      produced files — "Nothing produced yet", Mono surface)
- [x] Console clean — checked after every interaction this pass
      (`agent-browser errors`/`console`); only Fast Refresh/HMR noise

## A2 — The four states

- [~] All four, re-walked with both groups present. **Populated** (sent-only)
      and **both-empty** are live-verified with real content. **Loading** and
      **Error** are unchanged code (`ConversationItemsSkeleton` and the error
      `<Empty>` block are the exact same JSX `T-AM3-02` already exercised
      live — AM4 only added a conditional wrapper around the populated case,
      neither touches loading/error) — not re-walked pixel-by-pixel this pass
      since nothing in their code path changed, but not a fresh live check
      either; carrying `T-AM3-02`'s own coverage forward rather than re-ticking
      it on new evidence.
- [x] The "at a glance" claim tested honestly in **Mono**: both the populated
      (produced-empty + sent-populated) and both-empty cases render with the
      section labels doing all the work — no colour-only distinction anywhere
      in `SectionLabel` or `ProducedItem`.
- [x] Both themes, desktop panel and phone sheet — light (Paper, desktop,
      composer-driven), dark (Paper, desktop + 375px sheet), dark (Mono,
      desktop, both populated and both-empty)
- [x] Keyboard traversal across both groups; Escape closes the sheet —
      live-verified via a genuine keyboard walk (Tab from the model selector,
      Enter to open, Escape to close), and **found a real defect doing it**:
      see Result.

## B — What must NOT have changed

- [x] `SentAttachmentChip` renders on user messages in the transcript exactly
      as band 26 shipped it — live-verified (screenshot: "verify.png 70 B"
      pill, unchanged) — AM4 touched no file that defines it
- [~] The inline produced strip from `T-AM2-02` is unaffected. Confirmed by
      reading `chat-bits.tsx`: untouched by any AM4 diff, and its own use of
      `ProducedItem`/`ProducedItemViewer` is identical to before. It shares
      the one real code change this task made (the focus-restoration fix in
      `produced-item.tsx`, below) — a fix, not a behavior change, but not
      live-exercised on this specific surface since it needs a real
      agent-produced attachment on an assistant message, which no daemon
      exists to create.
- [x] A project chat still shows its project card — live-verified ("Verify
      project chat card" session: "Verify Project" card + terminal link,
      rendering above the whole-panel empty state, unaffected by AM4)
- [~] Band 26's session rename, archive, delete and auto-title all still
      work. **Auto-title live-verified** (see next item). Rename/archive/delete
      were not re-walked this pass — AM4's diff shares no file with any of
      the three, and `CS6`'s own verification (`T-CS6-02`) already covered
      them; re-testing UI flows with zero code overlap would be checking that
      nothing changed by testing something nothing could have changed, so
      this leans on that prior coverage rather than repeating it.
- [x] `enqueue_chat_turn` still auto-titles a fresh session — live-verified:
      sent "Auto-title regression smoke check" in a new session, title
      updated from the placeholder to the message text in both the header and
      the session list. Confirms `029` (this band's only migration) left
      `enqueue_chat_turn` alone, consistent with its diff touching only
      `ingest_chat_turn_reply`.

## C — The spec's success criteria, graded as a whole

- [~] **SC-001** — ask for an image, see it, without leaving the conversation
      or touching the machine. **Not reachable**: needs a live daemon to
      actually produce a file. `G-55`.
- [~] **SC-002** — no reply claims something the app then fails to show. The
      over-limit-file half is unit-tested (`T-AM1-02`'s outbox refusal, 8
      passing tests) but not live-triggered — that also needs a live daemon.
      The "reply mentions a file it never produced" half is satisfied
      structurally rather than adversarially tested: text and the produced
      list are fully decoupled (a reply's `content` is independent of
      `produced[]`), so a model's text falsely claiming production is just
      false text — the same failure mode chat already has today, not a new
      one this band introduces. Not exercised with a real false claim.
- [x] **SC-003** — phone, machine off, every item still viewable. `T-AM3-02`'s
      substitute stands (no second-device precondition exists in this
      environment) — carried forward, not re-earned. What *did* newly reach
      this pass: `T-AM4-01` proved the phone sheet renders **real, populated**
      content (not just empty-state chrome) for the first time in this band's
      whole verification chain — a genuine step past what `T-AM3-02` could
      reach, even though the SC's own literal precondition (a stopped daemon
      + a second device) is still unmet.
- [~] **SC-004** — ten-plus turns, find a named item without scrolling the
      transcript. Not empirically proven (would need 10+ turns of real
      produced files — no daemon). Architecturally satisfied: the panel is one
      session-scoped read (`sessionAttachments()`), independent of which turns
      are paginated into the DOM — by design, per `AM3` decision 3 — so
      scrolling the transcript cannot hide an item from the panel. Design
      confirmed by reading the code; scale not exercised with real data.
- [x] **SC-005** — a conversation that produced nothing is **byte-identical**
      to `development`. Two halves: the **transcript** side is confirmed by
      reading `chat-bits.tsx` — `message.attachments?.length ? (...) : null`
      gates the entire strip `<div>`, not just its contents, so a reply with
      no attachments renders no added node, exactly as `T-AM1-04`/`T-AM2-03`
      already established and nothing in `AM4`'s diff touches this file. The
      **panel** side is live-verified: a real zero-attachment session renders
      the identical whole-panel empty state `T-AM3-02` first confirmed, word
      for word. Not done: an actual screenshot-diff or DOM-diff against a
      running `development` checkout side by side — this grades on the two
      components' own logic and `T-AM3-02`'s prior direct comparison, not a
      fresh pixel-level re-comparison this pass.
- [x] **FR-010** — workspace A cannot read workspace B's produced file. Carried
      forward from `T-CS5-01`'s own live cross-workspace test (two real
      disposable accounts, two real workspaces: cross-workspace read and
      write both genuinely denied) — the storage policy that enforces this
      (`025_chat_attachments_storage.sql`) is untouched by band 27, confirmed
      by reading `029`'s diff, which only defines `ingest_chat_turn_reply`
      and touches no `storage.objects` policy. Not re-run with a third pair
      of accounts, since nothing changed for it to re-prove.
- [~] **FR-016** — a project chat, an agent-edited file inside the project's
      own folder produces neither a row nor a stored object. Still not
      reachable — same daemon dependency as `SC-001`, and every phase before
      this one recorded the identical gap. `G-55`, unchanged in kind by this
      task.

## D — What still needs something that doesn't exist

- [x] Anything `T-AM3-02` could not reach and recorded — carried forward, not
      re-ticked here without new evidence. Specifically: `SC-003`'s
      stopped-daemon-plus-second-device precondition, and the Loading state's
      gap (`agent-browser network route --body` has no delay option). Both
      still stand exactly as `T-AM3-02` left them; see `G-55`.

## E — Regression surface

- [x] `pnpm -r typecheck` and `pnpm -r test` green — clean typecheck across
      all 7 workspace projects; `apps/web` 515/515, `@sparstrow/core` 776/780
      (4 pre-existing skips), `@sparstrow/shared` 334/334, `@sparstrow/desktop`
      28/28
- [x] `apps/web`, `@sparstrow/core` and `@sparstrow/shared` all build — all
      three `tsc --noEmit` clean
- [x] `get_advisors` clean — re-ran both security and performance advisors.
      Findings present are all pre-existing (`SECURITY DEFINER` WARNs on
      functions band 27 never touched, unused-index INFOs on unrelated
      tables) — nothing new attributable to `029_chat_produced_files.sql`

## On completion

- [x] Update the phase `README.md` status line and its task table
- [x] Update the plan's **Status** row to `✅ Completed <date>` — or name the
      gap that stops it, rather than rounding up. Done: `✅ Completed
      2026-08-29, except G-55`
- [x] Knowledge Center: final pass on `chat-and-inbox.md`, and **re-read the
      four global-claim pages**. Found and fixed a real gap: `T-AM4-01`
      shipped the "Sent by you" section without updating this article (a
      violation of `AGENTS.md` §3.2 that slipped through that task's own
      close-out) — added a paragraph describing it. The four global-claim
      pages (`what-is-sparstrowgen.md`, `first-run-setup.md`,
      `limitations.md`, `providers-and-execution-modes.md`) were re-read;
      none makes a claim this band contradicts — `limitations.md` in
      particular does not say the app can't show what an agent generates (the
      task doc's guess was wrong; nothing there needed changing)
- [x] **Every unreached assertion written into
      [`../../KnownGaps.md`](../../KnownGaps.md)** — `G-55` extended once
      more, closing this task
- [x] Close the loop on the feedback items this band answers. Three files
      touched, one real gap fixed in the process:
      - `FB-2026-08-27-chat-missing-file-upload` — this was actually band
        26's item (US4, the input/upload half), never flipped from `🟡
        triaged` after `CS6` shipped it. Closed here since it's the sibling
        half of the same "files and media in chat" ask this band completes.
      - `FB-2026-08-28-chat-generated-media-not-shown-in-chat` and
        `FB-2026-08-28-media-input-output-folder-preview-pane` — the two
        that graduated into `I-16` and then this whole plan. Both closed,
        with what was actually built named against each one's own ask.
      - `I-16` deleted from `Ideas.md` per its own stated instruction ("delete
        it once the spec is reviewed and planned") — both conditions are now
        true.
      - Also found and fixed, in passing: `doc/feedback/README.md`'s index
        had duplicate rows for both `FB-2026-08-28-*` items — a stale `🔴 new`
        row sitting below each one's already-updated `🟢 routed` row, never
        removed when triage happened. Removed the stale rows.

## On closing the band

These happen **in the commit that lands `band/27-seeing-what-my-agent-made` on
`development`**, not in any task branch (`AGENTS.md` §2.9):

- [ ] Flip every band 27 row in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
- [ ] Archive band 27 to `CompletedMasterQueue.md` per
      [`../README.md`](../README.md#archiving-a-finished-band)
- [ ] Merge `development` into the band branch first (`AGENTS.md` §2.4)

## Result

Band 27 is done except `G-55` — a live-daemon proof no environment available
here can supply, unchanged in kind since `T-AM1-04` first named it. Everything
reachable without one was reached this pass, and one genuine defect was found
and fixed doing it.

**The defect: closing the produced-item viewer lost keyboard focus to
`<body>`.** Found via a real keyboard walk (Tab to the panel item, Enter to
open, Escape to close) — not a synthetic click, which had masked it in every
earlier task's verification. Root cause: `ProducedItemViewer`
(`produced-item.tsx`) never renders a `DialogTrigger` — the button that opens
it lives in a sibling `ProducedItem` instance, in a different part of the
tree entirely. Radix's own close-focus restoration keys off a trigger ref
that only `DialogPrimitive.Trigger` populates; with none in this tree it has
nothing to focus back to and falls through to `<body>`. Fixed by having
`ProducedItemViewer` capture `document.activeElement` itself, in a
`useEffect` keyed on `open` transitioning to `true`, and restoring it via
`onCloseAutoFocus`. Fixed once, in the shared file, so it covers both
surfaces that use it (`AM3`/`AM4`'s panel and sheet, and `T-AM2-02`'s inline
reply strip) without touching either caller. Live-verified fixed on the panel
surface (the only one reachable without a daemon); the inline-strip surface
inherits the identical fix but has no live proof of its own, for the same
reason as everything else in `G-55`.

Getting to that finding took a genuine wrong turn worth recording: an initial
Tab-count trace seemed to show the panel item missing from tab order
entirely. That was a false alarm from two compounding mistakes — my own
inspection script had no fallback for an image-only button's accessible name
(so it printed a blank label I misread as "missing"), and a disabled `Send
message` button (no paired machine) sits in raw DOM order but is correctly
skipped by real Tab navigation, throwing off a naive count. Resolved by
anchoring on a known element and checking one Tab at a time by content, not
by counting — worth remembering: a keyboard-nav check needs adjacency, not
DOM-order presence.

**Regression sweep.** `SentAttachmentChip`, the project card, and
`enqueue_chat_turn`'s auto-title were all live re-confirmed unaffected.
Rename/archive/delete were not re-walked — zero file overlap with this
band's diff, and re-testing UI flows nothing could have touched checks
nothing. `get_advisors` clean relative to `029` specifically (pre-existing
findings only).

**Documentation debt closed, not just the code.** `chat-and-inbox.md` was
missing the "Sent by you" section `T-AM4-01` shipped — fixed. Three feedback
items closed out, including one from band 26 (`FB-2026-08-27-chat-missing-file-upload`)
that had sat un-flipped since `CS6` shipped it, and a duplicate-row bug in
`doc/feedback/README.md`'s own index fixed in passing. `I-16` deleted from
`Ideas.md` per its own stated deletion trigger, now satisfied.

**What is not reached, named precisely rather than rounded up:** `SC-001`,
`SC-002`'s adversarial half, `SC-004`'s scale claim, and `FR-016` all still
need a live daemon this environment cannot supply — every one is either
unit-tested or architecturally satisfied by reading the code, never both
claimed as one. `G-55` carries the exact list forward.

Full regression numbers: `pnpm -r typecheck` clean across all 7 workspace
projects; `pnpm -r test` — `apps/web` 515/515, `@sparstrow/core` 776/780 (4
pre-existing skips), `@sparstrow/shared` 334/334, `@sparstrow/desktop` 28/28.

**Band close-out** (queue flip, archive, merging `development` into the band
branch first, then the band → `development` PR) happens next, as a separate
step after this task's own PR lands on the band branch — per `AGENTS.md`
§2.9, the queue and archive are touched only in the commit that lands the
*band* on `development`, never in a task branch.
