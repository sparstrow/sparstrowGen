# T-M10-02 — The naming controls

| | |
|---|---|
| **Tag** | `[P]` — two new component files; the only shared edit is one card added to `settings.tsx` |
| **Serves** | `US2` — the workspace and profile steps have a real action, completable in place |
| **Depends on** | M9 (all four tasks) |
| **Blocks** | T-M10-03 |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

## The scenario this satisfies

> 7. **Given** I reach the workspace step, **When** I read it, **Then** I can
>    give my workspace a real name **in place**, and doing so is what marks the
>    step done — the default `"Personal Workspace"` name does not count as
>    complete.

Spec decision 5 and plan decision 7. "In place" is the load-bearing phrase: the
guide must not bounce someone to Settings to finish a step.

## Objective

Two small, self-contained cards — `WorkspaceNameCard` and `ProfileNameCard` —
that each own one text field, one save action, and all four states. The guide
embeds them inside its steps; Settings → Workspace → General also renders the
workspace one, so the control exists where someone would look for it later.

## Decisions already made

### Two components, each rendered in two places

| Component | Rendered in |
|---|---|
| `WorkspaceNameCard` | the guide's workspace step, **and** Settings → Workspace → General |
| `ProfileNameCard` | the guide's profile step only |

The workspace name is a durable setting someone will want to change again in a
year; Settings is where they will look. A display name is arguably the same, but
Settings → Account → Profile is a read-only `InfoRow` card today
([`settings.tsx:588`](../../../packages/ui/src/routes/pages/settings.tsx:588))
and converting it into an editable form is a larger change than this phase
needs. **Recorded so it is a decision rather than an omission:** the profile
name is editable in the guide, and the guide stays reachable at `/setup`
forever — it does not disappear when complete, only its dashboard card does.

### Both take a `variant` prop, not two copies

```tsx
<WorkspaceNameCard variant="card" />   // Settings — with Card chrome
<WorkspaceNameCard variant="inline" /> // inside a guide step — no chrome
```

Two components with the same logic is the duplication that drifts — spec
decision 4 rejected exactly that for the Machines card. One component, one prop.

### The four states, per control

| | |
|---|---|
| **Populated** | the current name in the field, save disabled until it changes |
| **Empty** | n/a — a workspace always has a name; the *default* name is the interesting case and renders with a hint that it was generated |
| **Loading** | skeleton the height of the field, so the guide step does not reflow |
| **Error** | the mutation's real message under the field, and the typed value **retained** — never cleared on failure |

### Save behaviour

- Trim on save. Refuse an empty or whitespace-only value in the UI **as well
  as** on the server (M9 validates too; a client check just avoids a round trip
  for an obvious mistake).
- 60-character limit, enforced with `maxLength` **and** shown as a counter once
  past ~50 — a silently truncating field is worse than a visible limit.
- Enter saves; Escape reverts to the current value. Same interaction as the
  machine rename in `machines.tsx`, so the two feel like one product.
- On success the field shows the saved value and a brief confirmation. Do
  **not** navigate, and do **not** auto-advance the guide — the step's state
  changes on its own when the query invalidates, which is the point.

### The default-name hint

When the workspace slug still matches the bootstrap pattern, the card says so
in one line — something to the effect of *"this name was generated for you"* —
so scenario 7's "the default doesn't count as complete" is explained rather
than merely enforced. The implementer owns the wording; the claim is fixed.

## Checklist

- [ ] `packages/ui/src/components/workspace-name-card.tsx` created, using
      `useWorkspace` and `useRenameWorkspace`
- [ ] `packages/ui/src/components/profile-name-card.tsx` created, using
      `useAccount` for the current value and `useUpdateProfile` to save
- [ ] Both support `variant="card" | "inline"`
- [ ] All four states per the table, including the error state retaining the
      typed value
- [ ] Enter saves, Escape reverts, save disabled while unchanged or pending
- [ ] `maxLength` 60 and a counter past 50
- [ ] The generated-name hint on the workspace card
- [ ] `WorkspaceNameCard variant="card"` added to Settings → Workspace →
      General, above Factory Health
- [ ] Shadcn workflow followed before writing either component — `DESIGN.md`,
      then the `shadcn` MCP for the input/form primitives (AGENTS.md §3.11)
- [ ] `pnpm --filter @sparstrow/ui typecheck`, `pnpm typecheck`, `pnpm test`
      green

## Traps

**The profile name will not update the shell unless `USER_UPDATED` fires.**
`supabase.auth.updateUser` emits it and `WebAccountProvider` listens
([`account-provider.tsx:35`](../../../apps/web/src/components/auth/account-provider.tsx:35)),
so the sidebar changes without a reload — but only in the tab that saved.
Verify it visually; do not assume it because the request returned 200.

**Do not invalidate a react-query key for the profile.** The account is not in
react-query (M9 decision). An invalidation there would look like it was doing
the work and would not be.

**Clearing the field on error loses the user's typing.** It is the single most
common form bug and it is the one that makes someone retype a name they already
got right.

**`variant="inline"` must not render a `<Card>`.** Nesting a card inside a
guide step produces a double border and a box that looks like it belongs to
something else. Check both variants visually, not just the one you built first.

**Do not touch `ProfileCard` in Settings.** It stays read-only this phase — see
the decision above. Editing it is a bigger change and is not what any scenario
asks for.

## Verification

- [ ] `pnpm typecheck` and `pnpm test` green
- [ ] Both variants render, all four states, and the save round-trip is proved
      in [T-M10-05](T-M10-05-verification.md)
- [ ] The Settings placement is confirmed there too — including that
      Workspace → General still renders correctly with a card added *and* the
      Machines card removed by M8

## On completion

- [ ] Tick 12.2 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
- [ ] Update this file's **Status** row and the phase README's task table

## Result

<!-- Filled in when the task lands. -->
