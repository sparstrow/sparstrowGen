---
name: designing-shared-contracts
description: >-
  Designs and versions the shared request/response contracts between
  apps/web's API routes and packages/core, using this repo's actual pattern —
  Zod schemas in packages/shared/src/schemas plus registerRoute handlers in
  apps/web/src/lib/api — not OpenAPI. Use when defining or changing any
  interface between the web app, the daemon, or a future service.
metadata:
  sparstrowgen-owner: architect
---

# Designing shared contracts

This repo has no OpenAPI/GraphQL layer. The contract between `apps/web` and
`packages/core` (via the daemon) is TypeScript-native: a Zod schema in
`packages/shared/src/schemas/<name>.ts` is the canonical shape, shared by
UI forms, the daemon, and (for typed tables) Drizzle. Design the schema
first; the route handler and the UI form both derive from it.

## Where the pieces live

- **Canonical shape** — `packages/shared/src/schemas/<name>.ts`. A `z.object`
  plus its inferred TS type. This is what UI forms, the daemon, and any
  cross-package caller import — never redeclare the same fields in a second
  place.
- **Authenticated v1 API** — a single catch-all route,
  `apps/web/src/app/api/v1/[...path]/route.ts`, dispatches by method +
  pattern to handlers registered with `registerRoute()` in
  `apps/web/src/lib/api/handlers/*.ts` (see `router.ts` for the registry).
  Each handler gets a `HandlerContext` with an authenticated `supabase`
  client, the caller's `workspaceId` (already resolved — RLS is what
  actually enforces the boundary, per `AGENTS.md` §4, not this layer), path
  `params`, `searchParams`, and a loosely-typed `body`.
- **Daemon-facing API** — `apps/web/src/app/api/daemon/*` (heartbeat, pair,
  register, memory, runs, …), a separate surface for the local daemon rather
  than the browser client.

## Two validation postures — pick deliberately

Most CRUD routes under `/api/v1` pass `body` through close to as-is (see any
handler in `apps/web/src/lib/api/handlers/agents.ts` for the pattern) and
lean on RLS + the `workspace_id` filter as the real safety boundary — the
schema exists for TypeScript/form correctness, not request-time rejection.

Anywhere the input is genuinely untrusted — user-supplied text an LLM turns
into structured data, a partial draft, anything that will be interpreted as
permissions or executable configuration — parse and clamp explicitly at the
boundary instead. `packages/shared/src/schemas/agent-draft.ts` is the
reference case: the draft schema accepts a loose, partial shape so a
half-filled conversation never gets rejected, and a separate `clampDraft`
step (not shown in the schema) re-validates the *real* schema server-side
and strips anything that would let a draft grant itself `bypassPermissions`
or a wildcard tool. When designing a contract that touches permissions,
tool grants, or arbitrary code/config, default to the clamp pattern, not the
pass-through one.

## Naming and casing

Postgres columns are `snake_case`; TypeScript is `camelCase`.
`apps/web/src/lib/case.ts` provides `toCamel`/`toSnake` conversion used by the
router, and `OPAQUE_COLUMNS` marks fields that should pass through
un-converted (typically JSON blobs). When adding a table/column, check
whether it needs an `OPAQUE_COLUMNS` entry rather than assuming automatic
conversion is always correct.

## Registration gotcha

`registerRoute()` replaces (doesn't throw on) a duplicate `method` +
`pattern` registration, specifically so HMR re-imports don't wedge the dev
server — see the comment in `router.ts`. In production this means two
modules registering the same route silently shadow each other and *which one
wins depends on import order*. Register each `method`+`pattern` pair in
exactly one handler module.

## Versioning

There's no independent deploy for the contract — `apps/web` and
`packages/core` ship from the same monorepo, so a breaking schema change
must update every call site in the same change, not behind a version flag.
Prefer additive, optional fields when a change can be additive at all;
reserve a genuine breaking change (renamed/removed field) for when the
plan's Decisions section says why backward compatibility wasn't worth
carrying.

## Output

The plan's Decisions section should name: which schema(s) are new or
changed, which route(s) consume them, which validation posture (pass-through
vs. clamp) applies and why, and any `OPAQUE_COLUMNS` implications.
