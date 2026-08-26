# Spec: A terminal on my machine

| | |
|---|---|
| **Status** | **Draft** — the four framing decisions were taken by the owner on 2026-08-24 *before* this was written (see [Owner review](#owner-review)), and planning was authorized in the same turn. The document itself has not been read back. |
| **Created** | 2026-08-24 |
| **Trigger** | The owner, picking the next thing to build after the Vite retirement: "lets build the terminal." Terminals is a destination in the sidebar that has never worked from a browser and says so |
| **Plan** | [`../plans/2026-08-24-a-terminal-on-my-machine.md`](../plans/2026-08-24-a-terminal-on-my-machine.md) |
| **Open questions** | none. [`OQ-6`](../OpenQuestions.md) states explicitly that it does **not** block terminals |

## The experience today

**Terminals is a dead destination.** It sits in the sidebar between pages that
work. Opening it shows an empty frame and two buttons — *Agent terminal* and
*Shell*. Pressing either produces an error, every time, on every machine, in
every browser. There is nothing else on the page, and no explanation that
means anything: the app does not say "your machine is asleep" or "you are not
allowed to do that", it says the feature is not available here — which is not
true of the feature and not true of here.

What makes this worth fixing rather than removing: **the hard part is already
built and running.** The machine can open a real shell, keep it alive, remember
what was on screen, and hand it back. It has been able to do that the whole
time. The only thing missing is a way for a browser that is not sitting on that
machine to reach it — and now that the local copy of the app has been retired,
"a browser that is not sitting on that machine" is the only kind there is.

## What I expect instead

When I am signed in and one of my machines is on, I open Terminals and get a
real shell on that computer — I type, it answers, output appears as it is
produced. It says whose computer I am on. If I close the laptop and come back
tomorrow, the session I left running is still there with its output intact; and
if it isn't, the app tells me plainly why rather than leaving me to guess. When
no machine is on, it says which machine and when it was last seen. It never
tells me the feature doesn't exist here.

---

## User stories

### US1 — Open a shell on my machine from a browser (Priority: P1)

I open Terminals from any browser I am signed in on, press one button, and I am
at a prompt on my machine. I type a command; it runs on that computer and
prints back at me as it goes.

**Why this priority:** It is the whole feature. Everything else here is a
refinement of it, and none of the refinements is worth anything without it. It
is also the story that turns a dead sidebar entry into a working one, which is
the most visible thing this delivers.

**Independent test:** From a browser on a computer that is not the machine, open
Terminals → press Shell → type a command that prints slowly → watch the output
arrive progressively → type another and see it run.

**Acceptance scenarios:**

1. **Given** my machine is on, **When** I open Terminals and press Shell,
   **Then** I get a prompt within a couple of seconds, and the page names the
   machine I am on.
2. **Given** a session is open, **When** I run something that prints for several
   seconds, **Then** I see the output as it is produced, not all at the end.
3. **Given** no machine of mine has ever been paired, **When** I open Terminals,
   **Then** I am told what a machine is for and offered the way to pair one —
   not an error.
4. **Given** my machine is paired but off, **When** I open Terminals, **Then** I
   am told the machine's name and when it was last seen, and offered a retry —
   never that terminals are unavailable in the browser.
5. **Given** a session is open, **When** my network drops, **Then** the session
   says it has lost contact and stops accepting keystrokes that would go
   nowhere; when the network returns it either reconnects to the same session or
   says plainly that it could not.
6. **Given** a command starts producing output faster than the page can show it,
   **When** that continues, **Then** I am told output is being suppressed and
   given a way to stop the command — the page does not freeze and the session
   does not die silently.

---

### US2 — Come back to a session I left running (Priority: P2)

I start something long, close the tab, and come back later — from the same
browser or a different one. My session is still there, still running, with what
it printed while I was gone.

**Why this priority:** It is what makes a terminal usable for the thing people
actually open terminals for. P2 rather than P1 because US1 alone is already a
working terminal; this makes it a trustworthy one.

**Independent test:** Start a command that runs for several minutes, close the
tab, reopen Terminals from a different browser, and find the session still
running with its output.

**Acceptance scenarios:**

1. **Given** I have a session running, **When** I close the tab and reopen
   Terminals an hour later, **Then** the session is listed, I can reattach to
   it, and I see what it printed while I was away.
2. **Given** I have sessions running, **When** I open Terminals, **Then** I see
   every live session on that machine with how long it has been open — not just
   the one I last used.
3. **Given** a session's shell exited on its own, **When** I next look, **Then**
   it is not in the list, and if it was the one I was attached to I am told it
   ended rather than shown a frozen pane.
4. **Given** my machine restarted while I was away, **When** I come back,
   **Then** I am told the sessions ended because the machine restarted — not
   shown an empty list with no explanation.
5. **Given** I no longer want a session, **When** I close it, **Then** it ends
   on the machine and stops using anything there.

---

### US3 — Open an interactive agent session (Priority: P2)

Instead of a bare shell, I start a session that drops me straight into one of my
agents' command-line tools, running on my machine, and I talk to it directly.

**Why this priority:** It is the button the page leads with today, and the
machine already knows how to spawn it — so leaving it out would mean the page
visibly loses something even as it starts working. P2 because a plain shell can
reach the same tools by typing their name.

**Independent test:** Open Terminals → pick an agent → press Agent terminal →
land inside that agent's interactive tool on the machine → have an exchange with
it.

**Acceptance scenarios:**

1. **Given** an enabled agent whose tool has an interactive mode, **When** I
   start an agent session for it, **Then** I land inside that tool on my machine
   and can interact with it.
2. **Given** an agent whose provider has no interactive mode, **When** I look at
   the agent list here, **Then** it is not offered — I am not allowed to pick
   something that will fail.

---

### US4 — Turn browser terminals off for a machine (Priority: P3)

On a machine's own page I can switch off its willingness to give out terminals,
and the machine stops answering for them — not just the button disappearing.

**Why this priority:** A shell reachable from any browser is the largest single
thing this app can hand out, and there should be one obvious place to take it
back without unpairing the machine. P3 because nothing is broken without it and
the default is the state most people want.

**Independent test:** Switch the machine's terminal access off, then try to open
a terminal on it from a browser and be refused by the machine.

**Acceptance scenarios:**

1. **Given** a paired machine, **When** I look at its page, **Then** I can see
   whether it currently allows terminals and change it there.
2. **Given** I have switched terminals off for a machine, **When** I open
   Terminals and choose it, **Then** I am told that machine does not allow
   terminals and pointed at where to change it.
3. **Given** sessions are open on a machine, **When** I switch its terminal
   access off, **Then** those sessions end rather than continuing invisibly.

---

## Interface & experience

Terminals stays where it is and keeps the shape it has — a row of controls, a
list of open sessions, one big black pane. What changes is that it works, that
it says which computer it is talking to, and that every way it can fail says
something true.

### Surfaces

| Surface | New or existing | What the owner does here |
|---|---|---|
| Terminals | existing (dead) | Open, use, list, reattach to and close shells on a machine |
| The session list on that page | existing (cosmetic) | See every live session on the machine, not just this tab's |
| The machine's name on that page | **new** | Know whose computer this is, without opening another page |
| A machine's page → terminal access | **new** | Switch a machine's willingness to give out terminals |

### The four states

| State | What the owner sees |
|---|---|
| **Populated** | A live shell, with the machine's name legible and unobtrusive above it, and every open session on that machine listed with how long it has been running. |
| **Empty** | Four different emptinesses, because each needs a different action. *No machine ever paired* → what a machine is for, and the way to pair one. *A machine exists but is off* → its name, when it was last seen, and a retry. *Machine on, no session open yet* → the two buttons and one line saying what they do. *Terminals switched off for this machine* → says so, and links to the machine's page. Never a bare "No sessions". |
| **Loading** | A framed pane in the terminal's own colours with a line naming the machine being waited on — never an anonymous spinner, because the wait is on a specific computer and saying which one is most of the information. |
| **Error** | Plain words plus the next action. *Unreachable* names the machine and its last-seen time, inheriting the Machines page's wording. *Not permitted* says terminals are restricted on this workspace. *Machine refused* shows the machine's own reason. *Session ended* distinguishes "the shell exited", "you closed it", "the machine restarted" and "the machine stopped allowing terminals". Never "not available from the web app" — that sentence is the bug this spec exists to delete. |

### Flow

1. The owner opens Terminals. There is no connect step and nothing to configure
   first.
2. If a machine of theirs is on and allows terminals, they see its name, any
   sessions already running on it, and the two buttons.
3. Pressing a button gives them a prompt. Typing works.
4. Closing the tab leaves the session running. Coming back lists it.
5. If none of that is possible, they get the matching empty or error state
   above, each of which links to the one page that can fix it.

**The dead end to avoid:** naming a state without a time attached, or telling
someone to go somewhere without linking there. Both were settled once already
for the Machines page — "unreachable" plus a last-seen time, never "turned off"
([`setup-and-machines`](2026-08-16-setup-and-machines.md), decision 1) — and
this spec inherits that vocabulary rather than inventing a second one.

## Edge cases

- What happens when someone opens twenty sessions and forgets them? Sessions now
  outlive the tab that made them, so there must be a ceiling and it must be
  visible, not a surprise.
- What happens when two tabs attach to the same session? Both should work, and
  typing in one should be visible in the other — a terminal is a shared screen,
  not a private one.
- What happens when a command floods the screen faster than it can be delivered?
  Covered by US1.6; the requirement is that neither the page nor the session
  dies.
- What happens when someone signs out with a session open, or their access to
  the workspace is taken away? A shell on someone's computer must not outlive
  their right to be there.
- What happens when the machine is on but very busy? There has to be a point at
  which the app stops waiting and says so.
- What happens when a session's shell exits by itself — the person typed `exit`,
  or the tool crashed?
- What happens when the pairing is revoked while sessions are open?
- What happens when the person opening a terminal is a workspace member but not
  an owner or admin? They should be told they are not permitted, in those terms,
  rather than shown a button that fails.

## Requirements

### Functional requirements

- **FR-001**: Owner MUST be able to open a shell on any of their machines that
  is on, from a browser that is not that machine, and interact with it.
- **FR-002**: Output MUST appear as it is produced rather than in one block at
  the end.
- **FR-003**: A typed character MUST appear back on screen fast enough that
  typing does not feel remote.
- **FR-004**: A session MUST survive the tab being closed, and MUST remain
  available to reattach to until it is closed, its shell exits, the machine
  restarts, or the machine stops allowing terminals.
- **FR-005**: The app MUST list every live session on the machine it is
  reaching, not only sessions this browser opened.
- **FR-006**: The app MUST show which machine any terminal surface is currently
  reaching.
- **FR-007**: System MUST distinguish, in what it tells the owner, between *no
  machine has ever been paired*, *a machine exists but is not reachable now*,
  *this machine does not allow terminals*, *you are not permitted*, and *the
  machine answered and refused* — and offer the right next action for each.
- **FR-008**: System MUST NOT tell the owner that terminals are unavailable in
  the browser.
- **FR-009**: Only someone signed in, entitled to that machine's workspace, **and
  holding an owner or admin role in it**, may open or attach to a terminal on
  it.
- **FR-010**: Losing that entitlement MUST prevent any further attachment, and
  revoking the machine's pairing MUST end its sessions.
- **FR-011**: Owner MUST be able to switch a machine's terminal access off from
  that machine's page, and the machine MUST enforce it — a browser that ignores
  the switch MUST still be refused.
- **FR-012**: System MUST bound how many sessions a machine will hold at once,
  and MUST say so when the ceiling is reached rather than failing opaquely.
- **FR-013**: System MUST bound how much output it will carry from one session,
  and MUST tell the owner when it starts suppressing rather than freezing or
  dying.
- **FR-014**: System MUST stop waiting and say so if a machine does not answer
  within a reasonable time.
- **FR-015**: Owner MUST be able to start a session inside an agent's
  interactive command-line tool, and MUST NOT be offered agents whose provider
  has no such mode.

### Key entities

- **A terminal session**: a live shell running on a machine, belonging to that
  machine rather than to the browser that started it. It has an age, whatever it
  has recently printed, and whether anyone is currently watching it.
- **A machine's willingness to give out terminals**: a state of the machine
  itself, visible on its page, that the machine enforces for itself.
- **Reachability**: whether the app can get an answer from a given machine right
  now. Already a concept on the Machines page; this spec adds no second meaning
  for it.

## Success criteria

- **SC-001**: A typed character appears back on screen in under 200 ms from a
  browser on a different network from the machine, on a normal home connection.
- **SC-002**: A command that prints for ten seconds is visible progressively
  throughout, not delivered as one block at the end.
- **SC-003**: A session started, abandoned for an hour with the tab closed, and
  reopened from a different browser is still running and still shows what it
  printed in between.
- **SC-004**: No terminal surface in the app tells the owner a feature is
  unavailable in the web app. Checked by opening Terminals in every state.
- **SC-005**: With the machine deliberately stopped, Terminals shows the
  machine's name and last-seen time and offers a way forward — not a spinner,
  not a blank page, not an error code.
- **SC-006**: A person who installed only the machine service, never the desktop
  app, can open a working terminal on it entirely from a browser.
- **SC-007**: With the machine's terminal access switched off, an attempt to
  open one is refused **by the machine**, not merely hidden by the page.

## Assumptions

- **The person is already paired.** Getting a machine paired and on is
  [`setup-and-machines`](2026-08-16-setup-and-machines.md)'s journey. Installing
  the machine service without the desktop app is [`D-10`](../Deferred.md). This
  spec starts from "a machine is paired".
- **A shell is unrestricted, and the control is who gets one.** The owner decided
  on 2026-08-24 that terminals are owner/admin-only rather than available to
  every workspace member. Confining the shell itself was rejected as theatre —
  the reasoning is [`OQ-6`](../OpenQuestions.md)'s, which says in as many words
  that terminals are deliberately *not* bounded by the folder-sharing boundary
  because a shell can go anywhere its account can. This spec therefore grants
  more than folder browsing will, on purpose.
- **Sessions outlive tabs, and that has a cost.** The owner chose
  survive-until-closed over the machine's current ten-minute grace, knowing that
  abandoned shells accumulate. FR-005 and FR-012 exist because of that choice: a
  ceiling, and a list that always shows what is actually running.
- **One machine is the normal case.** Where more than one is on, the app names
  which it is using and lets the owner switch; it does not build a machine
  manager. The full multi-machine treatment is US4 of
  [`reaching-my-machine-from-the-browser`](2026-08-24-reaching-my-machine-from-the-browser.md).
- **Offline is out of scope**, per [`D-24`](../Deferred.md). This assumes the app
  is reachable and asks only whether the *machine* is.
- **Scope boundary — this is terminals only.** Project files and folder browsing
  are the other two stories of
  [`reaching-my-machine-from-the-browser`](2026-08-24-reaching-my-machine-from-the-browser.md),
  whose US3 this spec supersedes; the remaining switched-off surfaces are
  [`I-11`](../Ideas.md). They are the same *kind* of problem and should become
  much cheaper once this exists, but none is specified here.
- **Scope boundary — no cloud record of terminal activity.** Who opened a shell
  and when is recorded on the machine and in its logs, not in the control plane.
  Parked as [`D-26`](../Deferred.md) rather than built for a one-person
  workspace.

## Owner review

**Reviewed:** — *(the document has not been read back; the four decisions below
were taken before it was written)*

On 2026-08-24, before this spec existed, the owner answered four framing
questions that would otherwise have been `[NEEDS CLARIFICATION]` markers or `OQ`
entries, and authorized planning in the same turn:

| Question | Chosen | Recorded in |
|---|---|---|
| What carries keystrokes to the machine and output back? | The existing hosted realtime service, with both ends connecting outward to it | A plan decision — no technology belongs in this file |
| Does a session survive the tab closing? | **Yes, until closed** — over the recommended middle option and over the machine's current ten-minute grace | US2, FR-004, FR-012 |
| Who may open one, given a shell is unrestricted? | **Owner/admin only** — over any-member and over confining the shell | FR-009, and the second Assumption |
| How much ships first? | **Shell and agent terminals both** | US1 and US3 |

**One correction to what was put to the owner.** The owner/admin option was
described as resolving [`G-35`](../KnownGaps.md) as a side effect. It does not.
It gives `workspace_members.role` a fifth thing it genuinely governs, but
`users.role` — the decorative column that gap is actually about — is untouched
by this work and stays decorative.
