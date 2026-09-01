---
title: Machines
section: Surfaces
description: Pair a computer to your workspace, read whether it's reachable, and rename, revoke or remove it.
order: 8
updated: 2026-09-01
---

**Machines** is in the sidebar, under **Workspace**, directly after Runs. It lists every
computer running Sparstrow core that this workspace can reach.

Agents run on these machines, **not in the browser**. An empty list means nothing can
execute — no run will start, however healthy everything else looks.

## Pair a machine

There's no button here for this any more — pairing starts on the computer itself, not in
the browser.

1. On the computer you want to pair, run `sparstrow pair`.
2. It opens your browser to a confirm screen, already signed in. Check the machine name
   and workspace, then press **Authorize this machine**.
3. The machine appears in this list on its own — no refresh needed.

Nothing is ever shown to copy or type. If core was already running on that computer,
restart it so it picks up the new pairing.

> `sparstrow` isn't published yet. The machine needs a checkout of this repository to run
> the command. Packaged installers are planned but not available.

> **`sparstrow pair` couldn't open a browser automatically?** It prints the URL to open
> manually — paste it into a browser **on that same computer**. The confirm step finishes
> by talking back to a listener only that machine can reach, so opening the link on a
> different device (a phone, a laptop) won't complete the pairing even though the page
> itself loads fine. A machine with no browser reachable from it at all — a bare headless
> server, most CI runners — can't be paired today; this is a known gap, not an oversight.

## What a row tells you

Each machine shows a tile with a status dot, its name, and a line of identity:

- **active** — core is running and checking in.
- **unreachable · last seen 4m ago** — nothing has checked in recently. This is
  deliberately vague: the app cannot tell a computer that was switched off from one
  that crashed, went to sleep, or lost its network, so it doesn't guess. The last-seen
  time is always shown so you can judge for yourself.
- **shutting down** — the machine declared it was stopping and is still reachable. Once
  it goes quiet it reads as unreachable like anything else.

After the state comes the operating system, the hostname, and the core version. To the
right are **capability badges**: the providers genuinely installed on that machine,
which is what the board uses to decide what it can be asked to do. A machine with none
reads **no providers**. A badge confirms the provider's CLI or key is present and
runnable — not that it's currently authenticated. A CLI whose login has expired still
shows as available; a run dispatched to it starts, then fails a few minutes later with a
clear auth error rather than failing instantly. If a run seems to hang and then fail,
check that provider's own login state on that machine.

## Rename, revoke, remove

**Rename** — click the machine's name, type, press Enter. Escape cancels. The new name
is what that machine is called everywhere, including on the Runs page.

**Revoke** cuts the machine off on its very next request. The row stays in the list;
pairing it again restores access — but see the note below, the same computer needs
`--force`. Use it for a computer you no longer control.

**Remove** deletes the machine and its pairing from the workspace, along with anything
recorded against it. The computer itself keeps its local data — pair it again to
reconnect, again with `--force` (see below).

> **Re-pairing the same computer needs `--force`.** Revoking or removing a machine only
> deletes its record in the workspace — nothing here can reach onto that computer's disk
> and clear the token it already stored, so the CLI still sees itself as paired. Plain
> `sparstrow pair` is refused with "already paired"; run `sparstrow pair --force` instead.
> This is the CLI protecting against silently moving a machine between workspaces, not a
> bug — it just means "pair it again" always means "with `--force`" when it's the same
> computer.

Both ask you to confirm, and the dialog says which of the two you're about to do.
Removing a machine that an agent is restricted to (see below) says so in the dialog
before you confirm — that agent isn't blocked afterward, it can just run anywhere again.

## Opening a machine's profile

Click the **chevron** at the end of a row (or open the row and press it with the
keyboard) to open that machine in its own tab, alongside the list. Clicking a machine
that's already open focuses its existing tab rather than opening a second one. Each
open tab has four sections down its own side navigation:

- **Overview** — the same diagnostics as the row, plus the machine's core version and
  whether a newer one is known to exist. That's an *awareness* note only — nothing here
  triggers a remote update. Updating a machine's `sparstrow core` install is still
  something you do on that computer directly.
- **Providers** — every capability this machine reported, each with its provider's own
  logo and an **available** pill. Same information the row's badges summarize, shown
  one per line with room to read the id.
- **Activity** — month-to-date spend across every run this machine executed, run count,
  and average duration, with **recent runs** listed below (agent, outcome, cost,
  duration, when). You can set an optional **monthly budget** here — it's a plain
  number you choose, purely a marker: going over it turns the total amber and adds an
  **over budget** badge, and nothing else happens. No run is ever blocked or slowed by
  it, and nothing alerts you outside this tab.
- **Settings** — the same Snapshot and Terminal switches as the row, plus **Agent
  access** (below) and the same Revoke/Remove controls as the row's own actions.

### Agent access

A machine's Settings tab can list which agents are **restricted** to it — an agent
you've restricted here may run on this machine and nowhere else. An agent with no
restriction at all may run on any machine; restricting it to one machine is something
you opt into per agent, not a default anyone starts with. Add a restriction with
**Restrict an agent to this machine**, and lift one any time with **Remove** next to
its name — lifting it doesn't move the agent anywhere, it just widens where it's
allowed to run again.

## Snapshot uncommitted work

Each row carries its own switch for work-in-progress snapshots on that machine. It shows
what the machine last **confirmed**, not what you last clicked — so if the change didn't
reach the computer, the switch doesn't move.

The switch is **disabled while a machine is unreachable**, with the reason stated.
Nothing is queued for later: a setting you believe you changed on a computer that is
switched off is worse than a control that refuses.

What the snapshots themselves are, and how to recover from one, is in
[Settings](/knowledge/settings).

## Known Limitations & Boundaries

- **`sparstrow` is not installable yet.** Pairing requires a development checkout of the
  repository on the target machine. This is the single biggest friction in the flow and
  it is known, not overlooked.
- **Pairing needs a browser on the machine being paired.** A headless server, most CI
  runners, or anything with no local browser and nothing forwarding one can't be paired
  today — the old code-you-could-type-anywhere flow is gone, and nothing has replaced its
  ability to pair a machine you can't open a browser on.
- **A pairing attempt expires after 5 minutes** if nobody confirms it — run the command
  again to start a fresh one.
- **Status is inferred from the last check-in, not announced.** A machine reads as
  unreachable roughly **90 seconds** after it stops. A machine that crashes looks
  identical to one that was shut down cleanly, because from the workspace's side it is.
- **Revoking is immediate but not retroactive.** It stops the next request; work already
  in flight on that machine is not recalled.
- **Snapshot settings are per machine and only editable while it is reachable**, since
  the change is carried to the machine rather than stored centrally.
- **The list polls every 15 seconds.** A machine crossing the staleness threshold
  changes nothing in the database, so there is nothing to push — expect up to that much
  delay before a label changes.
- **The Activity tab's totals cover at most the 500 most recent runs in the current
  calendar month.** A machine with more runs than that in one month shows a real total
  that undercounts, flagged in the tab itself rather than silently — this is a display
  ceiling, not a bug.
- **A monthly budget is a marker, not a limit.** Setting one only recolors the total and
  adds a badge past it. There is no alerting, no email, no run-blocking, and no history
  of past months — it reflects only the current calendar month, live.
- **"Update available" on a machine's Overview tab is read-only.** It compares the
  machine's reported core version against the newest version this app knows about — it
  does not, and cannot, push an update to that machine. There is no remote-update
  mechanism for `sparstrow core` at all today; the desktop app's own updater is a
  separate, local-only thing for the Electron shell itself, not for a paired machine's
  daemon.
