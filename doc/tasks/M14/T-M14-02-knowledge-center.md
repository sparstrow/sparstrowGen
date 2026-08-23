# T-M14-02 — the Knowledge Center names the specific waiting states and the 24h wait

| | |
|---|---|
| **Tag** | `[P]` — one markdown file, no code overlap with T-M14-01 |
| **Serves** | US2 |
| **Depends on** | — (can be written from the spec/plan; doesn't need T-M14-01's code to land first, though the wording it documents is T-M14-01's) |
| **Blocks** | — |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

## Objective

`packages/ui/src/content/knowledge/chat-and-inbox.md`'s Known Limitations
bullet on sending already says the true, load-bearing thing — "you're told
plainly and pointed at pairing rather than left with a dead end" — and stays
accurate once T-M14-01 ships three specific cards instead of one generic
notice; nothing here contradicts M14. What it doesn't say yet, because it
wasn't true until M14: that a Project session can be told **specifically**
that no online machine has that project, and that an unanswered message
doesn't wait forever.

## Decisions already made

Extend the existing bullet (`chat-and-inbox.md` line 47-49) rather than
adding a new one — it is already the right paragraph, just incomplete:

```md
- **Sending needs at least one paired machine that's currently online, and —
  for a Project session — that machine needs the project checked out
  locally.** With none paired, all paired machines offline, or the right
  project unavailable anywhere online, you're told plainly which of the
  three it is and pointed at pairing rather than left with a dead end.
- **An unanswered message waits up to 24 hours**, then is marked as having
  taken too long rather than left waiting silently forever; retry is offered
  once M15 ships it.
```

The second bullet's "once M15 ships it" clause is deliberate — per
`AGENTS.md` §3.2, never document a capability ahead of when it actually
exists. If T-M15 lands and this file is edited after, drop that clause.

## Checklist

- [ ] Apply the wording above to `chat-and-inbox.md`'s Known Limitations
      section
- [ ] Bump the `updated:` frontmatter date
- [ ] Re-read the four global-claim pages (`what-is-sparstrowgen.md`,
      `first-run-setup.md`, `limitations.md`, `providers-and-execution-modes.md`)
      for anything that describes chat's waiting behavior more vaguely than
      this — none are expected to need a change (M13's own pass already
      covered chat generally), but the check itself is the requirement, not
      just this file's edit

## Traps

**Don't describe the TTL as configurable.** The plan's Scope boundaries
section explicitly ran the settings check and concluded no dial is built —
see [M14/README.md](README.md)'s Traps. Documenting one that doesn't exist
is the overstating failure mode `AGENTS.md` §3.2 calls out by name.

## Verification

- [ ] The edited article reads correctly rendered in the Knowledge Center UI
      (`/knowledge/chat-and-inbox`), light and dark

## On completion

- [ ] Tick 18.13 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
- [ ] Update this file's **Status** row

## Result

<!-- Filled in when the task lands. -->
