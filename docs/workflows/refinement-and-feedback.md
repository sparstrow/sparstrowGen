# Workflow: Refinement & Feedback

> **Status: 🔒 LOCKED 2026-07-10.** First workflow logged under the dual-track model.
> Purpose: capture issues, refinements, and ideas found while *using* Sparstrowgen (or an
> app it built) — faithfully, one at a time — without diagnosing or fixing them. Analysis
> and fixes are separate, later workflows.

Every workflow here is documented in three parts:
- **The Process** — how the human + Claude/agy run it *today*, in this repo.
- **The Product** — the Sparstrowgen features needed to run the same workflow *in-app*.
- **The Agents** — portable `SKILL.md` agent definitions (design surface now → import into
  Sparstrowgen, wire to a cron/task/pipeline trigger later).

The Process is the prototype; the Product is the proven process, productized. The Agents
section is the bridge — the same prompt is *how Claude behaves now* and *the agent deployed
later*.

---

## The Process

**Trigger:** you are dogfooding Sparstrowgen (or a project it built) and hit something —
a bug, a rough edge, a "this should work differently," or an idea. You bring it to a chat
(Claude or agy) as raw material: text, screenshots, testing notes.

### The one hard rule: capture ≠ analyze ≠ fix

During a capture session the agent is a **stenographer with comprehension, not an engineer.**
It records *what you saw* and *what you meant*. It does **not**:
- read or analyze code,
- propose a cause ("this is because state resets on navigate"),
- propose a fix,
- assign a severity beyond your own words.

Diagnosis belongs to a later `/investigate` session. If the agent catches itself starting to
explain *why*, it stops. Capture is deliberately dumb — that's the feature.

### Steps

1. **You dump raw** — one issue or many, as messy as you like.
2. **The agent clarifies only to capture faithfully.** Allowed: *"what did you expect
   instead?"*, *"which screen?"*, *"every time or once?"* Not allowed: *"what do you think
   caused it?"* or opening the source to check.
3. **The agent reflects back a 1–2 sentence "what I understood"** and shows you the drafted
   item. This reconciles the two rules — *understand what you mean* (it restates meaning) and
   *don't add information* (you're the gate; strike anything invented).
4. **You confirm or correct.** The corrected version is the record.
5. **The agent saves one file per issue** in `docs/feedback/inbox/`. It never merges two of
   your issues, never splits one into a diagnosis.

### Item format

```
docs/feedback/inbox/FB-0001-agent-creator-draft-lost.md
---
id: FB-0001
status: captured
project: factory            # "factory" = Sparstrowgen itself; else the project slug
surface: Agents / Agent Creator
type: bug                   # bug | refinement | idea  (agent proposes, you confirm)
date: 2026-07-10
screenshots: [assets/FB-0001-draft-gone.png]
---

## What happened (verbatim)
<your words, minimally cleaned — typos/formatting only. This block is SACRED:
later analysis appends below it, never rewrites it.>

## What I understood
Clicking "Open" on a suggested duplicate navigated to that agent and discarded the
draft the Agent Creator had just produced.

## Expected
<only if you stated it>
```

### Screenshots

Claude in chat cannot save a pasted image as a file (the write path is text, not binary).
So: **you paste → Claude views it → Claude gives you the exact filename + path → you rename
and save it.** e.g. reply is `Save as: docs/feedback/assets/FB-0001-draft-gone.png`, you drop
it there, the item references it. (In the Product this is a native upload — see below.)

### Lifecycle — the folder is the state

A file physically moves as it progresses. No separate index to drift out of sync.

| Stage | Location | What's true |
|---|---|---|
| **Captured** | `docs/feedback/inbox/` | Raw + confirmed understanding. Awaiting analysis. |
| **Planned** | `docs/feedback/planned/` | A later analysis/`/investigate` session **appended** its findings + a link out to where the work lives (a SPEC, an `ENGINEERING_PLAN` entry, an issue). Your capture untouched. |
| **Done** | `docs/feedback/done/` | Resolved — a `resolution:` line + link to the fix (PR/commit). Or closed wontfix/dup/deferred (if deferred, also recorded in [`DEFERRED_SCOPE.md`](../../DEFERRED_SCOPE.md)). |

Nothing is deleted. `done/` becomes an audit trail and a retro input ("Agent Creator
generated 4 of the last 10 items → invest there"). To see the open queue: look in `inbox/`.

**Close the loop:** when a fix ships or an item is deferred, Claude moves the file and links
the resolution — you don't have to ask.

### Project scoping

Most feedback is on **projects** the factory builds, not the factory itself. Track A mirrors
the Product's `project_id`:
- Feedback on Sparstrowgen itself → `project: factory` (global scope).
- Feedback on a built project → `project: <slug>`; when volume grows, items move to
  `docs/feedback/<slug>/inbox|planned|done/`.

### Out of scope for this workflow

No code reading, no root-cause, no fix, no severity ranking, no batching unrelated issues.
Those are the `/investigate` and build workflows, run later against `inbox/` items.

---

## The Product

What Sparstrowgen must build so its own agents run this workflow in-app. **Per-project**, since
that's the dominant case. This is a spec — scheduled later through the normal build loop, not
built yet.

### Data model — `feedback_items`

Follows repo conventions (text ids, ISO timestamps, nullable scope, JSON-as-text — portability
rule 3):

| Column | Notes |
|---|---|
| `id` | `fb_<nanoid>` |
| `project_id` | nullable — `null` = factory-self feedback (global) |
| `status` | `captured` \| `planned` \| `done` (mirrors the folders) |
| `type` | `bug` \| `refinement` \| `idea` |
| `surface` | free text — which screen/flow |
| `title` | short slug-able summary |
| `raw_body` | verbatim capture (append-only; analysis writes elsewhere) |
| `understood_summary` | the confirmed 1-liner |
| `screenshots` | JSON array of uploaded asset refs |
| `links` | JSON — { plan, investigate_run, pr } as they appear |
| `resolution` | set at `done` — shipped / wontfix / dup / deferred |
| `created_at` / `updated_at` | ISO |

### Surfaces

- **Per-project Feedback tab** in the project workspace (`/projects/:id`) — inbox/planned/done
  columns (same folder-as-state, as views), alongside that project's tasks/pipelines.
- **Capture composer** — conversational, drives the Feedback Scribe agent; **native screenshot
  upload** (auto-named to the item id — no hand-renaming).
- A factory-global Feedback view for `project_id = null` items.

### Behavior

- Capture is **review-then-commit**: the Scribe *emits* a structured feedback item
  (zod-validated); the surface persists it only on your confirm — the exact
  draft-then-publish pattern the P10 Team Manager already uses (never a direct DB write from
  the model).
- **Hand-off:** promoting an item to `planned` spawns a **task** (assigned to an investigator
  agent) — that's the seam into the analysis/build workflows.
- **Digest:** a nightly rollup of new `captured` items into the project briefing / Messages.

### Triggers (how the agents run in-app)

- **Feedback Scribe** → **task** (on-demand; human provides the input).
- **Feedback Digest** → **cron** (nightly; summarizes the inbox).

→ New build-board rows when scheduled: `feedback_items` migration · per-project Feedback tab ·
Scribe + Digest system agents · capture-emit-then-persist flow · promote-to-task hand-off.

---

## The Agents

Portable `SKILL.md` definitions (Sparstrowgen's real projection shape). Paste into the Agent
Creator / P9 skill-ingestion to deploy; wire to the trigger noted in each.

### Feedback Scribe — capture-only

```markdown
---
name: "Feedback Scribe"
role: "Capture-only feedback recorder"
provider: "claude-code"
model: "sonnet"
tools: []
permissionMode: "default"
---
You record product feedback while the user is testing an app. You are a stenographer with
comprehension — NOT an engineer.

## You MUST NOT
- Read, open, or analyze code.
- Propose a cause, a root cause, or a fix.
- Assign severity or priority beyond the user's own words.
- Merge two issues into one, or split one issue into a diagnosis.
(You have no code tools on purpose — the discipline is structural, not willpower.)

## You MUST
- Capture behavior + the user's intent, one item per issue.
- Ask clarifying questions ONLY to record faithfully ("what did you expect?", "which screen?",
  "every time?") — never "what caused it?".
- Reflect back a 1–2 sentence "what I understood" and get the user's confirmation before saving.
- Preserve the user's verbatim words as the record; correct only when they correct you.

## Output
Emit ONE structured feedback item per issue: { surface, type (bug|refinement|idea), title,
raw_body (verbatim), understood_summary, expected? }. Do not persist it yourself — the
Feedback surface saves it after the user confirms (review-then-commit).

Trigger: task (on-demand).
```

### Feedback Digest — nightly rollup

```markdown
---
name: "Feedback Digest"
role: "Nightly summarizer of newly-captured feedback"
provider: "claude-code"
model: "haiku"
tools: []
permissionMode: "default"
---
Once per night, summarize the project's newly-`captured` feedback items into a short digest:
count by type, one line each, flagged by surface. No analysis, no fixes — just "here's what
came in." Silence over filler: if nothing new was captured, produce no digest.

Trigger: cron (nightly, per project).
```

> Both carry `tools: []` — capture and digest never touch code. Least privilege makes the
> "no diagnosis" rule impossible to violate, not just discouraged.
