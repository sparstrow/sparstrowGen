---
title: Limitations & gotchas
section: Reference
description: The honest list — what Sparstrowgen deliberately doesn't do, and the sharp edges to know about.
order: 1
updated: 2026-08-20
---

Knowing the edges is part of knowing the tool. These are current and deliberate unless
marked otherwise.

## By design

- **Agents run on your machines, never in the cloud.** The cloud holds the board —
  workspace, agents, tasks, runs, memory text — so you can watch and steer from a
  browser. Execution needs a **paired machine that's switched on**. With none online you
  can plan, but nothing runs.
- **Your project files never leave the machine they're on.** Nothing syncs them. If a
  task is queued for a machine that doesn't have the project, it parks with four ways
  out — run it on a machine that does have it, point Sparstrowgen at the copy already
  on that machine, clone it there from the project's git remote, or unbind. Cloning
  needs a git remote; without one, the bytes only exist where they already are.
- **Work starts within a few seconds, not instantly.** A machine checks for new work
  every three seconds or so, so there's a short pause between pressing Run and the
  agent starting. Runs take minutes, so this is rarely noticeable.
- **Memory search is local.** Each machine embeds notes with a bundled model and
  searches its own index — fast, and it works offline. The cloud stores note *text*
  only, so searching by meaning from a phone isn't available; keyword search is.
- **Scheduler sleeps when the machine does.** Cron jobs fire only while that machine is
  running; missed fires are skipped, not back-filled.
- **Humans merge.** No agent can merge a PR or push a trunk branch — ever.
- **Nothing self-approves.** Delegations, quarantined imports, and memory contradictions
  wait in the attention queue until you act.

## Sign-in

- **Creating an account needs no email.** Email confirmation is currently off, so
  signing up puts you straight into the app. If you're waiting on a confirmation
  message, it isn't coming — you're already in.
- **A sign-in link only works if you already have an account.** For security the form
  gives the same answer either way, so if no link arrives, the likeliest reason is that
  no account exists for that address yet. Create one instead.
- **GitHub and Google sign-in are switched off.** The buttons show on the login page but
  are disabled until OAuth apps are registered. Use email and password, or a one-time
  sign-in link.
- **Sign-in emails are rate-limited** to a handful per hour on the current plan. Hitting
  `Email rate limit exceeded` means waiting a few minutes; password sign-in is
  unaffected.
- **Passwords aren't checked against known breaches** — that screening needs a paid
  plan. Use a password you don't reuse, or skip passwords with the emailed link.
- **One workspace per person.** There's no workspace switcher yet.

## Current sharp edges

- **Untrusted-run memory *writes*** — untrusted runs are detected and badged, and their
  notes are quarantined; but the strict write-clamp that sandboxes get is not yet
  applied to every untrusted run. Treat delegated/web-touching runs' notes with the
  quarantine review they land in.
- **Live run transcripts don't stream from the cloud yet.** A run's transcript fills in
  as it's saved rather than arriving keystroke-by-keystroke.
- **Cost is an estimate.** Prices come from static provider tables; new or local models
  may read as zero.
- **Direct-API agents have a smaller tool set** than CLI agents (the curated registry) —
  heavy file-editing jobs still belong to CLI providers.
- **Model discovery can go stale** — re-run *Discover models* in Settings after a
  provider ships new models.
- **Pipelines are linear**; branching orchestration lives in Goals.
- **Windows note:** the memory MCP surface is served over HTTP (not stdio) because
  headless stdio MCP is unreliable on Windows — nothing to configure, but useful to
  know if you wire external MCP clients.

## Known Limitations & Boundaries

- **A machine reads unreachable about 90 seconds after it stops.** Status is derived
  from the last check-in, so a crash and a clean shutdown look the same for that
  window — which is why the app says "unreachable" rather than naming a cause.
- **Pairing codes are single-use and expire.** Generate a new one per machine.
- **Some settings are per-machine, not per-workspace** — work-in-progress snapshots,
  for one. You can change them from the browser, but you change them *for one machine
  at a time*, on the [Machines](/knowledge/machines) page, because machines can
  legitimately disagree: a
  laptop with a small disk and a workstation with a large one have different right
  answers. The switch is disabled while a machine is offline rather than queueing a
  change against a computer that is switched off.
- **Platform quotas come from the hosting plan** (auth requests, connections, realtime
  channels) and change with it. Read them from the Supabase dashboard rather than
  trusting a number written here.

## Where the list is maintained

Deliberate scope deferrals live in the repo's `doc/Deferred.md`, each with the reason it
was deferred and what should bring it back; things that are built but not yet fully
proved live in `doc/KnownGaps.md`. When a limitation here is lifted, this page is
updated in the same PR — see
[How these docs stay current](/knowledge/how-docs-stay-current).
