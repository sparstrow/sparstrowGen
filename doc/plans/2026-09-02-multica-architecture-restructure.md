# Restructure to Multica's architecture — 2026-09-02

| | |
|---|---|
| **Spec** | n/a (internal) — this changes how the app is assembled and shipped, not what the owner can ask it to do. No screen gains or loses a capability by this plan alone. |
| **Status** | In progress — Phase 0 |
| **Trigger** | The owner, 2026-09-02: *"it's been 5 months, I have been building the app, but I never had one feature of the built properly and could even open the app use it once… So I choose long lasting, best practise and right path."* |
| **Depends on** | nothing — this is the new root of the tree |
| **Touches** | the repo layout itself; `AGENTS.md`; `doc/KnownGaps.md`; `doc/Deferred.md`; `doc/Ideas.md`; `packages/*`; `apps/*`; `pnpm-workspace.yaml`; `turbo.json` |
| **Supersedes** | [`server-action-write-conversion`](2026-08-24-server-action-write-conversion.md); `D-1`, `D-15`, `D-19`, `D-24`, `D-25`; 35 `KnownGaps.md` entries |
| **Open questions** | none — all four forks were answered by the owner on 2026-09-02 (see Decisions) |

## Summary

Adopt multica's repo architecture — **one server, thin clients** — in TypeScript,
and prove it with a single vertical slice the owner can install and use before
anything else is ported.

## Why

Five months produced 36K LOC of web app, a 24K LOC agent engine, 40+
control-plane tables, 23 plans and 40 task folders — and an application the owner
has never once opened and used. There are two causes.

### The structural cause

1. **Every write is a Next.js Server Action** — 44 exported actions across 18
   files in `apps/web/src/app/**/actions.ts`. A Server Action is only callable
   from inside a Next.js render. Desktop cannot call one. Mobile cannot call one.
2. **So the desktop app has to ship Next.js inside Electron.**
   [`service-manager.ts:237`](../../packages/desktop/src/service-manager.ts:237)
   spawns a bundled Next standalone server *plus* the core daemon *plus* a
   bundled Node runtime, alongside native modules (`better-sqlite3`, `node-pty`,
   `onnxruntime-node`, `fastembed`) that must all ABI-match. The hardest
   packaging problem in the JS ecosystem, taken on as a side effect of the
   architecture rather than as a choice.
3. **Two servers, neither of them "the" server.** `packages/core/src/api/routes`
   is a complete Fastify REST+WS API (26 route modules). `apps/web` has 23 more
   routes plus direct Supabase access in 16 files.

Multica avoids all three the same way: its desktop renderer is a plain Vite React
SPA importing the same `core`/`views`/`ui` packages the web app imports, talking
to one server over HTTP/WS. Nothing is bundled into Electron but the UI.

### The procedural cause

~73,000 lines of governing instruction around 60K LOC of app. `KnownGaps.md` held
47 open entries and **about 20 said some version of "built, never run"**.
Meanwhile `AGENTS.md` §2.3 mandated a Vercel-preview verification pass that was
**physically impossible** — `G-54` recorded the Vercel account as blocked — so
every band since 2026-08-29 shipped on a documented workaround. The process
detected the exact failure twenty times and never once stopped to fix it.

## Decisions

| Decision | Chosen | Rejected, and why |
|---|---|---|
| **D1 — Server stack** | TypeScript / Fastify. Multica's exact layout and contracts, our language, promoting the Fastify API that already exists in `packages/core`. | A Go rewrite is literally multica's stack and gives a single-binary daemon, but discards the GOAP engine, memory/RAG, MCP and orchestrator, with no Go equivalent for our agent tooling. Realistically 4–8 months before the app opens — repeating the pattern this plan exists to break. The API contract is what matters; Go can replace routes later behind it. |
| **D2 — Auth & data** | Supabase behind the server. Clients never import `@supabase/*`; `server/` verifies the JWT, issues its own session for desktop/CLI, owns all DB access. RLS stays as defence in depth. | Own JWT + PAT + plain Postgres is fully self-hostable and is what multica does, but means rewriting magic-link, OAuth, password reset and email delivery that all work today. `server/src/auth/provider.ts` is an interface so this stays reversible. |
| **D3 — Migration** | Vertical slice first. Full skeleton, then ONE feature end-to-end until it is usable. `apps/web` never breaks. | A full restructure before features is a cleaner end state with no dual-maintenance, but nothing is usable mid-flight — which is the exact pattern that produced the last five months. |
| **D4 — First slice** | machine + agent + chat. | A task board is more CRUD-shaped and exercises less of the runtime path; machines+terminal proves the transport but not the product's purpose. |
| **D5 — Environments** | One Supabase project for `development` and `main`. Local Docker Supabase per feature branch. `staging` retired. | A separate production project (`D-15`) assumed a `staging` tier to promote from. |
| **D6 — Branching** | slice branch → `development` → `main`. | The band tier costs two PRs per unit of work for a single owner. |
| **D7 — Feature cull** | Carry runs & transcripts only. Park memory/RAG, pipelines, cron, GOAP, teams/messages, skills ingestion, terminals, Knowledge Center. Cut the HITL gate. | Everything carried must be ported, wired, styled and *proved in the desktop app* before Phase 4 can be called done. |

### The cull's biggest consequence

Parking memory/RAG (`D-31`) and terminals (`D-37`) removes `fastembed`,
`onnxruntime-node`, `sqlite-vec` and `node-pty` from the desktop bundle.
**`better-sqlite3` is the only native module left**, and Node 22 ships
`node:sqlite` built in. The packaging problem that has blocked this project for
months largely dissolves as a by-product of the cull.

### Two findings that make this cheaper than it looks

- [`apps/web/src/lib/api/router.ts`](../../apps/web/src/lib/api/router.ts) is
  **already framework-agnostic**: `registerRoute({ method, pattern, handler })`
  over a plain `HandlerContext`, with 71 routes across 19 modules in
  `lib/api/handlers/`. The Next `/api/v1/[...path]/route.ts` is a ~50-line
  adapter. Re-hosting on Fastify is an adapter swap, not a rewrite.
- `packages/core/src/cloud/` already implements the entire daemon↔cloud protocol
  (registration, heartbeat, command loop, chat-turn execution, run reporting).
  The slice re-homes its server half; it does not build it.

## Target layout

```
apps/
  web/                 Next.js — thin shell
  desktop/             electron-vite React SPA  (was packages/desktop)
  mobile/              later
packages/
  core/                client domain logic: ApiClient, WSClient, react-query,
                       zustand stores, CoreProvider. NO UI. Exports .ts source.
  views/               feature UI per domain, mirrors core/ 1:1
  ui/                  primitives (exists — 31 components)
  shared/              Zod contracts + Drizzle schema — used by BOTH sides
  tsconfig/            new
  eslint-config/       new
server/                the one server            (was packages/core)
  src/routes/          from apps/web/src/lib/api/handlers + /api/daemon/*
  src/internal/        engine: orchestrator, providers, agents, mcp
                       (parked subsystems live on here, unwired)
  cmd/server.ts        the API (HTTP + WS)
  cmd/daemon.ts        local agent runtime
  cmd/migrate.ts
Makefile               make up / down / status / check
docker-compose.yml     local Supabase, per feature branch
scripts/dev-env.sh     per-worktree DB + port isolation
```

**Naming:** multica's `packages/core` is *client* logic; its backend is `server/`.
Ours is inverted. Phase 1 moves `packages/core` → `server/`, freeing the name.
Supersedes `D-19`.

### Rules the layout enforces

- **Only `server/` imports `@supabase/*`.** Today 16 files in `apps/web/src` do.
- **No Server Actions.** Every write is an HTTP route in `server/`.
- **Shared packages export source, no build step** — `"exports": { "./x":
  "./x/index.ts" }`, as multica's `packages/core` does.
- **One version of everything** via pnpm `catalog:`.

## Foundational work

### Phase 0 — Clear the ground

Nothing here changes behaviour. All of it changes what the next agent believes.

- **0a — purge the registers.** Close the ~35 `KnownGaps.md` entries describing
  surfaces this plan replaces; keep only what is still true. Supersede `D-1`,
  `D-15`, `D-19`, `D-24`, `D-25`; add `D-31`–`D-38` for the parked subsystems.
  Mark the WA plan superseded with its reason. Answer `I-5`, park `I-6`.
- **0b — rewrite `AGENTS.md`.** New layout; the three enforced rules above;
  `development` → `main`; verification is local + a packaged build the owner
  opens; suspend the Knowledge Center rule and the design skill chain; keep the
  Options framework, the Supabase/Postgres skills, the settings-surface check
  (§3.14), and same-turn bug/security documentation.
- **0c — foundations.** `packages/tsconfig` + `packages/eslint-config`; a
  `catalog:` block; **fix the React mismatch** (`apps/web` runs `next@16.3.0`
  with `react@18.3.1`; Next 16 requires 19); `Makefile`, `docker-compose.yml`
  with local Supabase, `scripts/dev-env.sh`; turbo `cache-inputs`; cap turbo
  concurrency to test `G-59`; drop the HITL column.

> **Scope correction, found while doing 0c.** "Cut the HITL gate" turned out to
> mean exactly one dead column, `tasks.hitl_approved` — declared `NOT NULL
> DEFAULT true` and read by nothing. `paused_hitl` needed no migration at all;
> it existed only in a schema comment and was never a value in
> `runStatusSchema`.
>
> **`task_questions` is NOT part of the cut**, though an earlier draft of this
> plan said it was. It is the *agent asks a question* flow — live, and wired to
> `tasks/actions.ts`, `handlers/tasks.ts` and realtime. The gate is a human
> granting permission **before** work runs; a task question is an agent asking
> for information **during** it. Dropping it would have broken working code to
> remove a feature nobody asked to remove.

**Done when:** `make up` starts local Supabase + server + web; `make status`
proves which checkout owns them; `AGENTS.md` no longer describes a process nobody
can follow.

> **Read [`G-60`](../KnownGaps.md) before writing the HITL migration.**
> `drizzle-kit migrate` does not work against the shared Supabase project — its
> journal is empty while `public` holds 42 tables. Use
> `packages/shared/drizzle/apply-pending.mjs`.

### Phase 1 — `server/` exists and is the one API

- `git mv packages/core server`. `server/cmd/daemon.ts` is today's
  `packages/core/src/index.ts`, behaviour unchanged.
- New `server/cmd/server.ts`: Fastify, HTTP + WS.
- **Lift the route registry.** `apps/web/src/lib/api/router.ts` and
  `lib/api/handlers/*` into `server/src/routes/`, behind a Fastify adapter
  supplying the same `HandlerContext`. Carried subsystems only.
- **Lift the daemon protocol.** The 21 `apps/web/src/app/api/daemon/*` routes
  into `server/src/routes/daemon/`.
- **Auth boundary** (`server/src/auth/`): verify the Supabase JWT for web; issue
  a server session token for desktop/CLI, reusing `accessTokens` and the
  person-scoped PAT work from #213. `provider.ts` is an interface.
- `apps/web` keeps working: `/api/v1/[...path]` becomes a thin proxy.

### Phase 2 — `packages/core` (client) and `packages/views`

- `packages/core`: `api/client.ts`, `api/ws-client.ts`, `platform/types.ts` +
  `platform/core-provider.tsx` (`CoreProvider` taking `apiBaseUrl`, `wsUrl`,
  `storage`, `identity {platform, version, os}`), and per-domain
  `queries.ts` / `mutations.ts` / `stores/` for `machines/`, `agents/`, `chat/`,
  `runs/`.
- `packages/views`: machine list/status, agent picker, chat surface, run
  transcript — against `DESIGN.md` and `packages/ui`.

> **[`G-30`](../KnownGaps.md) constrains the chat surface**: turns stream at
> whole-message granularity, not token-level. Do not design a typing indicator
> that implies tokens.

### Phase 3 — `apps/desktop` becomes a real SPA

- `git mv packages/desktop apps/desktop`; adopt `electron-vite` and multica's
  `electron-builder.yml` shape.
- Renderer imports `@sparstrow/core` + `views` + `ui`.
- **Delete the bundled Next.js server and the bundled Node runtime** —
  `spawnWeb()` and the `web` / `node-runtime` `extraResources` entries.
- Main process keeps: single-instance lock, tray, updater, deep links, daemon
  supervision.
- Sign-in: main opens the browser, receives the callback, hands the renderer a
  server session token — the loopback pattern from #210.
- **Evaluate `node:sqlite`** now that `better-sqlite3` is the last native module.

## Per-story work

### Phase 4 — The slice: machine + agent + chat

> install → open → sign in → **my machine is there** → pick an agent → send a
> message → it runs on my computer → output streams back

- Wire `packages/core`'s machines/agents/chat/runs queries to `server/`.
- Daemon connects to `server/` for register / heartbeat / commands / chat-turn /
  run events.
- Stream turn events over the server's WS into the desktop renderer.
- Per `AGENTS.md` §3.14, ship the settings these surfaces need — provider/model
  defaults, auto-start, which machine is preferred — in the same phase.

**Done when the owner installs the built artifact and uses it.** Not when tests
pass.

### Phase 5+ — Port the rest

Reverse the remaining Server Actions into `server/` routes one feature at a time;
migrate `apps/web` screens onto `packages/views`; unpark subsystems per their
`Deferred.md` triggers; `apps/mobile` once two clients have proved the shape.

## Verification

| Phase | How it is proved |
|---|---|
| Every slice | `pnpm typecheck && pnpm test`, then `make check` |
| 1 | With `make up`: sign in on web, then `curl -H "Authorization: Bearer <token>" localhost:8080/api/v1/agents` returns what the web app shows. `apps/web` still passes through the proxy. |
| 3 | `pnpm package`; install on a clean Windows profile; it opens with no Node runtime and no Next server present. |
| 4 | **The real gate**, below. |

**Phase 4 gate.** On a machine that has never run the repo:

1. Install the packaged desktop app.
2. Sign in.
3. Confirm the machine appears with no pairing step.
4. Pick an agent, send a message.
5. Confirm the agent process starts locally (server logs + task manager).
6. Confirm output streams back into the window.
7. Close and reopen; confirm the session is still there.

**Steps 1–7 are performed by the owner, not asserted by an agent.** Anything not
proved gets a `KnownGaps.md` entry in the same change.

> `G-59` — the suite flakes under parallel turbo — **blocks this plan's own
> verification story**. `make check` is worthless if `pnpm test` is
> nondeterministic. Cap concurrency in Phase 0 and see whether it goes away.

## Risks

| Risk | Mitigation |
|---|---|
| The `packages/core` → `server/` rename touches every import | One mechanical commit: `git mv` + path rewrite, typecheck as the gate. Nothing else in it. |
| React 18→19 destabilises `apps/web` | Phase 0, alone, before anything depends on it. Next 16 already requires it — this fixes a latent misconfiguration. |
| Parked code rots in `server/src/internal/` | Unwired, not deleted, and carrying no verification burden. Each has an unpark trigger in `D-31`–`D-38`. |
| Purging `KnownGaps.md` loses a real problem | Only entries about *replaced surfaces* closed. `G-5`, `G-35`, `G-51`–`G-53`, `G-59`, `G-60` survive. |
| Cutting HITL leaves dispatch unguarded | Accepted knowingly: single user; workspace-scoped RLS and the `effectiveTools` spawn clamp stay live. Unpark trigger is the first collaborator — see `D-1` and `G-35`. |
| Restructuring stalls like the last five months | **Phase 4 is the gate.** If the owner cannot open and use the app at the end of it, the plan has failed regardless of what else is green. |
