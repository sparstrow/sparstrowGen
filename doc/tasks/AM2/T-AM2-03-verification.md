# T-AM2-03 — Verification

| | |
|---|---|
| **Tag** | `[S]` sequential — needs all of AM2 in place |
| **Depends on** | T-AM2-01, T-AM2-02 |
| **Blocks** | — |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

## Objective

Walk US1's six acceptance scenarios in the running app. This is the first pass
in the band where the owner's reported problem — *"I've generated a picture for
you!"* and an empty screen — is either fixed or not.

**What this pass may not be able to reach.** Vercel preview deployments were
unavailable across the whole 2026-08-28 billing period
([PR #175](https://github.com/sparstrow/sparstrowGen/pull/175)). If that is
still true, run the live pass against a local `apps/web` pointed at the same
Supabase project — the accepted workaround, not a deviation — and say so in the
Result. `AGENTS.md` §2.3's preferred form is the band branch's own preview;
prefer it if previews are back.

**Needs a real agent that will write a file.** Scenario 1 depends on a model
actually producing an image. If no available provider does so reliably, drive
the outbox directly from a scripted turn to prove the *app* half, and record
the model half as the gap — do not tick scenario 1 on a hand-placed file
without saying that is what happened.

## A — The acceptance scenarios

- [ ] **US1 scenario 1** — ask for an image in a fresh chat; the reply shows it;
      clicking opens a larger view
- [ ] **US1 scenario 2** — a non-image file shows name, kind and size with an
      open/save action, and no broken picture
- [ ] **US1 scenario 3** — a turn that produced a file and wrote no text shows a
      reply containing the file, with no empty prose block above it
- [ ] **US1 scenario 4** — a reply that *claims* a file it never produced shows
      **only text**, with nothing added — and is visually distinct from a file
      that failed to load (reach the latter by corrupting a `storage_path`)
- [ ] **US1 scenario 5** — a turn that failed after producing shows both the
      file and the failure
- [ ] **US1 scenario 6 (FR-016)** — in a `project` chat, files the agent writes
      inside the project folder appear nowhere in the conversation and no copy
      exists in storage
- [ ] **Independent test** — with only AM1 + AM2 present (AM3/AM4 absent), the
      image is visible in the reply and survives a reload
- [ ] Browser console clean on load and after opening the viewer

## A2 — The four states

- [ ] **Populated** — real produced image and real produced PDF in one turn
- [ ] **Empty** — a conversation that produced nothing renders with **no extra
      DOM node** under the reply. Verify by DOM inspection, not by eye: four
      pixels of margin is invisible and is still the SC-005 failure
- [ ] **Loading** — throttle the network; the skeleton appears at the reading
      column width and the layout does not jump when the image arrives
- [ ] **Error** — an attachment row whose object was deleted says
      "<name> couldn't be loaded" in place, and the rest of the reply is intact
- [ ] **Expiry** — leave a conversation with an image open for **six minutes**,
      then force a re-render (resize, or switch sessions and back). The image
      re-mints its URL rather than breaking. This is the phase's own trap 3 and
      it is invisible in any faster pass
- [ ] Both light and dark themes
- [ ] Paper and Mono surfaces
- [ ] Keyboard: Tab reaches an item, Enter opens, Escape closes, focus returns
- [ ] Nothing scrolls sideways at 375px

## B — What must NOT have changed

- [ ] **SC-005, stated as a regression check**: screenshot a text-only
      conversation on `development` and on this branch; they are identical
- [ ] Inbound attachment chips on user messages render exactly as they did
      after band 26 — this phase does not restyle them
- [ ] "Copy message", "Copy text" and "Copy as Markdown" all still produce what
      they did before
- [ ] The model caption under an assistant turn is unmoved
- [ ] A markdown image with an `https` src in reply text still renders; one with
      a local Windows path renders its alt text, not a broken glyph

## C — What can be verified today

- [ ] `pnpm -r typecheck` and `pnpm -r test` green
- [ ] `agent-browser` run captured: console output and a screenshot of a reply
      containing an image, per
      [`../../runbooks/agent-browser-session.md`](../../runbooks/agent-browser-session.md)

## D — What needs something that doesn't exist yet

**Needs AM3.** The per-conversation list.

- [ ] SC-004 — find an item from ten turns ago without scrolling
- [ ] SC-003 — phone, machine off

## E — Regression surface

- [ ] `pnpm -r typecheck` and `pnpm -r test` green
- [ ] `apps/web` builds

## On completion

- [ ] Update the phase `README.md` status line and its task table
- [ ] Update the plan's **Status** row
- [ ] **Knowledge Center pass — this is the phase where it is due.**
      `chat-and-inbox.md` gains a section on seeing what an agent made, with
      its `updated:` date bumped and a `## Known Limitations & Boundaries`
      entry for the 10 MB cap and the project-folder exclusion. **Re-read the
      four global-claim pages** (`what-is-sparstrowgen.md`,
      `first-run-setup.md`, `limitations.md`,
      `providers-and-execution-modes.md`) — `limitations.md` in particular may
      claim the app cannot show generated media
- [ ] **Every unreached assertion written into
      [`../../KnownGaps.md`](../../KnownGaps.md)**

> The queue flip happens once, in the commit that lands the band on
> `development` — not here.

## Result

<!-- What was actually run, and what it found. -->
