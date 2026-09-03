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
