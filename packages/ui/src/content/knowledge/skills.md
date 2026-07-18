---
title: Skills
section: Surfaces
description: Reusable instruction packs you assign to agents — injected into every run, created three ways.
order: 11
updated: 2026-07-18
---

A **skill** is a reusable set of instructions — a Markdown pack — that you assign to agents.
Every run of an agent that has the skill gets those instructions injected into its prompt, so
you write a behaviour once ("always cite sources", "here's how we handle PDFs") and reuse it
across your whole roster instead of pasting it into each agent's system prompt.

> **Not to be confused with:** the agent's own generated **SKILL.md** (its definition, shown in
> the Skill Viewer — see [Agents & Imports](/knowledge/agents-and-imports)) or **imported skill
> packs** that become whole agents through the Imports quarantine. Workspace skills on this page
> are a separate library that *attaches to* agents you already have.

## The Skills page

Find it under **Configure → Skills**. Each row shows the skill, how many agents use it, its
size, an enable toggle, and the last-updated date. Search and the All / Enabled / Disabled
filter narrow the list.

- **Enabled toggle** — a disabled skill stays assigned to its agents but is *not* injected into
  runs. Use it to pause a skill everywhere at once without un-assigning it.
- **Edit** opens the instructions in a Markdown editor; **Delete** removes it (assigned agents
  simply stop receiving it on future runs).

## Three ways to add a skill

**New skill** opens a chooser with three paths:

1. **Create manually** — start from a blank editor and write the name, description, and
   Markdown instructions yourself.
2. **Import from URL** — paste a link to a published `SKILL.md`. A GitHub *blob* link is
   converted to raw automatically, and the skill's name and description are read from the file's
   frontmatter. Only `http(s)` URLs are fetched.
3. **Copy from runtime** — promote a skill already installed on this machine's CLI runtimes. The
   dialog scans the standard skill directories (`~/.claude/skills`,
   `~/.gemini/antigravity-cli/skills`, and the cross-tool `~/.agents/skills`) and lists what it
   finds; **Import** copies the `SKILL.md` into your workspace library. The original file is
   never touched.

If a skill you're importing has the same name as one already in the library, the import stops
and offers **Overwrite** — take it to replace the existing skill's contents, or rename to keep
both.

## Assigning skills to agents

Skills do nothing until they're attached to an agent. On the [Agents](/knowledge/agents-and-imports)
page, open a row's **⋯ menu → Manage skills** and check the skills that agent should carry. A
count chip on the agent row shows how many it has.

## How injection works

When an agent runs, every skill that is **assigned to it and enabled** is injected into the run
prompt as a guaranteed block, alongside the project's directives — it's never trimmed to save
tokens. The agent sees each skill's name, description, and full instructions and is told to
follow them when a task matches. Changing or disabling a skill affects *future* runs; runs
already in flight keep the prompt they started with.

## Notes & limitations

- A very large skill body is capped when injected (about 20 KB per skill) so one runaway paste
  can't crowd out the rest of the prompt.
- "Copy from runtime" imports the `SKILL.md` body only — a skill that ships extra bundled files
  brings its instructions across, not its attachments.
