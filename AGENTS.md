# AGENTS.md — AI Coding Agent Guidelines & Repository Standard

Welcome agent! This file defines the mandatory workflow, safety rules, and engineering standards for all AI coding agents working on **Sparstrowgen**.

> ## ⚠️ A restructure is in progress. Read this first.
>
> **Plan:** [`doc/plans/2026-09-02-multica-architecture-restructure.md`](doc/plans/2026-09-02-multica-architecture-restructure.md)
>
> The repository is moving to **one server, thin clients** — multica's
> architecture, in TypeScript. Until it completes, this file describes a
> **target** layout that parts of the repo have not reached yet, and several
> long-standing rules are **deliberately suspended**. Both are marked inline.
>
> **Why this happened.** Five months of work produced a web app, an agent engine,
> 40+ tables, 23 plans — and an application the owner had never once opened and
> used. The cause was structural (every write was a Next.js Server Action, so the
> desktop app could only work by shipping Next.js inside Electron) and procedural
> (~73,000 lines of governing instruction, a `KnownGaps.md` where twenty entries
> said "built, never run", and a mandatory verification gate that was physically
> impossible to pass).
>
> **The rule that now outranks the rest of this document:**
> **a feature is not done until it runs in the desktop app.** Green tests are not
> the gate. If you are ever choosing between satisfying a process rule below and
> making the app actually work, make the app work and say so in your Result.

---

## 1. Monorepo Architecture & Locked Stack

**Sparstrowgen** is an autonomous AI agent platform and developer control plane built 100% in **TypeScript** for orchestrating multi-node agent runtimes and agent chat across a person's own machines.

### Workspace Directory Layout

**This is the target layout.** Phases 1–3 of the restructure move the repo into
it; until then, expect `packages/core` and `packages/desktop` still to exist in
their old positions.

```
.
├── apps/
│   ├── web/            # Next.js — thin shell over packages/views
│   ├── desktop/        # Electron + Vite React SPA — thin shell, same packages
│   └── mobile/         # Expo — later
├── packages/
│   ├── core/           # @sparstrow/core — CLIENT domain logic: ApiClient,
│   │                   #   WSClient, react-query, zustand stores, CoreProvider.
│   │                   #   NO UI, no server code.
│   ├── views/          # @sparstrow/views — feature UI per domain, mirrors core/
│   ├── ui/             # @sparstrow/ui — Shadcn primitives + design tokens
│   ├── shared/         # @sparstrow/shared — Zod contracts + Drizzle schema,
│   │                   #   the one package BOTH sides import
│   ├── tsconfig/       # shared TS config
│   └── eslint-config/  # shared lint config
├── server/             # THE server. Its own module.
│   ├── src/routes/     # every HTTP route, human-facing and daemon-facing
│   ├── src/internal/   # engine: orchestrator, providers, agents, mcp
│   └── cmd/            # server.ts | daemon.ts | migrate.ts
└── scripts/            # monorepo build and development scripts
```

### The four rules this layout exists to enforce

These are not style preferences. Each one is a thing that broke.

1. **`server/` is the only thing that talks to the database.** No client
   imports `@supabase/*` — not `apps/web`, not `apps/desktop`, not
   `packages/*`. Clients get a token and call `server/`. *(Before the
   restructure, 16 files in `apps/web/src` imported Supabase directly, which is
   why no other client could ever exist.)*
2. **No Server Actions. Ever.** Every write is an HTTP route in `server/`,
   called through `packages/core`. A Server Action is only callable from inside
   a Next.js render, so one is a feature the desktop and mobile apps can never
   have. *(This is the single decision that cost five months — see the
   [superseded WA plan](doc/plans/2026-08-24-server-action-write-conversion.md).)*
3. **Shared packages export source, not builds.** `"exports": { "./x":
   "./x/index.ts" }`. No build step, no `dist/`, no watch mode. Each app's
   bundler transpiles them.
4. **One version of every dependency**, via pnpm `catalog:`. Two Reacts in one
   tree is not a warning, it is a broken app.

### Locked Technology Stack

**`.sparstrowgen/blueprint.yaml` is the single source of truth for the stack,
commands, MCP server roster, and CLI tool roster — read it, don't restate its
facts here.** It's loaded every session same as this file, so duplicating its
content in prose here would just be two places to keep in sync instead of one.
When the stack changes, update the blueprint; only touch this section for the
wiring detail below, which the blueprint deliberately doesn't carry (file paths,
provider specifics — not "what tech are we on").

- **Server**: Fastify (HTTP + WS), TypeScript. `server/cmd/server.ts` is the API
  every client talks to; `server/cmd/daemon.ts` is the per-machine agent runtime.
  Both are entry points over shared `server/src/internal/` code.
- **Client data layer**: `packages/core` — one `ApiClient`, one `WSClient`,
  TanStack Query, Zustand. `CoreProvider` takes `apiBaseUrl`, `wsUrl`, `storage`
  and `identity {platform, version, os}`, so each app injects its own platform
  pieces and shares everything else.
- **Router**: plain `next/link` / `next/navigation` in `apps/web`; a plain SPA
  router in `apps/desktop`. No adapter, no shim — `packages/views` takes
  navigation as props or context rather than importing a router.
- **Design doctrine**: `DESIGN.md` — written 2026-08-18 with the owner via the
  `design-brief` skill. Read it before any UI work. It defines a **theming
  contract** (user-selectable brand accent + surface character, with contrast
  floors) rather than a fixed palette, so never hardcode a colour.
- **Authentication**: Supabase Auth (magic link, email+password, GitHub, Google)
  **verified by `server/`**, which then issues its own session token for desktop
  and CLI. `server/src/auth/provider.ts` is an interface with `supabase.ts`
  behind it, so the identity provider can be swapped without touching routes.
- **Live updates**: a **server-owned WebSocket**, not Supabase Realtime. One
  connection per client, multiplexed by topic.

### Connected MCP Servers & Skills

The server roster is `blueprint.yaml`'s `mcp_servers` list, configured in
`.mcp.json` — update both together when a server is added or removed. What follows
is operational detail neither of those files carries (why each is there, auth
posture, what pairs with what):

- **`supabase`**: schema inspection, migration execution, Edge Function deployment.
- **`context7`**: up-to-date library/framework documentation lookup — prefer this
  over training-data knowledge or web search for API syntax and version-specific
  docs.
- **`shadcn`**: UI pattern discovery (`search_items_in_registries`,
  `view_items_in_registries`, `get_add_command_for_items`, `get_audit_checklist`).
  Paired with the vendored `shadcn` skill (`.claude/skills/shadcn/`) for the
  procedural half of the Shadcn workflow — see §3.11.
- **`github`**: PR/issue management and repo search against this project's
  GitHub remote. OAuth on first connect (run `/mcp` to authorize), same pattern
  as `supabase` — no token ever belongs in `.mcp.json` or an agent's hands.
- **`playwright`**: browser automation. The end-to-end loop in §3.10 defaults to
  the `agent-browser` CLI instead — it drives Chrome directly over CDP and
  doesn't share the Claude Browser pane's `document.visibilityState` bug.
  `playwright` is kept for the one thing `agent-browser` can't do: forcing a
  specific non-2xx status or a delayed response via route mocking. Full
  walkthrough:
  [`doc/runbooks/agent-browser-session.md`](doc/runbooks/agent-browser-session.md).

### Connected CLI Tools

The roster is `blueprint.yaml`'s `cli_tools` list — plain executables invoked
via Bash, not MCP servers, so there's no `.mcp.json` entry and none is
guaranteed present on a fresh machine.

- **`agent-browser`**: the default browser-automation tool for the §3.10
  verification loop. Install: `npm install -g agent-browser && agent-browser
  install`.
- **`gh`**: GitHub CLI. Required for the auto-merge step in §2 rule 6. Install:
  https://cli.github.com (not an npm package).
- **`supabase`**: **now primarily a local tool.** `supabase start` brings up a
  full local stack (Postgres, Auth, Storage, Studio) in Docker for a feature
  branch — see §2 rule 1 and §4. Also `db advisors`, `migration new`, `db pull`.
  Install: `npm install -g supabase`.
- **`vercel`**: deployment config for `development` / `main`. Install:
  `npm install -g vercel`.

**`impeccable` Skill**: personal/user-level, not declared in this repo. Its slop
rules — and three default clusters from Anthropic's `frontend-design` skill —
were adapted into the repo's own `ai-design-slop` catalogue under Apache-2.0;
attribution lives in `.claude/skills/ai-design-slop/NOTICE.md`. `impeccable`
itself carries a competing doctrine and is not part of this repo's chain. Any
other MCP tool or skill an agent sees available (e.g. `clockify`, `square`) comes
from that agent's personal config the same way — don't assume it's present for
another agent or machine unless it's in `.mcp.json` or `.claude/skills/`.

---

## 2. Mandatory Git & Branch Workflow

**Simplified 2026-09-02, by the owner.** The two-tier band model and the
`staging` environment are gone. They cost a minimum of two PRs per unit of work
and a third environment nobody reviewed, on a project with one person and no
finished product to protect.

```
localhost (fast iteration — local Docker Supabase, no push needed)
        │
        ▼  slice complete: pnpm typecheck && pnpm test
[worktree: slice/<name>] ──PR (squash)──► [development]
        │
        ▼  the owner opens a packaged build and uses it
[main]  ◄── PR (squash), agent-opened once the work is production-ready
```

### Critical Branch Rules

1. **Isolated Worktrees ONLY**
   - Create an isolated branch/worktree per unit of work:
     `slice/<name>`, `feature/<name>`, or `fix/<name>`.
   - **NEVER** edit files directly on `development` or `main`.
   - **One worktree per agent, always.** Two agents — subagents, forked
     sessions, or separate windows — must never share a working directory. That
     is not a merge conflict resolved later; it is two processes writing the same
     files at once.
   - **Each worktree gets its own local Supabase** (`supabase start`) and its own
     port block, via `scripts/dev-env.sh`. No shared cloud project for
     day-to-day work, and therefore no port registry constrained by a redirect
     allow-list.

2. **PR Target & Merge Strategy**
   - Every branch targets **`development`**. Squash and merge.
   - `development` → `main` is also a PR, squash-merged. **Never push directly to
     `development` or `main`.**
   - There is no band tier and no `staging`. If a piece of work is big enough
     that it feels like it needs one, it is big enough to split into slices that
     each land working.

3. **Verification Before PR**
   - Always: `pnpm typecheck && pnpm test`, then `make check`.
   - **For anything a person can see or click: a packaged desktop build the owner
     opens.** This replaces the old Vercel-preview gate, which mandated a step
     that was impossible to perform — the Vercel account was blocked, and every
     band for a month shipped on a documented workaround instead. A gate nobody
     can pass teaches everyone to route around gates.
   - See §3.10 for the loop itself.

4. **Keep a long-lived branch fresh**
   - Merge `development` **into** your branch periodically — at minimum before
     opening its PR — so the PR carries only your own conflicts.
   - Do **not** rebase a branch someone else has branched from.

5. **Worktree cleanup post-merge — never delete a branch on your own**
   - **Set 2026-09-03, by the owner**, who also turned off GitHub's
     delete-branch-on-merge. **A merged branch is not a finished branch.** Work
     continues on long-lived branches after their first PR lands, and deleting
     one because it merged destroys a working checkout the owner was still using.
   - **Deleting a branch — local or remote — requires the owner asking for that
     specific branch by name.** "It's merged", "it's stale", and "its worktree is
     gone" are not authorization. This overrides any earlier guidance and any
     memory of a past session's cleanup habit.
   - Freeing a **worktree directory** is a separate, safe act, and only once the
     work in it is genuinely finished:
     ```bash
     git worktree remove <path>   # leaves the BRANCH intact
     git fetch --prune            # prunes remote-tracking refs only
     ```
     Removing a worktree also means stopping its local Supabase
     (`supabase stop`) so its Docker volumes are released.
   - Never `git branch -d`/`-D` or `git push origin --delete` as part of
     cleanup.

6. **Auto-Enqueuing PR Merges**
   - On opening a PR into `development`, run
     `gh pr merge <pr_number> --auto --squash` so GitHub merges it when CI
     passes.
   - The `development` → `main` PR is the exception: it gets a reviewer and is
     not auto-merged.

7. **Commit and Push Without Asking**
   - Once edits for a coherent unit of work are complete, commit them on the
     current branch **without waiting for the user to say "commit this"**. This
     file is the standing, advance authorization.
   - Commit at the end of a logical change, not after every file edit.
   - **Immediately push** (`git push`, or `git push -u origin <branch>` first
     time) — same standing authorization. Set 2026-09-01, by the owner,
     specifically so work survives a lost local session. A commit that never
     leaves the local checkout is exactly as unrecoverable as one never made.
   - This covers **the agent's own current branch only**. It does not authorize
     pushing to `development` or `main`, and does not change anything about
     **opening** a PR or **merging** one.
   - If a push is rejected (diverged), do not force-push. Fetch, reconcile, push
     the reconciled result.

8. **Development → Main Promotion (agent-initiated)**
   - The agent judges for itself whether the work is complete and
     production-ready, and opens the `development` → `main` PR without being
     asked for that specific step.
   - **Merging it is an owner-only gate.** Never merge to `main` without an
     explicit "approved, ship it" in chat for that specific promotion.

9. **Merging to `main` releases the desktop app**
   - Set 2026-09-03, by the owner: *"when everything being pushed to main, there
     should be a release and I should be able to update the app from my desktop
     from settings, and a notification should tell me a new update is there."*
   - **The release gesture is a line in a diff.** A `development` → `main` PR
     that bumps `apps/desktop/package.json`'s `version` **is** a release; one
     that leaves it alone builds and publishes nothing. Nothing else is a
     release gesture — there is no tag to push and no draft to publish by hand.
     [`.github/workflows/release.yml`](.github/workflows/release.yml) does the
     rest, and `.claude/skills/release` is the procedure.
   - **So a version bump belongs in the promotion PR, with its changelog entry**
     (`apps/web/src/content/changelog/<version>.md`), not in a follow-up commit
     to `main`. Because rule 8 keeps that merge owner-only, the owner approving
     the promotion is approving the release — which is why no second gate exists.
   - **Never push directly to `main`** to trigger one. Unchanged by this rule.
   - **The update mechanism cannot be verified with one release.** "An update is
     available" is a comparison between an installed version and a published
     one, so proving it needs version A installed and version B published. Never
     report the update path as working on the strength of a single build.

10. **`MasterTaskQueue.md` is frozen for the duration of the restructure**
   - Do not regenerate it, do not archive bands into `CompletedMasterQueue.md`,
     and do not run the drift check. The restructure plan's phases are the run
     order; a task file's own `Status` row is the record.
   - The queue's elaborate bookkeeping existed to coordinate parallel bands
     across many open branches. There are no bands now.

---

## 3. Engineering Guidelines & Knowledge Center Rules

1. **Obey Explicit Directives**
   - Maintain documentation integrity. Do NOT delete comments or docstrings unrelated to your changes.

2. **In-App Knowledge Center Synchronization** — ⏸️ **SUSPENDED**
   - **Suspended 2026-09-02** until the product has users who are not the owner.
     See [`D-38`](doc/Deferred.md).
   - The 27 articles in `apps/web/src/content/knowledge/` are not the cost; the
     per-PR obligation to keep them true — plus re-reading four "global claim"
     articles on every change — is. It was a real tax on every change, paid to
     keep documentation accurate for a product with zero users, while the app
     itself had never been opened.
   - **On unpark, assume every article is wrong until checked.** The restructure
     changes the product's shape underneath all 27.

3. **Never Guess Code Logic or File Paths**
   - Inspect authoritative files using code search or `view_file` before writing code.

4. **Inspect Error Logs Before Diagnosing**
   - Always read full, un-truncated error stack traces before proposing fixes. Base diagnoses strictly on log evidence.

5. **No Superficial Symptom Patches**
   - Do NOT mask errors by returning dummy fallbacks, catching and swallowing exceptions silently, or commenting out failing tests. Fix the underlying root cause.

6. **Never Declare Success Without Running Verification**
   - You MUST execute test commands (`pnpm typecheck`, `pnpm test`, or specific
     test files) to prove your code works before claiming task completion.
   - **And for anything visible: run it.** See §3.10 and the rule in this file's
     header.

7. **Human-in-the-Loop (HITL) Gates**
   - Destructive operations (dropping database tables, deleting protected files,
     releasing to production) REQUIRE explicit user confirmation.
   - *Note: this is the rule about **you**, the agent, asking before destructive
     acts. It is unrelated to the product's HITL approval feature, which was cut
     — see [`D-1`](doc/Deferred.md). This rule stands unchanged.*

8. **Open Question Protocol & Options Framework**
   - Do NOT build the specific thing an unanswered question is about. An open question blocks **only the subtask that depends on it** — never the whole task, and never the whole plan.
   - Park the blocked subtask in `doc/OpenQuestions.md`, mark that one checklist item `[~] blocked → OQ-n` in its task file, and **complete every other item in the task**. One piece missing must not stop the plate being served.
   - A task is "done except OQ-n" — a real, reportable state. Report it that way rather than leaving the whole task open.
   - When the question is answered, unblock that item, finish it, and delete the entry from `OpenQuestions.md`.
   - When presenting open questions to the user, always structure each question with full context, a simple user-side scenario, and concrete options.
   - For every option presented, provide:
     - **Its own context** — what this option actually *is*, concretely enough to tell it apart from its neighbours: what gets built or configured, what the user has to do, what changes
     - **Its own user scenario** — **the question's scenario replayed under this option**, so the reader compares outcomes side by side instead of reasoning about each in the abstract. Same person, same moment, different result. This is the field that makes options answerable; a set of options that all describe *different* situations cannot be compared at all
     - Pros and Cons
     - Score out of 10
     - Blast radius if chosen wrong
     - Overall caveats
     - Agent's overall recommendation
   - **A dismissed question means stop, not "proceed on defaults."**

9. **Micro-Level & Complete Feature Delivery (No Over-Engineering)**
   - Build features at a **micro-level**: complete the full long-term design (backend, frontend, UI/UX, and data layer) of one feature cleanly before moving to the next.
   - Avoid over-engineering or unnecessary abstractions. Choose minimal, effective implementations that solve the requirement.
   - If feature B depends on feature A, build feature A completely first (exposing the minimal clean interface required), then build feature B completely.
   - **Corollary, learned the hard way:** a feature built but never run is not
     delivered. Prefer one path that works end to end over five that typecheck.

10. **End-to-End Visual & Runtime App Testing**
    - At the end of ANY feature implementation or bug fix, drive the real app,
      interact with the UI, and report console errors and usability issues. Fix,
      then re-verify. Loop until clean.
    - **Where to run it:**
      - Local: `make up` — local Supabase + `server/` + the app under test.
      - **For the desktop app, a packaged build**, not just `pnpm dev:desktop`.
        The packaging step is where this project has historically failed, so a
        dev-mode pass proves the least interesting half.
    - This is what the `frontend-verify` skill (`.claude/skills/frontend-verify/`)
      implements — invoke it rather than improvising the loop.

11. **Shadcn UI & MCP Server Integration**
    - ALL design work MUST use `@sparstrow/ui` components and design tokens
      (`bg-background`, `bg-card`, `border-border`, `text-foreground`,
      `text-muted-foreground`).
    - Use the `shadcn` MCP tools to discover, inspect, and audit component
      patterns. Check for an existing block before composing a page from scratch.
    - **Order of work before writing a component**: read `DESIGN.md` (especially
      §6 Iconography and §7 Motion) and `PRODUCT.md`'s register → invoke
      `/shadcn` and the MCP → then write code. Verify in **both modes and at
      least the Paper and Mono surfaces**; Mono is the honest worst case.

13. **The Design Skill Chain** — ⏸️ **PARTIALLY SUSPENDED**
    - **Suspended 2026-09-02:** the `design-brief` → `design-system` →
      `interactive-prototype` → `slop-audit` chain, and the `slop-killer` agent.
    - **Kept and still mandatory:** `DESIGN.md` as doctrine, `packages/ui` as the
      component vocabulary, `ai-design-slop` as a catalogue to read **before**
      writing UI, and `frontend-verify` (§3.10).
    - **Never restate the doctrine's rules inside another skill, agent, or
      checklist.** Point at it. A duplicated doctrine keeps enforcing itself
      after the original changes — this happened in the retired
      `design-system-conformance` skill and silently overrode the design system
      for every agent that loaded it.
    - **Record why a design changed, not just what changed.** When the owner asks
      for a different style or a tighter layout, the reason usually generalises
      into a rule that stops the same debate recurring on every page.
      `design-system/DECISIONS.md` is where it goes.

12. **Mandatory Supabase & Postgres Skills**
    - Load the `supabase` skill for ANY task touching Supabase — schema, Auth,
      Realtime, Storage, Edge Functions, RLS, the CLI/MCP, or client-library
      integration.
    - Load `supabase-postgres-best-practices` **before** writing or changing
      anything that lives in Postgres: tables/columns, migrations, RLS policies,
      indexes, triggers, functions. Load it too when diagnosing slow queries,
      timeouts, locking, or rows visible to the wrong tenant.
    - Load both together for anything Supabase-and-schema at once.
    - **BEFORE writing the SQL, not after.** M1 found three real defects this way
      — per-row RLS function calls, `SECURITY DEFINER` helpers reachable as
      public RPC, and 25 unindexed foreign keys — that a plausible-looking
      migration would have shipped uncaught.
    - This is not satisfied by general Postgres knowledge or a past session's
      memory of the rules. Invoke the skill in the turn where the work happens.

14. **Check for a Settings surface, every feature** — ✅ **KEPT**
    - Set 2026-08-22 by the owner, after noticing that M1–M11 built page after
      page without a matching pass over the app's own settings surface.
      **Explicitly re-affirmed 2026-09-02** when the rest of the per-PR
      obligations were suspended: *"when I began, the settings page was not even
      built, so the feature needs to be built some settings if it makes sense."*
    - Before calling a feature complete, ask: does this introduce a behaviour a
      user might reasonably want to configure, toggle, or set a default for? If
      yes, build the settings entry for it **in the same PR**, next to the
      feature.
    - If the feature is a straight capability with no reasonable configuration
      surface, it stays a straight feature — this is a required *check*, not a
      mandate to invent settings that add no value (see rule 9).
    - **During the restructure this applies to the carried subsystems** —
      machines, agents, chat, projects, runs — so the desktop app ships with the
      settings those need rather than acquiring them later as a retrofit.

15. **Fetch current documentation before writing framework code** — ✅ **MANDATORY**
    - Set 2026-09-02, by the owner. **Use the `context7` MCP server** for any
      library, framework, SDK or CLI you are about to write against — Next.js,
      React, Electron, Drizzle, Fastify, Tailwind, Supabase, Claude Code, and
      anything else it carries.
    - **Use it even when you think you know the answer.** Training data lags
      reality, and this repo has already paid for that twice in ways that cost
      real time: `apps/web` ran `next@16.3.0` against `react@18.3.1`, a
      combination Next 16 does not support, for weeks; and a mocked class in a
      vitest test was written as an arrow function, which vitest 4 cannot
      construct. Both were "I know how this works" errors.
    - `resolve-library-id` first, then `query-docs`. Prefer it over web search
      and over memory for API syntax, config shape, and version-specific
      behaviour.
    - Do **not** use it for refactoring, business-logic debugging, code review,
      or general programming concepts — it answers "what is the current API",
      not "what should this code do".

16. **The agent's own account, for driving the running app**
    - Set 2026-09-02, by the owner, who created it: **`agent@sparstrow.com`**,
      password `Ibelieveinyou`. Use this account for anything an agent needs to
      do inside the running application — signing in, walking a flow,
      reproducing a bug, verifying a screen.
    - **Scope: the LOCAL Docker stack only.** This credential is written in a
      file that is committed to git and therefore public to anyone with the
      repository. It is acceptable *only* because a local Supabase database is
      disposable, recreated by `pnpm db:reset`, and reachable from nowhere but
      the developer's own machine.
    - **Never use this password against a deployed environment**, and never set
      it on one. If it is ever reused on the shared Supabase project, it stops
      being a test credential and becomes a published one — at which point it
      must be changed, and the change recorded in `doc/security/`.
    - Sign-up needs no email confirmation locally: `supabase/config.toml` sets
      `[auth.email] enable_confirmations = false`, which is why account creation
      logs you straight in. That is local configuration, not a defect, and it
      does **not** describe the deployed project.
    - **Clean up test data an agent creates**, but leave this account in place —
      it is shared infrastructure, not scratch data.
    - Note for agents: *creating* an account and typing a password are actions
      an agent does not perform. This account exists precisely so that boundary
      does not block verification — it was created by the owner, once, for reuse.

---

## 4. Environment & Database Configuration

> Before changing anything below, load the `supabase` and
> `supabase-postgres-best-practices` skills — mandatory per §3.12, not optional
> for "simple" changes.

* **Two databases, two owners.** The cloud control plane (identity, machines,
  agents, projects, runs, transcripts, chat) is Postgres/Supabase, schema in
  `packages/shared/src/db/schema.ts` (`pgTable`). Each daemon's local execution
  store is SQLite, schema in `server/src/internal/db/schema.ts` (`sqliteTable`).
* **`server/` is the only thing that talks to the control plane.** This is §1's
  rule 1 restated where it bites: no client, no app, no shared package opens a
  Supabase connection. A route in `server/src/routes/` does.
* **RLS is the security boundary, not an add-on.** Dispatch is cloud-canonical,
  so a row targeting a runtime causes a process to spawn on someone's machine.
  Any new table needs a workspace-scoped policy. Post-migration SQL lives in
  `packages/shared/drizzle/policies/`; see its README before touching policies.
  - ⚠️ **[`G-35`](doc/KnownGaps.md): the enforced role is narrower than it
    looks.** Every content table is governed by a generic "are you a member"
    policy — **any member has full read and write on all workspace content.**
    There is no viewer role. This is why the HITL cut ([`D-1`](doc/Deferred.md))
    is safe today and stops being safe the moment a second person joins.
* **Never query the control plane with the `postgres` role from application
  code.** It owns the tables and bypasses RLS.
* **Migrations: read [`G-60`](doc/KnownGaps.md) first.** `drizzle-kit migrate`
  **does not work** against the shared Supabase project — its journal holds zero
  rows while `public` holds 42 tables, so it would start at `0000` and abort on
  an existing table. Use `packages/shared/drizzle/apply-pending.mjs`. A fresh
  local Docker Supabase does not have this problem, which is a second reason to
  develop against one.
* **Vector search is parked.** Memory embeddings, `sqlite-vec` and the FastEmbed
  model are not carried across the restructure's first pass — see
  [`D-31`](doc/Deferred.md). Cloud `memory_notes` deliberately has **no vector
  column** and gains none on unpark: retrieval sits in the hot path of every run
  and must not become a network call.
* **Environment Variables**:
  - `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`: only
    `apps/web`'s auth callback and `server/` should need these.
  - `SUPABASE_SERVICE_ROLE_KEY`: **`server/` only.** Never ship it to a client or
    a daemon.
  - `DATABASE_URL`: direct Postgres, for migrations only.
  - `SPARSTROW_SERVER_URL`: what a daemon and a desktop app point at.

---

## 5. Documentation & Decision Records (`doc/`)

All non-code project memory lives in `doc/`. Read `doc/README.md` first.

### ⏸️ The full lifecycle is suspended for restructure work

**Suspended 2026-09-02.** The `idea → spec → owner review → plan → tasks → code`
lifecycle produced 13 specs, 23 plans, 40 task folders, 336 documents and 59,142
lines — and no running app. It is a good process for a product that works; it was
a way of appearing productive on one that didn't.

**For work inside the restructure plan**, the required artifacts are:

1. the restructure plan itself (already written),
2. **one task file per slice** in `doc/tasks/`, and
3. a **Result section** in that task file saying what you actually ran.

No new spec, no phase README, no queue regeneration, no band archiving, no drift
check. `doc/templates/` still holds the skeletons for when the full lifecycle
resumes.

**For work outside the restructure** — a genuine new product capability the owner
asks for — the full lifecycle in `doc/specs/README.md` and `doc/tasks/README.md`
still applies. Ask if it's unclear which you're in.

### The registers are NOT suspended

These four files are how the project remembers things that would otherwise be
re-learned the expensive way. They stay, and they stay accurate:

* **`doc/OpenQuestions.md`** — decisions waiting on the owner. Every entry needs
  the full options framework from §3.8. When one is answered, record the answer
  where it's consumed and **delete the entry**.
* **`doc/Deferred.md`** — agreed to build, explicitly parked. Each entry records
  what triggers unparking it. **This register grew during the restructure**:
  `D-31`–`D-38` are the eight parked subsystems, and each is a promise that
  "parked" does not quietly become "abandoned".
* **`doc/KnownGaps.md`** — **built, but not proved**, plus limitations accepted
  knowingly. **Read it before relying on something, and before claiming it
  works.** When you close one, **delete the entry** and say where the proof
  lives. Never reuse a `G-` number — allocate above the highest ever used
  (currently `G-60`).
* **`doc/Ideas.md`** — unscoped, no commitment, may never be built. Written with
  the `elaborating-ideas` skill. An idea that answers its own open questions has
  become a spec that skipped owner review.

* **`doc/bug/`** and **`doc/security/`** — one file per issue, never deleted,
  marked resolved in place. Formats in their READMEs.

**Always document a bug or security issue in the same turn it surfaces** —
whether the owner reports it or an agent notices it while doing something else.
Do not wait to be asked. A problem mentioned only in a chat message does not
exist to the next session.

When the owner says "park it", "later", or "just an idea", write it to the right
file in the same turn rather than relying on the conversation being re-read.

### Shipping without proof is allowed; shipping without saying so is not

Verification sometimes can't be completed. That's a normal outcome and not a
reason to hold a change back. It **is** a reason to write it down: name what you
actually ran in the task's Result section, and open a `KnownGaps.md` entry **in
the same change**.

**Never tick a box on weaker evidence than it asked for and stay silent about
it.** A ticked box that quietly means "looked right to me" devalues every other
ticked box in the repo, and the next agent has no way to tell which is which.
Caveats raised only in chat do not exist.

**And note what this file's header says about that**: twenty `KnownGaps.md`
entries faithfully recorded "built, never run", and nothing acted on them. The
register did its job. Writing the entry is the floor, not the goal — if you find
yourself opening a third gap in a row on the same surface, stop and make it run
instead.
