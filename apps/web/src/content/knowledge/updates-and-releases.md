---
title: Updates & the changelog
section: Surfaces
description: How the desktop app updates itself, the two release channels, and where to read what changed.
order: 15
updated: 2026-08-29
---

The desktop app checks for updates automatically and tells you when one is ready — it
never downloads or installs anything without you clicking a button.

## Two channels, two installs

Depending on which build you have, your desktop app tracks one of two channels:

- **Sparstrowgen (stable)** — tracks the production release. A new version becomes
  available only when a release is deliberately published.
- **Sparstrowgen Staging** — tracks the staging branch, and updates itself automatically
  as changes land there, ahead of a stable release. It's a separate install with its own
  icon and its own data, so it never touches your stable install.

Both can be installed on the same machine at once if you want to see what's coming
before it reaches stable.

## When an update is ready

A banner appears at the top of the window: **Download**, then **Install & restart**
when it's ready. If any agents are mid-run, the app waits for them to finish before
restarting — or you can choose to interrupt them and update immediately. Nothing
installs silently and nothing restarts without your say-so.

## The changelog

Every release — stable or staging — gets an entry on the [Changelog](/changelog) page,
grouped by month. The update banner links straight to the entry for the version you're
about to install, so you always know what changed before you restart.

## Known Limitations & Boundaries

- The update check runs roughly every 30 minutes while the app is open; there's no way
  to change that interval from the app today.
- The changelog only lists releases someone wrote an entry for — an internal build that
  shipped without one (rare) won't appear.
- Code signing isn't set up yet for either channel, so Windows/macOS may show an
  "unknown publisher" warning on install.
