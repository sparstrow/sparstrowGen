# Spec: Computers that are just there

| | |
|---|---|
| **Status** | Draft |
| **Created** | 2026-09-02 |
| **Trigger** | Owner, 2026-09-02: *"When our open in desktop or web, it should be able to find the device… Once found hit pair, and then paired. When the app is opened the daemon should always be automatically started and reachable. Once a machine is paired in the app, when the laptop is on, the machine should always able to reach."* Brought with three [multica](../../references/multica) screenshots — the Runtimes list, the "Add a computer" dialog, and Settings → Daemon — as the reference to match |
| **Plan** | [`../plans/2026-09-02-computers-that-are-just-there.md`](../plans/2026-09-02-computers-that-are-just-there.md) |
| **Open questions** | none — four framing decisions taken by the owner in the 2026-09-02 session, recorded under Assumptions |

## The experience today

**Connecting a computer is a chore, and it is the first thing anyone does.**

To use Sparstrowgen on a machine, the owner opens a terminal on that machine
and runs a command. Not a command they can discover — the Machines page prints
it, along with a note admitting the tool it names isn't published anywhere and
the machine needs a checkout of the repository to run it at all. The command
opens a browser, they click a button, and the machine appears. It works, and
it is four steps and a terminal for something that should be zero steps.

The desktop app makes this stranger, not simpler. The desktop app *is* running
on the machine. It already starts the local agent runtime, supervises it, and
restarts it when it crashes. It knows exactly which computer it is on. And it
still asks the owner to open a terminal and tell it what it already knows.

**Then the machine goes away when you close the app.** Closing the window
minimises to the tray and the runtime keeps going. Choosing Quit stops it
outright. Nothing on screen says the two are different, so a machine that was
online all week goes silently unreachable because the owner tidied their
taskbar. There is no setting for this, no status panel to check, and nothing
that says "this machine is unreachable because the app on it is closed" — it
simply reads as offline, the same as a laptop in a bag.

**And a machine belongs to exactly one workspace, forever.** The credential a
machine holds names one workspace and one runtime, decided at the moment it was
connected. The owner wants personal and work projects separated into different
workspaces on the same laptop. Today that requires connecting the same computer
twice, and even then the app refuses: belonging to two workspaces produces a
flat error, because there is no way to choose between them anywhere in the
interface.

**Nothing shows what has access.** A connected machine can be revoked from the
Machines page. That is the entire visibility surface. There is no list of
credentials, no record of when each was last used, and no single place to answer
"what can currently reach my account, and when did it last do so" — which is the
question that matters at exactly one moment, and it is a bad moment.

## What I expect instead

I install the desktop app, sign in, and my computer is *there* — no terminal, no
pairing screen, no step I had to know about. It stays there whenever the laptop
is on, whether or not the app's window is open, and if I ever want it to stop I
can find the switch and read the machine's status in plain words. My personal
and work workspaces both live on that one computer and I flip between them the
way I'd switch accounts anywhere else. And when I want to know what has access
to my account, there is one page that tells me, with a Revoke button next to
each row.

Multica is the reference for the feel of this, deliberately: its computers do
not get "paired", they simply show up, badged as this device.

---

## User stories

### US1 — My computer is ready the moment I sign in (Priority: P1)

The owner installs the desktop app, signs in, and the machine they are sitting
at appears in the Machines list, marked as this computer, within seconds. There
is no pairing step to find, no command to run, and no terminal involved. Signing
in *is* the proof that this computer is theirs.

**Why this priority:** it is the first thing every new person does and the
current version of it is the worst-quality moment in the product — a page that
tells you to run an unpublished command. Nothing else in this spec matters if
getting a computer connected still requires a terminal.

**Independent test:** on a machine that has never been connected, install and
open the desktop app, sign in, open Machines — the computer is listed, badged as
this device, and shows as reachable. No other action taken.

**Acceptance scenarios:**

1. **Given** a freshly installed desktop app and an account with one workspace,
   **When** the owner signs in, **Then** within a few seconds the Machines list
   shows this computer by its own name, badged as this device, marked reachable.
2. **Given** the owner is signed in and the computer is already listed, **When**
   they quit and reopen the app, **Then** the same computer is still listed —
   one entry, not a second copy, and the name they may have given it is kept.
3. **Given** the owner signs out and signs in as a different person on the same
   computer, **When** the second account's Machines list loads, **Then** the
   computer appears there under the second account, and stops acting on behalf
   of the first.
4. **Given** the computer cannot reach the internet at sign-in, **When** the
   owner opens Machines, **Then** it says this computer could not be registered
   because the service is unreachable, names the retry it is doing on its own,
   and does not show a half-connected machine as reachable.
5. **Given** the local agent runtime fails to start at all, **When** the owner
   opens Machines, **Then** the computer is shown as present but not running,
   with the reason and a way to start it — never silently absent.

---

### US2 — My machine is reachable whenever my laptop is on (Priority: P1)

Once a computer is connected, it stays connected. The agent runtime starts when
the owner logs in to the computer, keeps running when the app's window is
closed, and — by default — keeps running after the app is quit entirely. A
Settings panel says what it is doing, and the owner can turn either behaviour
off.

**Why this priority:** the owner's words were *"when the laptop is on, the
machine should always be able to reach"*. A machine that is only reachable while
a particular window is open is not a machine you can send work to from your
phone, which is the entire point of having connected it.

**Independent test:** connect a computer, quit the app completely, then from
another device open Machines — the computer still reads as reachable, and work
sent to it still runs.

**Acceptance scenarios:**

1. **Given** a connected computer with the app running, **When** the owner quits
   the app entirely, **Then** the machine stays reachable and continues to
   accept work.
2. **Given** the owner has turned off "keep running after quit", **When** they
   quit the app, **Then** the machine goes unreachable, and the Machines list
   says it is unreachable *because the app on it was closed* — not a bare
   offline.
3. **Given** the computer is restarted, **When** the owner logs back in to the
   computer, **Then** the machine becomes reachable again without the owner
   opening the app.
4. **Given** the agent runtime crashes, **When** the owner looks at the Settings
   panel on that computer, **Then** it shows the runtime as stopped with the
   time it stopped, and it has already been restarted automatically — or says
   why it gave up.
5. **Given** the owner wants to know whether it is working, **When** they open
   the Settings panel, **Then** they can read the running state, how long it has
   been up, the machine's identity, and which service it reports to, without
   opening a log file.

---

### US3 — Personal and work on one computer, switched in a click (Priority: P1)

The owner keeps a personal workspace and a work workspace. Both are theirs, on
the same laptop. The one computer serves both, and the owner switches which one
they are looking at from anywhere in the app.

**Why this priority:** the owner said it directly — *"I want to have one machine
many workspaces, I should be easily switched between workspace. I will create
personal, work related workspace in same machine."* Today belonging to two
workspaces is not merely unsupported, it is a hard error that locks the account
out of every page.

**Independent test:** create a second workspace, switch to it, confirm the same
computer is available there and that work sent from either workspace runs on it.

**Acceptance scenarios:**

1. **Given** the owner belongs to two workspaces, **When** they open the app,
   **Then** they land in one of them with its name clearly shown, and can switch
   to the other from a control that is present on every page.
2. **Given** the owner switches workspace, **When** the new workspace loads,
   **Then** the same computer is listed there as reachable, and the projects,
   chats and machines shown are that workspace's alone — nothing from the other
   leaks in.
3. **Given** the owner creates a brand-new workspace, **When** it opens, **Then**
   their existing computer is already available in it, with no reconnection step.
4. **Given** the owner is sent work in one workspace while viewing another,
   **When** it runs on the shared computer, **Then** its results appear in the
   workspace it was sent from, not the one being viewed.
5. **Given** the owner has exactly one workspace, **When** they open the app,
   **Then** the switcher does not clutter the interface with a choice that has
   one option — it identifies the workspace without demanding a decision.

---

### US4 — I can see what has access, and cut it off (Priority: P1)

One page lists every credential that can act as the owner: what it is called,
which computer it is on, when it was created, and when it was last used. Each
row has a Revoke button, and revoking takes effect on that credential's next
attempt.

**Why this priority:** it is the direct consequence of the decision that these
credentials do not expire. A credential with no expiry and no visible list is
one that can outlive a laptop the owner no longer has. This page is what makes
the non-expiring choice a safe one rather than a lazy one — it is not a
follow-up nicety.

**Independent test:** connect a computer, open the page, see the credential it
created; revoke it; the machine stops being able to act, and says why.

**Acceptance scenarios:**

1. **Given** two connected computers, **When** the owner opens the page, **Then**
   both credentials are listed with their name, computer, creation date, and last
   use in plain relative terms ("2 hours ago"), newest first.
2. **Given** the owner revokes the credential belonging to a lost laptop, **When**
   that laptop next tries to act, **Then** it is refused, it stops retrying, and
   the Machines list shows that machine as no longer connected.
3. **Given** the owner is about to revoke the credential for the computer they
   are currently sitting at, **When** they press Revoke, **Then** they are told
   plainly that this will disconnect this computer, and must confirm.
4. **Given** a credential has never been used, **When** it is listed, **Then** it
   says never used rather than showing a misleading date.
5. **Given** the page cannot load, **When** the owner opens it, **Then** it says
   the list of credentials could not be loaded and offers a retry — it never
   shows an empty list, which would read as "nothing has access".

---

### US5 — I add a computer that isn't this one (Priority: P2)

The owner wants to use a second machine — a desktop at home, a dev box. From the
Machines page they choose to add a computer and are given the exact commands to
run on it. The dialog then waits, and the moment that machine comes online it is
detected and shown, without the owner returning to the page to check.

**Why this priority:** it is the multica screenshot the owner shared, and it is
the only path for a machine that is not running the desktop app. It ranks below
US1 because the first computer — the one you are sitting at — is the common case
and US1 removes that step entirely.

**Independent test:** on a second machine, run the two commands shown; the dialog
on the first machine detects it without a refresh.

**Acceptance scenarios:**

1. **Given** the Add a computer dialog is open, **When** the owner runs the shown
   commands on another machine and signs in there, **Then** the dialog changes
   from waiting to found, names the machine, and the Machines list gains it.
2. **Given** the dialog is open and nothing happens, **When** several minutes
   pass, **Then** it still says it is waiting and how long it usually takes — it
   does not time out into an error that suggests something is broken.
3. **Given** the owner's other machine has no browser it can open, **When** they
   look at the dialog, **Then** there is a clearly-marked alternative for that
   case rather than a dead end. *(The alternative itself is US6.)*
4. **Given** the owner closes the dialog before the machine appears, **When** the
   machine comes online later, **Then** it still joins the list — closing the
   dialog cancels nothing.
5. **Given** the commands shown cannot be run because the tool is not published,
   **When** the dialog renders, **Then** it says so honestly rather than printing
   a command that will fail. *(Removable once distribution exists — see
   Assumptions.)*

---

### US6 — I connect a machine that has no browser at all (Priority: P3)

For a server, a CI runner, or a shell with no reachable browser, the owner
creates a credential in their own browser, copies it once, and gives it to that
machine.

**Why this priority:** it restores a capability that was deliberately given up
when typed pairing codes were removed ([`D-29`](../Deferred.md)). It is P3
because the owner has no such machine today — but the credential page US4 builds
makes this nearly free, so it is worth naming rather than re-deferring blindly.

**Independent test:** create a credential in the browser, hand it to a machine
with no display, and see that machine appear in Machines.

**Acceptance scenarios:**

1. **Given** the credentials page, **When** the owner creates a new credential by
   hand, **Then** it is shown exactly once, with a clear warning that it will not
   be shown again, and a copy control.
2. **Given** a headless machine given that credential, **When** it starts,
   **Then** it appears in Machines like any other computer.
3. **Given** the owner navigates away from the one-time display without copying,
   **When** they return, **Then** the credential is listed but its value is gone,
   and they are told to create a new one rather than shown a broken reveal.

---

## Interface & experience

### Surfaces

| Surface | New or existing | What the owner does here |
|---|---|---|
| Machines list | existing | See every computer, its reachability, and which one is this device |
| Add a computer dialog | **new** | Get the commands for another machine, and watch it arrive |
| Settings → Daemon | **new** | Read this computer's runtime status, and control start/stop behaviour |
| Settings → API Tokens | **new** | See what has access, revoke it, create one by hand |
| Workspace switcher | **new** | Move between personal and work without leaving the page |
| Machines empty state | existing | Understand there are no computers yet, and add one |

Shape to copy: the Machines list already uses the item-row treatment with an
entity tile and a state dot; the new dialog and both Settings cards should read
as siblings of what is there, not as a different app. Multica's three
screenshots are the intended feel — a quiet list, a dialog that waits without
nagging, and a diagnostics block that is plain rows of label and value.

### The four states

**Machines list**

| State | What the owner sees |
|---|---|
| **Populated** | Each computer as a row: name, this-device badge where it applies, reachability in words beside a state dot, its available runtimes, workload, and when it was last heard from |
| **Empty** | "No computers yet" with the explanation that the desktop app connects the computer it runs on automatically, and the Add a computer action for any other machine |
| **Loading** | Row-shaped skeletons in the list's own layout, not a spinner |
| **Error** | "Your computers couldn't be loaded" with the reason and Retry — never an empty list, which would falsely read as "you have none" |

**Add a computer dialog**

| State | What the owner sees |
|---|---|
| **Populated** | Numbered commands with copy buttons, and a live "Waiting for your computer" line that says it usually takes under a minute |
| **Empty** | n/a — this surface is always instructional |
| **Loading** | The waiting state *is* the loading state, and it is labelled as waiting rather than as loading, because nothing is being fetched |
| **Error** | If detection can't be established at all, it says the app can't currently watch for new computers and that the machine will still appear in the list once connected |

**Settings → Daemon**

| State | What the owner sees |
|---|---|
| **Populated** | Two switches with one line of consequence each, plus a diagnostics block: running state, uptime, process id, machine identity, service address, machine name, workspace count |
| **Empty** | On a machine where no local runtime applies (the web app in a plain browser), the card explains that these settings apply to the desktop app and is not shown as broken |
| **Loading** | Skeleton rows in the diagnostics block; switches disabled until their real value is known, never defaulted to off and then corrected |
| **Error** | "Couldn't reach the runtime on this computer" with the address it tried and a Retry — the switches stay visible but disabled |

**Settings → API Tokens**

| State | What the owner sees |
|---|---|
| **Populated** | One row per credential: name, computer, created, last used, Revoke |
| **Empty** | "Nothing has access yet" with the explanation that signing in on a computer creates one automatically, plus Create a token for the headless case |
| **Loading** | Row skeletons |
| **Error** | "Couldn't load what has access" with Retry — explicitly never an empty list |

**Workspace switcher**

| State | What the owner sees |
|---|---|
| **Populated** | Current workspace named, with the others listed to switch to, and Create workspace |
| **Empty** | Cannot occur — everyone has at least one; with exactly one it names it and offers Create rather than presenting a choice of one |
| **Loading** | The current workspace's name as a skeleton in place, with the rest of the page unblocked |
| **Error** | Names the failure and keeps the owner in their current workspace rather than dropping them somewhere ambiguous |

### Flow

**The common path (US1) has no steps.** Install → sign in → the computer is
listed. The only moment worth designing is the arrival: the machine appearing in
the list must read as something that just happened, not as a row that was always
there.

**The second-computer path (US5).** Machines → Add a computer → copy two
commands → run them on the other machine → sign in there → the dialog says found
→ close. The dead end to avoid: a machine that cannot open a browser. That is
signposted inside the dialog and lands on US6.

**The switching path (US3).** The switcher is present on every page. Choosing
another workspace reloads into that workspace's own data at the equivalent
place, not back to a landing page.

## Edge cases

- What happens when the same computer is signed in as two different people —
  does it hold two identities at once, or does the second replace the first?
  *(Decided: replace. See Assumptions.)*
- What happens when the owner is removed from a workspace while their computer is
  actively running work for it?
- What happens when a computer is connected but the owner belongs to no workspace
  at all — for instance immediately after account creation?
- What happens when two computers have the same hostname? Does the list become
  ambiguous?
- How should the Machines list behave with a computer that has been unreachable
  for months — does it stay in the list forever?
- What happens when the owner revokes the credential of the computer they are
  sitting at, from that computer?
- What happens when the runtime is running but the account it was connected with
  has been deleted?
- How does the Add a computer dialog behave if the owner opens it on a machine
  that is itself not yet connected?

## Requirements

### Functional requirements

- **FR-001**: When the owner signs in on a computer running the desktop app, the
  system MUST connect that computer to their account without any further action.
- **FR-002**: The system MUST identify, in the Machines list, which computer the
  owner is currently using.
- **FR-003**: Re-opening the app on an already-connected computer MUST NOT create
  a second entry for it, and MUST preserve any name the owner gave it.
- **FR-004**: Signing in as a different person on a computer MUST transfer that
  computer to the second account and stop it acting for the first.
- **FR-005**: The agent runtime MUST start when the owner logs in to the computer,
  without the owner opening the app.
- **FR-006**: The agent runtime MUST by default keep running after the app is
  quit, and the owner MUST be able to turn that off.
- **FR-007**: The owner MUST be able to read the runtime's state, uptime, and
  identity on that computer without opening a log file.
- **FR-008**: A machine that is unreachable because the app on it was closed MUST
  say so, distinctly from a machine that is simply offline.
- **FR-009**: One connected computer MUST be usable from every workspace the
  owner belongs to, including workspaces created after it was connected.
- **FR-010**: The owner MUST be able to switch workspace from any page, and
  belonging to more than one workspace MUST never produce an error.
- **FR-011**: Work sent from a workspace MUST return its results to that
  workspace, regardless of which workspace the owner is viewing.
- **FR-012**: The system MUST show every credential that can act as the owner,
  with its name, computer, creation time, and last use.
- **FR-013**: The owner MUST be able to revoke any credential, and a revoked
  credential MUST stop working on its next use.
- **FR-014**: Credentials MUST NOT expire on their own.
- **FR-015**: Revoking the credential of the computer in use MUST require an
  explicit confirmation that names that consequence.
- **FR-016**: The Add a computer dialog MUST detect a newly-connected machine
  without the owner refreshing or reopening it.
- **FR-017**: Closing the Add a computer dialog MUST NOT cancel a connection in
  progress.
- **FR-018**: The owner MUST be able to create a credential by hand, shown once,
  for a machine that cannot open a browser.
- **FR-019**: Every surface in this spec MUST distinguish "failed to load" from
  "there is nothing here".

### Key entities

- **Computer**: a physical machine the owner has connected. Has a name they can
  change, an operating system, a reachability state, and belongs to the *person*
  rather than to a single workspace.
- **Runtime**: a thing on a computer that can actually run work — one per agent
  tool available there, per workspace it serves. A computer has many.
- **Credential**: what lets a computer act as the owner. Created automatically at
  sign-in or by hand, named, revocable, never expiring, and its secret value is
  visible exactly once.
- **Workspace**: a separate space of projects, chats and history belonging to the
  owner. A person has many; a computer serves all of the owner's.

## Success criteria

- **SC-001**: A new owner goes from a downloaded installer to a reachable
  computer in their Machines list without opening a terminal, and without being
  shown any pairing step.
- **SC-002**: The number of owner actions required to connect the computer they
  are sitting at is **zero**, beyond signing in.
- **SC-003**: A connected computer remains reachable across quitting the app,
  logging out of the computer, and restarting it — verified by sending work to it
  from a second device with the app closed on the first.
- **SC-004**: The owner can state, from one page, what has access to their
  account and when each thing last used it.
- **SC-005**: An owner with two workspaces can reach every page of the app in
  both, and can switch between them without a full navigation back to a landing
  page.
- **SC-006**: A revoked credential stops working within one request, and the
  affected machine reports the reason rather than retrying silently.
- **SC-007**: Every surface named in this spec renders all four states, verified
  in both light and dark and on the Paper and Mono surfaces.

## Assumptions

**Framing decisions taken by the owner in the 2026-09-02 session**, after the
options were laid out with pros, cons, score, and blast radius:

1. **A computer authenticates as the person, not as one workspace.** The owner
   chose multica's model explicitly — *"I like multica's way of handling the user
   scenario… go with user's PAT"* — after being shown that a leaked credential
   then acts as them across every workspace, rather than as one machine in one
   workspace. This is a deliberate widening of blast radius, accepted knowingly;
   it is recorded as a decision in the plan and gets a `doc/security/` note.
2. **One computer serves every workspace the owner belongs to**, with a switcher.
   The owner's qualifier matters and is taken as a boundary: *"Right now I am not
   gonna be added to client or external user workspace… I will create personal,
   work related workspace in same machine."* This spec therefore assumes all of a
   person's workspaces are **their own**. Being added to someone else's workspace,
   and whether a machine should auto-join it, is **out of scope** and filed as a
   new deferral.
3. **Credentials do not expire**, and the credentials page (US4) is the
   compensating control rather than an optional extra.
4. **The runtime keeps running after the app is quit, by default**, with a
   Settings switch to change it — not registered as an operating-system service.
   The service route was presented and scored lower on blast radius; it stays
   available as later hardening.

**Other assumptions:**

5. **Existing connected machines will be disconnected once and reconnected.**
   Running the old and new credential models side by side across every machine-
   facing route doubles the trust surface for a transition that, pre-release,
   affects a handful of machines.
6. **US5's commands are honest about distribution.** The tool is still not
   published and the Machines page already says so. The dialog inherits that
   caveat until distribution exists ([`D-10`](../Deferred.md)); it is not a
   reason to delay the dialog.
7. **US6 closes [`D-29`](../Deferred.md)** (headless/remote pairing), which was
   parked when typed pairing codes were dropped. It is not re-deferred: the
   credentials page makes it nearly free, so it is written as a real, low-priority
   story instead.
8. **Scope boundary — nothing here changes what a machine may *do*.** Permissions,
   terminal access and the agent access model are a separate spec
   ([`2026-08-24-what-an-agent-is-allowed-to-do`](2026-08-24-what-an-agent-is-allowed-to-do.md))
   and are untouched.
9. **Scope boundary — no local-network discovery.** The owner's words were "find
   the device", but the reference does not scan for machines and neither will
   this: the Add a computer dialog is a waiting room. A browser probing the
   computer it runs on was scored and rejected (works only for the machine you
   are already on, requires relaxing a deliberate protection, unreliable across
   browsers).

## Owner review

**Reviewed:** — pending

<!-- The four framing decisions above were taken live on 2026-09-02, but this
document itself has not been read back to the owner. Planning proceeded on the
owner's explicit instruction in the same session ("you can spec, plan, design the
frontend, and backend… go ahead for completeness"). The review gate is therefore
still open on the written form, and this row must be filled before build starts. -->
