---
title: How these docs stay current
section: Reference
description: The Knowledge Center is versioned with the code and updated in the same PR as every user-facing change.
order: 2
updated: 2026-08-10
---

These tutorials aren't a wiki that drifts — they're **part of the codebase**.

## The mechanism

Each article is a markdown file in the repo
(`packages/ui/src/content/knowledge/`), bundled into the app at build time. That makes
one simple rule enforceable:

> **A change that adds or alters anything a user sees or does must update the matching
> Knowledge Center article in the same branch/PR.**

This is a mandatory step in the factory's build runbook (FACTORY-LOOP §⑤) — a PR that
changes a workflow ships with its documentation diff, and the reviewer sees both
together. What you read here matches the app you're running because the two can't
version apart.

The rule now covers a second, harder case: **a change must also re-check the articles
it didn't touch.** A new capability can make a page false without going near it — which
is exactly how these docs once kept telling people the app had no accounts and no
remote access, months after both arrived. Pages that describe the product as a whole
are re-read whenever its shape changes, not only when they're edited.

Two habits keep it honest rather than merely current:

- **Nothing is documented before it works.** A feature that's planned, deferred, or
  switched off is described as unavailable, or left out. Sending you to a button that
  fails is worse than saying nothing.
- **Capabilities are checked against the code, not remembered.** Overstating is the
  costlier direction: a page once described a semantic-search feature that had been
  deliberately removed.

## The update policy

Docs are written **for user understanding**, not as a change log:

- Include what changed *for a user* — a new button, a changed flow, a lifted limit.
- Skip internal refactors and line-level code detail entirely.
- Each article's *Updated* date reflects its last meaningful content change.

## What articles can contain

Standard markdown — tables, fenced code, ASCII diagrams — rendered with the same
engine as agent chat. Images can be added under the UI's public assets and referenced
by path. Richer diagram rendering (e.g. Mermaid) is a known future enhancement.

## Spotted something wrong?

If an article disagrees with the app, that's a bug worth reporting like any other.
It gets designed and planned like any other change, and the fix lands here through
the same PR discipline.
