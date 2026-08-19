# M9 — Workspace and profile identity

| | |
|---|---|
| **Plan** | [`../../plans/2026-08-16-setup-and-machines.md`](../../plans/2026-08-16-setup-and-machines.md) (M9) |
| **Kind** | **foundational** — a migration, endpoints, a bucket, hooks. Demos to nobody. |
| **Spec** | [`../../specs/2026-08-16-setup-and-machines.md`](../../specs/2026-08-16-setup-and-machines.md) |
| **Depends on** | — |
| **Blocks** | **M10.** Without these, US2's first two steps have nothing to fill in and no way to fill it. |
| **Status** | 🟢 **01–05 done; SQL applied to staging 2026-08-18.** 04's component and 06's HTTP-level checks remain |
| **Open questions** | none |

## Objective

Make the profile and the workspace into things an owner actually fills in.

Three columns, a `bootstrap_workspace` that stops inventing names, two handlers
carrying four fields each, a storage bucket, and their hooks. Nothing here
renders — M10 builds the forms. This phase exists because those forms need
something to call, and because **spec decision 6's rule only works if the
database stops filling these fields in on its own**.

Serves FR-017 through FR-022, and SC-008.

## The shape of what was found

**The database invents two names, and that is the thing to remove.**
`bootstrap_workspace` writes `split_part(email, '@', 1)` into `users.name` —
which is where `sriharicoder` comes from — and the literal `'Personal Workspace'`
into `workspaces.name`
([`004_bootstrap_rpc.sql:66-98`](../../../packages/shared/drizzle/policies/004_bootstrap_rpc.sql:66)).
Spec decision 6 deletes both. Every other task in this phase and the next
depends on that having happened, which is why `T-M9-01` is `[S]` and first.

**There is no workspace endpoint at all.** `/api/v1` has 16 handler modules and
not one of them touches the `workspaces` table
([`handlers/index.ts`](../../../apps/web/src/lib/api/handlers/index.ts)). The
workspace id is *resolved* per request by
[`getActiveWorkspaceId`](../../../apps/web/src/lib/workspace.ts) and used as a
filter; the row itself is never read back or written.

**Two of the six fields have no column.** `users` has `name` and `avatar_url`
but no `bio`; `workspaces` has `name`, `slug` and `description` but no
`context` and no `logo_url`. Confirmed in
[`schema.ts`](../../../packages/shared/src/db/schema.ts).

**Both name columns are `text().notNull()` with no default** — which is why
"unset" is `''` and not `NULL` (plan decision 6), and why removing the
fallbacks is a migration rather than an edit to one function.

**`workspaces.slug` is referenced by no application code.** Verified by search
across `apps/web/src`, `packages/core/src` and `packages/ui/src`. It is written
once at bootstrap and never read. That is what makes plan decision 8 —
derive once, show it, freeze it — safe.

**This codebase has never used Supabase Storage.** No bucket, no policy, no
upload helper, no size guard. Avatar and logo are genuinely new infrastructure,
which is why they are isolated in `T-M9-04` and why that task is the one
designed to be cuttable.

**There are two display-name stores and they already disagree by design.**
`account.name` and `account.avatarUrl` come from the **auth session's**
metadata
([`account-snapshot.ts:37-44`](../../../apps/web/src/lib/auth/account-snapshot.ts:37)),
server-rendered into the shell deliberately to prevent a hydration mismatch.
`public.users` is written once at bootstrap. Writing one and reading the other
is a change that appears to work and reverts on the next full page load.

**The sidebar has never shown the workspace name.** `WorkspaceSwitcher` prints
the literal `"Sparstrowgen"`
([`workspace-switcher.tsx:50`](../../../packages/ui/src/components/layout/workspace-switcher.tsx:50)).
The consumer lands in M10; the query it needs is built here.

## Tasks

Run order and concurrency live in [`../MasterTaskQueue.md`](../MasterTaskQueue.md).

| Task | Tag | Serves | Depends on | Status |
|---|---|---|---|---|
| [T-M9-01 — schema, and a bootstrap that invents nothing](T-M9-01-schema-and-bootstrap.md) | `[S]` | foundational → M10 | — | ✅ done — applied + verified on staging |
| [T-M9-02 — workspace read + update](T-M9-02-workspace-handler.md) | `[P]` | foundational → M10 | 01 | ✅ done (2026-08-18) |
| [T-M9-03 — profile read + update](T-M9-03-profile-handler.md) | `[P]` | foundational → M10 | 01 | ✅ done (2026-08-18) |
| [T-M9-04 — avatar and logo upload](T-M9-04-image-upload.md) | `[P]` | foundational → M10 | 01 | 🟡 SQL applied + hardened; component held for the design system |
| [T-M9-05 — hooks](T-M9-05-hooks.md) | `[C]` | foundational → M10 | 02, 03 | ✅ done (2026-08-18) |
| [T-M9-06 — verification](T-M9-06-verification.md) | `[S]` | foundational → M10 | 01–05 | not started |

01 is `[S]` and blocks everything: the columns and the bootstrap change are what
02–05 are written against. 02, 03 and 04 are `[P]` — three disjoint pieces of
new work, hand to three workers. 05 is `[C]` because `packages/ui/src/api/hooks.ts`
is a ~2100-line shared file other phases also edit.

**04 is cuttable on its own** (plan decision 7a). Neither image gates a setup
step, and without it both forms still work with the initials badge the shell
already renders. If it is cut, 02 and 03 accept only `null` for their URL
fields and M10 omits two controls — nothing else changes.

## Definition of done

**This phase unblocks M10**, which is the only reason it exists. Concretely:

- A brand-new account has `users.name = ''` and `workspaces.name = ''` —
  **read from the database**, not the screen. That is SC-008.
- The names bootstrap already invented on existing accounts are cleared, once,
  narrowly.
- `GET`/`PATCH /api/v1/workspace` carries name, description, context and logo;
  returns the slug and never accepts it; sets the slug once and freezes it.
- `GET`/`PATCH /api/v1/me` carries name, bio and avatar; writes the name and
  avatar to **both** stores and bio to one.
- Both handlers accept **partial** bodies and both accept an **empty name**.
- An image uploads, renders, and cannot be written by anyone but its owner —
  or `T-M9-04` is cut, with a `Deferred.md` entry saying so.
- Four hooks exported from `packages/ui/src/api/hooks.ts`.
- Everything proved the way M2 proved its handlers: a real session, real
  requests, a second account for the denials.
- `pnpm typecheck` and `pnpm test` green.

**Not in this phase:** any rendered surface. The two forms, the guide and the
sidebar change are M10. Also not here: email or password change, workspace
deletion, invites, a workspace picker, or feeding `bio`/`context` into an
agent's prompt — see the plan's Scope boundaries.

---

## Decisions already made

Plan decisions 6, 7, 7a, 8 and 9 are inherited; cite them rather than restating.

### 1. `/workspace` and `/me` are singular and take no id

The caller has exactly one active workspace and is exactly one user, both
resolved server-side before a handler runs. A `/workspaces/:id` shape would
invite passing an id the server then has to re-authorize, for a product with no
picker and whose multiple-workspace branch is a deliberate 400. Singular
matches the reality; [`D-7`](../../Deferred.md) is where plural comes from if it
ever does.

### 2. Both handlers take partial bodies, and both accept an empty name

A form that saves one field sends one field. And since `T-M9-01` makes `''` the
starting state, the API must be able to write it — an API that refuses the value
its own database holds is incoherent, and "clear this and think about it later"
is a legitimate thing to do.

**Empty is not "invalid"; it is "not done yet".** That reading belongs to
`setupSteps()` in M10, not to the handler.

### 3. Validation is server-side, inline, and shared with nothing

Name 60, description 280, bio 2000, context 4000. Rejected with `400` and a
message naming the actual limit, not a generic one.

There is no validation helper in this handler layer — every handler validates
inline (see `runtimes.ts`'s `name` check) — so follow that. Do not introduce an
abstraction for six fields across two files.

**Length is capped in the handler, not by a column constraint.** A check
constraint would fail with a SQLSTATE the API would have to translate into a
readable message anyway.

### 4. A URL field accepts only a URL this app produced

`avatar_url` and `logo_url` are rendered in an `<img>` for every member of a
workspace. An arbitrary URL there is a tracking pixel at minimum. Both handlers
validate that the value is `null` or under this project's own Supabase storage
origin — **and that check exists even if `T-M9-04` is cut**, in which case only
`null` is accepted.

---

## Files

| Path | Change |
|---|---|
| `packages/shared/src/db/schema.ts` | edit — `users.bio`, `workspaces.logoUrl`, `workspaces.context` |
| `packages/shared/drizzle/00XX_*.sql` | **new** — generated by `drizzle-kit` |
| `packages/shared/drizzle/policies/012_no_invented_names.sql` | **new** — replaced `bootstrap_workspace` + one-time cleanup |
| `packages/shared/drizzle/policies/013_storage_images.sql` | **new** — bucket write policies (skip if 04 is cut) |
| `apps/web/src/lib/api/handlers/workspace.ts` | **new** |
| `apps/web/src/lib/api/handlers/profile.ts` | **new** |
| `apps/web/src/lib/api/handlers/index.ts` | edit — import both, **before** `./stubs` |
| `apps/web/src/lib/api/*.test.ts` | new or edit — router-level tests |
| `packages/ui/src/components/image-upload-field.tsx` | **new** (skip if 04 is cut) |
| `packages/ui/src/api/hooks.ts` | edit — four hooks and two interfaces |

## Traps

**Register before `./stubs`.** The comment in `handlers/index.ts` is
load-bearing: stubs are registered last so wildcard patterns act as fallbacks.
Importing a new module after them means a stub can win — M2's defect 5 was
exactly this, a real handler shadowed by its own 501.

**Bodies arrive snake-cased.** `parseBody` → `toSnake` runs before a handler
sees the body, so the browser's `logoUrl` arrives as `logo_url`. Reading the
camelCase name makes every well-formed request a 400 — M4 lost time to this.

**`bootstrap_workspace` runs on every user's first authenticated request.** A
syntax error or a dropped grant in `T-M9-01` 500s every endpoint for every new
account, which is precisely what M2's defect 1 was. Test it by signing up a
throwaway account, not by reading the SQL.

**RLS permits these updates; it does not scope them.** Every query in this layer
also filters explicitly — "defence that costs one line is not worth omitting"
([`runtimes.ts:174`](../../../apps/web/src/lib/api/handlers/runtimes.ts:174)).
Follow it.

**A `PATCH` that affects zero rows must not report success.** M2 found this
across eleven handlers. `.select()` after the update and check the array.

**`name: ""` is a normal value, not a missing one.** Anything that treats it as
missing and substitutes a default re-creates the exact problem this phase
exists to remove.

## Verification

Full procedure in [T-M9-06 — verification](T-M9-06-verification.md).

The assertions that decide the phase:

1. **A fresh account holds no name in either table** — read from the database.
   This is SC-008 and it is the phase's headline.
2. An edit round-trips, survives a reload, and lands in both stores where it
   should.
3. The slug is set on the first name and unchanged on the second.
4. A second account can neither read, write, nor upload into the first's
   workspace or profile.
5. M10 can be started: four hooks exist and return typed data.
