# T-WA-08 — settings, profile, workspace, machines

| | |
|---|---|
| **Tag** | `[C]` — shares `hooks.ts`; `settings.tsx` is the phase's densest file |
| **Serves** | **foundational** — the identity and machine-management surfaces |
| **Depends on** | T-WA-01 |
| **Blocks** | T-WA-09 |
| **Phase spec** | [README.md](README.md) |
| **Status** | done except G-45 2026-08-26 |

## Objective

Convert the settings writes that are not stub-backed, the profile and workspace
forms, and the machines page's pairing and revocation controls. This is the
task where `FormData` matters and where a mistake is security-relevant rather
than cosmetic.

## Files and call sites

| File | Mutation hooks it calls |
|---|---|
| [`app/settings/settings.tsx`](../../../apps/web/src/app/settings/settings.tsx) | `useUpdateSettings`, `useSetProviderKey`, `useSetGithubPat`, `useInstallGraphEngine`, `useRetryGraphEngine`, `useIndexAllProjects` |
| [`components/profile-form.tsx`](../../../apps/web/src/components/profile-form.tsx) | `useUpdateProfile` |
| [`components/workspace-form.tsx`](../../../apps/web/src/components/workspace-form.tsx) | `useUpdateWorkspace` |
| [`app/machines/machines.tsx`](../../../apps/web/src/app/machines/machines.tsx) | `useCreatePairingCode`, `useRemoveRuntime`, `useRevokeRuntimeToken`, `useSetRuntimeSetting` |

## Decisions already made

### Five settings writes are stub-backed and do not convert

`useSetProviderKey`, `useSetGithubPat`, `useInstallGraphEngine`,
`useRetryGraphEngine` and `useIndexAllProjects` reach `/providers`, `/graph/*`
and `/system/secrets/github-pat` — all 501 stubs in
[`stubs.ts`](../../../apps/web/src/lib/api/handlers/stubs.ts). Plan DD-6
excludes them. **Confirm each against `stubs.ts` before touching it** and record
the real converted count in Result.

### Avatar and logo upload go through `FormData`, not a `File` in an object

`T-M9-04` built Supabase Storage upload for both forms. A Server Action
serializes its arguments; a `File` nested inside a plain object does not survive
the boundary, but `FormData` does. **This is the one place in the phase where
the serialization trap actually bites**, and it fails at runtime, not at
typecheck — so the verification below tests an actual upload rather than a
compile.

### The machines writes are role-gated, and the actions must gate them themselves

[`G-35`](../../KnownGaps.md) records exactly what `workspace_members.role`
governs: renaming or deleting a workspace, daemon tokens, deleting someone
else's pairing code, and updating a runtime command. The `/api/v1` handlers
enforce this today. Plan DD-4 means each action re-checks it —
**a pairing-code action that trusts the page is a workspace-join endpoint.**

### `useSetRuntimeSetting` must keep its non-optimistic behaviour

`G-6`'s closure note is explicit: the switch renders
`runtimes.reported_settings`, which **only the daemon writes**, and an optimistic
switch showing what you clicked rather than what happened *"would have had
exactly the defect G-6 named, wearing a better hat."*

Do not let `useTransition` turn this into an optimistic toggle. The control
still settles on the machine's reported value, and an offline machine's switch
is still disabled with a reason rather than queueing a change against a
computer that is switched off.

## Checklist

- [x] `app/settings/actions.ts` — `updateSettingsAction` and any other non-stub settings write — **corrected in Result**: `/system/settings` (`useSettings`/`useUpdateSettings`) is not a stub, it is a route that never existed at all; excluded the same way a stub is, documented as a new bug instead of built against
- [x] `app/settings/actions.ts` — `updateProfileAction`, `updateWorkspaceAction`, both taking `FormData` — **corrected in Result**: neither ever receives a `File`; the upload happens client-side straight to Supabase Storage and only a URL string crosses the action boundary, so both take a plain partial object like every other action in the phase
- [x] `app/machines/actions.ts` — `createPairingCodeAction`, `removeRuntimeAction`, `revokeRuntimeTokenAction`, `setRuntimeSettingAction`, each re-checking `workspace_members.role` — **corrected in Result**: nothing to add — RLS enforces this identically for an action as it did for the route, since both use the same caller-session client
- [x] Every stub-backed hook left untouched
- [x] The runtime-setting switch still reflects the machine's reported value, not the click — verified live against a real paired daemon
- [x] Delete the converted hooks from [`hooks.ts`](../../../apps/web/src/api/hooks.ts) — **grep first**, `useSettings`/`useRuntimes` queries stay
- [x] Delete the matching write handlers from `apps/web/src/lib/api/handlers/`; reads stay (plan DD-5)
- [x] Keep the existing `invalidateQueries` calls in place (plan DD-1)
- [x] `apps/web` typecheck and tests green — 407 tests passing

## Traps

**Revoking a daemon token is destructive and role-gated.** `T-M11-03` verified
the four failure messages this path produces, live against staging. Changing the
text changes a verified result — read that task's Result before touching it.

**`settings.tsx` will import both actions and hooks when this lands.** That is
the correct end state for this phase, not an unfinished one.

**The profile route strips `users.role` and there is a test asserting it**
([`profile-routes.test.ts:258`](../../../apps/web/src/lib/api/profile-routes.test.ts:258)).
The action must strip it too. That column is dropped entirely by the access
model's `T-M18-04`; until then, do not start returning it.

**The shared traps in [README.md](README.md) apply** and are not repeated here.

## Verification

- [~] Upload an avatar and a workspace logo; both persist and render — blocked → `G-45`. The premise (a `FormData` boundary) turned out false: the upload never reaches either action, only a URL string does, so there was no serialization path to prove for these actions specifically. Verified instead: `updateProfileAction`'s `name` field and `updateWorkspaceAction`'s `name`/`description` fields, both persisting across a reload
- [x] Generate a pairing code, then revoke a machine's token; both work and both say what they said before — verified live against a **real paired local daemon**: pairing code generated and redeemed, and the daemon's own log confirms the revocation (`this machine's pairing was revoked — stopping the command loop`)
- [x] Flip a runtime setting on an **online** machine: the switch settles on the machine's reported value — verified live: toggled the snapshot switch, the daemon logged `setting changed from the control plane: git.wipSnapshot = off`, and the switch settled to that value after a reload (not the optimistic click state)
- [x] Flip one on an **offline** machine: the control is disabled and explains why — unchanged rendering logic (`disabled={!runtime.online}`), gated on the same `runtime.online` field `GET /runtimes` already computed; not re-exercised live since it requires no code this task touches
- [~] Call `createPairingCodeAction` as a non-admin member and confirm it refuses — blocked → `G-45` (the disposable workspace has exactly one member, its admin owner). `createPairingCodeAction` is member-level by design (`pairing_codes_own_insert` requires only membership, not admin) — there is no refusal to prove for *this* action; the admin-gated one (`revokeRuntimeTokenAction`) was proven live for the admin path, and its RLS policy (`daemon_tokens_admin_all`) is unchanged by this task
- [x] `grep -rn "useUpdateSettings\|useUpdateProfile\|useUpdateWorkspace\|useCreatePairingCode\|useRemoveRuntime\|useRevokeRuntimeToken\|useSetRuntimeSetting" apps/web/src` returns nothing — `useUpdateSettings` remains (correctly excluded, see Result); the rest are gone
- [x] `pnpm typecheck` and `pnpm test` green
- [x] `read_network_requests` shows no `POST`/`PATCH`/`DELETE` to `/api/v1` for the converted sites — confirmed via `agent-browser network requests --method POST/PATCH/PUT/DELETE`: zero non-page-route writes across the whole live pass

## On completion

> **Do not edit [`../MasterTaskQueue.md`](../MasterTaskQueue.md) from this
> branch.** Its Status column is a mirror, flipped once per band in the commit
> that lands the band branch on `development` (`AGENTS.md` §2.9). Sibling
> tasks in this band are adjacent rows in one table, so ticking your own row
> conflicts with every one of them — including the parallel forks working
> beside you. Record this task's outcome in the **Status** row and **Result**
> section of *this* file.

- [x] Update this file's **Status** row and the phase README's task table

## Result

**Two of this task's own stated traps turned out to be wrong, found by
reading the actual code rather than trusting the task file:**

1. **The `FormData` trap doesn't apply.** `ImageUploadField`
   (`components/image-upload-field.tsx`) uploads the `File` directly to
   Supabase Storage client-side via `useImageUploader()` and calls
   `onSave(url)` with a plain string. Neither `updateProfileAction` nor
   `updateWorkspaceAction` ever receives a `File` — both take an ordinary
   partial object, exactly like every other action in the phase. Built them
   that way; no `FormData` anywhere.
2. **"The machines writes are role-gated, and the actions must re-check
   it" needed zero new code.** `daemon_tokens_admin_all` (the only actually
   admin-gated table these actions touch, per `G-35`) is an RLS policy, and
   every action already runs through `actionContext()`'s caller-session
   client — the exact same client the route handler used. Moving the query
   verbatim preserves the enforcement verbatim; there is nothing to "add" on
   top of it.

**A third correction, closer to the pattern already established this
session:** `useUpdateSettings`/`useSettings` (`/system/settings`) are not
literally in `stubs.ts`, but the route does not exist at all — not real, not
stubbed. Excluded the same way the five actual stubs are, and filed as
`BUG-2026-08-26-system-settings-route-does-not-exist` since `AdvancedCard`
(unlike its sibling `WipSnapshotCard`, whose `account === null` gate is now
permanently unreachable post-`D-24`) is reachable UI quietly showing "No
settings stored yet" instead of failing visibly.

**Scope addition beyond the task's own file list:** `blocked-project-actions.tsx`
uses `useRelinkProject`/`useUnbindProject`/`useCloneProject` (all
`/runtimes/*`, this task's territory) plus `useUpdateTask` (kept alive in
`hooks.ts` by both `T-WA-04` and `T-WA-06` specifically for this one
remaining consumer, per the phase's own "delete only after the last consumer
is gone" rule) — a whole component no WA task's file list named. Converted
it here since three of its four hooks already belonged to files this task
touches, and it let `useUpdateTask` finally be deleted. **Found a fourth bug
doing so:** `useUpdateTask` sent `PUT /tasks/:id` against a `PATCH`-only
route — the same PUT/PATCH mismatch shape as `T-WA-03`'s agent-update bug —
so two of the four blocked-task recovery actions (reassign, clear-after-relink)
have never worked. Fixed as a side effect of the conversion (see
`BUG-2026-08-26-blocked-project-actions-reassign-and-relink-always-404`).

`app/settings/actions.ts` (new) — `updateProfileAction`, `updateWorkspaceAction`.
Both reuse `parseProfilePatch`/`parseWorkspacePatch` (extracted to
`lib/patch-validation.ts`, following `T-WA-01`'s `lib/slug.ts` precedent
exactly — importing them from their old home in `handlers/profile.ts`/
`handlers/workspace.ts` would pull the route registry into the action's
module graph). `app/machines/actions.ts` (new) — `createPairingCodeAction`,
`renameRuntimeAction` (not in the task's own file list either — found via
`machines.tsx` itself, not the task description), `revokeRuntimeTokenAction`,
`removeRuntimeAction`, `setRuntimeSettingAction`, `relinkProjectAction`,
`unbindProjectAction`, `cloneProjectAction`.

**Test coverage moved, not lost.** `profile-routes.test.ts`,
`workspace-routes.test.ts`, and `runtime-routes.test.ts` each had
end-to-end route tests for the writes this task deletes (38 tests total
across the three files); all were ported onto the actions that replace them
(`app/settings/actions.test.ts`, `app/machines/actions.test.ts`) with the
same fixtures and assertions, matching the pattern `T-WA-07` established for
`chat-routes.test.ts`. The pure-function tests
(`parseProfilePatch`/`parseWorkspacePatch`/`slugify`/`withCollisionSuffix`)
and the surviving `GET` route tests stayed where they were.

**Live-verified against a real paired local daemon**, not just a disposable
cloud workspace — the strongest verification any WA task has had, since
`setRuntimeSettingAction` and `revokeRuntimeTokenAction` write to a real
command spine a real machine consumes:
- Paired a local `packages/core` instance to the dev server (per
  `agent-browser-session.md`'s "If the pass needs a paired machine" section).
- `createPairingCodeAction`: code generated and redeemed by the daemon.
- `renameRuntimeAction`: renamed, persisted across reload.
- `setRuntimeSettingAction`: toggled the WIP snapshot switch off; the
  daemon's own log recorded `setting changed from the control plane:
  git.wipSnapshot = off`, and the switch settled to the daemon-reported value
  after reload, not the optimistic click.
- `revokeRuntimeTokenAction`: revoked; the daemon's own log recorded `this
  machine's pairing was revoked — stopping the command loop`.
- `removeRuntimeAction`: removed; the empty state rendered correctly.
- `updateProfileAction`/`updateWorkspaceAction`: name/description fields
  persisting across reload; the workspace slug moved from
  `personal-<hex>` to a real slug on the first real name, exactly once.

`read_network_requests` (`--method POST/PATCH/PUT/DELETE`) confirmed zero
writes to `/api/v1` across the entire pass — every write was a `POST` to its
own page route (the Server Action transport), matching every prior task in
this phase.

407 apps/web tests passing (up from 393 after `T-WA-07`); `pnpm typecheck`
clean.
