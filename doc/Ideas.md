# Ideas

Unscoped. No commitment, no decision behind them, possibly never built. If an
idea graduates it becomes a **spec** in `doc/specs/` — owner review first, per
`doc/README.md`'s lifecycle — or gets a decision and moves to `Deferred.md`.
(I-10 is the worked example: it spawned a spec and stayed open, because the
spec took only one dimension of it.)

Distinct from `Deferred.md`: those were agreed and parked. These were merely
noticed.

**Writing an entry here is a procedure — invoke the
[`elaborating-ideas`](../.claude/skills/elaborating-ideas/SKILL.md) skill.**
An idea's whole value is that it makes something *thinkable*: what is true in
the code today, the reframe that changes what the idea is about, a shape
concrete enough to argue with, what it collides with, and the decisions it
would need — named, and answered nowhere. An entry that decides its own open
questions has become an unreviewed spec; one written without opening the code
reads exactly like one that was.

---

## I-1 — Same-LAN direct daemon connection

Decision 2 routes every command through the cloud, which is correct for
correctness and NAT traversal. But when the browser and the daemon are on the
same network — the common desktop case — a direct local connection would cut a
round trip for transcript streaming and chat turns.

Only ever as an *optimization layered on* the cloud path, never as the primary
transport: exposing the daemon's host-process API is precisely what core's
`cors: { origin: false }` was added to prevent.

*Surfaced while scoring Decision 2 Option C.*

---

## I-2 — Full-text search across run transcripts

Once transcripts are in Postgres, "which run touched this file / hit this error"
becomes answerable. Cheap while transcripts stay in the database; needs a
separate index if D-3 ever moves them to Drive, which is an argument for building
it before archiving rather than after.

---

## I-3 — Cross-run cost and behaviour analytics

`runs` already carries `cost_usd`, `num_turns`, `duration_ms`, and
`effective_tools`. Aggregating across runs would answer: which agent is
expensive, which tools actually get used, where time goes, whether a prompt
change helped.

The `GraphUsageLine` component in `run-detail.tsx` already does a miniature
version of this for graph tools — counting `tool_use` blocks out of the
transcript — so the pattern exists.

---

## I-4 — Ephemeral per-task git workspaces (Multica model)

Multica never binds user-chosen paths: it clones into
`~/multica_workspaces/{workspace_id}/{task_id_short}/` per task and
garbage-collects when the issue closes. Portability becomes free — a project is
just a git URL — and `runtime_projects` bindings largely stop mattering.

Rejected for now because it gives up working in-place on an existing checkout
with uncommitted changes, which is how this repo is actually used. Worth
revisiting as an *option per project* rather than a global mode — sandbox and
`is_sandbox` projects are the natural candidates.

---

## I-5 — Self-hosted Postgres

Removes the free-tier ceiling, gives backups on your own terms, and makes
transcript retention a non-issue. Rejected during Decision 1 because it trades
"management is easier" — the actual reason cloud-canonical won — for an
operational burden.

Only interesting if self-hosting becomes necessary for another reason.

---

## I-6 — Surface memory-retrieval failures in the UI

`buildMemoryBlock` catches retrieval errors and silently falls back to recency:

```js
} catch (err) {
  logger.warn({ err }, "memory retrieval failed — falling back to recency");
}
```

The run still succeeds — it just quietly had worse context. Today this barely
matters because retrieval is a local file read that can't time out. It would
matter a lot if memory ever moved to a network call (see D-5), and it's cheap to
surface now: the run detail page already renders a "Memory injected:" row, so a
degraded-retrieval badge has an obvious home.

---

## I-7 — Stale-reference sweep

`packages/core/src/db/schema.ts` cites
`docs/archive/fable-handoff/P3-SEAM-TABLE.md`, which does not exist — there was
no `doc/` or `docs/` directory in the repo at all before this one. Worth a pass
over code comments for other pointers to files that have moved or were never
committed.

---

## I-8 — Feed "about you" and workspace "context" into a run

M9 adds `users.bio` and `workspaces.context`, and
[the setup spec](specs/2026-08-16-setup-and-machines.md) describes both as the
text an agent reads before working on the owner's behalf — role, stack,
preferences, what the workspace is for. M10 stores and displays them. **Nothing
reads them.**

Actually wiring them into a run is its own piece of work with its own
decisions: where in the prompt they sit relative to the memory block and the
project directives, what happens when they are empty (omit the section entirely,
or say "not provided"?), whether they count toward the same budget
`buildMemoryBlock` works against, and whether a delegated sub-agent inherits
them.

Worth doing — the fields have no other purpose — but not worth guessing at
inside a phase about setup UI. Raised while decomposing M9/M10.

---

## I-9 — Server-side image processing for avatars and logos

`T-M9-04` accepts an uploaded image as-is: no resize, no re-encode, no EXIF
strip. A 2 MB bucket limit bounds the damage, and a 2 MB PNG rendered into a
32px badge is wasteful rather than harmful.

If this ever matters — many members, mobile bandwidth, or someone uploading a
photo whose EXIF carries GPS coordinates — the fix is a transform on upload.
Supabase has an image transformation service on paid plans; a serverless
re-encode is the alternative. Deliberately not built for one owner and two
images.

---

## I-10 — Application settings & customization surface

Every milestone so far built page after page — chat, projects, agents,
machines, workspace/profile identity (M9), the setup guide (M10) — without a
matching pass over the *application's own* settings and customization
surface. What exists under Settings today is thin: mostly M9's
workspace/profile forms and M4's per-runtime WIP-snapshot toggle.

Raised as a representative list, not a scoped one — the owner's own words
were "I just gave a random list, but we need to properly design the settings
page": profile, preferences, keyboard shortcuts, issue tracking, chat
notifications, update behavior, repository-level (project) settings, members
and invites, task/status property customization, and MCP server
configuration.

Several of these — members/invites, task status properties — don't exist as
concepts anywhere in the app yet and need real product decisions, not just a
settings row for something already built. That's why this graduates to a
`doc/specs/` entry and owner review before a plan, rather than being written
straight from this list.

*Raised 2026-08-22, by the owner, after M11 closed out the Machines/Setup
work. See also I-8 above (workspace `context`/user `bio` unused) and
[D-17](Deferred.md) (the theme picker) — both are settings-shaped work this
idea would likely absorb rather than duplicate, once it's scoped.*

### Access and permissions is the dimension of this that is already leaking

**Added 2026-08-24, by the owner**, on being asked to decide a machine's
file-sharing boundary in isolation ([`OQ-6`](OpenQuestions.md)): "we should not
just think and [be] bound to only one access. We should [design] project access
settings for users, agents on what level they can access and configure."

The point is correct and evidenced. Access is not one decision that OQ-6 needs;
it is a grid — **who** (a person, an agent, a machine) may do **what** (see,
use, configure, administer) to **which thing** (workspace, project, machine,
agent, secret, run, chat) — and the app has been filling cells in it one at a
time, by hand, without the grid existing. What is in the tree today:

| Mechanism | Where | What it actually covers |
|---|---|---|
| `workspace_members.role` | RLS, [`001_rls.sql`](../packages/shared/drizzle/policies/001_rls.sql) | Real, but only 4 things: workspace rename/delete, daemon tokens, others' pairing codes, runtime-command update |
| The generic member policy | [`001_rls.sql:124`](../packages/shared/drizzle/policies/001_rls.sql:124) | Everything else. **Any member = full read/write on all content.** No viewer, no read-only |
| `effectiveTools` clamp | `packages/core`, at spawn | What tools an *agent* gets — the only per-agent capability control that exists |
| Untrusted-run badging | [`G-5`](KnownGaps.md) | Badges, does not clamp writes. An access control that was started and not finished |
| `users.role` | [`schema.ts:71`](../packages/shared/src/db/schema.ts:71) | **Nothing.** Decorative — see [`G-35`](KnownGaps.md) |
| HITL gates | [`D-1`](Deferred.md) | Parked. The approval half of the same problem |

**The half that is urgent is not the half that feels urgent.** Multi-user is
the familiar frame, and it is genuinely coming — but there is one person on
this workspace today, and there are already autonomous agents running commands
on that person's machine right now, governed by a partial tool clamp and an
unfinished write clamp. Agents are the subject with real exposure today;
people are the subject with real exposure later. A model that treats agents as
an afterthought to a people-permissions system would get the ordering exactly
backwards.

**Decide the grid; build almost none of it.** The model is cheap and the
enforcement is expensive, and `AGENTS.md` §9's no-over-engineering rule points
straight at not building a permissions product for a one-person workspace. The
deliverable is a written model that says what the cells *are* and what the
default is for each, so that each feature's access question — OQ-6's included
— is answered by looking it up rather than by inventing a rule and a vocabulary
on the spot. Two cheap things fall out of it immediately and need no
enforcement work: resolving `users.role` (`G-35`), and recording B as what the
model says about a machine's shared locations.

**Scoped and written, 2026-08-24**, as
[`specs/2026-08-24-what-an-agent-is-allowed-to-do.md`](specs/2026-08-24-what-an-agent-is-allowed-to-do.md)
— the access model, agents-first, at the owner's direction. People as subjects
are designed for throughout and deliberately built last, since the owner is the
only person using the app today.

**That spec is not this idea.** It decides what access *means*; I-10 remains
open as the settings and customization surface that will later render it,
alongside profile, preferences, shortcuts, notifications, update behavior,
task/status properties and MCP configuration. Members and invites — the one
item on I-10's original list that is squarely access-shaped — is where the two
meet, and belongs to the people half that spec defers.

---

## I-11 — The rest of the machine-reaching surfaces

[`specs/2026-08-24-reaching-my-machine-from-the-browser.md`](specs/2026-08-24-reaching-my-machine-from-the-browser.md)
specified three surfaces — project files, folder browsing, terminals.
Terminals has since been scoped out into its own spec
([`a-terminal-on-my-machine`](specs/2026-08-24-a-terminal-on-my-machine.md),
planned as M16/M17), which builds the live channel the other two need. The
remaining seven are switched off in the browser for exactly the same reason
and were left out of that spec deliberately, to keep it demoable rather than
exhaustive: provider settings, importing a skill that lives on the machine,
re-scanning memory, reading a memory note in its original form, the code
graph, a project's git state and pull requests, and the project briefing.

Each should become much cheaper once the app can ask a machine a question at
all, but each carries its own interface questions — what a provider list means
when two machines disagree, what a git state looks like for a project you are
not sitting in front of — so none is a mechanical follow-on. Worth picking up
individually, by whichever the owner misses first, rather than as one batch.

*Surfaced while scoping that spec's Assumptions.*

> **The code graph is no longer one of the seven — removed outright, 2026-09-01.**
> The owner decided against reviving it and asked for complete removal instead:
> the whole `packages/core/src/graph/` engine/client/lifecycle/viz module, its
> 9 API routes, the 7 curated MCP tools (`search_graph`, `trace_path`,
> `query_graph`, `get_graph_schema`, `get_code_snippet`, `get_architecture`,
> `detect_changes`) and their preamble/capability-docs wiring, the factory-health
> check, the project-creation/-deletion hooks, the Settings engine-install row,
> and the project workspace's Code-graph panel. This reverses
> [`retire-the-vite-app`](plans/2026-08-24-retire-the-vite-app.md) Decision 1,
> which had deliberately kept the handlers for exactly this kind of revival —
> see that decision's note for the reversal record. The remaining six items
> above are unaffected.

---

## I-12 — Retire the "two hosts disagree about accounts" branch in three files

`account.tsx`, `image-upload.tsx` and `directory-picker.ts` (now in
`apps/web/src/lib/`) each carry a branch built when two UI hosts genuinely
disagreed about what existed: the web app authenticated against Supabase, the
local desktop build had no account or workspace to speak of. `D-24` retired
that second host — Electron now just points a window at the hosted app. The
branch's premise is gone, but the branch itself is still there, since removing
it is behavioural surgery, not something a file-organization pass
(`T-VR-07`) should also be doing.

Found and recorded in full in `design-system/DECISIONS.md` `DD-015`, which is
where the reasoning lives. This entry exists only so it surfaces to someone
scanning ideas rather than only to someone who happens to open that file.

*Surfaced while classifying `packages/ui` files for `T-VR-07`.*

---

## I-13 — Chat session right-click menu, and an app-wide keyboard shortcuts page

Chat session rows in the rail (`apps/web/src/app/chat/chat.tsx`, ~line 718) are
plain buttons with no per-row actions. The only session action anywhere is an
Archive icon in the conversation header — and there is **no unarchive
affordance at all**, which matters more since M12–M15 made archived sessions
genuinely read-only. A right-click menu is the obvious home for these, paired
with a `/shortcuts` reference page (no such page exists today).

The design work is not "copy Claude Code's menu". Most of that menu doesn't
map here, and the mapping is the interesting part:

- **Translates directly:** Rename and Archive/Unarchive — `chatSessionUpdateSchema`
  already accepts `title` and `status`, so both are free of backend work.
- **Needs reinterpreting:** "Move to group" → *Move to project* (this app has
  no folders, but `projects` is already a first-class organizer);
  "Continue in Cloud" → *Continue on \<machine\>*, which is potentially richer
  here than in Claude Code since `free`/`agent` sessions can resume on any
  online runtime while `project` sessions are machine-affine — **though M12–M15
  may now select a runtime automatically, which would make a manual override
  redundant. Unverified; read the dispatch path before assuming either way.**
- **Doesn't translate:** "Split view" / "New window" — the chat split-pane is a
  persistent layout, not a per-session action, and no pop-out concept exists.
- **New, and a good fit:** *Fork* — duplicate a session plus its messages up to
  a point, to branch an approach without polluting history. No such concept
  exists anywhere today; needs a new endpoint.

Open decisions that need the owner, none of them answered: whether Delete
exists at all (no DELETE route today, and every comparable entity —
`teams.archivedAt` — soft-archives rather than hard-deletes); whether chats
should be pinnable (`usePins` in `apps/web/src/lib/pins.ts` supports
`project|run|team|agent|page`, so adding `chat` is a one-line change, but pins
are localStorage-only and so wouldn't follow a user across devices — arguably
wrong for a cloud-canonical product); and how large the shortcuts page should
be when only a couple of shortcuts genuinely exist.

**If this is picked up, it goes through the full spec → plan → tasks
lifecycle** — the owner's explicit instruction on parking it was that doing it
means doing it "properly and fully". A first attempt was built straight to code
on unreviewed defaults and discarded unmerged; the scope questions above are
the ones that attempt got wrong by answering them itself.

*Surfaced 2026-08-24 from an owner request to design the chat right-click menu;
parked by the owner the same day as a design addition wanting its own proper
pass.*

## I-14 — Sweep orphaned daemon auth identities

Each paired machine gets its own Supabase Auth user (plan
[`2026-08-27-the-daemon-gets-a-real-identity`](plans/2026-08-27-the-daemon-gets-a-real-identity.md),
`DI-1`). When a machine is unpaired or removed, that identity is deliberately
left behind rather than deleted — `DI-3` explains why: deleting it would need
the Auth admin API from a Server Action that today runs as the *caller's*
RLS-scoped client, which would widen the service role's blast radius past
`/api/daemon/*`, a boundary
[`auth.ts`](../apps/web/src/lib/daemon/auth.ts) states explicitly.

The leftover row is inert by construction — no membership, no `public.users`
row, and no `public.daemon_identities` row after the cascade — so it can reach
nothing. This is a tidiness idea, not a security one.

**What would make it real work:** enough unpair/re-pair churn that the Auth →
Users list becomes hard to read, or an audit that wants the count to be exact.
Neither is true today with one owner and a handful of machines.

**If picked up:** the deletion needs a service-role path that does not live in a
Server Action — most likely a `/api/daemon/*`-adjacent internal route, or a
scheduled sweep matching on `app_metadata` plus the absence of a
`daemon_identities` row. Note the lesson from
[`BUG-2026-08-18-orphaned-account-rows-on-staging`](bug/BUG-2026-08-18-orphaned-account-rows-on-staging.md):
`auth.admin.deleteUser` does not cascade, so anything built here proves what it
leaves behind before it deletes anything.

*Surfaced 2026-08-27 while planning the daemon identity; parked in the plan's
own Scope boundaries rather than built.*

---

## I-15 — Per-machine status indicator in the header, replacing the global connection badge

The header's connection badge (`app-shell.tsx`) reads "live"/"offline" from
the Realtime run/chat channel connection state, not from whether any paired
machine is reachable — see
[`BUG-2026-08-27-header-badge-shows-offline-with-active-machine`](bug/BUG-2026-08-27-header-badge-shows-offline-with-active-machine.md).
Even relabelled correctly, a single global pill can't answer "which of my
machines is up" once a workspace has more than one paired.

Shape: an aggregate `n/total online` pill in the header, sourced from the same
heartbeat-derived `machineState()` query `machines.tsx` already computes (not
from `useLiveEvents`), reusing its `active`/`draining`/`unreachable` dot
vocabulary so the header and `/machines` can never visually disagree.
Click/hover expands a popover listing each machine by name with its own dot.
Zero machines paired is neutral, not red.

*Surfaced while documenting `BUG-2026-08-27-header-badge-shows-offline-with-active-machine`.*

---

## I-17 — What a turn changed in a project, which is a different problem from what a turn produced

### What was noticed

The owner, 2026-08-28, reading the draft of
[`seeing-what-my-agent-made`](specs/2026-08-28-seeing-what-my-agent-made.md):

> what if we chat about the project. There is already folders and repository
> in there. The agents can make file edits, create new files, media, delete
> etc. how the media is handled then. can we have this as an separate or same
> idea?

### What is true today

- **Project chats already run somewhere real.** `kind: "project"` is
  machine-affine by design — [`schema.ts:820`](../packages/shared/src/db/schema.ts:820)
  says so explicitly, because the session builds context from a project bound
  to that runtime. The agent works in that directory, with the CLI's own file
  tools.
- **The app has no idea what happens in there.** Git usage is a single
  `git clone` when a project is bound
  ([`bindings.ts:145`](../packages/core/src/cloud/bindings.ts:145)) — no
  status, no diff, no branch, no changed-file list anywhere. `runs` records
  `effective_tools` but nothing about files touched.
- **Reading project files from a browser is specified and accepted, not
  built.** [`reaching-my-machine`](specs/2026-08-24-reaching-my-machine-from-the-browser.md)
  US1 — "see the real folder tree as it exists on the machine… open a file to
  read it" — was owner-reviewed and accepted 2026-08-24 and is not yet
  planned. The web app still stubs local filesystem access entirely.
- So after an agent edits a project during a chat, the only way to learn what
  it did is to go to the machine and look.

### The reframe

**Media is not the special case — every file is.** The question asks how media
is handled in a project chat, but a generated logo and an edited `route.ts`
have exactly the same problem: the app does not know the turn touched either
of them. Media is simply where the absence is most visible, because it is the
file you would want to *look* at rather than read.

**The noun is different, and that is the real seam.** In a free chat the agent
**produces an artifact** that has no other home, so the app must keep it — the
model the spec adopts. In a project chat the agent **changes a working tree
that already has a home.** Copying those files into app storage would
manufacture a second, instantly-stale copy of something the repository already
owns and git already versions. The right treatment is the opposite of the
spec's: reference, never copy.

So the split the owner sensed is real, but it does not run between *media and
other files*. It runs between **artifact and change** — and it happens to line
up with a boundary the data model already draws for an unrelated reason, which
is decent evidence it is a genuine seam rather than one invented for this
feature.

**Corroboration from outside:** Multica does not build an in-app diff either.
Their server has no diff, PR, git or review handler, and their README puts
codebase work behind "review gates where work lands in pull requests" — i.e.
reviewed on the git host, not in the product. Their chat is positioned as the
surface for work that "hasn't formed a clear issue yet." (Their web components
could not be enumerated — a 404 — so this is a server-side and docs reading,
not exhaustive.)

### A shape

A project-chat turn ends with a compact **what changed** summary attached to
its reply: paths added, modified, and deleted, grouped by turn. Each path links
through to the file viewer `reaching-my-machine` US1 specifies, where an image
previews and a text file reads.

The property that makes this work, and that neither "copy everything" nor "show
nothing" achieves: **the summary is metadata, so it syncs even when the content
cannot.** A list of paths and change kinds is tiny. So with the machine asleep
you still see *what* the agent did last night — you just cannot open the files
until it wakes. That degrades honestly instead of going blank.

### What it touches

- **[`seeing-what-my-agent-made`](specs/2026-08-28-seeing-what-my-agent-made.md)
  must draw the boundary explicitly**, or its implementation will do the wrong
  thing: a project chat's edits are not "produced items" and must not be
  copied. Amended in that spec the same day this was raised.
- **`reaching-my-machine` US1 is the viewer this needs** and it is already
  owner-accepted. The only addition it wants is rendering an image rather than
  offering to read it as text — much smaller than a viewer of its own.
- **[`I-11`](#i-11--the-rest-of-the-machine-reaching-surfaces)** already parks
  "a project's git state and pull requests". This is a narrower, chat-shaped
  consumer of that — *what did this turn do*, not *what is the state of the
  repo*. If I-11's git surface is ever built, this becomes a filtered view of
  it rather than separate machinery.
- **[`what-an-agent-is-allowed-to-do`](specs/2026-08-24-what-an-agent-is-allowed-to-do.md)**
  and [`G-5`](KnownGaps.md)'s unfinished write clamp: showing what an agent
  changed is the natural place to notice it changed something it should not
  have. Related, and deliberately not merged — one decides what is permitted,
  this reports what happened.

### Decisions this needs

1. **Where does "what changed" come from — git, or the agent's own report?**
   Git is truthful but cannot separate the agent's edits from the owner's own
   uncommitted work in the same tree. Self-reporting is precise about
   attribution but trusts the agent to be honest and complete.
2. **Does a project chat offer to commit, branch, or open a pull request?**
   Multica's answer is that this is exactly where work should land. Ours has
   no opinion yet, and it is a product question, not a technical one.
3. **What happens to a project chat when the machine is offline** — is the
   whole conversation read-only, or can you queue a request for later?
4. **What does a deleted file look like** when you can see it in the summary
   but can never open it?

### What would make it real

Project chats actually being used to edit code — which the owner is only now
starting to do, and which is what surfaced this.

**What would shrink or kill it:** if `reaching-my-machine` US1 ships first and
simply browsing the tree turns out to be enough in practice, this collapses to
"add image rendering to the file viewer" and needs no change summary at all.
Worth shipping that viewer before scoping this.

*Raised 2026-08-28 by the owner while reviewing the spec above, asking whether
project-chat media was the same idea or a separate one. Separate — but not
along the line the question drew.*
