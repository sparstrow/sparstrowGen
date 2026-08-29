# AM3 — everything this conversation produced, in one place

| | |
|---|---|
| **Plan** | [`../../plans/2026-08-28-seeing-what-my-agent-made.md`](../../plans/2026-08-28-seeing-what-my-agent-made.md) (AM3) |
| **Kind** | **serves US2** — ends in: find a thing from three days ago without scrolling |
| **Spec** | [`../../specs/2026-08-28-seeing-what-my-agent-made.md`](../../specs/2026-08-28-seeing-what-my-agent-made.md) |
| **Depends on** | AM1, and `T-AM2-01` for the viewer |
| **Blocks** | AM4 |
| **Status** | not started |
| **Open questions** | none |

## The story this serves

> **US2 — Find everything this conversation produced, in one place** (P2)
>
> The panel beside the conversation lists everything the agent made across the
> whole chat, newest first, grouped by the request that produced it — so you can
> find a thing without remembering which message it came from.

**Acceptance scenarios this phase must satisfy:**

1. **Given** a conversation where an agent produced files across three separate
   turns, **When** I open the panel, **Then** I see every file grouped under the
   request that produced it, newest group first.
2. **Given** a conversation where nothing has been produced yet, **When** I open
   the panel, **Then** it explains that things the agent makes will collect here,
   rather than showing a bare "Nothing to preview".
3. **Given** I am on a phone, **When** I open a conversation, **Then** I can
   still reach this list — it is not a desktop-only feature.
4. **Given** a file in the list that can no longer be loaded, **When** I try to
   open it, **Then** I am told plainly that it is unavailable and why, and the
   rest of the list keeps working.

**Independent test:** In a conversation where an agent produced several files
across different turns, open the panel and see all of them listed, each labelled
with the request it came from. Click one; it opens.

## The four states

From the spec's Interface & experience section — **the panel**.

| Surface | Populated | Empty | Loading | Error |
|---|---|---|---|---|
| The panel (≥`xl`) | Everything the conversation produced, newest first, grouped by the request it belongs to | An explanation that files the agent makes and files you attach collect here — replacing today's "Nothing to preview" | Rows shaped like real rows, matching the count where known | The panel says the list could not be loaded and offers retry; a single bad item says so on its own row and the rest stay usable |
| The same list below `xl` | Identical content in a sheet | Same copy | Same skeleton | Same |

## Tasks

Run order and concurrency live in [`../MasterTaskQueue.md`](../MasterTaskQueue.md).

| Task | Tag | Serves | Depends on | Status |
|---|---|---|---|---|
| [T-AM3-01 — the panel becomes the conversation's list](T-AM3-01-panel-list.md) | `[P]` | US2 | T-AM2-01 | not started |
| [T-AM3-02 — verification](T-AM3-02-verification.md) | `[S]` | US2 | T-AM3-01 | not started |

`T-AM3-01` is `[P]` against `T-AM2-02` — different files, both gated only on
`T-AM2-01`'s viewer. This is the fork point the plan named, and the two are
meant for two agents.

## Objective

Replace a placeholder that has always said "Nothing to preview" with the
conversation's own index of what it produced, and make it reachable on a phone
— which the current markup structurally prevents.

## The shape of what was found

**The panel is desktop-only by construction.**
[`chat.tsx:1620`](../../../apps/web/src/app/chat/chat.tsx) —
`<aside className="hidden w-80 shrink-0 flex-col border-l bg-sidebar xl:flex">`.
It is not merely narrow below `xl`; it is `display: none`. FR-008 ("reachable on
a phone") and scenario 3 therefore need a second presentation, not a CSS tweak.
The plan's phrase "reachable below `xl`" understates this — there is nothing to
reach today.

**The panel already has a non-placeholder branch.** For a session with a
`projectId` it renders the project name and a link to open a terminal. That is
real, useful content and predates this work. Removing it to make room for the
list would be a silent regression — see decision 2.

**Grouping "by the request that produced it" has a natural key already.** Each
produced attachment's `message_id` is the assistant message; that message's turn
had exactly one preceding user message. Grouping by assistant `message_id` and
labelling with the preceding user message's `content` gives the spec's "the
request that produced it" with no new columns.

**There is no query for this yet.** `attachmentsByMessageId`
([`chat-attachments.ts:22`](../../../apps/web/src/lib/chat-attachments.ts))
batches by message ids that a caller already has. A session-wide list needs its
own read — see decision 3.

## Definition of done

- All four acceptance scenarios above, walked in the running app
- All four states on the panel, at both `xl` and phone widths
- The project card is still reachable for a project chat
- Clicking an entry opens the **same** `ProducedItemViewer` `T-AM2-01` built
- Light and dark, Paper and Mono
- `pnpm typecheck` and `pnpm test` stay green

**Not in this phase:** the owner's own attachments. The list shows produced
items only; folding in what was sent is AM4, which is why the empty-state copy
below deliberately mentions both — see decision 4.

---

## Decisions already made

### 1. Below `xl`, the list is a Sheet opened from the conversation header

Shadcn `Sheet`, side `right`, triggered by a button that appears only below
`xl` so the desktop panel is not duplicated. The content component is shared;
only the container differs.

*Rejected: making the `aside` responsive.* It is 320px of fixed-width chrome
next to a conversation; at 375px it would leave the transcript unusable.

*Rejected: a route of its own.* It would take the owner out of the conversation
to look at something belonging to it, and back-navigation from a phone browser
is exactly where that gets lost.

### 2. The project card stays, above the list

For a project session the panel renders the existing project card, then the
list beneath it. Nothing that works today stops working.

*Rejected: replacing it.* Silent regression, and the terminal link is the only
in-app pointer to running a project's app from chat.

### 3. One session-scoped read, joined in the query, not N per message

A single Server Component read: attachments for the session, joined to their
message and that message's role and `created_at`, ordered newest first. It
belongs beside `attachmentsByMessageId` in `chat-attachments.ts`.

The query returns produced **and** attached rows from the outset — AM4 needs no
new query, only the presentation split. The distinction is `role` on the joined
message, per the plan's Decision 2.

*Rejected: deriving the list client-side from loaded messages.* A long
conversation paginates; the panel must list items from turns that are no longer
in the DOM, which is the entire point of the story.

### 4. The empty state names both halves, before AM4 exists

> "Files your agent makes — and files you attach — collect here."

This is what the spec asks the empty state to say, and it stays true after AM4
lands rather than needing a rewrite. It is a promise about where things appear,
not a claim that both are already listed.

*Rejected: mentioning only produced files now and editing it later.* The edit
would be forgotten; `AGENTS.md` §3.2's warning about documenting an intended
state applies to interface copy too — but here both halves are genuinely built
within this band.

---

## Files

| Path | Change |
|---|---|
| `apps/web/src/components/chat/conversation-items.tsx` | new — the grouped list, its four states, shared by panel and sheet |
| `apps/web/src/app/chat/chat.tsx` | edit — panel content, and the below-`xl` sheet trigger |
| `apps/web/src/lib/chat-attachments.ts` | edit — the session-scoped read |

## Traps

**`hidden … xl:flex` is `display: none`, not "small".** Testing at 1280px wide
proves nothing about scenario 3. Use `resize_window` at 375 and confirm the
sheet trigger is actually reachable.

**Grouping by turn is not grouping by message.** Two assistant messages can
belong to one session in sequence; the group label comes from the *preceding
user* message, and a session whose first message is an assistant one (possible
after AM1's FR-013 path) has no preceding user message. Fall back to the
timestamp rather than rendering an empty heading.

**The panel is inside `previewOpen`.** An owner who has closed the preview
panel has no way to reach the list at all on desktop. Confirm what `previewOpen`
defaults to and whether closing it should also hide this — the honest default
is that the list follows the panel's existing visibility, and that the sheet is
the always-available path.

**Do not re-implement the item.** `ProducedItem` from `T-AM2-01` renders each
row, including its own loading and unavailable states. Scenario 4 is satisfied
by using it, not by writing a second error treatment that will drift.

## Verification

Full procedure in [T-AM3-02 — verification](T-AM3-02-verification.md).
