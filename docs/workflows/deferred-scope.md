# Workflow: Deferred Scope

> **Status: 🔒 LOCKED 2026-07-11.** The **freezer** — scope intentionally *not* built now,
> parked with context for the future. Cross-cutting: fed by human dream-plans *and* by agents
> cutting scope during any other workflow.

Shared foundation:
- Capture agent → [Listener](./agents/listener.md), used with the **defer disposition** (not a
  new mode — see below).
- The record → [`DEFERRED_SCOPE.md`](../../DEFERRED_SCOPE.md) (factory) + per-project deferred docs.

---

## The Process

The freezer has **two feeders** and one exit:

```
 ① human dream/future plan ──▶ Listener (defer) ──┐
                                                   ├──▶ DEFERRED_SCOPE.md ──▶ revive ──▶ intake
 ② agent cuts scope mid-work ──(no-silent-drop)───┘        (the freezer)              (fresh capture)
```

1. **Feeder ① — human dream-plan.** You bring a future idea for a project you don't want to
   build now. The Listener captures it in its natural mode (`new-feature`/`new-concept`), then
   — because you said "park it" — adds the **deferral questions**: *why not now · what would
   trigger doing it · rough size*. It's written as a freezer entry (`source: human-dream`), not
   routed to review.
2. **Feeder ② — agent deferral (a rule, not a session).** Whenever any agent or Claude cuts,
   skips, or defers scope during a build/review/investigate, it **writes a freezer entry at that
   moment** — the "no silent scope-drop" rule (`source: agent-defer`). This is what produced
   most of the existing file (EH7, OpenAI adapter, …). It's a conduct rule every working agent
   carries, not a separate agent.
3. **Also — deferred-after-review.** A capture that runs the review spine and gets a "not now"
   verdict ends `status: deferred` → the same freezer entry (`source: review-outcome`).
4. **Revival (the exit).** When an item's time comes, pull it out → create a fresh `docs/intake/`
   capture (`new-feature`/`new-concept`) → the normal review → build flow. Mark the freezer entry
   revived with a link to the new capture. Nothing is deleted; revived entries stay as history.

**Why defer is a disposition, not a Listener mode:** a dream-plan is a feature/concept by
content; "defer" is only what you decide to *do* with it. Modes describe *what you brought*;
status describes *what happens to it*. This keeps the mode list from bloating and lets
dream-first and deferred-after-review land in one place.

### Entry format

See the top of [`DEFERRED_SCOPE.md`](../../DEFERRED_SCOPE.md): `source · project · what · why
deferred · revisit when · size · date · links`.

### Project scoping

Factory-self deferrals → root `DEFERRED_SCOPE.md`. Per-built-project dreams → that project's own
deferred doc (Track A) / `project_id` (Track B).

## The Product

- **`deferred_items` table** — `project_id` (nullable = factory), `source`, `what`, `why`,
  `revisit_when`, `size`, `status` (`deferred` → `revived`), `links`, timestamps.
- **Freezer view** per project (`/projects/:id`) + a factory-global view.
- **`defer_scope` capability** — the no-silent-drop rule as an in-app action that
  build/review/investigate agents call at the moment they cut scope (structural, not willpower).
- **Revive = promote** — a deferred item promotes into `captures` as a fresh intake item → the
  review/build pipeline.

→ Build-board rows when scheduled: `deferred_items` migration · freezer view · `defer_scope`
capability · revive-to-intake promote.

## The Agents

- **Human dream-plan:** [Listener](./agents/listener.md) with the defer disposition (adds the
  three deferral questions, routes to the freezer). Shared.
- **Agent deferral:** **not a new agent** — a shared **conduct rule** ("log every deferral to the
  freezer, with what/why/revisit, before moving on"). Belongs in the final `CLAUDE.md`/`AGENTS.md`
  wiring and in every build/review/investigate agent's prompt.
