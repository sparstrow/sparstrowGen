---
id: 0006
category: feature-change
secondary_modes: [new-concept]
status: routed
project: factory
surface: Agents / Projects / Pipelines — build verification process
date: 2026-07-14
screenshots: []
links: { related: "docs/intake/0007-agent-factory-performance-tracking-2026-07-14.md", plan: "docs/planned/verification-agent-gym-app.md" }
resolution:
---

## What I brought (verbatim)

Right now, after building the desktop app for 1 month, I'm not confident enough that it can build
a production app. From agent creation, creating an agent, running pipelines, and everything, I'm
really not sure if it can create production-level app yet.

When building the app now, there is also no data on that, I think. There are no agents, and there
are no projects. While we are building the app, I want to give it a project that it needs to build
to a production grade as final goal verification. You can create agents for testing everything.
The end result that we want is a production-level app. It is going to build a production-level app
by agents, so that's the main goal.

Me giving feedbacks, new concept, adding features on this sparstrowgen is fine, but I'm thinking
that while we build our features, I want the app to actually have some agent workflows created. It
needs to create some production app while we test. I mean, not everything needs to be
production-level right away, but at least each agent needs to be created, and at least some
pipelines need to be created on some flow. I don't know how to advise that in the build, and it's
going to be separate. It's for testing purposes, or an example purpose. Yes, there is a production
app already: this sparstrowgen build, and I can refer to it and create others.

**On the permanence of this:** every future feature gets verified against a live ONE test project
+ agents + pipelines, permanently — not a one-time bootstrap.

**On the test project itself — the Muscle-Specific Gym App:**

The Muscle-Specific Gym App is a comprehensive fitness application designed to assist users in
achieving their fitness goals and maintaining a healthy lifestyle. The app provides a range of
features and functionalities to support users throughout their fitness journey. The Muscle-Specific
Gym App aims to provide a comprehensive fitness solution, combining workout guidance, tracking,
nutrition support, and AI assistance, all in one user-friendly application.

Key Features:

- **Workout Routine Setup:** The app offers a structured workout routine that includes warm-up
  exercises, stretching, compound exercises, isolation exercises, and a cool-down session. Users
  can customize their routines based on their preferences and fitness levels.
- **Weight and Reps Tracking:** Users can easily track their weights, sets, and reps for each
  exercise. The app allows users to monitor their progress over time and adjust their workout
  intensity accordingly.
- **Exercise Guidelines:** Each exercise in the app is accompanied by detailed descriptions,
  including dos and don'ts, ensuring users perform exercises correctly and safely. Users can refer
  to these guidelines to enhance their exercise technique.
- **Before and After Photos:** The app enables users to capture and store photos before and after
  their gym sessions. Daily photo capture helps users visualize their progress and stay motivated
  on their fitness journey.
- **Gym Time Reminders:** Users can set up personalized reminders to ensure they never miss a gym
  session. These reminders can be scheduled at convenient times based on the user's preferences.
- **Diet and Nutrition Support:** The app provides users with a comprehensive diet plan, including
  protein-rich meals and suggestions for nearby restaurants that offer healthy options. Users can
  also track their calorie intake to maintain a balanced diet.
- **Exercise Analysis:** The app offers detailed analysis of each exercise, providing insights into
  the muscles targeted, benefits, and variations. This information helps users understand the
  purpose and effectiveness of different exercises.
- **AI Chatbox Support:** In case of any health issues or concerns, users can seek assistance from
  the app's AI chatbox. The chatbox provides guidance and support, addressing user queries and
  offering solutions to problems related to exercise or fitness.
- **Calisthenics Learning:** The app includes resources and tutorials for users interested in
  learning calisthenics, a form of exercise that uses bodyweight movements. Users can access
  step-by-step instructions and progress at their own pace.
- **Dashboard and Sleep Analysis:** The home screen of the app features a personalized dashboard
  that displays workout analysis, sleep patterns, and other relevant metrics. This helps users
  track their overall progress and make informed decisions about their fitness routine.

**On how this plugs into the existing verification gate:** it is both — (1) this project becomes
the target for the real-artifact usability test step already locked in
`docs/planned/factory-workflow-v2.md` (any future change/improvement gets real-artifact usability
tested against this live gym app), AND (2) there's a separate initiative to track the performance
of the app that's getting created, so the work can be refined accordingly — the agents, the
features, the workflow, the app itself. That second part is captured separately (see linked item
0007), since it's its own initiative, not just a detail of this one.

## What the Listener understood

Set up one permanent, standing live test project — the Muscle-Specific Gym App (full spec above)
— built with real agents and real pipelines, that every future Sparstrowgen feature/change gets
verified against going forward, plugging into the already-locked real-artifact usability-test gate
in the v2 workflow doc. Motivation: after a month of building Sparstrowgen with no agents/projects
actually created or exercised, there's no concrete proof yet that the factory can build a
production-grade app end-to-end.

## Curator session

**Before:** filed `feature-change` (secondary `new-concept`), status `captured`. Mode question at
capture time was genuinely open — the deliverable could have been (A) a one-time bootstrap action
using already-built features, or (B) new software.

**Dialogue:** the mode fork was resolved via an `/office-hours` session, not resolved silently —
see [`docs/planned/verification-agent-gym-app.md`](../planned/verification-agent-gym-app.md)
(APPROVED, reviewed twice: an internal adversarial pass and an independent Fable-5 review). It's
neither pure A nor pure B: an outside agent bootstraps a Team + test agents + pipeline through
Sparstrowgen's real UI (reusing the existing P10 Team Workspace, not new agent-coordination
infrastructure), then the existing Scheduler keeps the team building recurringly — with
failure-cap/kill-switch and EH7 write-scope safety requirements before that goes live
unattended. "Production-grade" was scoped down from the full enterprise SaaS release lifecycle
(supplied verbatim by the user) to what applies to a single local app.

**After:** `category` unchanged — `feature-change` (secondary `new-concept`) confirmed correct,
now with a concrete, reviewed, approved shape instead of an open question.

**D1 — decided:** route directly to the standard build loop
(`CAPTURE → PLAN → BUILD → VERIFY → PROMOTE → SHIP`, per the v2 CLAUDE.md rewrite), **not**
`gap` → Pipeline Suggester. Pipeline Suggester exists for "no path forward exists" — that
condition no longer holds; `docs/planned/verification-agent-gym-app.md` is the path forward,
already built and twice-reviewed. Routing to Pipeline Suggester now would just re-derive the same
plan at extra cost.

**Verdict:** `locked` → `routed`. Target: the approved plan's Phase 1 (bootstrap) is the next
build task.
