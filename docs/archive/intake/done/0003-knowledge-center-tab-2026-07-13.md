---
id: 0003
category: new-feature
status: done
project: factory
surface: App / (new) Knowledge Center tab
date: 2026-07-13
screenshots: []
links: { spec: .design-src/knowledge-center/SPEC.md, pr: "#48" }
resolution: shipped
---

## What I brought (verbatim)

I want a tab in the app called Knowledge center. It should have all the instructions on how to
use the app. each workflows, notes, liminitaion etc like a tutorial.

As we build new features and change the existing one, the knowledge center should always keep on
upto date. The tutorial can include any media, diagram, artifacts to best understand the app and
its usage.

## What the Listener understood

A new **Knowledge Center** tab that teaches how to use the app — every workflow, plus notes and
limitations — written as tutorial content, and able to include media, diagrams, and artifacts.
Captured facts (from confirmation):

- **Audience:** both — serves the operator now, but written well enough to onboard a future
  teammate cold.
- **Content source:** authored fresh — new tutorial content written for end-user consumption
  (not just surfacing existing `CLAUDE.md` / `docs/workflows` verbatim).
- **"Done" for v1:** every workflow documented (each workflow + its notes + its limitations),
  tutorial-style.
- **Stays up to date:** must be **automatic in v1** — as features are built or existing ones
  change, the Knowledge Center should keep itself current (stated as a v1 requirement, not a
  later goal).
- **Media:** the tutorial can embed any media / diagrams / artifacts that best convey usage.

## Curator session

**Before:** `new-feature` — a Knowledge Center tab that "must auto-update automatically in v1,"
read as possibly one build or two.

**After:** `new-feature` (unchanged, confirmed against a push toward `new-concept`). Verdict:
**one build + one process addendum**, fast-tracked.

**What the dialogue settled:**
- **Not a duplicate / genuinely new surface** — grep + the `.design-src/APP.md` build board
  (11 pages, Dashboard→Settings) confirm no existing Help / Docs / tutorial page. This becomes
  **page #12** on the build board.
- **Structure (P3):** a top-level tab **with subpages — one per tutorial concept/workflow.**
  Carry this IA into the SPEC.
- **"Auto-updates in v1" is a process step, not a feature (P2, agreed):** no watcher/regen
  software is built. Instead a line is added to the build checklist
  (`.design-src/FACTORY-LOOP.md`): *"when you build or change a feature, also update the matching
  Knowledge Center page — write for user understanding; include what changed for a user, skip
  internal code trivia."* The "update intelligently, skip the unnecessary" policy the user wants
  lives in that checklist wording.
- **Mode (D1):** stays `new-feature`. Reclassifying to `new-concept` was rejected — the user's
  own framing ("keep it a simple user tutorial") + the fast-track choice are `new-feature`
  instincts; `new-concept` would force a vision gauntlet they opted out of.
- **Pipeline (D2 = B, fast-track):** route to the existing **page-build pipeline**
  (`FACTORY-LOOP.md`) but **enter at SPEC** — skip Claude Design + office-hours. Flagged: because
  office-hours is skipped, the **SPEC must nail the subpage IA itself** (what concepts get a
  subpage, nav/hierarchy, empty state).

**Routing:** intake-track, **pipeline exists → `routed`.**
Target: author a build SPEC at `.design-src/knowledge-center/SPEC.md`, add page #12 to the
`.design-src/APP.md` build board (stage `✏️ spec'd`, next action: autoplan), then the build
routine picks it up. **Rider (rides with this item):** add the Knowledge Center update step to
the build checklist in `.design-src/FACTORY-LOOP.md`.

**Content note (downstream, not routing):** "author fresh, every workflow documented" is a
content-generation effort for the build stage (the `/document-generate` skill fits); it does not
change the routing.
