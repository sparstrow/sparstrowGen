# Finish the slice, then the first screens

**Status:** Active. Supersedes nothing — this is the execution detail under
[`2026-09-02-multica-architecture-restructure.md`](2026-09-02-multica-architecture-restructure.md)
§Phase 4 and §Phase 5.
**Written:** 2026-09-04, so the remaining work can be picked up by an agent that
was not in the conversation where it was decided.

> **Read this first if you are starting cold.** Everything below the line "What
> is already true" is *verified*, not planned. Do not rebuild it. The work that
> remains starts at §3.

---

## 1. The one sentence this phase exists to make true

> pick an agent → send a message → **it runs on my computer** → output comes back

As of 2026-09-04 every part of that sentence works **except the "pick" and the
"send"**, because the desktop app has no chat screen. The protocol underneath it
is closed and proved end to end.

---

## 2. What is already true

### 2.1 The loop closes at the protocol level

Proved 2026-09-04 against local Docker Supabase, a real `server/`, and the
**real daemon** — not a test harness:

```
[25] Assign a real turn to the running daemon
    OK   turn ct_508afefdeb62 queued for runtime rt_c5f45a6bc829
    ..   in_progress/seq0
    ..   succeeded/seq2  reply="PONG"

    OK   THE AGENT REPLIED: "PONG"
    ..   command row: done
```

A turn assigned in the cloud was claimed by the daemon, resolved against an
agent the daemon had synced down at boot, executed by the Claude Code CLI, and
reported back. Detail and the full 25-step check list live in
[`doc/tasks/2026-09-03-phase-4-finish-the-slice.md`](../tasks/2026-09-03-phase-4-finish-the-slice.md).

### 2.2 Shipped subsystems

| Piece | Where | State |
|---|---|---|
| `server/` as the only DB client | `server/src/routes/` | Phases 1–2 done |
| Client data layer | `packages/core` | reads only — see §2.4 |
| Desktop as a real SPA | `apps/desktop` | Phase 3 done, v0.3.4 installed |
| Release + self-update | `.github/workflows/release.yml` | v0.3.0–v0.3.4 published |
| `dev` channel isolation | `apps/desktop/scripts/build-channel-config.mjs`, `src/main/ports.ts` | separate `appId`, `productName`, userData **and** ports |
| `server/` supervised by the app | `apps/desktop/src/main/service-manager.ts` | `G-67` closed |
| `/connect` served by `server/` | `server/src/routes/` | `G-68` closed |
| Provider credentials from saved settings | `server/src/orchestrator/provider-env.ts` | fixed, then **re-fixed** — see §5.1 |
| Daemon syncs workspace agents down | `server/src/cloud/agent-sync.ts` | OQ-12 option A |
| Command delivery | `server/src/routes/daemon/index.ts` | §2.1 |

### 2.3 Test baseline to keep green

```
pnpm typecheck   9/9
pnpm test        7/7   (859 server tests)
```

### 2.4 The precise shape of the remaining gap

This is the most useful fact in the document, so it is stated exactly.

**The chat write routes already exist.** In
[`server/src/routes/handlers/chat.ts`](../../server/src/routes/handlers/chat.ts):

| Method | Pattern | Line |
|---|---|---|
| `GET` | `/chat/sessions` | 77 |
| `GET` | `/chat/search` | 102 |
| `GET` | `/chat/sessions/:id` | 165 |
| `POST` | `/chat/sessions` | 266 |
| `PATCH` | `/chat/sessions/:id` | 349 |
| `DELETE` | `/chat/sessions/:id` | 382 |
| `POST` | `/chat/sessions/:id/messages` | 399 |

**The `ApiClient` already has the verbs.** `post`, `patch` and `delete` are on
[`packages/core/src/api/client.ts:136-148`](../../packages/core/src/api/client.ts).

**What is missing is only the hooks layer and the screen.** Every domain folder
in `packages/core/src/` — `agents`, `chat`, `machines`, `runs` — contains
`queries.ts` and nothing else. There is **no `mutations.ts` anywhere in
`packages/core`**.

> `packages/core` can read everything and write nothing.

That is the whole of the remaining Phase 4 work. It is much smaller than "port
the write path", which is what the older task file said before it was corrected.

### 2.5 Inventory for Phase 5, recounted 2026-09-04

| | |
|---|---|
| Pages in `apps/web` | **29** |
| Screens lifted into `packages/views` | **1** (`machines/machine-list.tsx`) |
| `actions.ts` modules still in `apps/web` | **16** |
| Components importing `@supabase/*` | **0** |

The design is not welded to Next.js; the pages around it are.

---

## 3. Remaining work in this phase

### 3.1 — Chat mutations in `packages/core` ← **start here**

**Why first:** nothing else in this phase can be demonstrated without it, and it
is the smallest piece.

Create `packages/core/src/chat/mutations.ts`, mirroring the shape of the
existing `queries.ts` in the same folder.

- [ ] `useCreateChatSession()` → `POST /chat/sessions`
- [ ] `useSendChatMessage()` → `POST /chat/sessions/:id/messages`
- [ ] `useRenameChatSession()` → `PATCH /chat/sessions/:id`
- [ ] `useDeleteChatSession()` → `DELETE /chat/sessions/:id`
- [ ] Invalidate the matching keys from `packages/core/src/query-keys.ts` on
      success — do not invent a second key convention
- [ ] Export from `packages/core/src/index.ts`

**No server work.** If you find yourself editing `server/src/routes/handlers/chat.ts`,
stop and re-read §2.4 — the route you need is almost certainly already there.

**Acceptance:** a vitest test per hook, and `pnpm typecheck` clean.

### 3.2 — The chat surface in `packages/views`

- [ ] `packages/views/src/chat/` — session list, transcript, composer
- [ ] Reads through `@sparstrow/core`, renders with `@sparstrow/ui`
- [ ] **Navigation arrives as props.** No `next/*`, no Electron, no router
      import — see the doctrine comment at the top of
      [`packages/views/src/index.ts`](../../packages/views/src/index.ts)
- [ ] Export from `packages/views/src/index.ts`
- [ ] Polling is sufficient for v1; streaming is §3.4

**Before writing any component**, in this order:
1. Read [`DESIGN.md`](../../DESIGN.md), especially §6 Iconography and §7 Motion
2. Read the register in [`PRODUCT.md`](../../PRODUCT.md)
3. Read the `ai-design-slop` catalogue in `.claude/skills/ai-design-slop/`
4. Then `/shadcn` and the `shadcn` MCP — check for an existing block before
   composing a page from scratch

Never hardcode a colour. `DESIGN.md` defines a theming contract (user-selectable
brand accent + surface character with contrast floors), not a fixed palette.
Verify in **both modes and at least the Paper and Mono surfaces**; Mono is the
honest worst case.

**No em-dashes in app frontend text.** (Standing instruction from the owner.
This document is not frontend text.)

### 3.3 — Render it in the desktop app

The renderer today is four screens' worth of files and no router:
`apps/desktop/src/renderer/src/{app,settings,server-settings}.tsx`.

- [ ] Add chat to the desktop shell
- [ ] The owner picks an agent, types a message, sees a reply

**Done when the owner does that.** Not when tests pass. This is the phase gate
and it has not moved.

### 3.4 — Streaming (the server-owned WebSocket)

Currently a reply lands **when the turn completes**, not progressively.

Verified state on 2026-09-04:
- `server/src/ws/handler.ts` exists but is **not mounted** in
  `server/src/http/app.ts`
- there is **no `ws://` / `wss://` / `wsUrl` anywhere in `packages/core`**

So the WS client does not exist yet. Supabase Realtime was deliberately not
ported — the restructure replaced it, and `D-37` parks the Realtime bridge.

- [ ] Mount the handler
- [ ] `WSClient` in `packages/core`, one connection multiplexed by topic
- [ ] `CoreProvider` already takes `wsUrl`; use it rather than deriving one

**Sequencing note that matters:** see §4. If hosting happens, build this
*against the hosted server*, because nginx is where WebSockets break.

### 3.5 — Model discovery (OQ-11)

The owner's requirement, recorded but not yet built:

- [ ] Discover installed providers and models from Windows environment
      variables, the way multica does (`references/multica` is cloned locally,
      read-only — its licence bars verbatim reuse in a hosted product)
- [ ] Keep the list current as providers ship new models; no hardcoded snapshot
      that ages
- [ ] List all of a provider's **non-deprecated** models
- [ ] **Settings surface in the same slice** — `AGENTS.md` §3.14 is not optional

Half of this already exists: `server/src/orchestrator/provider-env.ts` reads the
persistent Windows environment (`HKCU`/`HKLM`) and reports a per-key source.
Discovery and correctness wanted the same source of truth, and it is already
built. This item is the *listing and Settings* half.

### 3.6 — Daemon routes still unported

The daemon logs a warning for the two it polls and carries on, which is the
intended degradation. Port them when a screen needs them, not before:

`/runs/:id/events`, `/runs/:id/status`, `/memory/*`, `/realtime/token`,
`/settings`, `/status`, `/projects/bindings`, `/providers/discover-models`,
`/chat/attachments/*`

### 3.7 — Then Phase 5, in this order

1. **The app shell** — `apps/web/src/components/layout/app-shell.tsx` plus
   breadcrumbs, command palette, pinned items, tab strip, workspace switcher.
   Needs `useLiveEvents`, `useAttentionQueue`, `useWorkspaceTabs` in
   `packages/core` first. This is what stops the window looking like a
   two-tab prototype.
2. **Agents** — create and edit, which the agent sync made meaningful
3. **Machines** — already lifted, needs the shell around it
4. **Projects**
5. **Runs** and the transcript view

Moving a screen is three steps and only one is UI work: its writes become HTTP
routes in `server/` (many already are), its reads become a `queries.ts` in
`packages/core`, its component moves to `packages/views` with navigation
injected instead of imported.

---

## 4. Hosting — decided 2026-09-04, deliberately sequenced after chat

The owner's direction: **develop locally with full freedom, and use a hosted
server when actually using the app.** Target is a **Hostinger VPS running
Coolify**, hosting both `server/` and the Next.js web client.

This reopens [`D-40`](../Deferred.md) with a real intent, so record it there
rather than here when it starts.

**The decision was to do it after the chat surface lands, not before.** Reasons,
all verified rather than asserted:

- **The WebSocket does not exist yet** (§3.4). WS is the thing that breaks
  behind a reverse proxy — it needs explicit `Upgrade`/`Connection` headers and
  a raised `proxy_read_timeout` or connections die silently at 60s. Building it
  against `127.0.0.1` with no proxy in the path and deploying afterwards means
  debugging the streaming code and the proxy config simultaneously.
- **CORS currently defaults to `http://localhost:3000`**
  ([`server/src/http/config.ts`](../../server/src/http/config.ts)).
- **Latency changes UI decisions.** Local is sub-millisecond; a VPS is
  30–150 ms. Optimistic updates, spinner thresholds and poll intervals decided
  against 0 ms feel wrong at 100 ms.

**Hosting is configuration, not architecture** — this was preserved on purpose:

| Knob | Where | Default |
|---|---|---|
| `SPARSTROW_SERVER_HOST` | `server/src/http/config.ts` | `127.0.0.1`, with a comment saying to set it deliberately to expose |
| `SPARSTROW_SERVER_PORT` | same | `8080` |
| `SPARSTROW_SERVER_CORS_ORIGINS` | same | `http://localhost:3000` |
| `SPARSTROW_WEB_ORIGIN` | same | this server's own origin |
| `SPARSTROW_SERVER_URL` | `apps/desktop/src/main/ports.ts` | what the window dials |
| `SPARSTROW_CLOUD_URL` | `apps/desktop/src/main/main.ts:68` | what the daemon reports to; `??=` so an explicit value wins |

`apps/desktop/src/main/packaged-env.ts:94` says it outright: *"when hosting
arrives (`D-40`) it comes back as configuration, not as a baked constant."*

**The daemon polls outbound**, so a hosted server needs no port forwarding and
works with the machine behind NAT. This is the thing that usually kills the idea
and it does not apply here.

### 4.1 Two costs to price before starting

**Every migration becomes a live migration.** The hosted server points at cloud
Supabase, which carries [`G-60`](../KnownGaps.md): `drizzle.__drizzle_migrations`
holds zero rows while `public` holds 42 tables, so `drizzle-kit migrate` would
start at `0000` and abort on an existing table. Migrations currently go through
`packages/shared/drizzle/apply-pending.mjs` by hand. See §5.3 — this is fixable,
and worth fixing *before* hosting rather than after.

**Offline.** If the app talks to a VPS and the connection drops, an agent running
on the machine physically in front of you becomes unreachable. Mitigation is a
visible Settings field for `SPARSTROW_SERVER_URL` (local vs hosted), not an
environment variable somebody has to remember. `AGENTS.md` §3.14 requires the
Settings surface anyway.

### 4.2 On Coolify

Good fit, and better than hand-rolling systemd + nginx. It gives per-app
environment management, automatic Let's Encrypt, and Docker-based deploys, which
is what both `server/` and `apps/web` want. Two things to get right on day one:

- **WebSocket proxying** must be enabled for `server/` in the Coolify proxy
  config, or §3.4 will appear broken when it is not.
- **`SUPABASE_SERVICE_ROLE_KEY` goes in Coolify's secret storage and reaches
  `server/` only.** Never the web client, never a daemon, never an installer.
  It is `server/`-only today and that is enforced by discipline alone.

**Use the VPS, not Hostinger shared hosting.** Shared is LiteSpeed/PHP-shaped
and will not hold a long-lived Fastify process with WebSockets.

---

## 5. Traps — read before writing code

These each cost real time. They are recorded so they cost it once.

### 5.1 Verify the thing that runs, not something adjacent to it

The provider-env fix merged to `main` on 2026-09-03 **was inert**. A mangled
escape turned the registry query into `` `${root}\${path}` `` — in a template
literal `\$` escapes the `$`, so the argument became the literal `HKCU${path}`,
and the HKLM path lost its separators the same way. Both registry reads threw,
both returned `{}`, and every provider group silently fell through to the
ambient fallback — exactly what the fix existed to prevent.

Two verifications missed it:

- the unit tests passed, because they only exercised the fallback path;
- the manual check passed, because it used a **separate copy** of the parser in
  a scratch script rather than importing the module.

It is now guarded by two assertions on the **source text** (the bug is invisible
at runtime off Windows) plus a Windows-only test that reads `HKCU\Environment`
and requires every provider key found there to resolve as `persistent`. See
`server/src/orchestrator/provider-env.test.ts`.

### 5.2 A test that passes because the code is broken

Two child-env tests planted `ANTHROPIC_API_KEY` in `process.env` and asserted it
was forwarded. That only passed **because** discovery was broken. When
discovery started working they failed correctly, and had to be *corrected*, not
repaired. Before "fixing" a newly failing test, check whether it was asserting
the bug.

Related: an e2e step asserted "0 local-only agents survived" against a fresh
data dir — vacuously true, proving nothing about the guarantee that matters
(a sync must never delete). Now it plants an agent that exists in no workspace,
syncs, and checks it survived.

### 5.3 `G-60` is fixable, and the Supabase Drizzle guide does not fix it

Checked against current docs 2026-09-04. `supabase/docs/guides/database/drizzle`
covers **connecting** Drizzle to Supabase — connection strings, pooler modes,
schema definition. `G-60` is not a connection problem; it is migration-journal
state drift, and no connection guide touches it.

The actual fix is a **baseline**, and both routes are documented:

- `drizzle-kit push --init` marks the current database schema as the baseline
  for future migrations
- or backfill `drizzle.__drizzle_migrations` directly — its columns are
  documented as `id`, `hash`, `created_at`, plus `name` and `applied_at` in v1

(The Supabase CLI's own `supabase migration repair --status applied` repairs
`supabase_migrations.schema_migrations`, which is a **different table** from
Drizzle's journal. Do not reach for it expecting it to help here.)

Worth doing **before** hosting, per §4.1.

### 5.4 Lazy resolution in the Electron main process

`main.ts` imports `core-client` (line 3) and `service-manager` (line 6) but does
not call `applyPackagedEnv()` until line 52. Anything resolved from per-install
config **must** be read lazily — that is why every export in
`apps/desktop/src/main/ports.ts` is a function, not a constant.

### 5.5 Electron prefers `productName` over `name`

The packaged `package.json`'s `productName` decides `userData`, not `name`. A
dev-channel build with `name: sparstrow-desktop-dev` but `productName:
Sparstrowgen` wrote to the owner's data directory and quit on their
single-instance lock. Both must be set in `extraMetadata`.

### 5.6 Tooling

- `server/` compiles with `noUncheckedIndexedAccess`; `apps/web` does not.
  Index access needs a guard or an explicit throw.
- Large heredocs through the Bash tool fail with
  `unexpected EOF while looking for matching`. Use the Write tool for anything
  substantial.
- Never bare `git stash` / `git stash pop` — the stash stack is shared across
  worktrees and other sessions may be using it.

---

## 6. Working agreement (from `AGENTS.md`, restated because it is easy to miss)

- **A feature is not done until it runs in the desktop app.** Green tests are
  not the gate.
- Open PRs and merge them **without asking**; `gh pr merge <n> --auto --squash`.
- **Never delete a branch** — local or remote — unless the owner names that
  specific branch. "It's merged" is not authorization.
- **Never push directly to `development` or `main`.**
- A version bump in the `development` → `main` PR **is** the release. Leaving
  the version alone lands work on `main` without releasing it, and is the right
  choice when you are not confident the build is one the owner should run.
- Load the `supabase` and `supabase-postgres-best-practices` skills **before**
  writing anything that lives in Postgres, in the turn where the work happens.
- Use `context7` for any framework API you are about to write against, **even
  when you think you know the answer**.
- Shipping without proof is allowed. Shipping without **saying so** is not —
  name what you actually ran, and open a `KnownGaps.md` entry in the same
  change.

## 7. Verification for this phase

```bash
pnpm typecheck && pnpm test && make check
```

Then the part that actually counts: a packaged desktop build the owner opens,
in which they pick an agent, send a message, and see a reply. `pnpm dev:desktop`
proves the least interesting half — packaging is where this project has
historically failed.
