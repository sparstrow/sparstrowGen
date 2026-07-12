# Workflow: Feedback

> **Status: 🔒 LOCKED 2026-07-11.** Category `feedback` (types: bug · refinement) in the
> unified intake model. Captures issues and rough edges found while *using* Sparstrowgen or an
> app it built. Capture is shared; this doc covers the feedback-specific **back** (routing +
> Product + downstream agents).

Shared foundation (don't re-read here — they're the source of truth):
- Capture agent → [Listener](./agents/listener.md), run in `feedback` mode.
- Capture format + lifecycle → [`../intake/`](../intake/).
- Analysis + routing gate every capture passes through → [Review & Routing](./review-and-routing.md).

---

## The Process

**Trigger:** you hit a bug or a "this should work differently" while using the app, and bring
it — text + screenshots — to a chat.

1. **Capture** with the Listener in `feedback` mode: it draws out *what happened · which
   surface · expected vs actual · every time?* and records it verbatim. It does **not**
   diagnose, read code, or propose a fix — that's a later Investigate session.
2. On request (*"what do you think?"*) it may offer **observational blind-spot** notes — e.g.
   *"in your screenshot the draft panel is gone but the toast says 'saved' — were you seeing a
   discard, or a navigation? same thing?"* Helps you describe what you saw more completely;
   never *why the code did it*.
3. The item is saved as `category: feedback, status: captured`.
4. **The [Reviewer](./agents/reviewer.md) runs its fast pass** (Review & Routing) — for
   feedback this is typically light-touch: confirm the mode really is `feedback` (not secretly
   a `new-feature` in disguise) and confirm the Investigate pipeline exists. `status: locked` →
   `status: routed`.
5. **Route to analysis** (a separate session): our **Investigator** agent reads the item,
   appends findings, and links out to where the fix is tracked. Your capture block is
   untouched.
6. **Close the loop:** when the fix ships, Claude sets `resolution:` + the PR link, `status:
   done`, and moves the file to `docs/intake/done/`. Deferred → `done/` + a line in
   `DEFERRED_SCOPE.md`.

**Out of scope for capture:** code reading, root cause, fixes, severity ranking, batching
unrelated issues. Those belong to Investigate and Build.

## The Product

Per-project, since most feedback is on the apps the factory builds.

- **`captures` table** (shared across categories) filtered to `category = feedback`:
  `project_id` (nullable = factory-self), `status`, `surface`, `raw_body`,
  `understood_summary`, `screenshots`, `links`, `resolution`.
- **Feedback view** inside the project workspace (`/projects/:id`) — a filter of the Intake
  surface; native screenshot upload, auto-named.
- **Capture = review-then-commit:** the Listener emits the item; the surface saves on your
  confirm (never a direct model write).
- **Routing:** promoting a feedback item spawns a **task** assigned to the Investigator agent
  — the seam into the Investigate workflow.
- **Digest:** nightly rollup of new feedback into the project briefing (silence over filler
  when nothing came in).

→ Build-board rows when scheduled: `captures` migration · Intake surface + feedback filter ·
Listener (feedback mode) + Investigator + Digest system agents · promote-to-task routing.

## The Agents

- **Capture:** [Listener](./agents/listener.md) in `feedback` mode (shared).
- **Analysis:** **Investigator** — *to be authored* (our own, extracted from the
  investigate/debug methodology, not the gstack skill). Reads a feedback item, finds root
  cause, proposes the fix path. Lives in `./agents/` once written; this doc will link it.
- **Digest:** nightly feedback rollup (cron) — *to be authored* alongside the Intake surface.
