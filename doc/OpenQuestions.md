# Open Questions

Decisions waiting on the owner. Nothing here blocks work that doesn't depend on
it — but per `AGENTS.md` §8, work that *does* depend on an entry here does not
start until it is answered.

Format is mandated by `AGENTS.md` §8: context, a plain user-side scenario, then
options carrying pros/cons, a score, blast radius if chosen wrong, caveats, and
a recommendation.

When one is answered, record the answer in the plan or task that consumes it and
**delete the entry from this file**.

---

## OQ-6 — How much of a machine may a signed-in person look at?

**Raised:** 2026-08-24, writing
[`specs/2026-08-24-reaching-my-machine-from-the-browser.md`](specs/2026-08-24-reaching-my-machine-from-the-browser.md).
**Blocks:** US1's and US2's folder-browsing scope, and FR-002. It does **not**
block US3 (terminals), which is bounded by the shell's own permissions rather
than by this decision, nor the underlying ability to ask a machine a question
at all.

> **Answered in preference, 2026-08-24, by the owner: option B.** Left open
> deliberately rather than closed, because the owner's reply reframed the
> question in a way that changes what "answered" means here:
>
> > "This is regarding the access right … since we have multiple users, we
> > [are] thinking of access right now. But we should not just think and [be]
> > bound to only one access. We should [design] project access settings for
> > users, agents on what level they can access and configure."
>
> B stands as the intended answer. What is no longer wanted is B *as a
> bespoke rule for folder browsing*. A machine's shared locations are one cell
> of a grid — **who** (person, agent, machine) may do **what** (see, use,
> configure, administer) to **which thing** (workspace, project, machine,
> agent, secret) — and this app already has four partial, independently
> invented answers in that grid, plus a fifth that is decorative
> ([`G-35`](KnownGaps.md)). Adding a sixth by hand is the thing to avoid.
>
> **This entry closes when the access model is decided** ([`I-10`](Ideas.md))
> and B is recorded as what that model says about this cell — not before. It
> continues to block only US1/US2's scope in the meantime, exactly as above.

### Context

The spec asks for browsing folders on a paired machine from a browser. That
raises a question the app has never had to answer, because until now the
person browsing was sitting at the machine: **when the app asks a machine
"what is in this folder", what may the machine agree to answer about?**

Two facts make this sharper than it first looks. First, the folder picker for
adding a project needs to start somewhere *above* any project — that is the
whole point of it, so "projects only" cannot be the answer for that surface
without breaking it. Second, a workspace can eventually have more than one
member, and machines belong to a workspace, not to a person. So the boundary
cannot be "whatever the owner can see", because the owner is not necessarily
the only one asking.

This is a decision about the machine's own posture, not about permissions in
the app. It is worth taking deliberately once, because loosening it later is
easy and tightening it later breaks someone's working setup.

### Scenario

You pair your work laptop. Six months later you invite a contractor into the
workspace so they can watch a project's runs. They open the Add Project
dialog and press Browse. What do they see — your whole drive, including
`Documents` and `Desktop`? Only the folders that already hold projects? Or a
set of locations you nominated when you set the machine up?

### Options

Each option replays the same moment from the scenario above — **the contractor
presses Browse** — so the three can be compared on what actually happens
rather than on how they sound.

**A — Anything the machine's own account can read**

- **What this is:** The machine answers any folder question about anything the
  account it runs under can read. Nothing to configure, no setup step, no
  list to maintain. The Browse dialog behaves exactly like a file dialog on
  that computer.
- **The contractor presses Browse:** They see your drives. `C:\`, then
  `Users\you\`, and from there `Documents`, `Desktop`, `.ssh`, your tax
  returns, and the repositories belonging to your other clients. Nothing
  stops them opening any of it. Nothing in the app records that they did, and
  nothing ever shows you what is exposed — so there is no moment at which you
  would notice.
- **Pros:** Nothing to configure and nothing to explain; the picker is what
  people expect from a Browse button. Zero friction for the single-user case,
  which is today's only case.
- **Cons:** Every workspace member gets read access to the whole user profile
  on that machine. A single over-broad invite has the whole disk as its blast
  radius. The exposure is invisible by construction.
- **Score: 4/10**
- **Blast radius if wrong:** Severe and silent. A workspace member — or
  anyone who compromises one member's session — can read arbitrary files off
  your computer. Recoverable only by unpairing the machine, and there is no
  record of what was read.
- **Caveats:** Only defensible while the workspace is provably one person, and
  nothing enforces that it stays that way.

**B — Nominated locations, chosen when the machine is set up**

- **What this is:** At pairing, the machine is told which folders it may
  answer about, defaulting to the parent folder your projects already live
  in. Browse opens at those locations. Adding another later is a visible
  action on that machine's page in the app, and the list is visible there
  whether or not you ever change it.
- **The contractor presses Browse:** They see one entry — `D:\Sparstrow` —
  and navigate freely inside it, which is everything they need. `Documents`
  and `.ssh` are not merely hidden from the dialog: the machine will not
  answer questions about them at all. You can see that same list yourself, on
  the machine's page, without asking anyone what you shared.
- **Pros:** You state once what this machine shares, and everything works
  normally inside it. The exposure is something you chose, can see, and can
  change. It scales to a second workspace member without revisiting the
  decision, and it makes the picker honest — it opens at the shared locations
  rather than pretending to be a full file dialog.
- **Cons:** One more thing at setup, and a new failure mode to explain — "I
  can't find my folder" when a project lives outside the nominated set.
- **Score: 8/10**
- **Blast radius if wrong:** Contained by construction — what leaks is what
  was nominated. The likelier failure is the annoying one: too narrow a
  default sends people to settings before they can add their first project.
- **Caveats:** The default matters more than the mechanism. It must cover the
  ordinary case on first pair, so most people never meet this feature at all.

**C — Registered project roots only**

- **What this is:** The machine answers only about folders inside projects
  already registered with it. Nothing to configure — the app knows where
  every project is, so the boundary maintains itself.
- **The contractor presses Browse:** Nothing useful happens. The dialog can
  only show folders inside projects that already exist, and the entire reason
  to press Browse is to find a folder that is not a project yet. Adding a
  project stays a typed-path operation, exactly as it is today. Their *other*
  task — opening an existing project and reading its files — works perfectly.
- **Pros:** Tightest boundary of the three, and it needs no configuration and
  no new setup step at all.
- **Cons:** **It cannot serve the folder picker.** US2 stays broken
  permanently, which is one of the two things the spec set out to fix.
- **Score: 5/10**
- **Blast radius if wrong:** Smallest of the three. The cost is capability,
  not safety.
- **Caveats:** Viable only if you are content for Browse to remain
  unavailable — in which case US2 should be cut from the spec rather than
  left looking buildable.

### Recommendation

**B, with the default doing the work.** When a machine pairs, nominate the
parent folder it already keeps projects in, so the common case needs no
decision and the picker opens somewhere useful. Show the nominated list on the
machine's own page in the app so the exposure is visible rather than implied,
and allow adding a location from there.

Two narrowings I would take with it: nominated locations grant **reading only**
— nothing in this spec needs to write outside a project — and terminals are
explicitly *not* bounded by them, since a shell can go anywhere its account
can and pretending otherwise would be security theatre. That asymmetry should
be stated plainly to the owner rather than hidden, because it means US3 is a
bigger grant than US1 and US2, and it is reasonable to want the two decided
separately.

A is the honest choice only if the workspace is guaranteed to stay
single-person, and nothing enforces that. C should be chosen only alongside a
decision to drop US2.

---

*OQ-5 (Vercel Deployment Protection blocking `development`/`staging`) was
**answered by the owner on 2026-08-20** — option A. SSO protection disabled
project-wide via `vercel project protection disable sparstrowgen --sso`; both
hosts now reach the app's own sign-in directly. Recorded in
[`runbooks/deploy-web-app.md`](runbooks/deploy-web-app.md).*

<details>
<summary>OQ-5 — Vercel Deployment Protection blocks reaching `development`/`staging` at all (closed)</summary>

## OQ-5 — Vercel Deployment Protection blocks reaching `development`/`staging` at all

**Raised:** 2026-08-20, attempting the live-host pairing test M11/G-16 have been
waiting on.
**Blocks:** testing the app as a regular user (or an agent) against a deployed
URL — pairing, sign-in, anything. Does not block localhost work, which already
has its own signed-in-session method (`runbooks/agent-browser-session.md`).

### Context

Asked to open `development.sparstrow.com` and pair/unpair a machine like a
regular user would, to surface friction in the flow. Navigating there —
and separately to `staging.sparstrow.com` — redirects to **Vercel's own login
page** (`vercel.com/login?...next=/sso-api?url=https://development.sparstrow.com/machines`),
before the app's own Supabase sign-in is ever reached. This is Vercel's
**Deployment Protection** (aka Vercel Authentication) feature, gating the
whole deployment behind membership in the Vercel team/project — a second,
separate gate in front of the app's own auth.

No bypass secret (`VERCEL_AUTOMATION_BYPASS_SECRET` or similar) is present in
`apps/web/.env.local`, so there is currently no way through this at all,
scripted or manual, without a Vercel account that has access to the project.

### Scenario

A teammate or early tester, with no Vercel account, is handed
`development.sparstrow.com` (or `staging.sparstrow.com`) to try the app. They
get a Vercel login screen asking for credentials to a project they've never
heard of, before they ever see Sparstrowgen's own sign-in. From their side
this reads as "the link is broken" or "I don't have access," not as an app
issue — and no error on the app's own side gives any hint why.

### Options

**A — Disable Deployment Protection on `development` and `staging`**
- **Pros:** Directly unblocks exactly what's being tested — reaching the app
  in an ordinary browser, no Vercel account needed. These two branches exist
  specifically as pre-launch test surfaces (per `deploy-web-app.md`, "for the
  owner's own testing right now"); the app's own Supabase auth is already the
  real gate once you're past this. One dashboard toggle, no code change,
  fully reversible.
- **Cons:** Anyone who finds the URL can load the sign-in screen and see the
  app's unauthenticated shell (marketing-less, no data) before real launch.
  Not indexed or publicized today, but no longer requires a Vercel login to
  probe.
- **Score:** 8/10
- **Blast radius if wrong:** Low. Without a real Supabase session, an
  outside visitor sees a login page and nothing behind it — no data, no RLS
  boundary at risk. Reversible in one click.
- **Caveats:** Scope this to `development`/`staging` only — `main` should stay
  however it's configured today (dummy content per `Deferred.md` D-15) until
  real launch decisions are made for it.

**B — Keep protection on; generate a Protection Bypass for Automation secret**
- **Pros:** No change to who can casually browse to the URL. Lets scripts/CI
  get through with a header or query param.
- **Cons:** Does not answer what was actually asked — testing *as a regular
  user* specifically means without a bypass secret, since a real user won't
  have one. Only helps scripted/agent testing, not the UX verification this
  came up while doing. One more secret to generate, store, and avoid leaking
  in a script or CI log.
- **Score:** 4/10 for this goal (higher for a pure-CI use case)
- **Blast radius if wrong:** Low technically; the secret leaking (e.g.
  committed by accident) would let anyone through the same door, same as
  option A but by mistake instead of by design.
- **Caveats:** Worth adding later for CI regardless of what's chosen here —
  doesn't substitute for A.

**C — Grant the testing agent/service a Vercel account with project access**
- **Pros:** No protection-config change.
- **Cons:** Means an agent authenticating to a third-party account — outside
  what this session is willing to do (no password entry, no account
  creation, by standing rule) — and defeats the actual reason `development`
  was chosen over `staging` in the first place (avoiding needing platform-
  level access at all). Wrong shape besides: Vercel team membership controls
  deploy permissions, not app-level testing.
- **Score:** 2/10
- **Blast radius if wrong:** High — grants deploy-level access for what only
  needed page-load access.
- **Caveats:** Not recommended.

### Recommendation

**A.** Turn off Deployment Protection for `development` (and `staging`, since
it's explicitly meant for testing already) in Vercel's project settings —
Settings → Deployment Protection, per-branch. This is the only option that
actually lets a regular user, or this agent, reach the app the way the test
requires, and it costs nothing but flipping a toggle you can flip back.

</details>

---

> **Nothing else is currently open.**
>
> `OQ-4` (is code syntax highlighting a fifth colour role) was answered by the
> owner on 2026-08-19 — **option A**. Recorded in `DESIGN.md` §2.1 and the new
> §2.6, and as `DD-011` in `design-system/DECISIONS.md`. It unblocks the
> `--hl-*` sub-item of phase D2.2 in
> [`plans/2026-08-19-parametric-theming.md`](plans/2026-08-19-parametric-theming.md):
> the twelve values stay literal and are excluded from the parametric rebuild.
>
> OQ-3 was answered by the owner on 2026-08-19 — the answer is recorded in
> `DESIGN.md` §2.1, §2.4, and §2.5, and unblocks the two parked items in
> `tasks/D1/T-D1-01-status-colour-token-sweep.md`.

---

<details>
<summary>OQ-1 — Protecting uncommitted agent work (answered and built 2026-08-10)</summary>

**Answer: option B, narrowed.** Recorded as settled decision 5 in
[`plans/2026-08-09-daemon-cloud-control-plane.md`](plans/2026-08-09-daemon-cloud-control-plane.md),
shipped in `packages/core/src/projects/wip-snapshot.ts`, toggle in Settings.

Two things changed from the recommendation below, both while building it:

- **Not a branch.** `refs/sparstrow/wip/<run-id>` sits outside `refs/heads/`, so
  it does not show in `git branch`, does not tab-complete, and does not match the
  default `push` refspec. The recommendation's "never pushed" was a rule someone
  would eventually break; this makes it structural.
- **Not `git commit`.** Plumbing against a throwaway index, so HEAD, the real
  index, and `git status` are provably untouched — the option's stated cost
  ("writes to the developer's repo without being asked") mostly evaporates once
  the write cannot be seen from any command they normally run.

The full original entry is kept below, because the options it rejected are the
reason the shipped design looks the way it does.

---

## OQ-1 — Protecting uncommitted agent work *(closed)*

**Raised:** 2026-08-09, during the local-tier data audit.
**Parked for M4** by the owner on 2026-08-10, when M3 was decomposed. M3 pairs
and registers machines but never starts work on them, so nothing it builds can
produce a dirty working tree. The exposure begins with the M4 command spine —
the first moment cloud dispatch can make an agent edit files unattended.
**Blocks:** nothing in M3. Decide before M4's first dispatch task is written.

### Context

The data audit found that after the cloud split, exactly two things in the local
tier are irreplaceable: the memory vault, and **uncommitted changes in project
working trees**. The vault is covered — it mirrors to Drive. Uncommitted work is
covered by nothing in the current plan.

Agents produce dirty working trees constantly. Committed and pushed work is
recoverable from the remote; a half-finished edit is not.

### Scenario

An agent spends 40 minutes refactoring a module on your desktop and stops to ask
a question. Before you answer, the machine reboots for an update, or you run
`git checkout .` in that repo while cleaning up something unrelated. What
survives?

### Options

**A — Leave it to the developer, document the risk**
- **Pros:** Zero code. No surprise commits appearing in anyone's history. Matches
  how developers already work — you own your working tree.
- **Cons:** The failure is silent and total when it happens. OS-level backup
  (File History / Time Machine) may or may not cover the repo, and neither is
  verified.
- **Score: 5/10**
- **Blast radius if wrong:** One bad day and 40 minutes of agent work, repeated
  occasionally. Not catastrophic, genuinely annoying.
- **Caveats:** Realistically the status quo. Worth choosing deliberately rather
  than by default.

**B — Daemon auto-commits to a scratch branch before yielding**
- **Pros:** Nothing is ever only in the working tree. Recovery is a normal git
  operation. Gives a per-run diff for free, which is useful for review anyway.
- **Cons:** Writes to the developer's repo without being asked. Needs a branch
  naming scheme, cleanup policy, and care not to commit secrets or huge build
  artifacts that happen to be untracked.
- **Score: 8/10**
- **Blast radius if wrong:** Branch clutter and confusion about where work
  lives. Recoverable — delete the branches — but irritating to unwind across
  many repos.
- **Caveats:** Must respect `.gitignore` and must never auto-push. Local commits
  only; pushing is a separate, explicit action.

**C — Daemon snapshots the working tree to Drive before each run**
- **Pros:** Doesn't touch git at all, so no interference with the developer's
  branch state. Captures untracked files too.
- **Cons:** Duplicates whole trees including `node_modules` unless carefully
  filtered. Restore is manual and awkward. Storage grows fast.
- **Score: 4/10**
- **Blast radius if wrong:** Wasted Drive quota and a restore path nobody trusts
  enough to use.
- **Caveats:** The filtering problem is the whole problem, and git already
  solved it.

### Recommendation

**B**, scoped tightly: local commit only, to a `sparstrow/wip/<run-id>` branch,
respecting `.gitignore`, never pushed, garbage-collected after N days. It reuses
machinery that already exists in every project and produces a per-run diff that
makes review easier regardless.

</details>

---

*OQ-2 (how an agent completes a browser pass) was **answered on 2026-08-10**
during M3 and deleted from this file, per the rule at the top. The method is
recorded in [`runbooks/agent-browser-session.md`](runbooks/agent-browser-session.md):
mint a one-time magic-link token with the Supabase admin API and navigate to
`/auth/confirm`. No password is typed, and it is no kind of bypass — it is the
product's own sign-in path, which only became usable this way once magic-link
sign-in was restored.*

*Decisions 1–4 of the daemon/cloud plan (data placement, transport,
degradation, auth & shell) are all settled — see
`doc/plans/2026-08-09-daemon-cloud-control-plane.md`.*
