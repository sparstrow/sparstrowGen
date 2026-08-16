# T-M10-02 — The two setup forms

| | |
|---|---|
| **Tag** | `[P]` — two new component files; the only shared edit is `settings.tsx`, which M8 also touches |
| **Serves** | `US2` — the profile and workspace steps have real actions, completable in place |
| **Depends on** | M9 (all six tasks; the image controls specifically need `T-M9-04`) |
| **Blocks** | T-M10-03 |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

## The scenarios this satisfies

> 7. **Given** I reach the profile step, **When** I read it, **Then** I can set
>    my avatar, my name, and a few lines about me **right there** — and
>    supplying my name is what marks the step done. The other two are offered,
>    never demanded.
> 8. **Given** I reach the workspace step, **When** I read it, **Then** I can
>    give my workspace a logo, a name, a description, and the background an
>    agent should know about it — and supplying the name is what marks the step
>    done.
> 9. **Given** a brand-new account, **When** I look at either step before
>    touching it, **Then** it is empty and says so. Nothing has been guessed on
>    my behalf.

"Right there" is the load-bearing phrase: the guide must not bounce someone to
Settings to finish a step.

## Objective

Two self-contained forms, each owning its fields, its save action and all four
states. The guide embeds them inside its steps; Settings renders the same
components as their permanent home (FR-021).

## Decisions already made

### Two components, each rendered in two places

| Component | Fields | Rendered in |
|---|---|---|
| `ProfileForm` | avatar, name, about you | the guide's profile step, **and** Settings → Account → Profile |
| `WorkspaceForm` | logo, name, description, context, slug *(read-only)* | the guide's workspace step, **and** Settings → Workspace → General |

FR-021: the guide is where these are first filled in, not the only place they
exist. **Rejected:** guide-only forms, which would make a name unchangeable
after setup; and Settings-only forms with the guide linking out, which breaks
"right there".

### `variant`, not two copies

```tsx
<WorkspaceForm variant="card" />   // Settings — with Card chrome
<WorkspaceForm variant="inline" /> // inside a guide step — no chrome
```

Two components with the same logic is the duplication that drifts — spec
decision 4 rejected exactly that for the Machines card. One component, one prop.

### Settings → Account → Profile becomes a form

[`ProfileCard`](../../../packages/ui/src/routes/pages/settings.tsx:588) is four
read-only `InfoRow`s and a sign-out button today. Name becomes editable, and
avatar and about-you are added. **Email, provider, user id and the sign-out
button all stay** — they are useful and none of them is editable here (email
change is out of scope; see the plan's Scope boundaries).

Its `account === null` branch — the local desktop build — is untouched. That
host has no account to edit.

### Field rules

| Field | Control | Limit | Required? |
|---|---|---|---|
| avatar / logo | `<ImageUploadField>` from `T-M9-04` | 2 MB, png/jpeg/webp | no |
| name | single-line input | 60 | **yes, to complete the step** |
| about you | textarea, ~4 rows | 2000, with a counter | no |
| description | single-line or 2-row textarea | 280 | no |
| context | textarea, ~6 rows | 4000, with a counter | no |
| slug | **read-only**, monospace | — | n/a |

**Only the name gates the step** (FR-020). Nothing here refuses to save because
another field is empty, and no field is marked with a required asterisk except
the name.

**The slug is displayed, never edited** (FR-022, plan decision 8). Monospace,
visibly non-interactive, with one line saying it is set from the name the first
time and does not change afterwards.

**Counters appear near the limit, not always.** A counter on every field is
noise; a counter at ~80% of the limit is a warning. `2000` and `4000` are large
enough that most people never see one.

### Placeholders teach, and never pre-fill

Empty fields show **placeholder** text, which is not a value and is not saved:

- about you — *"e.g. Backend engineer (Go + Postgres). Prefer terse PRs and
  tests alongside the change."*
- context — *"Background information and context for AI agents working in this
  workspace."*
- description — *"What does this workspace focus on?"*

Scenario 9 requires the fields be genuinely empty. A `defaultValue` derived from
anything — the email, the hostname, a guess — reintroduces exactly what M9
removed. Placeholder attribute only.

Both forms should say, once, that about-you and context are **read by agents
working on your behalf**. That is why anyone would bother filling them in.

### Save behaviour

- **Per-field save**, sending a partial `PATCH` — the handlers accept one key
  (M9 decision 2). Saving a bio must not touch the name.
- Trim on save. An empty name is allowed to save (M9 decision 2); the step
  simply reverts to not-done. Do **not** block it in the UI.
- Enter saves a single-line field; Escape reverts it. Textareas take Enter as a
  newline and save on blur or an explicit button — do not trap Enter in a
  multi-line field.
- On error: the mutation's real message under the field, and **the typed value
  retained**. Never cleared.
- On success: the saved value stays, with a brief confirmation. Do **not**
  navigate and do **not** auto-advance the guide — the step's state changes on
  its own when the query invalidates, which is the point.

### The four states, per form

| | |
|---|---|
| **Populated** | current values in the fields; save disabled until something changes |
| **Empty** | the expected state for a fresh account — placeholders, and the step reads as not-done. Not an error, not a warning |
| **Loading** | skeletons the height of each field, so a guide step does not reflow |
| **Error** | the real message under the affected field, value retained |

### If `T-M9-04` was cut

Omit the two upload controls entirely. Do **not** render a disabled control or
a "coming soon" affordance — AGENTS.md §3.2's rule against documenting what is
not built applies to UI just as much. Everything else in both forms works.

## Checklist

- [ ] `packages/ui/src/components/profile-form.tsx` created, using
      `useProfile` and `useUpdateProfile`
- [ ] `packages/ui/src/components/workspace-form.tsx` created, using
      `useWorkspace` and `useUpdateWorkspace`
- [ ] Both support `variant="card" | "inline"`
- [ ] Per-field partial saves — saving one field does not send the others
- [ ] Placeholders only; **no field pre-filled from anything derived**
- [ ] Slug rendered read-only and monospace, with its one-line explanation
- [ ] Counters near the limit on the two long fields
- [ ] Empty name saves without a UI block
- [ ] All four states per the table, error retaining the typed value
- [ ] Enter/Escape on single-line fields; Enter **not** trapped in textareas
- [ ] `<ImageUploadField>` wired for avatar and logo — or omitted entirely if
      `T-M9-04` was cut
- [ ] `WorkspaceForm variant="card"` in Settings → Workspace → General
- [ ] `ProfileCard` replaced by `ProfileForm variant="card"` in Settings →
      Account → Profile, **keeping** email, provider, user id and sign-out, and
      **keeping** the `account === null` local-build branch untouched
- [ ] Shadcn workflow followed before writing either form — `DESIGN.md`, then
      the `shadcn` MCP for input / textarea / form primitives (AGENTS.md §3.11)
- [ ] `pnpm --filter @sparstrow/ui typecheck`, `pnpm typecheck`, `pnpm test`
      green

## Traps

**A `defaultValue` is not a placeholder.** Pre-filling "about you" with
anything generated, or the name with the email local part, puts back exactly
what M9's migration removed — and it would then get *saved* on the first
unrelated edit, silently marking the step done.

**Sending the whole object on every save blanks fields.** The handlers write
every key present in the body. A form that always sends `{name, bio, avatarUrl}`
will write an empty bio the moment someone edits only their name in a stale tab.
Send what changed.

**The profile name will not update the shell unless `USER_UPDATED` fires.**
`supabase.auth.updateUser` emits it and `WebAccountProvider` listens
([`account-provider.tsx:35`](../../../apps/web/src/components/auth/account-provider.tsx:35)),
so the sidebar changes without a reload — but only in the tab that saved.
Verify visually; do not assume it from a 200.

**Do not invalidate a react-query key expecting the shell to update.** The
account is not in react-query (M9 decision). That invalidation would look like
it was doing the work and would not be.

**Clearing the field on error loses the user's typing.** The most common form
bug, and the one that makes someone retype a name they already got right.

**`variant="inline"` must not render a `<Card>`.** Nesting a card inside a guide
step produces a double border and a box that looks like it belongs to something
else. Check both variants visually, not only the one you built first.

**`settings.tsx` is also edited by M8**, which removes the Machines card from
Workspace → General. Coordinate; do not resolve a conflict by restoring it.

## Verification

- [ ] `pnpm typecheck` and `pnpm test` green
- [ ] Both variants of both forms render, all four states, and per-field saves
      round-trip — proved in [T-M10-05](T-M10-05-verification.md)
- [ ] Settings → Workspace → General renders correctly with the workspace form
      **added** and M8's Machines card **removed**
- [ ] Settings → Account → Profile still shows email, provider, user id and
      sign-out alongside the new editable fields
- [ ] The local desktop build's Settings → Account → Profile is unchanged

## On completion

- [ ] Tick 12.2 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
- [ ] Update this file's **Status** row and the phase README's task table

## Result

<!-- Filled in when the task lands. -->
