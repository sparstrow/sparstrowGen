---
title: Machines
section: Surfaces
description: Pair a computer to your workspace, read whether it's reachable, and rename, revoke or remove it.
order: 8
updated: 2026-08-20
---

**Machines** is in the sidebar, under **Workspace**, directly after Runs. It lists every
computer running Sparstrow core that this workspace can reach.

Agents run on these machines, **not in the browser**. An empty list means nothing can
execute — no run will start, however healthy everything else looks.

## Pair a machine

1. Press **Pair a machine**. A short, single-use code appears with a live countdown.
2. On the computer you want to pair, run `sparstrow pair <code>`.
3. The machine appears in the list on its own — no refresh needed.

If core was already running on that computer, restart it so it picks up the new pairing.

> `sparstrow` isn't published yet. The machine needs a checkout of this repository to run
> the command. Packaged installers are planned but not available.

A code **works once and expires**. If it lapses before you use it, generate another — a
code that has already been redeemed can't be reused on a second machine.

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
right are **capability badges**: the providers that machine actually has installed and
usable, which is what the board uses to decide what it can be asked to do. A machine
with none reads **no providers**.

## Rename, revoke, remove

**Rename** — click the machine's name, type, press Enter. Escape cancels. The new name
is what that machine is called everywhere, including on the Runs page.

**Revoke** cuts the machine off on its very next request. The row stays in the list;
pairing it again with a fresh code restores access. Use it for a computer you no longer
control.

**Remove** deletes the machine and its pairing from the workspace, along with anything
recorded against it. The computer itself keeps its local data — pair it again to
reconnect.

Both ask you to confirm, and the dialog says which of the two you're about to do.

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
- **A pairing code works once and expires**, and cannot be re-sent or extended —
  generate a fresh one.
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
- **No per-machine detail page yet.** Everything a machine can tell you is on this one
  row; there is nowhere to drill into for its history or the agents that ran on it.
