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

## OQ-8 — what does "cancel this step" actually do to a running plan node?

**Raised:** 2026-08-25, converting `T-WA-04`'s goal-detail writes to Server
Actions.
**Blocks:** only `useCancelNode` (the goal detail page's "Cancel this step"
button on an in-flight plan node). Everything else in `T-WA-04` — task
board writes, the attention queue, the work launcher, and the goal's own
Cancel/Pause/Resume/Replan buttons — ships without waiting on this.

### Context

`useCancelNode` calls `POST /goals/:id/nodes/:nodeId/cancel`. That route has
never existed — not a stub, not a real handler, nothing in
`apps/web/src/lib/api/handlers/`. Converting it to a Server Action means
writing its logic for the first time, and the two obvious approaches both run
into the same wall: **a plan node has no status column of its own.**
`packages/shared/src/db/schema.ts`'s `planNodes` table has no `status` field —
the goal detail page derives a node's displayed status entirely from its
linked `tasks` row (`GET /goals/:id`'s join comment says so explicitly). So
"cancel this step" has to mean *something* to the linked task, and neither
option below is free of a real design decision:

- `TaskStatus` (`packages/shared/src/schemas/task.ts`) has **no `cancelled`
  value** — the closest existing state is `failed`, which is semantically
  wrong (a cancelled step didn't fail, it was stopped) and would make a
  cancelled step indistinguishable from a genuine failure everywhere else in
  the app that reads task status (the board, the attention queue, reporting).
- Even setting a status doesn't necessarily *stop* anything. If the node's
  task has a run in flight, cancelling the step plausibly should kill that
  live process on the runtime — and no exposed action anywhere in this repo
  does that today. A status flip that doesn't touch the live process would
  silently lie about what "cancel" did.

`useCancelGoal` and `useRetryNode` do not have this problem and are converted
normally in this task: cancelling a *goal* is a flip to `goals.status =
'cancelled'`, a value the schema and the UI (`GOAL_BADGE`, the
`!["done","cancelled"].includes(...)` gate) already use as a real, settled
state. Retrying a node resolves to its linked task and reuses the exact
`start_run` RPC call `POST /tasks/:id/run` already makes for the identical
"respawn the assignee" operation — nothing new to design.

### User scenario

The owner is watching a goal's plan graph. One step is stuck `running` for
ten minutes on a runtime that looks unresponsive. They click **Cancel this
step** hoping to free it up and either retry it or let the goal route around
it.

### Option A — add `cancelled` to `TaskStatus`, flip it, no live-process kill (Recommended)

**What it is:** widen the `TaskStatus` enum with a genuine `cancelled` value
(small migration touching the enum's callers: the board's status badges, the
attention queue's filters, any status-branching logic). `cancelNodeAction`
resolves the node → task and sets `status: "cancelled"`. Nothing reaches the
runtime; if a process is actually still executing, it keeps running to
completion or failure on its own, and the row will not update again — the
button means "stop tracking this as if it succeeds," not "kill the process."

**User scenario replayed:** the owner clicks Cancel, the step badge changes to
"cancelled" immediately, and the goal graph can route around it. If the
runtime process was still alive, it keeps running unseen in the background
and its eventual result never reaches the row again.

- **Pros:** ships an honest status the rest of the UI can render correctly;
  small, contained schema change; matches how `useCancelGoal` already treats
  "cancel" as a status, not a kill.
- **Cons:** does not free the runtime resource the owner was actually trying
  to reclaim — a "cancelled" step whose process is still silently running is
  a new, invisible kind of leak.
- **Score:** 6/10
- **Blast radius if wrong:** low-medium — worst case is a confusing status
  with no real effect; nothing destructive, easily corrected in a follow-up
  once live-cancel exists.
- **Caveats:** this is a stepping stone, not the real feature. Whoever
  eventually builds live cancellation will need to revisit every place that
  now treats `cancelled` as terminal.

### Option B — build real live cancellation now

**What it is:** design and build an actual stop-signal path from this action
down to the runtime executing the task's run (kill the process, mark the run
row accordingly, then set the task/node to `cancelled`). This is a genuine
feature, not a Server Action conversion — it needs a runtime-side contract
this repo does not have yet (how a daemon receives and honors a cancel
signal), which is squarely `packages/core`/`packages/daemon` territory.

**User scenario replayed:** the owner clicks Cancel, the runtime actually
stops the stuck process within a few seconds, and the step shows "cancelled"
truthfully — the resource is really freed.

- **Pros:** the only option that does what a reasonable person expects
  "cancel" to mean.
- **Cons:** real scope — a runtime dispatch feature, not a page conversion;
  building it inside `T-WA-04` would make a mechanical transport-conversion
  task into a new-feature task, exactly what plan DD-6 excludes stub-backed
  surfaces from doing.
- **Score:** 9/10 for correctness, 2/10 for fit in this task.
- **Blast radius if wrong:** high if rushed — a half-built kill-signal path
  that sometimes doesn't reach the runtime is worse than no button at all,
  because it would look reliable and not be.
- **Caveats:** this is the right long-term answer; it just isn't a `T-WA-04`-
  sized piece of work.

### Option C — leave `useCancelNode` exactly as it is (unconverted)

**What it is:** the button stays wired to the nonexistent
`POST /goals/:id/nodes/:nodeId/cancel` route, 404ing exactly as it does today.
Zero behavior change — this is the same treatment `useCreateGoal` already gets
in this task for the same reason (plan DD-6: don't build a transport for a
feature that isn't real yet).

**User scenario replayed:** the owner clicks Cancel, sees the same broken
result they'd see today (nothing happens, or an error toast), no worse and no
better than before this task touched the page.

- **Pros:** zero risk, zero invented behavior, consistent with how the plan
  already treats `useCreateGoal`.
- **Cons:** leaves a visibly broken button in the shipped UI indefinitely
  unless something else picks this up.
- **Score:** 7/10
- **Blast radius if wrong:** none — this is the status quo.
- **Caveats:** the button should arguably be hidden or disabled with a
  tooltip rather than left clickable-and-broken, but that's a design call
  for whoever picks this up next, not a silent scope addition here.

### Recommendation

**Option A**, done inside `T-WA-04`'s own scope once answered: it is a small,
honest schema change that unblocks the same conversion `useCancelGoal` and
`useRetryNode` already get, and it does not foreclose Option B later — a
`cancelled` status is exactly what a real live-cancel feature would also set,
once it exists. Until answered, `useCancelNode` and its call site are left
untouched (Option C's behavior), which is what `T-WA-04` ships with now.

---

> **OQ-8 above is the only entry currently open.** `OQ-6` and `OQ-7`, which
> stood here on the morning of 2026-08-24, were answered by the owner that
> same day; where each answer now lives is recorded below, per this file's own
> rule that an answered entry is deleted rather than archived in place.
>
> **`OQ-6` — how much of a machine a signed-in person may look at — is closed.**
> Answered **option B**, nominated locations with a sensible default at pairing.
> The entry had said it would close when
> [`what-an-agent-is-allowed-to-do`](specs/2026-08-24-what-an-agent-is-allowed-to-do.md)
> was owner-reviewed; that review happened on 2026-08-24 and the answer now
> lives as **US4 of that spec**, with `FR-008` carrying it. That placement was
> the point of leaving it open rather than closing it early — the owner's
> objection was never to B, it was to B arriving as a bespoke rule for the
> folder picker instead of as one cell of a model. It unblocks
> [`reaching-my-machine-from-the-browser`](specs/2026-08-24-reaching-my-machine-from-the-browser.md)'s
> US1/US2 scope and `FR-002`, which now inherit the boundary instead of
> defining one.
>
> The terminal asymmetry this entry flagged in advance still holds and is not
> re-litigated: nominated locations bound **folder browsing only**, and grant
> **reading only**. A shell is not bounded by them, because it can go anywhere
> its account can — decided separately in
> [`a-terminal-on-my-machine`](specs/2026-08-24-a-terminal-on-my-machine.md) as
> owner/admin-only access to an unconfined shell.
>
> **`OQ-7` — Server Action or keep the existing mutation — is closed.**
> Answered **option A**: every existing write is rewritten to the one-step
> Server Action pattern now, not only the ones a page conversion happens to
> touch. This is **not** the recommendation that entry carried (it argued for
> C, converting opportunistically); the owner chose A with A's costs stated,
> and the plan that executes it records both that fact and the cost, so nobody
> later reads the scope as an accident. The answer is recorded where the next
> person writing a write will actually read it — in
> [`apps/web/CLAUDE.md`](../apps/web/CLAUDE.md), next to the doctrine sentence
> `T-VR-05` did not follow — and is executed by
> [`plans/2026-08-24-server-action-write-conversion.md`](plans/2026-08-24-server-action-write-conversion.md).
> It supersedes the per-route opportunistic conversion described in
> [`D-25`](Deferred.md).

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

> **Older answers, kept as pointers.**
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
