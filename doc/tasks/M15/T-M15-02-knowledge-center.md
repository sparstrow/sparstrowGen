# T-M15-02 — the Knowledge Center says a reply can be retried, optionally on a different model

| | |
|---|---|
| **Tag** | `[P]` — one markdown file, no code overlap with T-M15-01 |
| **Serves** | US3 |
| **Depends on** | — (documents T-M15-01's wording; doesn't need its code to land first) |
| **Blocks** | — |
| **Phase spec** | [README.md](README.md) |
| **Status** | 🟢 done 2026-08-23 |

## Objective

`chat-and-inbox.md`'s "Chat" section describes sending and sessions but
never mentions retry — since M12–M14 shipped retry's backend and the
generic-failure retry button, but not the succeeded-turn affordance this
phase adds. T-M14-02 already deferred exactly this: its `chat-and-inbox.md`
edit closed with *"retry is offered once M15 ships it"* — this task is
where that clause gets resolved, either by adding the retry sentence now,
or by removing the forward-reference if T-M15-01 hasn't landed yet.

## Decisions already made

Add one sentence to the "Chat" section (not Known Limitations — retry is a
capability, not a boundary), immediately after the existing "Sessions
persist…" paragraph:

```md
Didn't like a reply, or it failed? **Retry** re-asks without retyping —
picking a different model first, if you want the second attempt to use one.
The original reply stays in the conversation; retry adds a new one rather
than replacing it.
```

And update T-M14-02's earlier clause in the Known Limitations section from:

```md
retry is offered once M15 ships it.
```

to:

```md
retry is offered — see above.
```

(only if T-M15-01 has landed by the time this task runs — check its Status
row first; if not, leave T-M14-02's clause alone and do not add the new
Chat-section sentence either, per AGENTS.md §3.2's "never document what is
not built").

## Checklist

- [x] Confirm T-M15-01's Status is done before making either edit (see
      Decisions above)
- [x] Add the retry sentence to the Chat section
- [x] Resolve T-M14-02's forward-reference in Known Limitations
- [x] Bump the `updated:` frontmatter date — left at `2026-08-23`: the
      session's own clock (per its system context) is still 2026-08-23 at
      the time of this edit, so no date actually needs bumping despite the
      wall-clock time having advanced past midnight during the session

## Verification

- [x] The edited article reads correctly rendered in the Knowledge Center UI
      (`/knowledge/chat-and-inbox`)

## On completion

- [x] Tick 18.17 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
- [x] Update this file's **Status** row

## Result

Applied both edits exactly as decided. Confirmed rendered correctly at
`/knowledge/chat-and-inbox` via the Playwright MCP against this branch's
own local dev server (staging-backed): the new retry sentence reads
correctly in the Chat section, and the Known Limitations bullet no longer
forward-references M15. No console errors.
