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

## OQ-9 — Where does `server/` actually run?

**Raised:** 2026-09-02, closing Phase 0 of the restructure.
**Blocks:** nothing before Phase 4. Phases 1–3 need a local `server/` regardless,
so that work proceeds either way. It blocks only the *shape* of Phase 4's gate —
what "install it and use it" is allowed to mean.

### Context

The restructure's whole point is that `server/` is a separate thing every client
talks to. Nothing has decided **where the copy a client talks to is running.**

Two facts constrain the answer. `packages/desktop/scripts/prepare-resources.mjs`
already bakes `cloudUrl: "https://sparstrow.com"` into production builds, and
**nothing is deployed there** — the Vercel account is blocked and its free-plan
usage is exhausted (this was `G-54`, closed in Phase 0 precisely because
verification stopped depending on a deployed host). Separately, the plan replaces
Supabase Realtime with a **server-owned WebSocket**, and a WebSocket needs a
process that stays alive — which a Vercel serverless function is not.

Worth knowing before you choose: **multica's own server is self-hosted by the
user.** Option A below is not a compromise away from the reference architecture;
it is the reference architecture.

### Scenario

You're in a hotel with your laptop. You open the Sparstrowgen desktop app,
wanting to check whether the agent you set running on your home desktop last
night actually finished.

### Options

**A — `server/` runs locally on each machine, started by the desktop app**

*What it is:* the desktop app's main process supervises a local `server/` on
`127.0.0.1`, exactly as it supervises the daemon today. That local server holds
the Supabase service key and is still the only thing touching the database — the
rule is unchanged, it just happens to be running on your own hardware. No
hosting account, no deploy step, no monthly bill, no public attack surface.

*Your scenario, under A:* the hotel laptop shows you the laptop. Last night's run
at home is not visible from here, and won't be until you're back at that desk.
You can start new work on the laptop immediately, offline, with no sign-in round
trip.

- **Pros:** Zero infrastructure to buy, deploy, or keep alive. Phase 4's gate
  becomes reachable in days rather than after a hosting project. Works fully
  offline. No public endpoint means no public attack surface. Matches multica.
  Development already requires this mode, so it is code you must write anyway.
- **Cons:** One machine at a time — no cross-device view, which is a real part of
  the product idea ("agent chat across a person's own machines"). A second
  machine is a second island.
- **Score: 9/10** for getting a working app you actually open; 5/10 as a
  permanent answer.
- **Blast radius if wrong:** Low. `SPARSTROW_SERVER_URL` already exists as the
  indirection. Moving to B later is a config change and a deploy, not a rewrite —
  provided nothing assumes `localhost`, which I'll keep out by construction.
- **Caveats:** Only honest if I build it so B is genuinely a config change. That
  costs a little discipline in Phase 1 (no baked-in origins, CORS configurable
  from the start) and I'd do it regardless.

**B — One hosted `server/` on a container host (Fly.io / Railway / Render)**

*What it is:* `server/` deploys as a Docker container to a host that keeps a
process alive, so the WebSocket works. Roughly $5/month. Every daemon on every
machine connects *out* to it; the desktop app talks to it over the internet.

*Your scenario, under B:* the hotel laptop signs in and lists your home desktop
as online. Last night's run is there with its full transcript. You send it
another message and it executes at home while you watch the output stream into
the laptop.

- **Pros:** This is the actual product. Cross-machine is the differentiator, and
  it only exists under B. One place to look at logs when something breaks.
- **Cons:** A hosting account, a deploy pipeline, secret management, and a
  monthly bill — before the app has been opened once. It is a second project
  bolted to the front of the one that has failed for five months, and it is
  exactly the class of thing that has consumed the last five months.
- **Score: 7/10** — right destination, wrong week.
- **Blast radius if wrong:** Moderate. Choosing B *now* costs weeks of
  infrastructure work at the precise moment the goal is to open the app. It also
  puts a public endpoint holding the Supabase service key on the internet, which
  needs real hardening rather than a first pass.
- **Caveats:** Cheap to add once A works, and A's testing exercises nearly all of
  the same code paths.

**C — Host `server/` inside `apps/web` on Vercel**

*What it is:* `server/` stays a library; `apps/web` mounts its route registry as
Next route handlers, as it does today. No new host.

*Your scenario, under C:* the laptop can see the home desktop and last night's
transcript — but the live output does **not** stream. Vercel's serverless
functions cannot hold a WebSocket open, so it either polls on a timer or falls
back to Supabase Realtime, which is the thing this restructure is removing. And
today it does not work at all: the Vercel account is blocked.

- **Pros:** No new hosting decision. Reuses a deployment path already written.
- **Cons:** Structurally cannot do the one thing the transport is being rebuilt
  for. Re-adopts Supabase Realtime as a client-side dependency, contradicting
  "only `server/` talks to the database". And the account is blocked, so it is
  not currently available at any price.
- **Score: 3/10**
- **Blast radius if wrong:** High and quiet. It would look fine until the first
  streaming feature, then require the same migration to B anyway — after the
  Realtime dependency had spread back through the clients.
- **Caveats:** Not recommended. Noted mainly so the reason it was rejected is on
  record.

### Recommendation

**A now, built so that B is a config change.** It is the only option where you
open a working app soon, it is what multica does, and it is code Phases 1–3
require regardless of the eventual answer. I'd revisit B the first time you
genuinely want to reach machine #2 from machine #1 — which is a real want, just
not the one blocking you today.

**Proceeding on A unless you say otherwise**, because it is the shared prefix of
all three options: nothing built for A is wasted under B.

---

## OQ-10 — Signing the Windows installer

**Raised:** 2026-09-02.
**Blocks:** nothing. Raised now purely because certificate issuance has a
**1–3 week lead time**, so if the answer is ever "yes", starting late is the only
expensive mistake available here.

### Context

Phase 3 produces a Windows installer. Unsigned executables trigger Microsoft
SmartScreen: a full-screen blue "Windows protected your PC" panel where the
"Run anyway" button is hidden behind a "More info" link. Since June 2023,
code-signing keys must live on a hardware token or cloud HSM, which is why these
certificates now involve identity verification and shipping times rather than an
instant download.

### Scenario

You send the installer to a friend to try. They double-click it.

### Options

**A — Ship unsigned**

*What it is:* nothing to buy or configure. `electron-builder` produces the
installer as-is.

*Your scenario, under A:* your friend gets the full-screen blue warning. If you
warned them in advance, they click through in about four seconds. If you didn't,
a good fraction of people delete the file instead and tell you the link was
broken.

- **Pros:** Free. Zero lead time. Entirely sufficient for the only user who
  matters right now, which is you.
- **Cons:** Every external tester needs coaching. Some browsers also flag the
  download itself.
- **Score: 8/10** today.
- **Blast radius if wrong:** Low and fully reversible — signing is a build-config
  change applied later.
- **Caveats:** Stops being fine the moment you want a stranger to install it
  without you on the phone.

**B — OV (Organisation Validation) certificate, ~$200–400/year**

*What it is:* a certificate tied to a verified business identity, on a hardware
token or cloud HSM.

*Your scenario, under B:* the warning is *usually* gone — but SmartScreen
reputation on an OV certificate builds with download volume, so early testers may
still see it until the app accumulates installs.

- **Pros:** Removes the warning for most users eventually. Much cheaper than EV.
- **Cons:** Requires a registered business entity to validate against. Weeks of
  lead time. Doesn't fully solve day one, which is the day you care about.
- **Score: 6/10**
- **Blast radius if wrong:** Financial only — a year of certificate you didn't
  need.
- **Caveats:** The business-identity requirement may simply not be satisfiable
  yet depending on how Sparstrow is registered.

**C — EV (Extended Validation) certificate, ~$400–700/year**

*What it is:* stricter validation, and SmartScreen grants reputation
**immediately**.

*Your scenario, under C:* your friend double-clicks and it just installs. No
warning, ever.

- **Pros:** The only option that fully solves it from the first download.
- **Cons:** Most expensive, strictest validation, longest lead time. Substantial
  spend on distribution polish for a product with no external users yet.
- **Score: 5/10** now; 9/10 at public launch.
- **Blast radius if wrong:** Financial only.
- **Caveats:** Right answer, wrong phase.

### Recommendation

**A now, and decide between B and C only when you have a date for putting this in
someone else's hands.** Given the 1–3 week issuance window, that decision wants
about a month of runway ahead of any launch — which is the only reason this is in
front of you tonight rather than in Phase 3.

---

## OQ-11 — Which provider has to work for the Phase 4 gate?

**Raised:** 2026-09-02.
**Blocks:** the Phase 4 slice's scope, and (per §3.14) whether a provider-picker
settings surface is built with it. Not Phases 1–3.

### Context

`packages/core/src/providers/` has five: `claude-code` (spawns the `claude` CLI),
`antigravity` (the `agy` CLI, added in P8.1), `anthropic` and `direct-api` (API
key, billed per token), and `ollama` (local models). Phase 4's gate is "pick an
agent, send a message, it runs on my computer, output streams back." **Which
provider is behind that sentence is undecided**, and each additional one is a
settings surface, a credential path, a failure mode, and a "which one broke"
debugging session added to the first slice that has to work.

### Scenario

You open the app, pick an agent, and type *"summarise what changed in this repo
this week."* What actually executes on your machine?

### Options

**A — Claude Code CLI only**

*What it is:* the daemon spawns `claude` as a child process. It uses the
subscription already authenticated on that machine, and comes with file, shell
and MCP tools already working.

*Your scenario, under A:* `claude` starts on your machine, reads the repo, and
streams its answer back into the window. Nothing to configure — if you can run
`claude` in a terminal there, the app works there.

- **Pros:** Most capable, by a wide margin. No API key to store, no per-token
  bill — it rides the two Claude accounts you already have. Tools work today.
  Smallest possible first slice: one provider, one credential path, one failure
  mode.
- **Cons:** Requires `claude` installed and signed in on any machine you want to
  use. A dead end for anyone without a Claude subscription — irrelevant now,
  relevant at launch.
- **Score: 9/10**
- **Blast radius if wrong:** Very low. The other four stay in the tree unwired;
  adding one later is wiring, not writing.
- **Caveats:** Needs a clear error when `claude` is missing, rather than a silent
  spawn failure — that's a small piece of work I'd do inside the slice.

**B — Direct Anthropic API**

*What it is:* the daemon calls the API with a stored key.

*Your scenario, under B:* you first paste an API key into settings. Then the
model answers — but it cannot read your repo unless we build the tool loop
ourselves, so "summarise what changed this week" is a question it can't actually
answer yet.

- **Pros:** No CLI dependency. Works identically on every machine.
- **Cons:** Per-token billing on top of subscriptions you already pay for.
  Requires a key-entry settings surface. **The tool loop that makes the answer
  useful does not exist** — this is the option that looks closest to done and is
  furthest from it.
- **Score: 4/10** for this gate.
- **Blast radius if wrong:** Moderate — you'd discover the missing tool loop at
  the end of the slice, which is the worst moment.
- **Caveats:** Genuinely the right choice later for a hosted, no-CLI experience.

**C — Antigravity CLI**

*What it is:* same shape as A, spawning `agy` against your antigravity account.

*Your scenario, under C:* like A, using the antigravity account instead.

- **Pros:** Uses a third account you already pay for. Spreads load off the Claude
  subscriptions.
- **Cons:** The newest and least-exercised provider in the tree (P8.1, additive,
  never load-bearing). Making the one gate that must pass depend on the least
  proven component is a bad trade.
- **Score: 5/10**
- **Blast radius if wrong:** Moderate — provider bugs would be indistinguishable
  from restructure bugs, in the one slice where telling them apart matters most.
- **Caveats:** Good second provider, precisely because A will have proved the
  spawn path by then.

**D — All of them, with a picker**

*What it is:* the slice ships provider selection in settings.

*Your scenario, under D:* you choose from a dropdown before sending. When nothing
comes back, the first question is which of five paths failed.

- **Pros:** Feels more finished. Satisfies §3.14 in the most literal way.
- **Cons:** Multiplies the surface that must work by five, in the one slice whose
  entire purpose is to work. §3.14 is a required *question*, not a mandate to
  build configuration that adds no value — and here it actively subtracts.
- **Score: 3/10**
- **Blast radius if wrong:** High. This is the exact shape of the failure the
  restructure exists to end: five paths that typecheck, none proved.
- **Caveats:** Becomes right once one provider has shipped and been used.

### Recommendation

**A — Claude Code only**, with the other four left in `server/src/internal/`
unwired and no provider picker in the slice. The settings surface §3.14 asks for
here is the *agent's* settings (which machine, which project, which working
directory), not a provider chooser — those are the choices you'll actually make
when sending a message. I'd add the picker in Phase 5, when switching providers
is a preference rather than a way to have five untested paths at once.

---

> **`OQ-6`, `OQ-7`, and `OQ-8`,** which stood
> here at various points, were all answered by the owner; where each answer
> now lives is recorded below, per this file's own rule that an answered entry
> is deleted rather than archived in place.
>
> **`OQ-8` — what does "cancel this step" actually do to a running plan
> node — is closed.** Answered **option B**: a real stop-signal path from the
> button down to the daemon actually running the process, not just a status
> relabel. This is a genuine feature (a daemon-side cancel contract that does
> not exist yet, plus a real `cancelled` `TaskStatus` value), not a `T-WA-04`
> Server Action conversion, so it is parked rather than built inline —
> `useCancelNode` ships exactly as `T-WA-04` left it (wired to the
> never-existed `POST /goals/:id/nodes/:nodeId/cancel` route, 404ing as
> before). Recorded as [`D-27`](Deferred.md), which carries the shape of the
> work and its unpark trigger — a `doc/specs/` entry, since this crosses
> `packages/core`, the control plane's `runs` table, and the web UI.
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
