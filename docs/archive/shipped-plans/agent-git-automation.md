> **Reference — shipped.** This plan's status line said "setup not yet executed," but git
> automation actually shipped as **P7** (PR #19) — see `../design-src/APP.md`'s Engine Phases
> table for the authoritative merged record. Kept for historical design detail only.

# Design: Agent Git Automation & CI/CD

Generated with /office-hours-style review on 2026-06-21
Founder: Sri Hari
Status: APPROVED (design) — setup not yet executed
Owner account: domains@sparstrow.com · Agent account: agent@sparstrow.com
Companion docs: `Sparstrow-strategy.md`, `Sparstrowgen-reframe-and-finish-plan.md`

---

## TL;DR

Agents never touch production directly. They work on a branch, open a PR, and a gate
(CI, and you) merges. The whole design is about **blast radius**: if an agent, or a
prompt-injected agent, misbehaves, the worst case is "a bad PR," not "the org is gone."

Two profiles, because the factory and the apps are different:
- **Factory (Sparstrowgen)** is local, never deploys. Flow: agent → PR → CI → you merge.
- **Apps (Shelfree, websites)** deploy to Vercel. Flow: agent → PR (preview) → `staging`
  (test env, test database) → you accept → promote `staging → main` → production.

Access: a machine-user (`agent@sparstrow.com`) with a **fine-grained, least-privilege,
expiring token**. Upgrade to a GitHub App later when there are many repos / machines.

---

## Principles

1. **Blast radius first.** Every choice is "what can a misbehaving agent do?" Keep it small.
2. **Least privilege.** The agent credential writes code and opens PRs in *your* repos.
   Nothing else: no admin, no org settings, no other orgs, no deploy secrets.
3. **`main` is sacred = production.** No one pushes to it directly, not even the agent.
   Branch protection enforces PR + green CI.
4. **Human gate now, automation later.** You approve every merge to start. Earn auto-merge.
5. **Deploy credentials live in CI, never on the agent.** The agent writes code; GitHub
   Actions / Vercel hold the Vercel + Supabase keys and deploy.
6. **Two-way doors.** Start with a PAT and direct push; swap to a GitHub App and an
   orchestrator-mediated push later. Neither is a rewrite.

---

## Profile A — Factory (Sparstrowgen)

Local tool, no production deploy. Simplest possible loop.

```
agent (cwd = Sparstrowgen repo)
  → git checkout -b agent/<task>
  → commit as agent@sparstrow.com
  → push branch
  → gh pr create  (target: main)
  → GitHub Actions CI: typecheck + test (+ lint)
  → you review + merge → main
  (no deploy — it's your local cockpit)
```

- Branch protection on `main`: require PR, require CI status checks, no force-push.
- You self-approve and merge (solo). The agent has Write, cannot bypass protection.
- This is the **first thing to set up**, and the `tier0-finish` branch (auth + cwd fix,
  already committed locally) is the first real PR to push through it.

## Profile B — App (Shelfree, client websites)

Deploys to Vercel with a Supabase database. Adds a staging acceptance gate.

```
agent (cwd = app repo)
  → git checkout -b agent/<task>
  → commit, push branch
  → gh pr create  (target: staging)
  → CI checks  +  Vercel per-PR PREVIEW url   (review THIS change in isolation)
  → you merge PR → staging
  → staging Vercel env redeploys (TEST Supabase)   (test the whole app live, as a user)
  → satisfied? open PR `staging → main` (you approve)
  → production deploys (real Supabase)
  → corrections? file a task in Sparstrowgen → agent → new PR → repeat
```

Branches: `main` = production (protected). `staging` = integration/QA (protected).
Always merge one direction: `agent/* → staging → main`. **Never force-push, never commit
directly to `main` or `staging`.**

---

## Identity & Access (chosen: machine-user + fine-grained PAT)

A "machine user" is a normal GitHub account used only by automation. A "fine-grained
PAT" (personal access token) is a password-like secret scoped to specific repos and
permissions, with an expiry.

**Setup:**
1. Add `agent@sparstrow.com` to the Sparstrow org with **Write** on the project repos
   (not Owner, not Admin).
2. Create a fine-grained PAT on the agent account:
   - Resource owner: **Sparstrow org**
   - Repository access: **Only select repositories** (the project repos)
   - Permissions: **Contents: Read and write**, **Pull requests: Read and write**,
     **Workflows: Read and write** (only if agents edit `.github/workflows`),
     **Metadata: Read** (auto). Nothing else.
   - Expiry: **90 days** (rotate; calendar reminder).
3. On the build machine, set the agent git identity:
   - `git config --global user.name "Sparstrow Agent"`
   - `git config --global user.email "agent@sparstrow.com"`
   - (Add `agent@sparstrow.com` as a verified email on the agent GitHub account so
     commits link to it.)
4. Authenticate `gh`/git with the PAT (e.g. `gh auth login` paste-token, or a
   credential helper).

**Where the credential lives — critical:** outside any repo, and **never in the vault
(the `SPARSTROW_VAULT` directory) or agent memory.** Your agents run Bash and read the vault, so a
token there is exfiltratable. Use the OS credential manager or a gitignored secrets file
sourced into the environment. The token is gitignored by `.env` / `.env.*` already.

**Seat cost note:** adding `agent@` as an org member with Write consumes a paid seat
*only if the org is on a paid plan*. On Free, no cost. (A GitHub App consumes no seat —
a point for the upgrade path.)

**Upgrade path — GitHub App (when, not now):** an app mints short-lived 1-hour tokens
from a private key, scoped per-repo, no seat. Move to it when you have multiple machines,
remote agents, or many repos. The app's private key becomes the master secret to protect.
Trigger: a second build machine, or a fleet of agents pushing.

---

## Push-credential architecture (the choice that matters most)

- **Now — agent pushes directly.** The build agent has Bash + the token and runs
  `git push` / `gh pr create`. Zero Sparstrowgen changes. Acceptable because the token is
  tightly scoped and `main` is branch-protected, so the blast radius is already "open a PR."
- **Later — orchestrator-mediated push.** The coding agent only *commits* locally;
  Sparstrowgen (trusted) pushes the branch and opens the PR as a controlled post-run step.
  The credential lives with the orchestrator, never the agent. Smallest blast radius.
  This is a feature to build into Sparstrowgen (a "push gate" after a run finishes).
  Trigger: once the loop is proven, or the first time an agent does something you didn't
  want pushed.

---

## Environments & secrets (App profile)

- **Vercel native Git integration** does previews + prod automatically: `main` → Production,
  every other branch/PR → Preview. Map `staging` to a stable preview alias (e.g.
  `staging.<app>`) so it has a permanent URL; PRs get ephemeral preview URLs.
- **Separate Supabase project for staging/preview. The one that bites people.** The test
  environment must point at a *different* database than production. Use Vercel's env-var
  scopes: **Preview** vars → test Supabase, **Production** vars → real Supabase. Agents
  testing on staging must never read/write real customer data.
- **Deploy secrets** (Vercel token, Supabase service keys) live in **Vercel project env /
  GitHub Actions secrets**, never on the local agent.
- **Database migrations** (Shelfree, later): run via the Supabase CLI in CI against the
  staging project on staging deploy, then the prod project at promotion. Static websites
  skip this; Shelfree will need it. Defer the details until Shelfree exists.

---

## CI/CD

**Factory CI** (`.github/workflows/ci.yml`, runs on PR + push to main):

```yaml
name: CI
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm test
```

Make this CI job a **required status check** in branch protection so a red build blocks merge.

**App CI:** same code checks, plus Vercel's native integration for preview/prod deploys
(no custom deploy workflow needed at first). Add migration steps later for Shelfree.

---

## Merge gate

- **Now: you approve & merge.** Nothing reaches production without your eyes. For the
  factory you self-merge after CI; for apps you accept staging, then promote `staging → main`.
- **Later: hybrid.** Auto-merge on green CI for low-risk internal repos (Sparstrowgen);
  human approval for client/production repos (Shelfree, websites). Per-repo config.
  Trigger: once you trust the CI suite enough that green = shippable for a given repo.

---

## Branch protection enforcement — the GitHub Team question (decided 2026-06-25)

GitHub gates **enforced** branch protection / rulesets on **private** repos behind the
**Team** plan (~$4/user/month). On Free you can *create* a ruleset but not set it Active.
**Decision: stay on Free for now; do NOT buy Team yet.** The hard gate only matters when
something you don't fully trust can push (autonomous agents, or a human hire), and neither
exists yet. What you keep for free: CI (`typecheck`, `author-check`) still **runs** on PRs
as an advisory signal (just not a required block); squash manually per-PR. The real
autonomous-agent risk is covered for free by **orchestrator-mediated push** (Sparstrowgen
only pushes `agent/*` branches + opens PRs, never `main`) — a code-level gate you own.
**Buy Team when:** a human collaborator joins, OR you want GitHub as an independent backstop
once agents push autonomously, OR you're past pre-revenue and ~$50–100/yr is noise. The
ruleset stays saved-but-inactive, ready to flip on. Do NOT make the repo public as a
workaround (exposes source + the gmail in the grandfathered history).

---

## The iteration loop

Sparstrowgen is the control plane:

```
you file a task (Sparstrowgen task board, or a GitHub Issue)
  → Sparstrowgen spawns an agent, cwd = the repo
  → agent opens a PR → preview deploy
  → you review the live preview
  → satisfied? merge / promote.  not? file the next task.  repeat.
```

Loop quality tracks **feedback specificity**. "Header is misaligned on mobile, center it"
gets a clean fix; "make it better" makes the agent guess. The task board is the input surface.

---

## Setup checklists

**One-time machine setup**
- [ ] `git config --global user.name "Sparstrow Agent"` / `user.email agent@sparstrow.com`
- [ ] `gh auth login` as the agent with the fine-grained PAT
- [ ] Store the PAT outside any repo and outside the vault/memory

**Factory repo (Sparstrowgen) — do first**
- [ ] Create/confirm the repo under the Sparstrow org
- [ ] Add `agent@` with Write
- [ ] Branch protection on `main`: require PR + required status check (CI) + no force-push
- [ ] Add `.github/workflows/ci.yml` (above)
- [ ] Push `tier0-finish`, open the first PR, watch CI go green, merge

**App repo (Shelfree / websites) — template, when the first app exists**
- [ ] Branches: `main` (prod, protected), `staging` (QA, protected)
- [ ] Connect repo to Vercel; map `main` → Production, `staging` → stable preview alias
- [ ] Vercel env vars scoped: Preview → test Supabase, Production → prod Supabase
- [ ] CI checks as required status checks on both branches
- [ ] (Shelfree) Supabase migration steps in CI

---

## Security guardrails summary (blast-radius table)

| If this leaks/misbehaves | Worst case, given the design |
|---|---|
| The agent's PAT | Open a PR / push a branch in your repos. Cannot merge to `main` (protection), cannot touch org settings or other orgs, expires in 90 days. |
| A prompt-injected coding agent | Same as above today; with orchestrator-mediated push (later), it can't push at all. |
| A bad change reaches `staging` | Hits the test environment + test database only. Production untouched until you promote. |
| Deploy secrets | Not on the agent or the machine, only in Vercel/Actions. |

---

## Deferred (with triggers)

- **GitHub App** (1h tokens, no seat) — trigger: 2nd machine / remote agents / many repos.
- **Orchestrator-mediated push** (credential off the agent) — trigger: loop is proven, or
  first unwanted push.
- **Hybrid auto-merge** — trigger: CI suite trusted enough that green = shippable.
- **Supabase migrations in CI** — trigger: Shelfree (schema-bearing app) exists.

## Open questions

1. Is the Sparstrow org on Free or paid? (Decides whether `agent@` as a member costs a seat,
   and nudges the GitHub-App timing.)
2. First app to wire the App profile: Seelin website (static, no Supabase) or Jameel/Shelfree
   (Supabase)? The static site is the gentler first run of the App profile.
