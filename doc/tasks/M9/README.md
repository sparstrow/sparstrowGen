# M9 — Workspace and profile identity

| | |
|---|---|
| **Plan** | [`../../plans/2026-08-16-setup-and-machines.md`](../../plans/2026-08-16-setup-and-machines.md) (M9) |
| **Kind** | **foundational** — endpoints and hooks. Demos to nobody. |
| **Spec** | [`../../specs/2026-08-16-setup-and-machines.md`](../../specs/2026-08-16-setup-and-machines.md) |
| **Depends on** | — |
| **Blocks** | **M10.** Without these, US2's first two steps have nothing to complete and no way to complete it. |
| **Status** | not started |
| **Open questions** | none |

## Objective

Three handlers and their hooks, so an owner can name their workspace and give
themselves a display name. Nothing here renders — M10 builds the surfaces. This
phase exists because those surfaces need something to call, and because the
"which store do I write?" question has exactly one correct answer that belongs
in a handler rather than in three components.

Serves FR-017 and FR-018 (workspace naming), and plan decision 7 (profile
naming, the generalization of spec decision 5).

## The shape of what was found

**There is no workspace endpoint at all.** `/api/v1` has 16 handler modules and
not one of them touches the `workspaces` table
([`handlers/index.ts`](../../../apps/web/src/lib/api/handlers/index.ts)). The
workspace id is *resolved* on every request by
[`getActiveWorkspaceId`](../../../apps/web/src/lib/workspace.ts) and then used
as a filter; the row itself is never read back or written. Both handlers here
are genuinely new surface, not extensions.

**`workspaces.slug` is referenced by no application code.** Verified by search
across `apps/web/src`, `packages/core/src` and `packages/ui/src`. It is written
once by `bootstrap_workspace` as `personal-<8 chars>` and never read by
anything. This is what makes plan decision 6 safe.

**There are two display-name stores and they already disagree by design.**
`account.name` is read from the **auth session's** metadata
([`account-provider.tsx`](../../../apps/web/src/components/auth/account-provider.tsx)),
server-rendered into the shell deliberately to prevent a hydration mismatch.
`public.users.name` is written **once**, at bootstrap, from that same metadata
with an email-local-part fallback
([`004_bootstrap_rpc.sql:66-77`](../../../packages/shared/drizzle/policies/004_bootstrap_rpc.sql:66)).
Writing one and reading the other is a rename that appears to work and reverts
on the next full page load. Phase decision 3 is the fix.

**The sidebar has never shown the workspace name.** `WorkspaceSwitcher` prints
the literal string `"Sparstrowgen"`
([`workspace-switcher.tsx:50`](../../../packages/ui/src/components/layout/workspace-switcher.tsx:50)).
Naming a workspace with nothing showing it would be a control with no visible
effect — the consumer lands in M10, but the query it needs is built here.

## Tasks

Run order and concurrency live in [`../MasterTaskQueue.md`](../MasterTaskQueue.md).

| Task | Tag | Serves | Depends on | Status |
|---|---|---|---|---|
| [T-M9-01 — workspace read + rename](T-M9-01-workspace-handler.md) | `[P]` | foundational → M10 | — | not started |
| [T-M9-02 — profile display name](T-M9-02-profile-handler.md) | `[P]` | foundational → M10 | — | not started |
| [T-M9-03 — hooks](T-M9-03-hooks.md) | `[C]` | foundational → M10 | 01, 02 | not started |
| [T-M9-04 — verification](T-M9-04-verification.md) | `[S]` | foundational → M10 | 01–03 | not started |

01 and 02 are `[P]` — two new files, no shared state, hand to different
workers. 03 is `[C]` because `hooks.ts` is a 2000-line shared file that other
phases also edit; one worker at a time on it.

## Definition of done

**This phase unblocks M10**, which is the only reason it exists. Concretely:

- `GET /api/v1/workspace` returns the caller's workspace row (id, name, slug,
  description, created_at) — enough for M10's derivation to decide whether the
  name is still the auto-generated default.
- `PATCH /api/v1/workspace` renames it, sets the slug on the first real rename
  only, validates, and is denied across workspaces.
- `PATCH /api/v1/me` sets a display name in **both** stores in one call, and
  the change is visible in the shell without a full page reload.
- `useWorkspace`, `useRenameWorkspace`, `useUpdateProfile` exported from
  `packages/ui/src/api/hooks.ts`, following the file's existing invalidation
  patterns.
- Handler behaviour proved through the router the way M2 proved its handlers —
  unit tests plus a live round-trip — not by inspection.
- `pnpm typecheck` and `pnpm test` green.

**Not in this phase:** any rendered surface. The naming cards, the guide and
the sidebar change are M10. Also not here: avatar upload, email change,
password change, workspace deletion, or a workspace picker — see the plan's
Scope boundaries, and [`D-7`](../../Deferred.md) for multi-workspace.

---

## Decisions already made

Plan decisions 6 and 8 are inherited; cite them rather than restating.

### 1. `/workspace` is singular and takes no id

The caller has exactly one active workspace, resolved server-side on every
request by `getActiveWorkspaceId` before a handler runs. A `/workspaces/:id`
shape would invite passing an id the server then has to re-authorize, for a
product that has no picker and whose multiple-workspace branch is a deliberate
400. Singular matches the reality; [`D-7`](../../Deferred.md) is where plural
comes from if it ever does.

### 2. The slug is set once, from the first real name, then frozen

Plan decision 6. Concretely: `PATCH /workspace` sets the slug **only** when the
existing slug still matches the bootstrap pattern `^personal-[0-9a-f]{8}$`.
After that, renaming leaves the slug alone.

Rationale beyond the plan's: the bootstrap pattern is a reliable marker of
"never named", which is the same signal FR-018 needs for the setup step. One
check serves both.

### 3. A display name is written to both stores, in one handler

Plan decision 8. `PATCH /me` calls `supabase.auth.updateUser({ data: { name,
full_name } })` **and** updates `public.users.name`. Both keys in the metadata,
because `bootstrap_workspace` reads `full_name` first and `name` second, and a
future bootstrap on another workspace should find the chosen name.

If the second write fails after the first succeeds, the handler reports the
failure rather than swallowing it — a name that landed in one store and not the
other is exactly the state this decision exists to prevent, and a silent
success would hide it until the next reload.

### 4. Validation is server-side and shared with nothing

Name: trimmed, 1–60 characters, must contain a non-whitespace character.
Rejected with `400` and a readable message, not a generic one. There is no
existing validation helper in this handler layer — every handler validates
inline (see `runtimes.ts`'s `name` check) — so follow that, do not introduce an
abstraction for two call sites.

---

## Files

| Path | Change |
|---|---|
| `apps/web/src/lib/api/handlers/workspace.ts` | **new** — `GET` and `PATCH /workspace` |
| `apps/web/src/lib/api/handlers/profile.ts` | **new** — `PATCH /me` |
| `apps/web/src/lib/api/handlers/index.ts` | edit — import both, **before** `./stubs` |
| `apps/web/src/lib/api/*.test.ts` | new or edit — router-level tests |
| `packages/ui/src/api/hooks.ts` | edit — three hooks and their types |

## Traps

**Register before `./stubs`.** The comment in `handlers/index.ts` is load-
bearing: stubs are registered last so wildcard patterns act as fallbacks.
Importing a new module after them means a stub can win — M2's defect 5 was
exactly this, a real handler shadowed by its own 501.

**Bodies arrive snake-cased.** The catch-all route runs every incoming body
through `parseBody` → `toSnake` before a handler sees it. Reading `body.name`
is fine; reading `body.displayName` is not — it arrives as `display_name`. This
made every well-formed relink a 400 in M4 until a real request was sent.

**RLS permits the update; it does not scope it.** `workspaces` carries a
member policy, but every query in this layer also filters on `workspaceId`
explicitly — "defence that costs one line is not worth omitting"
([`runtimes.ts:174`](../../../apps/web/src/lib/api/handlers/runtimes.ts:174)).
Follow it.

**A `PATCH` that affects zero rows must not report success.** M2 found this
across eleven handlers. `.select()` after the update and check the array.

## Verification

Full procedure in [T-M9-04 — verification](T-M9-04-verification.md).

The assertions that decide the phase:

1. A rename round-trips and survives a full page reload — both stores.
2. A cross-workspace rename is denied, and reports the denial rather than a
   silent 200.
3. The slug is set on the first rename and unchanged on the second.
4. M10 can be started: the three hooks exist and return typed data.
