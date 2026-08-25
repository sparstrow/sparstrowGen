# T-WA-08 — settings, profile, workspace, machines

| | |
|---|---|
| **Tag** | `[C]` — shares `hooks.ts`; `settings.tsx` is the phase's densest file |
| **Serves** | **foundational** — the identity and machine-management surfaces |
| **Depends on** | T-WA-01 |
| **Blocks** | T-WA-09 |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

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

- [ ] `app/settings/actions.ts` — `updateSettingsAction` and any other non-stub settings write
- [ ] `app/settings/actions.ts` — `updateProfileAction`, `updateWorkspaceAction`, both taking `FormData`
- [ ] `app/machines/actions.ts` — `createPairingCodeAction`, `removeRuntimeAction`, `revokeRuntimeTokenAction`, `setRuntimeSettingAction`, each re-checking `workspace_members.role`
- [ ] Every stub-backed hook left untouched
- [ ] The runtime-setting switch still reflects the machine's reported value, not the click
- [ ] Delete the converted hooks from [`hooks.ts`](../../../apps/web/src/api/hooks.ts) — **grep first**, `useSettings`/`useRuntimes` queries stay
- [ ] Delete the matching write handlers from `apps/web/src/lib/api/handlers/`; reads stay (plan DD-5)
- [ ] Keep the existing `invalidateQueries` calls in place (plan DD-1)
- [ ] `apps/web` typecheck and tests green

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

- [ ] Upload an avatar and a workspace logo; both persist and render — the `FormData` path **proved by running it**, not assumed from a green typecheck
- [ ] Generate a pairing code, then revoke a machine's token; both work and both say what they said before
- [ ] Flip a runtime setting on an **online** machine: the switch settles on the machine's reported value
- [ ] Flip one on an **offline** machine: the control is disabled and explains why
- [ ] Call `createPairingCodeAction` as a non-admin member and confirm it refuses
- [ ] `grep -rn "useUpdateSettings\|useUpdateProfile\|useUpdateWorkspace\|useCreatePairingCode\|useRemoveRuntime\|useRevokeRuntimeToken\|useSetRuntimeSetting" apps/web/src` returns nothing
- [ ] `pnpm typecheck` and `pnpm test` green
- [ ] `read_network_requests` shows no `POST`/`PATCH`/`DELETE` to `/api/v1` for the converted sites

## On completion

> **Do not edit [`../MasterTaskQueue.md`](../MasterTaskQueue.md) from this
> branch.** Its Status column is a mirror, flipped at integration on
> `development` by whoever hands out the next wave (`AGENTS.md` §2.8).
> Sibling tasks in this band are adjacent rows in one table, so ticking your
> own row conflicts with every one of them. Record this task's outcome in the
> **Status** row and **Result** section of *this* file.

- [ ] Update this file's **Status** row and the phase README's task table

## Result

*Filled in when the task lands.*
