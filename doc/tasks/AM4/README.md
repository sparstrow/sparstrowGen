# AM4 — see what I sent alongside what the agent made

| | |
|---|---|
| **Plan** | [`../../plans/2026-08-28-seeing-what-my-agent-made.md`](../../plans/2026-08-28-seeing-what-my-agent-made.md) (AM4) |
| **Kind** | **serves US3** — ends in: one place answers what went in and what came out |
| **Spec** | [`../../specs/2026-08-28-seeing-what-my-agent-made.md`](../../specs/2026-08-28-seeing-what-my-agent-made.md) |
| **Depends on** | AM3 |
| **Blocks** | — |
| **Status** | 🟡 in progress — T-AM4-01 done, T-AM4-02 remains |
| **Open questions** | none |

## The story this serves

> **US3 — See what I sent alongside what the agent made** (P3)
>
> The same panel also lists the files and images you attached to your own
> messages, kept visually distinct from what the agent produced, so one place
> answers "what went into this conversation and what came out".

**Acceptance scenarios this phase must satisfy:**

1. **Given** a conversation where I attached two files and the agent produced
   one, **When** I open the panel, **Then** all three appear, and I can tell at a
   glance which came from me and which from the agent.
2. **Given** a conversation where I attached files but the agent produced
   nothing, **When** I open the panel, **Then** my attachments are listed and the
   agent's side explains it is empty — not an error.

**Independent test:** In a conversation where you attached an image and the
agent produced one, open the panel and see both, clearly told apart.

## The four states

The panel's states are AM3's and are unchanged. What AM4 adds is a **second
empty state that can occur while the first does not** — scenario 2's "my files
are here, the agent's side is empty".

| Sub-surface | Populated | Empty | Loading | Error |
|---|---|---|---|---|
| Produced group | The agent's items | "Nothing yet" in place, **not** an error — scenario 2 says so explicitly | Inherited from AM3 | Inherited |
| Sent group | The owner's attachments | Omitted entirely when the owner has attached nothing | Inherited | Inherited |

The asymmetry is deliberate and is the phase's one real design decision — see
decision 2.

## Tasks

| Task | Tag | Serves | Depends on | Status |
|---|---|---|---|---|
| [T-AM4-01 — fold in what I sent](T-AM4-01-sent-items.md) | `[C]` | US3 | T-AM3-01 | ✅ done |
| [T-AM4-02 — verification](T-AM4-02-verification.md) | `[S]` | US3 | T-AM4-01 | not started |

`T-AM4-01` is `[C]`, **not** `[P]`: it edits
`apps/web/src/components/chat/conversation-items.tsx`, which `T-AM3-01`
creates and owns. One worker at a time on that file. The plan named this
explicitly and it is still right.

## Objective

Turn AM3's produced-only list into the two-sided answer the owner originally
asked for — *"on input and output folder for media"* — without a new query, a
new column, or a second component.

## The shape of what was found

**The work is almost entirely already done by AM3's decision 3.**
`sessionAttachments()` returns both roles from the outset and carries
`messageRole`; `T-AM3-01` filters to `assistant` and adds a test pinning that.
AM4 removes the filter and adds a presentation split. There is no data work in
this phase at all.

**Inbound attachments already render on user messages** as
`SentAttachmentChip` ([`chat-bits.tsx:33`](../../../apps/web/src/components/chat/chat-bits.tsx)),
shipped by band 26's `T-CS6-01`. That is the transcript treatment and it stays.
AM4 is a second view over the same rows, exactly as the spec says.

**`ProducedItem` handles both without change.** It renders from an attachment
row and knows nothing about provenance — the distinction is the caller's to
draw, which is what makes decision 1 cheap.

## Definition of done

- Both acceptance scenarios above, walked in the running app
- A conversation with only sent files, and one with only produced files, both
  read correctly — neither shows an error
- The distinction is legible without hovering, reading a tooltip, or relying on
  colour alone
- Light and dark, Paper and Mono, desktop panel and phone sheet
- `pnpm typecheck` and `pnpm test` stay green

**Not in this phase:** any change to how attachments render inside the
transcript. `SentAttachmentChip` is untouched.

---

## Decisions already made

### 1. Two labelled groups, not one interleaved list with badges

"Made by your agent" and "Sent by you", in that order, each internally grouped
and ordered as AM3 already does. The spec asks the owner to tell them apart "at
a glance"; two headings do that with no per-row ornament.

*Rejected: one chronological list with a per-row badge.* It reads as a single
stream in which provenance is a detail to check, and it makes scenario 2's
"the agent's side is empty" impossible to express — there is no side.

*Rejected: distinguishing by colour or icon alone.* Fails at Mono, and fails
anyone who does not already know the convention. `AGENTS.md` §3.11 and
`DESIGN.md` both push toward the label.

### 2. The produced group states its emptiness; the sent group just disappears

Scenario 2 requires "the agent's side explains it is empty — not an error", so
that group renders a quiet line when it has nothing. The sent group has no such
requirement and is omitted when empty — an owner who never attaches anything
should not see a permanent "Sent by you: nothing" in every conversation.

*Rejected: symmetric treatment.* It reads as tidier and produces a panel that
is two thirds empty scaffolding for the common case.

**When both are empty, AM3's whole-panel empty state wins** and neither group
heading renders. That copy already promises both halves (AM3 decision 4), so it
remains correct.

---

## Files

| Path | Change |
|---|---|
| `apps/web/src/components/chat/conversation-items.tsx` | edit — added `filterSentAttachments()` and `SectionLabel`, split `ConversationItems` into two sections |
| `apps/web/src/components/chat/conversation-items.test.ts` | new — unit tests for the four-case table, T-AM3-01's exclusion test updated in place rather than deleted |
| `apps/web/vitest.config.ts` | edit — added the missing `@` alias (a pre-existing gap, not planned scope; see `T-AM4-01`'s Result) |

**Correction:** `chat-attachments.ts` needed no change. `T-AM3-01`'s
`assistant`-only filter lived inside `groupProducedAttachments()` in the
component, not in the query — `sessionAttachments()` already returned both
roles. This task added a parallel function rather than dropping a filter that
turned out not to be misplaced.

## Traps

**`T-AM3-01` pinned "user rows are excluded" with a test.** That test is
correct for AM3 and wrong after AM4. Update it rather than deleting it — it
should become "user rows appear in the sent group", so the behaviour stays
pinned in both directions.

**The whole-panel empty state must not be shadowed.** With two groups it is
easy to render "Made by your agent — nothing yet" plus an omitted sent group,
and never reach AM3's empty state at all. Check the both-empty case explicitly;
it is the common one for a brand-new conversation.

**A conversation can now show an item whose message is not in the transcript.**
Already true after AM3, but AM4 doubles the ways to reach it. Clicking a sent
item opens the viewer; it does not scroll the transcript to the message. That
is the intended behaviour — say so rather than treating it as missing.

## Verification

Full procedure in [T-AM4-02 — verification](T-AM4-02-verification.md).
