# Phase 1 — `server/` exists and is the one API

**Plan:** [`2026-09-02-multica-architecture-restructure.md`](../plans/2026-09-02-multica-architecture-restructure.md)
**Branch:** `claude/multica-app-architecture-0a3e6f`
**Status:** ✅ Complete — verified at runtime, not only in CI.

Per `AGENTS.md` §5, restructure work needs the plan, one task file per slice,
and a Result section saying what was actually run. This is that file.

## Goal

Make `server/` a real process that every client talks to, and prove `apps/web`
still works as one of those clients rather than as the server.

## What was done

Six commits, each independently verified.

| Commit | What |
|---|---|
| `e57af89` | `git mv packages/core server`, `@sparstrow/core` → `@sparstrow/server` |
| `9eea2cc` | Dropped `next/server` from the route registry and the daemon responder |
| `3c17207` | Wire contract (`case.ts`, `enqueue.ts`) → `@sparstrow/shared` |
| `56910ff` | The 71-route registry → `server/src/routes/` |
| `7fdf4d3` | `cmd/server.ts` (Fastify) + the `AuthProvider` boundary |
| *(this)* | `/api/v1` becomes a proxy; `apps/web` is a client |

### The two things that made it cheap

1. **The registry was already framework-agnostic.** Its only Next.js coupling
   was one `NextResponse` import in one file. 71 routes across 19 handler
   modules were callable solely from inside a Next render because of four lines
   — invisible as a constraint precisely because Next was the only host.
2. **`packages/core` already spoke the daemon↔cloud protocol.** Nothing about
   it had to be rewritten; it was renamed and moved.

### The design decision that mattered most

`server/src/auth/provider.ts`'s second obligation: `clientFor` returns a
database client acting **as the user** (anon key + their JWT), never a
service-role client. Had `server/` used the service role for human-facing
reads, every policy in `packages/shared/drizzle/policies/` would have stopped
being enforced, and the only thing separating two people's data would be ~50
handlers each remembering `.eq("workspace_id", …)` forever. The service role
stays where it already was and is already documented — the daemon path, which
has no user session to act as.

## Result — what was actually run

**Static:** `pnpm typecheck` 7/7 and `pnpm test` 1658 tests green after every
commit. Test totals were tracked across the moves rather than just re-read
(1650 → 1658, the 8 new boundary tests) so a suite silently losing files during
a large `git mv` would have shown up.

**Runtime — `server/` on its own.** Signed in as `agent@sparstrow.com` through
the product's own magic-link exchange (no password typed, per
[`runbooks/agent-browser-session.md`](../runbooks/agent-browser-session.md)),
then `curl` against `127.0.0.1:8080` with that bearer token:

- `/healthz` → 200 without a credential
- `/api/v1/workspace` → 200 with real rows, **the same workspace id the web app
  returns for that account** — two hosts, one registry, one row
- `/agents`, `/projects`, `/teams`, `/skills`, `/runs`,
  `/tasks/attention/queue` → 200
- no credential and a bad credential → identical 401 JSON

**Runtime — security checks, run rather than reasoned about.**

- `grep` confirms nothing under `src/http`, `src/auth` or `src/routes`
  references the service role.
- A forged `x-sparstrow-workspace` naming a workspace the user does not belong
  to was **ignored**, returning their own — `getActiveWorkspaceId` validates
  against real membership before believing any client-supplied id.

**Runtime — `apps/web` through the proxy.** With `server/` in a separate
process, from the browser with a real session:

- read path: `/workspace`, `/agents`, `/projects`, `/teams`, `/skills`,
  `/runs`, `/tasks/attention/queue` → 200; unknown route → 404 passthrough
- **full write round-trip**, the riskiest part of the proxy (body forwarding,
  `duplex: "half"`, snake-casing): `POST /projects` 200 → `GET` 200 (camelCased)
  → `PATCH` 200 (renamed) → `DELETE` 204 → `GET` 404. The probe project was
  deleted, so no test data was left behind.
- `server/` stopped deliberately → 502 with a message naming the cause and the
  fix, plus a stable `reason: "server_unreachable"` token
- pages swept in a **fresh tab** (Projects, Settings, Agents, Machines): render
  correctly, Settings shows `agent@sparstrow.com`, **zero console errors**

The fresh tab matters: the original tab's console still held errors from
earlier in the session, which is exactly how a cumulative log talks someone
into believing a fixed problem is live, or a live one is fixed.

## What this phase did NOT do, deliberately

- **`apps/web` still depends on `@sparstrow/server`**, for
  `getActiveWorkspaceId` in `lib/action-result.ts` and `app/teams/page.tsx` —
  the Server Actions path, which Phase 5 deletes. The `/api/v1` adapter no
  longer does. Recorded as part of [`G-63`](../KnownGaps.md).
- **The daemon's 21 `/api/daemon/*` routes have not moved.** They still work
  unchanged in `apps/web`; they are de-Nexted (commit `9eea2cc`) and therefore
  ready to move whenever Phase 3 or 4 needs them to.
- **No WebSocket yet.** The plan puts the server-owned WS in Phase 2 with
  `packages/core`'s `WSClient`, and nothing consumes it before then.
- **`server/src/api/routes/` was left where it is.** That is the *daemon's* own
  local API — a different server for a different audience — and moving it under
  `src/internal/` is a separate change that would have made this one unreadable.

## Findings raised, not silently fixed

- [`G-62`](../KnownGaps.md) — **two `slugify`s that disagree**, surfaced only
  because the move put them in one namespace for the first time. They have been
  splitting `projects.slug`: the two project-create paths derive it differently,
  so a 40–80 character name yields two different URLs for one project. Renamed
  the moved one to `slugifyShort` and changed **no** behaviour — picking a
  winner rewrites slugs already in URLs, which is the owner's call.
- [`G-63`](../KnownGaps.md) — three surfaces in `apps/web` still read the
  database directly. The audit also **corrects the plan's own figure**: 7 files
  carry a runtime `@supabase/*` import, not 16 — the rest are `import type`, and
  3 of the 7 are auth plumbing that legitimately stays.

## Open questions this phase surfaced

[`OQ-9`](../OpenQuestions.md) — **where the copy of `server/` that a client
talks to actually runs.** Proceeding on local-per-machine, which is both what
Phases 1–3 need anyway and what multica itself does, built so that a hosted
deployment is a config change (`SPARSTROW_SERVER_URL`) rather than a rewrite.
