# T-AM4-01 — fold in what I sent

| | |
|---|---|
| **Tag** | `[C]` concurrent — edits `components/chat/conversation-items.tsx`, which `T-AM3-01` creates and owns. One worker at a time on that file |
| **Serves** | `US3` — see what I sent alongside what the agent made |
| **Depends on** | T-AM3-01 |
| **Blocks** | T-AM4-02 |
| **Phase spec** | [README.md](README.md) |
| **Status** | ✅ done |

## The scenario this satisfies

> 1. **Given** a conversation where I attached two files and the agent produced
>    one, **When** I open the panel, **Then** all three appear, and I can tell at
>    a glance which came from me and which from the agent.
> 2. **Given** a conversation where I attached files but the agent produced
>    nothing, **When** I open the panel, **Then** my attachments are listed and
>    the agent's side explains it is empty — not an error.

## Objective

Split AM3's list into "Made by your agent" and "Sent by you", using the
`messageRole` the query already returns. No new data, no new component.

## Decisions already made

**The split is by `messageRole`, per the plan's Decision 2** — the bound
message's role is the single source of truth for provenance, which is why no
`uploader_type` column exists.

```tsx
const produced = rows.filter((r) => r.messageRole === "assistant");
const sent     = rows.filter((r) => r.messageRole === "user");
```

**Group order and emptiness, per phase decisions 1 and 2:**

| Case | Renders |
|---|---|
| both non-empty | "Made by your agent" group, then "Sent by you" group |
| produced empty, sent non-empty | produced heading + "Nothing yet", then the sent group |
| produced non-empty, sent empty | produced group only; no sent heading |
| **both empty** | **neither heading — AM3's whole-panel empty state** |

The last row is the one to write a test for first; it is the common case for a
new conversation and the easiest to shadow.

**Sub-grouping by request stays inside the produced group only.** A sent
attachment's "request" is the owner's own message, so labelling it with that
message's text would repeat the filename's own context to no benefit. Sent
items are a flat list, newest first.

## Checklist

- [x] Remove the `assistant`-only filter (wherever `T-AM3-01` placed it) —
      **corrected**: there was nothing to remove. `T-AM3-01`'s
      `groupProducedAttachments` already filtered to `messageRole ===
      "assistant"` internally (it never rendered user rows, it just had no
      counterpart for them). This task added a parallel `filterSentAttachments`
      function rather than inverting a filter that was already scoped
      correctly — same net behaviour the doc's suggested code describes,
      arrived at without touching AM3's function.
- [x] Two labelled groups per phase decision 1
- [x] The produced group's "Nothing yet" line, which is **not** an error state
- [x] The sent group omitted entirely when empty
- [x] Both-empty falls through to AM3's whole-panel empty state
- [x] **Update `T-AM3-01`'s "user rows are excluded" test** to pin the new
      behaviour rather than deleting it (phase trap 1)
- [x] Tests for all four cases in the table above
- [x] Distinction is legible in Mono and in both themes, without colour alone
- [x] `apps/web` typecheck and tests green

## Traps

**Deleting `T-AM3-01`'s exclusion test instead of inverting it.** It is the
only thing pinning which rows land where; removing it leaves the split
untested in both directions.

**Rendering the sent group's items with a different component.** They are the
same shape and `ProducedItem` already handles them. A second component here is
how the two treatments drift apart over the next three months.

**Coordinate before starting.** `T-AM3-01` owns this file. Confirm its PR has
merged into the band branch before beginning — this is a `[C]` task and the
tag means exactly that.

## Verification

- [x] `pnpm --filter web test` green, all four cases
- [~] Live: a conversation with two attachments and one produced file shows
      three items under two clear headings — **partially reached**: no daemon
      exists anywhere in this band's verification chain, so there is no live
      conversation with an actual agent-produced file. What *was* reached
      live, for the first time in this band: a real `chat_message_attachments`
      row created through the ordinary composer (attach `verify.png`, send),
      rendered correctly under "Sent by you" as a real `ProducedItem` backed by
      a real signed Supabase Storage URL (confirmed via `img.naturalWidth` /
      `naturalHeight` / `complete`), opened in the real `ProducedItemViewer`
      dialog, and closed with Escape. The "both non-empty" combination (one
      produced + one sent) is proven only at the unit-test layer
      (`conversation-items.test.ts`, "both non-empty" case) — see `G-55`.
- [x] A conversation with attachments and no produced files shows the
      "Nothing yet" line, not an error — live-verified (the session above:
      "Made by your agent: Nothing yet." beside a real "Sent by you" item)
- [x] A brand-new conversation still shows AM3's whole-panel empty state —
      live-verified ("Say hello, this is a verification check" session,
      "Nothing produced yet")
- [x] Both themes, Paper and Mono, desktop and 375px — live-verified: light
      (Paper, desktop, from the composer-driven upload pass), dark (Paper,
      desktop and 375px sheet), dark (Mono, desktop, both the populated and
      both-empty cases)
- [ ] Scenario grading is `T-AM4-02` — not this task's job; unstarted, tracked
      there

## On completion

- [x] `pnpm typecheck` and `pnpm test` green
- [x] Update this file's **Status** row
- [ ] Open the PR into `band/27-seeing-what-my-agent-made`, then
      `gh pr merge <n> --auto --squash`

> **Do not edit [`../MasterTaskQueue.md`](../MasterTaskQueue.md) from a task
> branch.**

## Result

Shipped as designed, with one correction to the plan's suggested shape (see
the first checklist item) and one genuinely new proof this band hadn't had
until now.

**What changed.** `conversation-items.tsx` gained `filterSentAttachments()`
(mirrors `groupProducedAttachments()`'s shape, filters to `messageRole ===
"user"`, maps to `ChatMessageAttachment`, no sub-grouping — flat, newest
first) and a `SectionLabel` helper. `ConversationItems` now renders two
sections, "Made by your agent" and "Sent by you", per the phase's four-case
table; the both-empty case is unchanged from AM3 (same JSX block, same copy),
just re-gated on `produced.length === 0 && sent.length === 0` instead of
`groups.length === 0`.

**A pre-existing gap fixed in passing.** `apps/web/vitest.config.ts` was
missing the `@` alias `tsconfig.json` maps to `packages/ui/src` — the reason
`T-AM3-01` could not unit-test `groupProducedAttachments` at all (importing
`conversation-items.tsx` pulled in `Button`/`Empty`/`Skeleton` and failed at
collection). Rather than accept the same limitation again, added the missing
alias. `pnpm --filter web test` went 504 → 515, all passing, no regressions.

**Live verification reached further than any prior task in this band**,
because attaching a file to a real message needs no daemon — it's the
composer's own upload path. Using the `am27verify-…` disposable account
already signed in from `T-AM3-02`/`T-AM2-03`:

- Attached `verify.png` (a literal 1×1 PNG) to a new message in a fresh
  session and sent it, creating a genuine `chat_message_attachments` row with
  `role: "user"` — no synthetic SQL, no mock.
- Confirmed the panel splits correctly: "Made by your agent: Nothing yet."
  beside a real "Sent by you" item.
- Confirmed the item is a real image, not a placeholder: `img.naturalWidth` /
  `naturalHeight` were `1`/`1` (correct for a 1×1 PNG), `complete: true`, and
  `src` was a genuine signed Supabase Storage URL. The "solid-colour dot"
  appearance in the thumbnail is the test file's own nature, not a rendering
  defect.
- Opened `ProducedItemViewer` on this real item (disambiguated its trigger
  from the transcript's own `SentAttachmentChip` by comparing
  `agent-browser snapshot -i` ref numbers against surrounding DOM context),
  confirmed the enlarged image renders, closed it with Escape, checked
  `agent-browser console`/`errors` — clean (only Fast Refresh/HMR noise).
- Confirmed the same content in dark theme (desktop panel) and at 375px (the
  "Files this conversation produced" sheet trigger, disabled composer aside),
  and again under the Mono surface (both the populated case and, in a second
  session with zero attachments, AM3's original both-empty state).

**What is not reached, and why** (tracked in `G-55`, extended for this task
rather than opened fresh — same root cause, no live daemon in this band's
environment): the "produced + sent both non-empty" combination has no live
proof, because nothing in this environment can make the agent side non-empty
without a daemon. That combination is proven at the unit-test layer only.

**Not this task's job:** flipping `MasterTaskQueue.md`, archiving the band,
or grading the spec's acceptance scenarios — all `T-AM4-02`.
