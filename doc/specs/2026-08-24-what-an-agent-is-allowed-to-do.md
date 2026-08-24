# Spec: What an agent is allowed to do

| | |
|---|---|
| **Status** | **Draft — not yet reviewed** |
| **Created** | 2026-08-24 |
| **Trigger** | Owner, on being asked to settle a machine's file-sharing boundary in isolation ([`OQ-6`](../OpenQuestions.md)): "we should not just think and [be] bound to only one access. We should [design] project access settings for users, agents on what level they can access and configure." Scoped agents-first at the owner's direction: "right now, I'll be the only one using the app … human scope can be built at the very end, but all other things should be planned and built expecting that human access will be built in future" |
| **Plan** | not planned yet |
| **Open questions** | [`OQ-6`](../OpenQuestions.md) — a machine's shared locations, which US4 answers as one cell of this model |

> **Scope.** This is the **access model**, not a settings page. It decides who
> may do what to which thing, and it is scoped to **agents** as the actor.
> People as actors are deliberately last (see Assumptions), but every decision
> here is made in a shape that admits them later rather than one that would
> have to be undone.

## The experience today

**An agent can do almost anything on the owner's computer, and there is no
screen that says so.**

The pieces of an answer exist and do not add up to one. Walking it as the
owner:

- **Creating an agent offers two free-text boxes** — allowed tools and
  disallowed tools — with example text as the only hint about what may be
  typed into them. There is no list of what tools exist, nothing checks what
  is typed, and a typo silently grants or denies nothing at all.
- **Leaving them empty is the normal case, and it means "everything."** An
  empty allow list does not mean "nothing"; it means the agent falls back to
  its provider's full default toolset. So the default state of a new agent is
  unrestricted, and nothing on the screen says that.
- **The project level cannot be set at all.** A project can carry its own
  rules — the concept exists and works — but there is no screen anywhere that
  edits them. This is precisely the level the owner asked for.
- **Nor can the workspace-wide level.** It is read every time an agent starts
  and nothing has ever been able to write it.
- **Nothing shows the result.** Rules combine across several levels, with the
  strictest winning and a delegated agent never exceeding the one that sent
  it. That combination is computed correctly at the moment the agent starts,
  and then it is invisible: the owner cannot ask "what will this agent
  actually be able to do on this project" and get an answer.
- **Several other permissions live elsewhere and are not thought of as
  permissions at all** — the extra folders an agent may reach outside its
  project, which outside services it may talk to, and how much it may do
  without pausing to ask. Each is a separate box on a different part of a
  form.
- **Nothing restricts which machine an agent runs on.** Any agent can be
  dispatched to any paired machine. Once there is a second machine — a work
  laptop, someone else's computer — there is no way to say an agent belongs
  to one and not the other.
- **A run that the app itself flags as untrusted is only badged.** It gets a
  marker and its memory is quarantined; it is not otherwise restrained
  ([`G-5`](../KnownGaps.md)).

**The underlying machinery is good.** Rules combine across four levels in a
fixed order, the strictest always wins, the result is frozen the moment an
agent starts so nothing can change under a queued run, and a delegated agent
is clamped to never exceed its delegator. None of that needs rebuilding. What
is missing is every control that would let the owner use it, and any screen
that shows what it decided.

## What I expect instead

I want to be able to look at an agent and see what it is actually allowed to
do — not the raw settings, but the answer after everything has been taken into
account — and I want to shape that by picking from a real list rather than
typing strings and hoping. I want to set rules once for a project and have
every agent working in it respect them. And I want all of this built so that
when other people start using the app, giving *them* levels is filling in a
model that already exists, not inventing a second one alongside it.

---

## User stories

### US1 — See what an agent is actually allowed to do (Priority: P1)

I open an agent and see, in plain terms, what it can do — what tools it may
use, what it may reach beyond its project, what it may talk to, and how much
it may do without asking me. Where a rule came from somewhere other than this
agent, it says so.

**Why this priority:** It is the only story that is worth having even if
nothing else ships, because it tells me what I am exposed to *right now*.
Today I cannot answer "what can this agent do" without reading code. Every
other story here is a change I might want to make; this one is the reason I
would know to want it.

**Independent test:** Open an existing agent → see its effective permissions,
including at least one rule that came from a level above it, labelled with
where it came from.

**Acceptance scenarios:**

1. **Given** an agent with both rule boxes left empty, **When** I look at what
   it is allowed to do, **Then** I am told plainly that it can use its
   provider's full default set — not shown an empty list that reads as "it
   can't do anything."
2. **Given** an agent whose project denies something the agent itself allows,
   **When** I look at the agent, **Then** the denial is shown as the outcome,
   and it is attributed to the project rather than appearing as the agent's
   own setting.
3. **Given** an agent that has never run, **When** I look at it, **Then** I
   still see what it *would* be allowed — this must not require a run to have
   happened.
4. **Given** a rule that refers to something that does not exist — a
   mistyped tool name — **When** I look at the agent, **Then** it is flagged
   as having no effect, rather than shown as though it were doing something.

---

### US2 — Choose what an agent may do, from a real list (Priority: P1)

When I set up an agent, I pick what it may do from the actual set of things it
could do, with each one described. I am told what the default is before I
change anything.

**Why this priority:** It is what makes US1 actionable. It also removes a
whole class of silent failure — today a misremembered name is indistinguishable
from a working rule, and both look fine on screen.

**Independent test:** Create an agent, restrict it by picking from a list
without typing a free-text tool name anywhere, run it, and confirm it is
actually restricted.

**Acceptance scenarios:**

1. **Given** I am setting up an agent, **When** I look at what it may do,
   **Then** I see the real set of things available to it, each with a short
   description, and the current default made explicit.
2. **Given** I restrict an agent, **When** it next runs, **Then** it is
   genuinely restricted — attempting the removed thing fails for the agent
   rather than being quietly permitted.
3. **Given** I try to grant something the project or the workspace forbids,
   **When** I save, **Then** I am told it will not take effect and why —
   rather than being allowed to save a rule that silently loses.

---

### US3 — Set rules for a project, once (Priority: P2)

I set what may happen inside a project, and every agent working in that
project is bound by it regardless of its own settings.

**Why this priority:** It is the level the owner named, and it is the one that
scales — the alternative is repeating the same restriction on every agent and
remembering to repeat it on the next one. It is P2 rather than P1 only because
the two above must exist first for this to be visible or checkable.

**Independent test:** Deny something at the project level, then run an agent
that allows it, and confirm it is denied.

**Acceptance scenarios:**

1. **Given** a project that forbids something, **When** any agent runs in it,
   **Then** that thing is unavailable, whatever the agent's own rules say.
2. **Given** a project's rules change, **When** a run is already queued or
   in flight, **Then** that run keeps the rules it started with, and I can
   see that is what happened rather than being left to wonder.
3. **Given** a project I have marked as a sandbox, **When** I look at its
   rules, **Then** what "sandbox" actually changes is stated, not implied by
   the name.

---

### US4 — Say what a machine will share, and which agents may use it (Priority: P2)

Each machine states what it is willing to expose — which folders may be looked
at — and I can say which agents are allowed to run on it at all.

**Why this priority:** It is the same question as the other levels, asked
about a different kind of thing, and it is the one that stops being
hypothetical the moment there is a second machine. It also settles
[`OQ-6`](../OpenQuestions.md) as an instance of this model rather than as a
standalone rule.

**Independent test:** Nominate a folder on a machine, then confirm from a
browser that folders outside it cannot be browsed; restrict an agent from a
machine and confirm dispatching it there is refused with a reason.

**Acceptance scenarios:**

1. **Given** a newly paired machine, **When** I look at it, **Then** it
   already has a sensible shared location — the folder my projects live in —
   so this is not a setup chore, and I can see and change what it is.
2. **Given** a machine sharing one folder, **When** anything asks it about a
   folder outside that, **Then** it refuses, and the refusal says it is
   outside what this machine shares rather than pretending the folder is
   missing.
3. **Given** an agent not permitted on a machine, **When** work is dispatched
   to it there, **Then** it is refused with that reason, in the same way an
   unavailable machine is already refused today.

---

### US5 — Restrain a run the app does not trust (Priority: P3)

When the app has decided a run is untrusted, that means something beyond a
badge.

**Why this priority:** It closes a control that was started and left half
done ([`G-5`](../KnownGaps.md)). P3 because the quarantine already contains
the consequence the badge was introduced for, and because one of the three
signals cannot be known until the run is over — so this can only ever restrain
some untrusted runs, which makes it a real but partial win.

**Independent test:** Start a run under a condition known to be untrusting at
the point it starts, and confirm it is restrained, not merely marked.

**Acceptance scenarios:**

1. **Given** a run is untrusted for a reason known before it starts, **When**
   it runs, **Then** it is restrained accordingly and I can see what it was
   restrained from.
2. **Given** a run becomes untrusted only in hindsight, **When** it finishes,
   **Then** I am told plainly that it could not have been restrained, rather
   than being shown a control that did not apply.

---

## Interface & experience

### Surfaces

| Surface | New or existing | What the owner does here |
|---|---|---|
| Agent → what it can do | **new** (replaces two free-text boxes) | See the resolved answer, and change it by picking |
| Project → rules | **new** | Set what may happen in this project, for every agent |
| Workspace → default rules | **new** | Set the floor everything else sits under |
| Machine → what it shares | **new** | Nominate folders; say which agents may run here |
| Run → what it was allowed | **new** | See, after the fact, what this run's rules actually were |

### The four states

| State | What the owner sees |
|---|---|
| **Populated** | The resolved answer first and the raw settings second — what this agent can *actually* do, with each restriction attributed to the level that imposed it. The unrestricted case is stated in words, never shown as an empty list. |
| **Empty** | There is no true empty here, and that is the point: an agent with nothing set is *unrestricted*, not unconfigured. This state says so explicitly and offers the first sensible restriction rather than a blank panel. A machine with no nominated folders likewise says it is sharing nothing and offers the default. |
| **Loading** | A skeleton shaped like the resolved list. Because this screen answers a safety question, it must never show a partial list that could be read as a complete one — it is either loading or complete. |
| **Error** | Says which part could not be determined and refuses to imply the rest is safe. "Couldn't read this project's rules — what you're seeing is the agent's own settings only, not the final answer." Never a bare failure on a screen the owner is using to decide whether something is contained. |

### Flow

The load-bearing rule is that **the resolved answer leads and the raw settings
follow.** Today's screen is all inputs and no outcome, which is why the outcome
is invisible. Every surface above shows what is true first, and offers what to
change second.

## Edge cases

- What happens when rules disagree across levels? Settled: the strictest wins,
  and a denial anywhere is a denial. What is missing is showing *which* level
  denied it.
- What happens when an agent's rules change while a run is queued? Settled:
  the run keeps what it started with. What is missing is telling the owner.
- What happens when an agent delegates to another agent? Settled: a child can
  never exceed its parent. Should the owner be able to see the resulting chain?
- What happens when a rule names something that no longer exists — a tool that
  was renamed, a folder that was deleted?
- What happens when a project is a sandbox *and* a machine restricts folders
  *and* an agent has extra folders granted? Which wins, and can the owner tell
  before running it?
- What happens to running work when a permission is taken away mid-run —
  stopped, or allowed to finish?
- How is an agent that reaches an outside service governed — is that the same
  kind of permission as a tool, or a different kind?

## Requirements

### Functional requirements

- **FR-001**: Owner MUST be able to see, for any agent, what it is effectively
  allowed to do — the resolved outcome, not the raw settings — without running
  it.
- **FR-002**: Every restriction shown MUST be attributed to the level that
  imposed it.
- **FR-003**: Owner MUST be able to set what an agent may do by choosing from
  the real set of available things, each described, without typing a
  free-text name.
- **FR-004**: System MUST state, in words, when an agent is unrestricted —
  never represent it as an empty list.
- **FR-005**: A rule that can have no effect — naming something that does not
  exist, or granting what a higher level forbids — MUST be flagged as such at
  the moment it is set.
- **FR-006**: Owner MUST be able to set rules at the project level, applying
  to every agent working in that project.
- **FR-007**: Owner MUST be able to set workspace-wide default rules.
- **FR-008**: Each machine MUST state which locations it will answer questions
  about, defaulting to something useful at pairing, and MUST refuse anything
  outside them with that reason.
- **FR-009**: Owner MUST be able to restrict which machines an agent may run
  on, and a refused dispatch MUST say so.
- **FR-010**: A run MUST keep the rules it started with for its whole life,
  and the owner MUST be able to see what those were after it finishes.
- **FR-011**: A run the system flags as untrusted before it starts MUST be
  restrained, not only marked.
- **FR-012**: The model MUST express permissions as *a subject may do
  something at some level to some thing*, with the subject able to be a person
  as well as an agent — even though no person-level control is built here.
  Adding people later MUST NOT require a second vocabulary or a second
  enforcement path.
- **FR-013**: There MUST be exactly one place that describes a person's level,
  once people are added. The existing unused profile-level role
  ([`G-35`](../KnownGaps.md)) MUST be resolved as part of this work — given
  meaning or removed — so two vocabularies never coexist.

### Key entities

- **Subject**: the thing being permitted. An agent today; a person later; a
  machine where it acts on its own behalf.
- **Level of access**: how far a subject may go with something — from *see it*,
  through *use it*, to *change its settings*, to *control who else may*. The
  same ladder for every kind of thing, so it is learned once.
- **Scope**: the thing being permitted *about* — the whole workspace, one
  project, one machine, one agent, one run.
- **A rule**: one statement joining those three, set at a level, attributed to
  wherever it was set.
- **The resolved answer**: what all applicable rules add up to for a given
  subject in a given scope, at a given moment. This is what the owner reads
  and what the system enforces; it is not itself something anyone sets.
- **What a machine shares**: the locations a machine will answer about,
  independent of who asks. A property of the machine, not of the asker —
  which is why it sits beside the model rather than inside its subject axis.

## Success criteria

- **SC-001**: For any agent, the owner can answer "what can this do on this
  project" from one screen in under 30 seconds, without reading code or
  starting a run.
- **SC-002**: Restricting an agent from doing something results in it actually
  being unable to do it, demonstrated by a run that tries and is refused.
- **SC-003**: No screen represents an unrestricted agent as an empty list of
  permissions.
- **SC-004**: A deliberately mistyped rule is reported as having no effect at
  the moment it is saved, rather than being accepted silently.
- **SC-005**: A restriction set once on a project holds for an agent that was
  created afterwards and never individually configured.
- **SC-006**: Adding a person-level grant later requires no new vocabulary —
  demonstrated by writing down, at review time, exactly how a person with
  view-only access to one project would be expressed in this model. If that
  cannot be written in one sentence using the entities above, the model is not
  finished.
- **SC-007**: A newly paired machine shares something useful with no
  configuration, and the owner can see what it is without being told where to
  look.

## Assumptions

- **Agents first, people last, but people are designed for throughout.** The
  owner is the only person using the app today and directed this ordering:
  "human scope can be built at the very end, but all other things should be
  planned and built expecting that human access will be built in future."
  So no person-facing control is built here, and `FR-012`/`SC-006` are how
  that future is kept cheap rather than assumed.
- **The combination rules are already settled and are not reopened.** Strictest
  wins, denial anywhere is denial, a run is frozen at start, a delegated agent
  cannot exceed its delegator. This spec adds the controls and the visibility;
  it does not redesign that behaviour.
- **This decides the model, not a permissions product.** Per `AGENTS.md` §9,
  what is built is the smallest set of controls that makes the existing
  machinery usable and visible. The grid exists so each future question is
  looked up rather than re-invented — it is not a mandate to build every cell.
- **`OQ-6` is answered inside this spec, as US4**, with the owner's stated
  preference (nominated locations, sensible default at pairing). It stays open
  in the register until this spec is reviewed, so the answer is recorded as
  what the model says rather than as a one-off rule.
- **Approval gates are not in scope.** Pausing a run for a human to approve is
  [`D-1`](../Deferred.md) and is a different mechanism — permission is what a
  subject may do; a gate is a decision made while it is doing it. They belong
  together eventually and should not be conflated now.
- **The settings *page* is not in scope.** [`I-10`](../Ideas.md) covers the
  application's settings and customization surface as a whole; this spec
  decides what access means, and that surface is one of the things that will
  later render it.
- **Multi-workspace is untouched.** [`D-7`](../Deferred.md) stands: one person,
  one workspace.
- **Untrusted-run restraint can only ever be partial**, because one of the
  three signals is knowable only from a finished transcript. US5 is scoped to
  the two knowable at the start; the quarantine remains the mitigation for the
  third, by design.

## Owner review

**Reviewed:** — *(not yet reviewed; planning must not start before this is
filled in)*
