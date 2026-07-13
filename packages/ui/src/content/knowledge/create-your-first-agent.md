---
title: Create your first agent
section: Getting started
description: The Agent Creator interview — from a one-line idea to a configured, reusable worker.
order: 3
updated: 2026-07-13
---

An **agent** is a reusable worker: a name, a system prompt (its standing instructions), a
provider + model, and a tool policy. You'll build one with the guided creator.

## The quick path

1. Go to **Agents** and click **New agent**.
2. Choose **Create with interview** — this opens the Agent Creator, a short
   conversational flow where you describe what you want in plain words
   (e.g. *"an agent that reviews my TypeScript changes and flags risky patterns"*).
3. The creator drafts the agent for you: name, description, system prompt, and a
   suggested model. **Nothing is saved yet** — you're looking at a draft.
4. Edit anything you like, then confirm to create the agent.

Prefer full manual control? The plain **New agent** form exposes every field directly.
There's also **Duplicate** on any existing agent — the fastest way to make a variant.

## What the creator checks for you

Before creating, the factory runs a **pre-flight**:

- **Duplicate detection** — if an existing agent already does something very similar,
  you'll be told *before* you create a near-copy (advisory only; you can proceed).
- **Memory scan** — relevant notes from your memory vault are surfaced so the new
  agent's prompt can benefit from what the factory already knows.

## Fields that matter most

| Field | Why it matters |
|---|---|
| **System prompt** | The agent's permanent instructions. Be specific about scope and tone. No length ceiling — write what the job needs. |
| **Provider / model** | Where it runs — see [Providers & execution modes](/knowledge/providers-and-execution-modes). |
| **Tools** | What it's allowed to do. Empty = inherit defaults; see [Tool permissions](/knowledge/tool-permissions). |
| **Skills** | Attached skill documents the agent can lean on (view any skill with the built-in Skill Viewer). |

## Notes & limitations

- Agents imported from external skill packs go through **quarantine** first and cannot
  run until you promote them — see [Agents & Imports](/knowledge/agents-and-imports).
- An agent is *global*: teams and projects reference it, they don't copy it. Editing an
  agent changes future runs everywhere it's used (past runs keep their snapshot).

Next: [Run it and read the results](/knowledge/run-and-read-results).
