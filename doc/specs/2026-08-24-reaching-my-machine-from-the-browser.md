# Spec: Reaching my machine from the browser

| | |
|---|---|
| **Status** | **Draft — not yet reviewed** |
| **Created** | 2026-08-24 |
| **Trigger** | Owner, settling the three-component shape ([`D-24`](../Deferred.md)): "If the people don't want to use electron app, then daemon service installed on the machine and people can use it from web." That makes the browser a first-class way to use the app — and today the browser cannot reach the machine at all |
| **Plan** | not planned yet |
| **Open questions** | [`OQ-6`](../OpenQuestions.md) — how much of a machine a signed-in person may look at |

## The experience today

**Whole areas of the app are switched off in the browser, and they say so.**
Not subtly — they render a line of red text explaining that this feature runs
on the local machine and is not available from the web app. The owner is
signed in, their machine is paired and online, and the app still says no.

Walking it as the owner:

- **Terminals is a dead destination.** It sits in the sidebar between other
  working pages. Opening it and trying to start a session produces an error,
  every time. There is nothing else on the page.
- **"Browse…" doesn't browse.** Creating a project asks for a folder on the
  machine and offers a Browse button next to the box. The button opens a
  picker that immediately fails. The project can still be created — by typing
  the absolute path from memory, exactly right, with no confirmation that the
  folder exists until the whole thing fails later.
- **A project's own files are not visible.** Opening a project shows its
  board and its runs, but the tabs for its files, its git state and its pull
  requests are all dead ends.
- **Several smaller things fail the same way**: the provider list in
  settings, importing a skill that lives on the machine, re-scanning memory,
  reading a memory note in its original form, and the code graph.

**The common thread:** every one of these needs to look at, or run something
on, the computer the work actually happens on — and there is no way for the
app in a browser to ask that computer anything. The machine can be *told* to
start a run, and it reports back when it finishes. It cannot be *asked* a
question and answer it.

**Why this has been survivable until now.** The owner has been running the
app on the same computer as their machine, where a local copy of the app
could reach the filesystem directly. That local copy is being retired
([`D-24`](../Deferred.md)), and the whole point of the three-component shape
is that someone can install only the machine service and use the app from a
browser. For that person, today, a third of the app is switched off.

## What I expect instead

When I am signed in, and a machine of mine is online, the app should be able
to reach that machine — so that browsing its folders, reading a project's
files, and opening a terminal on it work from a browser the same way they
work when I am sitting in front of it. It should feel like the app is
reaching my computer, not like it is filing a request with it: folders open
when I click them, and a terminal types back at me. When no machine is
online, the app should say exactly that, and tell me what to do about it —
never that the feature doesn't exist here.

---

## User stories

### US1 — See my project's files from a browser (Priority: P1)

I open one of my projects from a browser on any computer, go to its files,
and see the real folder tree as it exists on the machine that project lives
on. I can click into folders and open a file to read it.

**Why this priority:** It is the substance of the thing. A project I cannot
look at is a row in a list. This is also the story that proves the whole
idea works, because it is ordinary question-and-answer — I ask for a folder,
the machine tells me what is in it — with no live streaming to complicate it.
If only this ships, the app is meaningfully more usable from a browser than
it is today.

**Independent test:** From a browser that is not on the machine, open a
project → Files → click through two levels of folders → open a text file and
read it.

**Acceptance scenarios:**

1. **Given** my machine is online and a project is registered on it, **When**
   I open that project's files, **Then** I see its top-level folders and
   files, and clicking a folder shows what is inside it.
2. **Given** I am looking at a project's files, **When** I open a text file,
   **Then** I see its contents.
3. **Given** my machine has gone offline since the page loaded, **When** I
   click into a folder, **Then** I am told plainly that the machine is not
   reachable right now, with its name and when it was last seen — and the
   folders I already opened stay on screen rather than being wiped.
4. **Given** a folder was deleted on the machine after I last looked,
   **When** I click into it, **Then** I am told it is no longer there, and
   the view returns me to the nearest folder that still exists.

---

### US2 — Point the app at a folder without typing its path (Priority: P2)

When I add a project, I press Browse and pick the folder on my machine, the
same way I would in a file dialog on that computer.

**Why this priority:** It is on the entry path — this is the first thing a
new person does — and today the Browse button is a button that fails. But it
is P2 rather than P1 because there *is* a way through: the path can be typed.
The cost is accuracy and confidence, not access.

**Independent test:** Add a project from a browser, press Browse, navigate to
a folder, select it, and see the path filled in correctly.

**Acceptance scenarios:**

1. **Given** my machine is online, **When** I press Browse, **Then** I see
   that machine's drives or top-level locations, and can navigate into them.
2. **Given** I have navigated to a folder, **When** I select it, **Then** the
   path box is filled in with that folder's real path on that machine.
3. **Given** no machine of mine is online, **When** I press Browse, **Then**
   I am told no machine is reachable and pointed at where to check on that —
   and the path box stays typeable so I am not blocked from continuing.

---

### US3 — Open a terminal on my machine from a browser (Priority: P2)

I open Terminals, start a session on one of my machines, and get a working
shell — I type, it responds, and output appears as it is produced rather
than in one lump at the end.

**Why this priority:** It converts a dead sidebar destination into a working
one, and it is the story that makes a remote machine feel genuinely
*reachable* rather than merely queryable. It is P2 rather than P1 because it
is the most demanding thing here — a terminal that lags is worse than no
terminal — and because the app is usable without it in a way it is not
usable without US1.

**Independent test:** From a browser not on the machine, open Terminals,
start a session, run a command that prints output slowly, and watch output
arrive progressively.

**Acceptance scenarios:**

1. **Given** my machine is online, **When** I start a terminal session,
   **Then** I get a prompt and typing produces output.
2. **Given** a session is open, **When** I run something that prints output
   over several seconds, **Then** I see it as it is produced, not all at the
   end.
3. **Given** a session is open, **When** my network drops briefly, **Then**
   the session shows that it has lost contact and either resumes or tells me
   it has ended — it never silently accepts keystrokes that go nowhere.
4. **Given** I close the browser tab, **When** I come back later, **Then**
   what happened to my session is stated plainly rather than left to guess.
   [NEEDS CLARIFICATION: should a terminal session survive the tab closing,
   or end with it? Surviving is more useful and costs a decision about when
   an abandoned session is cleaned up.]

---

### US4 — Choose which machine I am reaching (Priority: P3)

When I have more than one machine online, I can see which one a folder
listing or a terminal is coming from, and pick a different one.

**Why this priority:** It does not exist as a problem until there is a second
machine, and the owner has one. Building it early would be designing for a
situation nobody is in. But every surface above silently picks a machine, and
that choice becomes wrong the moment there are two.

**Independent test:** With two machines online, open Terminals, confirm which
machine is named, switch to the other, and confirm the new session is on it.

**Acceptance scenarios:**

1. **Given** two machines are online, **When** I open a surface that reaches
   a machine, **Then** it names which machine it is using.
2. **Given** two machines are online, **When** I switch to the other one,
   **Then** what I see is that machine's, and the choice is remembered next
   time I come back to that surface.

---

## Interface & experience

This feature mostly makes **existing** surfaces work rather than adding new
ones. What is genuinely new is a shared way of saying "your machine isn't
reachable" that behaves the same everywhere.

### Surfaces

| Surface | New or existing | What the owner does here |
|---|---|---|
| Project → Files | existing (dead) | Browse and read the project's real files |
| Add project → Browse… | existing (dead) | Pick a folder on the machine |
| Terminals | existing (dead) | Open a working shell on a machine |
| Machine indicator | **new** | See which machine a surface is reaching, and switch |
| "Can't reach your machine" notice | **new** | Understand why, and what to do next |

### The four states

Each surface keeps its own ordinary populated and empty states — a project
with no files still says so in its own words. What follows is the layer this
feature adds on top, and it must read the same on every surface above.

| State | What the owner sees |
|---|---|
| **Populated** | The real thing from the machine — folders, file contents, a live shell — with the machine's name visible somewhere unobtrusive, so it is never a mystery whose computer this is. |
| **Empty** | Distinguishes two different emptinesses, because they need different actions. *No machine has ever been paired* → explains what a machine is for and offers the pairing flow. *A machine exists but none is online right now* → names the machine, says when it was last seen, and offers to retry — it does not offer to pair a second one. |
| **Loading** | A skeleton shaped like the content being fetched — folder rows for a listing, a framed empty pane for a terminal. If the machine is slow to answer, the wait says which machine is being waited on rather than spinning anonymously. |
| **Error** | Says what failed in plain words and what to do: unreachable machine names the machine and its last-seen time; a refused or missing folder says so specifically; a machine that answered with a failure shows that failure. Never "runs on the local daemon and is not available from the web app" — that sentence is the bug this spec exists to remove. |

### Flow

The path is short by design, because the point is that there isn't one:

1. The owner opens an existing surface — a project's files, Browse, Terminals.
2. If a machine is online, they use it. No step in between, no "connect"
   button to press first.
3. If none is online, they get the empty state above, which links to
   Machines.

**The dead end to avoid:** an error that tells the owner to go somewhere
without linking there, or that names a state ("unreachable") without a time
attached. Both were already settled for the Machines page — "unreachable"
plus a last-seen time, never "turned off"
([`setup-and-machines`](2026-08-16-setup-and-machines.md), decision 1) — and
this spec inherits that wording rather than inventing a second vocabulary.

## Edge cases

- What happens when a folder has ten thousand files in it? The owner should
  get something usable rather than a frozen page, and should be told the view
  is partial if it is.
- What happens when a file is a 2 GB binary, or is currently being written?
  Opening it should refuse gracefully rather than attempt it.
- What happens when the machine is online but very slow — a spinning disk, a
  network drive that has gone away? There needs to be a point at which the
  app gives up and says so, rather than waiting forever.
- What happens when two browser tabs are open on the same terminal session?
- What happens when the owner's session expires while a terminal is open?
  A shell on someone's computer must not outlive their right to be there.
- What happens when a machine goes offline mid-answer — half a folder listing
  delivered, or a file half-read?
- How should it behave when the machine answers, but with something the app
  cannot make sense of? That is a broken or mismatched machine, and it should
  be named as such rather than shown as an empty folder.

## Requirements

### Functional requirements

- **FR-001**: The app MUST be able to ask an online machine a question and
  show the answer, while the owner waits — not queue the question for later
  collection.
- **FR-002**: Owner MUST be able to browse the folders of any machine of
  theirs that is online, within the boundaries decided in
  [`OQ-6`](../OpenQuestions.md).
- **FR-003**: Owner MUST be able to read the contents of a file inside a
  project registered on that machine.
- **FR-004**: Owner MUST be able to open a terminal session on an online
  machine and interact with it, with output appearing as it is produced.
- **FR-005**: System MUST show which machine any of these surfaces is
  currently reaching.
- **FR-006**: System MUST distinguish, in what it tells the owner, between
  *no machine has ever been paired*, *a machine exists but is not reachable
  now*, and *the machine answered and refused* — and offer the right next
  action for each.
- **FR-007**: System MUST stop waiting and say so if a machine does not
  answer within a reasonable time, rather than leaving a surface pending
  indefinitely.
- **FR-008**: Only someone signed in and entitled to that machine's workspace
  may reach it, and losing that entitlement MUST end any open session on it.
- **FR-009**: System MUST NOT tell the owner that a feature is unavailable in
  the browser when the real situation is that no machine is online.
- **FR-010**: A machine MUST be able to refuse a request, and the refusal
  MUST reach the owner as a specific reason rather than a generic failure.

### Key entities

- **A machine's reachability**: whether the app can get an answer from a
  given machine right now. Distinct from whether the machine exists, and
  distinct from whether it is running work.
- **A question and its answer**: something the app asks a specific machine on
  the owner's behalf, and what comes back. Short-lived and tied to the person
  who asked — unlike a run, which outlives the page that started it.
- **A live session**: a conversation with a machine that stays open and flows
  both ways, rather than one question and one answer. A terminal is the only
  one in this spec.
- **What a machine is willing to share**: the boundary of what a machine will
  answer questions about, independent of who is asking. Subject of
  [`OQ-6`](../OpenQuestions.md).

## Success criteria

- **SC-001**: From a browser on a different network from the machine, a
  folder listing appears in under 1 second on a normal home connection — fast
  enough to click through a tree without thinking about it.
- **SC-002**: In a terminal session, a typed character appears back on screen
  in under 200 ms on that same connection.
- **SC-003**: Every surface listed under Surfaces above works from a browser
  on a computer that is not the machine, with no local copy of the app
  installed on it.
- **SC-004**: No surface in the app tells the owner that a feature is
  unavailable in the web app. Checked by walking every destination in the
  sidebar.
- **SC-005**: With the machine deliberately stopped, every surface above
  shows the machine's name and its last-seen time, and offers a way forward —
  none shows a spinner that never resolves, and none shows a blank page.
- **SC-006**: A person who has installed only the machine service, and never
  the desktop app, can complete the journey from adding a project to opening
  a terminal on it, entirely in a browser.

## Assumptions

- **The person is already paired.** Getting a machine paired and online is
  [`setup-and-machines`](2026-08-16-setup-and-machines.md)'s journey, and
  installing the machine service without the desktop app is
  [`D-10`](../Deferred.md). This spec starts from "a machine is paired" and
  is about what the browser can then do with it.
- **This covers reaching *into* a machine, not asking it to do more work.**
  A separate group of things is switched off for a different reason — running
  a pipeline, starting a goal, drafting or test-spawning an agent, running a
  scheduled job now. Those need the machine to *perform* something, which the
  app can already ask for in other cases; they need new kinds of work
  defined, not a new way of reaching. They are deliberately out of scope and
  should get their own spec.
- **Which surfaces are in scope.** Project files, folder browsing and
  terminals are specified here. The remaining switched-off surfaces —
  provider settings, importing a skill from the machine, re-scanning memory,
  reading a memory note in its original form, the code graph, project git
  and pull requests, project briefing — are the same *kind* of problem and
  should become straightforward once this exists, but each has its own
  interface questions and none is specified here. Filed as
  [`I-11`](../Ideas.md).
- **Wording is inherited, not invented.** "Unreachable" plus a last-seen
  time, never "turned off", per
  [`setup-and-machines`](2026-08-16-setup-and-machines.md) decision 1.
- **One machine is the normal case.** US4 exists so the app is honest when
  that stops being true, not because multi-machine is expected soon.
- **Offline is out of scope.** The owner accepted online-only for the desktop
  shell on 2026-08-24 ([`D-24`](../Deferred.md)); this spec assumes the app
  is reachable and asks only whether the *machine* is.
- **New surfaces here are built in the current App Router idiom**, per
  `apps/web/CLAUDE.md` — a build convention rather than a spec decision,
  noted so the plan does not treat it as an open choice.

## Owner review

**Reviewed:** — *(not yet reviewed; planning must not start before this is
filled in)*
