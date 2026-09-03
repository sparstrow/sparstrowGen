# T-M17-05 — Knowledge Center

| | |
|---|---|
| **Tag** | `[P]` — markdown under `apps/web/src/content/knowledge/`, touched by nothing else |
| **Serves** | all four stories — `AGENTS.md` §3.2 |
| **Depends on** | T-M17-02 (the behaviour must be settled before it is described) |
| **Blocks** | — |
| **Phase spec** | [README.md](README.md) |
| **Status** | done (2026-08-27) |

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

- [x] `terminals.md` rewritten: what it is now, who may open one and why, session
      lifetime and the ceiling, the off switch, output suppression
- [x] `terminals.md` gains a `## Known Limitations & Boundaries` section with the
      real numbers — ten sessions, 256 KB scrollback, the throttle threshold,
      owner/admin only, ends on machine restart
- [x] The three false sentences above are gone
- [x] `updated:` bumped on every article whose content meaningfully changed
- [x] The four global-claim pages re-read and corrected where this plan made them
      wrong — `what-is-sparstrowgen.md` and `first-run-setup.md` re-read, found
      still accurate, left untouched (see Result); `limitations.md` and
      `providers-and-execution-modes.md` edited
- [x] `tool-permissions.md` gains the owner/admin sentence
- [x] `navigating-the-app.md` and `projects-and-workspaces.md` checked for stale
      claims about what Terminals can do — both still accurate, no edit needed
- [x] Nothing describes project files, folder browsing, or any other `I-11`
      surface as available
- [x] The bug file is marked resolved in place, pointing at this task

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

- [x] Every edited article renders at `/knowledge/<id>` with its breadcrumb and
      title correct — live, real browser: `terminals`, `limitations`,
      `tool-permissions`, `providers-and-execution-modes` all checked, breadcrumb
      and title correct on each, console clean
- [~] `grep -rn "local WebSocket\|no detach/reattach" apps/web/src/content/knowledge/`
      returns nothing — **true of `terminals.md`**; the grep also surfaced an
      unrelated pre-existing hit in `dashboard.md`, filed as its own bug rather
      than fixed here (see Result)
- [x] Read `limitations.md` end to end against `Deferred.md` and `KnownGaps.md`
      and confirm every sentence is still true — done; the new terminal bullets
      match what `T-M17-01`–`T-M17-04` actually shipped, not the plan's outline
- [x] The bug file's status row says resolved and names this task

## On completion

> **Do not edit [`../MasterTaskQueue.md`](../MasterTaskQueue.md) from this
> branch.** Its Status column is a mirror, flipped once per band in the commit
> that lands the band branch on `development` (`AGENTS.md` §2.9). Sibling
> tasks in this band are adjacent rows in one table, so ticking your own row
> conflicts with every one of them — including the parallel forks working
> beside you. Record this task's outcome in the **Status** row and **Result**
> section of *this* file.

- [x] Update this file's **Status** row and the phase README's task table
- [x] Mark the bug resolved and add it to `doc/bug/README.md`'s index row

## Result

`terminals.md` fully rewritten: what it is, opening a shell or an agent
session, the session list and lifetime (US2), the off switch and who may
use it (US4/FR-009), and a new `## Known Limitations & Boundaries` section
with the real numbers (ten sessions, 256 KB ring, owner/admin only, the
four end reasons, SC-001's 200ms figure, the two explicit scope boundaries
— no project files here, no cloud record of activity). All three sentences
the bug file named are gone.

**Global-claim pages, re-read per §3.2's own instruction, not just
grepped:** `what-is-sparstrowgen.md` and `first-run-setup.md` were read in
full against what M16/M17 actually ship and found still accurate — neither
claims anything about browser reachability that this plan contradicts, so
neither was touched (a real re-read reaching "no change needed" is a
different outcome than not reading it, and worth recording as such).
`limitations.md` gained the three new terminal-specific limitations the
phase README's Decisions section named (owner/admin only, ten-session
ceiling, output suppression) as a new "By design" bullet, and its existing
per-machine-settings bullet now names the terminal-access switch alongside
the WIP-snapshot one it already covered.
`providers-and-execution-modes.md` gained a paragraph connecting a CLI
provider to the interactive session `T-M17-03` built (US3), since that
page is where "what a provider can do" already lives.

**The three linking pages, checked individually:** `tool-permissions.md`
got the owner/admin sentence the task called for, next to its existing
"Terminals are outside this system" line — reads very differently now that
a terminal is reachable from any browser, which is exactly the
task's own reasoning. `navigating-the-app.md` (a sidebar link name) and
`projects-and-workspaces.md` ("agents — and you, in Terminals — do the
writing") were both re-read and found already accurate; neither needed a
change.

**Found a second, unrelated instance of the same bug class while
verifying — filed rather than fixed.** The task's own verification grep
(`local WebSocket|no detach/reattach`) also matched `dashboard.md`, whose
"Notes & limitations" section makes the identical false claim about the
attention queue ("updates live over the local WebSocket") — it is actually
a plain 5-second REST poll (`useAttentionQueue`), same root cause
(`wsHub`'s retirement from the hosted app) as the bug this task exists to
fix. Filed as
[`BUG-2026-08-27-dashboard-article-describes-a-transport-that-no-longer-exists`](../../bug/BUG-2026-08-27-dashboard-article-describes-a-transport-that-no-longer-exists.md)
rather than fixed here — `dashboard.md` is outside this task's file scope
(`apps/web/src/content/knowledge/terminals.md` and the named cross-reference
pages), and AGENTS.md's own guidance is to document a bug the turn it
surfaces, not to widen a task's scope to absorb it. Also flagged as a
standalone spawn-task suggestion for a quick follow-up session.

**Live-verified**, real signed-in browser session: `/knowledge/terminals`,
`/knowledge/limitations`, `/knowledge/tool-permissions`, and
`/knowledge/providers-and-execution-modes` all render with correct
breadcrumb, title, and content, no console errors — the specific failure
shape `BUG-2026-08-24-knowledge-breadcrumb-title-silently-blank` warns
about did not occur on any of them. Screenshot of the rewritten Terminals
article on file. `pnpm typecheck` green (no code touched by this task, but
confirmed nothing else regressed).
