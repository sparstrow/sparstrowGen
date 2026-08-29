# T-AM4-01 — fold in what I sent

| | |
|---|---|
| **Tag** | `[C]` concurrent — edits `components/chat/conversation-items.tsx`, which `T-AM3-01` creates and owns. One worker at a time on that file |
| **Serves** | `US3` — see what I sent alongside what the agent made |
| **Depends on** | T-AM3-01 |
| **Blocks** | T-AM4-02 |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

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

- [ ] Remove the `assistant`-only filter (wherever `T-AM3-01` placed it)
- [ ] Two labelled groups per phase decision 1
- [ ] The produced group's "Nothing yet" line, which is **not** an error state
- [ ] The sent group omitted entirely when empty
- [ ] Both-empty falls through to AM3's whole-panel empty state
- [ ] **Update `T-AM3-01`'s "user rows are excluded" test** to pin the new
      behaviour rather than deleting it (phase trap 1)
- [ ] Tests for all four cases in the table above
- [ ] Distinction is legible in Mono and in both themes, without colour alone
- [ ] `apps/web` typecheck and tests green

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

- [ ] `pnpm --filter web test` green, all four cases
- [ ] Live: a conversation with two attachments and one produced file shows
      three items under two clear headings
- [ ] A conversation with attachments and no produced files shows the
      "Nothing yet" line, not an error
- [ ] A brand-new conversation still shows AM3's whole-panel empty state
- [ ] Both themes, Paper and Mono, desktop and 375px
- [ ] Scenario grading is `T-AM4-02`

## On completion

- [ ] `pnpm typecheck` and `pnpm test` green
- [ ] Update this file's **Status** row
- [ ] Open the PR into `band/27-seeing-what-my-agent-made`, then
      `gh pr merge <n> --auto --squash`

> **Do not edit [`../MasterTaskQueue.md`](../MasterTaskQueue.md) from a task
> branch.**

## Result

<!-- Filled in when the task lands. -->
