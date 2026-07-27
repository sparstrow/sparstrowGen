# docs/deferred — the freezer

**Every feature we defer gets a file here, at the moment we defer it.** One file per item, named
`YYYY-MM-DD-<slug>.md`.

This is the **no silent scope-drop rule**: the moment you defer, cut, or say "later", "out of
scope", "not now", or "a follow-up" — write the entry before moving on. A deferral that only exists
in a chat message is a deferral that gets lost. See `CLAUDE.md`, Part II.

Nothing here is a promise to build. It's a waiting room with reasons attached. When an item's time
comes it is **revived as a fresh spec** in [`../specs/`](../specs/) and runs the normal
spec → plan → build flow.

## Entry format

```markdown
# <title>

- **source:** human-dream | agent-defer | review-outcome
- **project:** factory | <slug>
- **size:** S | M | L | XL
- **date:** YYYY-MM-DD
- **links:** <spec / plan / PR / commit>

**What:** the deferred scope, concretely enough to act on later.

**Why deferred:** the actual reason — not "no time".

**Revisit when:** the trigger that should bring it back. A condition, not a date.
```

`Revisit when` is the field that makes this a freezer rather than a graveyard. "When someone asks"
is not a trigger; "when a second consumer of this pattern exists" is.

## History

[`legacy-freezer.md`](./legacy-freezer.md) is the previous single-file ledger (~24 items,
2026-07-02 → 2026-07-15) kept whole rather than split. Still authoritative for what it records —
read it before assuming something is unrecorded. New items go in their own file here, not into it.
