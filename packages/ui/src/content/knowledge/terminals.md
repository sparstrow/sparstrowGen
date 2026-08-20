---
title: Terminals
section: Surfaces
description: Real embedded shells on your machine, inside the app.
order: 13
updated: 2026-07-13
---

The **Terminals** page hosts real shell sessions — full xterm terminals running on your
machine, streamed into the UI over the local WebSocket.

## What it's for

- Poking at a project directly (run the tests yourself, check `git status`) without
  leaving the factory.
- Watching something an agent just did, in the same environment it did it.
- Quick fixes that don't deserve a task.

Open multiple sessions; each is independent and keeps its scrollback while the app is
open.

## Notes & limitations

- A terminal is **your** shell with **your** user's full permissions — agent tool
  policies do not apply to what you type here. The factory's guardrails govern agents,
  not you.
- Sessions live in the core service: closing a tab ends that session; there's no
  detach/reattach like tmux.
- This is the one surface where you can do anything the factory would never let an
  agent do — treat it with the same care as any terminal.
