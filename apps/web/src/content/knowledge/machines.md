---
title: Machines
section: Surfaces
description: Your computers connect themselves. Read whether one is reachable, add another, and rename, disconnect or remove it.
order: 8
updated: 2026-09-02
---

**Machines** is in the sidebar, under **Workspace**, directly after Runs. It lists every
computer running Sparstrow core that you can reach.

Agents run on these machines, **not in the browser**. An empty list means nothing can
execute — no run will start, however healthy everything else looks.

## The computer you're sitting at connects itself

If you're reading this in the desktop app, there is nothing to do. Signing in *is* the
proof that the computer is yours: the app connects it in the background and it appears in
this list within a few seconds, badged **This device**.

There is no pairing screen, no code, and no terminal step. If your computer isn't here a
few seconds after signing in, something failed — see
[Troubleshooting](#when-a-computer-doesnt-appear) below.

## Add a different computer

For a second machine — a desktop at home, a dev box, a server — use **Add a computer** at
the top of the list. It shows two commands to run on that machine and then waits.

1. Install the CLI on that computer.
2. Run `sparstrow setup`. It opens a browser, you sign in, and it keeps the runtime
   running in the background.
3. The dialog detects the machine the moment it comes online and the list gains a row.

Closing the dialog cancels nothing — the machine is connecting on its own end and will
appear whether or not you're watching.

> The `sparstrow` CLI isn't published yet. Another machine needs a checkout of this
> repository to run it. Packaged installers are planned but not available.

### A computer with no browser

A bare server or a CI runner has no browser to open. Create a token under
**Settings → API Tokens**, then on that machine run:

```
sparstrow setup --token=
```

Leaving the value empty prompts for it, so the token never lands in your shell history.
This is the same credential the desktop app creates for itself — there's nothing special
about a token you make by hand.

## One computer, all your workspaces

A computer belongs to **you**, not to a single workspace. Connect it once and it serves
every workspace you belong to, including ones you create later — there is no per-workspace
step and nothing to repeat.

That's why the same physical machine appears in each workspace's list, and why work sent
from either workspace runs on it. Switch workspaces from the menu at the top of the
sidebar.

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

## Staying reachable

A connected computer stays reachable whenever it's switched on — not only while the app's
window is open. Closing the window minimises to the tray, and by default **quitting the
app leaves the runtime running**, so tidying your taskbar doesn't take your machine
offline.

Both behaviours are switches under **Settings → Daemon**, along with a diagnostics block
showing whether the runtime is running, how long it's been up, and which server it reports
to. Turn *Keep running after quit* off and quitting makes that computer unreachable — the
list will say so.

## Rename, disconnect, remove

**Rename** — click the machine's name, type, press Enter. Escape cancels. The new name
is what that machine is called everywhere, including on the Runs page.

**Disconnect** cuts the computer off on its very next request. Because its credential is
yours rather than any one workspace's, this stops it reaching **all of your workspaces**,
not just the one you're looking at — the confirmation says so, and warns you if it's the
computer you're currently using. The row stays in the list, and connecting it again
restores access.

**Remove** deletes the computer from this workspace along with anything recorded against
it. The computer itself keeps its local data.

## When a computer doesn't appear

- **In the desktop app, and it's not listed.** The runtime may not be running. Open
  **Settings → Daemon** and check the diagnostics block — it names the failure.
- **You just signed in as a different person on that computer.** The machine transfers to
  the account that signed in most recently, and the previous account's workspaces lose it.
  That's deliberate, not a bug.
- **You created a workspace after connecting.** The computer picks up new workspaces on
  its next check-in, within about 30 seconds — or immediately if you restart it.
- **Nothing has access.** Check **Settings → API Tokens**. If the computer's token was
  revoked, it stops connecting and needs `sparstrow setup --force` to reconnect.

## Known Limitations & Boundaries

- **The `sparstrow` CLI is not installable yet.** Adding a computer *other than the one
  running the desktop app* requires a development checkout of the repository on that
  machine. The desktop app's own computer needs nothing.
- **A connection attempt expires after 5 minutes** if nobody confirms it — run
  `sparstrow setup` again to start a fresh one.
- **Reconnecting the same computer needs `--force`.** Disconnecting only deletes the
  record here; nothing can reach onto that computer's disk to clear the credential it
  stored, so the CLI still sees itself as connected. Plain `sparstrow setup` is refused
  with "already connected" — this is the CLI protecting against silently moving a computer
  between accounts.
- **Status is inferred from the last check-in, not announced.** A machine reads as
  unreachable roughly **90 seconds** after it stops. A machine that crashes looks
  identical to one that was shut down cleanly, because from the workspace's side it is.
- **Disconnecting is immediate but not retroactive.** It stops the next request; work
  already in flight on that machine is not recalled.
- **A machine's credential acts as you.** It is not limited to one workspace or one
  machine's worth of access. Anyone who obtains the token file from a computer can act as
  you until it's revoked, which is why **Settings → API Tokens** shows when each was last
  used. Treat a lost laptop as a reason to revoke, not just to disconnect.
- **Snapshot settings are per machine and only editable while it is reachable**, since
  the change is carried to the machine rather than stored centrally.
- **The list polls every 15 seconds.** A machine crossing the staleness threshold
  changes nothing in the database, so there is nothing to push — expect up to that much
  delay before a label changes.
- **No per-machine detail page yet.** Everything a machine can tell you is on this one
  row; there is nowhere to drill into for its history or the agents that ran on it.
- **Joining someone else's workspace is not designed for.** Your computer automatically
  serves every workspace you belong to, which is right while those are all your own. If
  you're ever added to a workspace you don't control, your machine would join it without
  asking — a per-machine opt-in for that case is planned and not yet built.
