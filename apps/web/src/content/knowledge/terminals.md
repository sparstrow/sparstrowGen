---
title: Terminals
section: Surfaces
description: A real shell on one of your machines, reachable from any browser you're signed in on.
order: 13
updated: 2026-09-02
---

The **Terminals** page opens a real shell — or an interactive agent's own
command-line tool — running on one of your connected machines, from any browser
you're signed in on. It says whose computer you're on, and the session
outlives the tab: close it, come back later, from a different browser even,
and it's still there with everything it printed while you were gone.

## What it's for

- Poking at a project directly (run the tests yourself, check `git status`)
  without leaving the browser.
- Watching something an agent just did, in the same environment it did it.
- Talking straight to an agent's own CLI — `claude`, `agy` — instead of going
  through a run.
- Quick fixes that don't deserve a task.

## Opening a session

Open **Terminals**. If one of your machines is on and allows it, you'll see
its name above the pane. Press **Shell** for a plain shell, or pick an agent
and press **Agent terminal** to land inside that agent's own CLI — only
agents whose provider actually has an interactive mode are offered.

Every session your machine is holding is listed, not only the ones this tab
opened — reopen Terminals from a different browser and you'll see the same
list. Click a session to attach to it; close it from the list, or from the
pane, when you're done with it.

A session ends when you close it, its shell exits on its own, the machine
restarts, or that machine's terminal access is switched off — the page says
which, rather than leaving you looking at a frozen pane.

## The off switch

Every machine has its own **Browser terminals** switch, on its row on the
[Machines](/knowledge/machines) page, next to the snapshot toggle. It's on
by default. Switching it off refuses any new session on that machine and
ends every session already open there — the machine enforces this itself, so
a browser can't talk its way around it. Only workspace owners and admins can
open a terminal or change this switch.

## Notes & limitations

- A terminal is **your** shell with **your** user's full permissions — agent
  tool policies do not apply to what you type here. See
  [Tool permissions](/knowledge/tool-permissions).
- This is the one surface where you can do anything the factory would never
  let an agent do — treat it with the same care as any terminal, on any
  machine you can reach from it.
- Typing in one tab shows up in every other tab watching the same session —
  it's a shared screen, the same session, not a private copy per tab.

## Known Limitations & Boundaries

- **Owner/admin only.** A workspace member who isn't an owner or admin
  can't open or attach to a terminal, and is told so rather than shown a
  button that fails.
- **Ten sessions per machine.** A machine refuses an eleventh with a reason,
  rather than failing opaquely or silently queuing it.
- **Scrollback is a 256 KB ring per session**, kept on the machine. Older
  output falls off the front as new output arrives.
- **Output faster than the page can show it is suppressed, with notice.** A
  command flooding the screen gets throttled rather than freezing the page
  or killing the session; a way to interrupt it is always on screen.
- **A typed character round-trips in under 200 ms** on a normal connection,
  from a browser on a different network than the machine.
- **No project-files or folder browsing here.** A terminal is a shell, not a
  file manager — reaching a machine's files without one is a separate,
  not-yet-built surface.
- **Nothing about a session is recorded in the cloud.** Who opened a shell
  and when lives on the machine and in its own logs, not in the control
  plane.
