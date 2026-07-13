---
title: Git automation & execution profiles
section: Concepts
description: How agents push branches and open PRs — and the hard rails that keep trunks safe.
order: 4
updated: 2026-07-13
---

With a GitHub PAT stored (Settings → Git), the factory can push agent work and open PRs.
The rails are enforced in the core — not left to agent judgment.

## Execution profiles

Every project has a profile that sets its rules:

| Profile | Meaning | Push rules |
|---|---|---|
| **factory** | Sparstrowgen's own code / internal work | Feature branches only |
| **production_app** | An app you ship | Feature branches only, **staging branch is also protected** — promotion to production is a human act |

Set the profile in the project workspace's Git panel.

## The hard rails (non-negotiable, enforced in core)

- Agents can **never push to `main`/`master`** — any attempt is refused before git runs.
- For production apps, the **staging branch** is equally protected.
- Branch names are generated from the task and sanitized — they can't be coerced into a
  trunk name or carry injection tricks.
- The **PAT never reaches an agent**: it's applied by the core at the git boundary, is
  never written into an agent's environment or command line, and lives encrypted
  outside the database.

## What a typical flow looks like

1. An agent finishes work in a project → commits on a generated feature branch.
2. The factory pushes the branch and opens a PR via the GitHub API.
3. The PR appears in the Dashboard **PR queue** and the project's Git panel.
4. **You** review and merge. No agent merges anything, anywhere.

## Notes & limitations

- No PAT → git automation simply stays off (factory health shows it as a degrade, not a
  failure).
- The rails cover the factory's git pipeline. An agent with raw shell access could run
  `git` itself — pair git automation with sensible
  [tool permissions](/knowledge/tool-permissions) on production projects.
