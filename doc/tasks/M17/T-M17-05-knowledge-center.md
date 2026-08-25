# T-M17-05 — Knowledge Center

| | |
|---|---|
| **Tag** | `[P]` — markdown under `apps/web/src/content/knowledge/`, touched by nothing else |
| **Serves** | all four stories — `AGENTS.md` §3.2 |
| **Depends on** | T-M17-02 (the behaviour must be settled before it is described) |
| **Blocks** | — |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

## Objective

Make the Knowledge Center true about terminals. This is not a tidy-up: three
sentences in `terminals.md` are **already false today**, before this plan changes
anything, and are filed as
[`BUG-2026-08-24-terminals-article-describes-a-transport-that-no-longer-exists`](../../bug/BUG-2026-08-24-terminals-article-describes-a-transport-that-no-longer-exists.md).
This task closes that bug as well as documenting the new work.

## Decisions already made

**What is false right now, in `terminals.md` (`updated: 2026-07-13`):**

| The article says | The truth |
|---|---|
| "streamed into the UI over the local WebSocket" | The local WebSocket is unreachable from the hosted app; the page has been dead since the Vite host was retired (`D-24`) |
| "closing a tab ends that session; there's no detach/reattach like tmux" | False even before this plan — the manager has had a 10-minute detach grace with ring replay all along. After M16 it is false in the opposite direction: sessions survive until closed |
| "Open multiple sessions; each is independent and keeps its scrollback while the app is open" | Scrollback is the machine's, not the app's, and now outlives the app being open |

**What becomes true with this plan**, and must be described only once it is
built: terminals reachable from a browser; owner/admin only; sessions that
survive until closed, with a ceiling of ten; a per-machine off switch; output
suppression under flood.

**The article has no `## Known Limitations & Boundaries` section.** It has "Notes
& limitations", which is not the same heading. §3.2 requires the standard one.

**Re-read the four global-claim pages, not just this one.** §3.2 names them and
names this exact failure — M1–M3 shipped accounts and pairing while four pages
still said "one user, one machine, no accounts". This plan changes what the app
can reach *on* a machine and who is allowed to, which is a shape change:

- `what-is-sparstrowgen.md` — the mental model and architecture diagram
- `first-run-setup.md` — line 84 already mentions a terminal
- `limitations.md` — this plan removes a limitation and adds three (ten sessions,
  owner/admin only, output suppression)
- `providers-and-execution-modes.md` — interactive agent sessions are a provider
  behaviour

**And the three pages that link to terminals:** `navigating-the-app.md:17`,
`tool-permissions.md:47`, `projects-and-workspaces.md:74`. `tool-permissions.md`
is the one that matters — it says permissions govern agents and "your own
Terminals are outside" them, which is still true but now needs the owner/admin
sentence beside it, because "outside the permission system" reads very
differently when the terminal is reachable from any browser.

**Never document what is not built.** §3.2. Project files, folder browsing and
the other switched-off surfaces stay described as unavailable — this plan does
not ship them. Check `Deferred.md` and `KnownGaps.md` before writing any
capability sentence.

## Checklist

- [ ] `terminals.md` rewritten: what it is now, who may open one and why, session
      lifetime and the ceiling, the off switch, output suppression
- [ ] `terminals.md` gains a `## Known Limitations & Boundaries` section with the
      real numbers — ten sessions, 256 KB scrollback, the throttle threshold,
      owner/admin only, ends on machine restart
- [ ] The three false sentences above are gone
- [ ] `updated:` bumped on every article whose content meaningfully changed
- [ ] The four global-claim pages re-read and corrected where this plan made them
      wrong
- [ ] `tool-permissions.md` gains the owner/admin sentence
- [ ] `navigating-the-app.md` and `projects-and-workspaces.md` checked for stale
      claims about what Terminals can do
- [ ] Nothing describes project files, folder browsing, or any other `I-11`
      surface as available
- [ ] The bug file is marked resolved in place, pointing at this task

## Traps

**Overstating is the dangerous direction.** §3.2: a page once claimed `pgvector`
HNSW search over a column that had been deliberately removed. The tempting
overstatement here is "reach your machine from anywhere" — true of terminals,
false of files, folders, the code graph and everything else in `I-11`. Say
terminals.

**The limitations page is where this plan is most likely to leave a lie.** It
currently describes a product that cannot reach a machine from a browser at all.
Removing that limitation without adding the three new ones trades one wrong page
for another.

**A stale `updated:` date is its own small lie.** It is shown to users as a
freshness signal.

## Verification

- [ ] Every edited article renders at `/knowledge/<id>` with its breadcrumb and
      title correct — the `BUG-2026-08-24-knowledge-breadcrumb-title-silently-blank`
      failure shape
- [ ] `grep -rn "local WebSocket\|no detach/reattach" apps/web/src/content/knowledge/`
      returns nothing
- [ ] Read `limitations.md` end to end against `Deferred.md` and `KnownGaps.md`
      and confirm every sentence is still true
- [ ] The bug file's status row says resolved and names this task

## On completion

> **Do not edit [`../MasterTaskQueue.md`](../MasterTaskQueue.md) from this
> branch.** Its Status column is a mirror, flipped at integration on
> `development` by whoever hands out the next wave (`AGENTS.md` §2.8).
> Sibling tasks in this band are adjacent rows in one table, so ticking your
> own row conflicts with every one of them. Record this task's outcome in the
> **Status** row and **Result** section of *this* file.

- [ ] Update this file's **Status** row and the phase README's task table
- [ ] Mark the bug resolved and add it to `doc/bug/README.md`'s index row

## Result

*(filled in when the task lands)*
