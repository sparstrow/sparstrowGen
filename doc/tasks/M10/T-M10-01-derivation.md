# T-M10-01 — `setupSteps()`, the derivation

| | |
|---|---|
| **Tag** | `[S]` — every other task in M10 renders what this decides |
| **Serves** | `US2` — the guide reflects real state, never a stored tick |
| **Depends on** | — (types only; it does not call the hooks) |
| **Blocks** | T-M10-03, T-M10-04 |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

## The scenarios this satisfies

> 2. **Given** I am partway through setup, **When** I return later, **Then** the
>    guide shows completed steps as done and points me at the next one.
> 3. **Given** I complete a step elsewhere in the app … **Then** that step reads
>    as done. It reflects real state, never a separate checkbox I have to tick.
> 4. **Given** I am fully set up, **When** I look, **Then** the guide is not in
>    my way.
> 5. **Given** a step cannot be completed yet, **When** I reach it, **Then** it
>    says so and why.
> 9. **Given** an account that existed before this guide shipped … **Then** the
>    guide reflects what I have actually already done.

Scenario 9 needs no code: because nothing is stored, an old account is just an
account whose workspace was never named. The tests must **prove** that rather
than assume it.

## Objective

One pure function in `packages/ui/src/lib/setup.ts` that turns the account, the
workspace and the machine list into three steps with a state each. It calls no
hooks, does no I/O, and stores nothing — which is what makes FR-009 and FR-010
true by construction, and what makes it testable in a package with no jsdom.

## Decisions already made

### The signature

```ts
export type StepState = "done" | "current" | "todo" | "unknown";
export type StepId = "profile" | "workspace" | "machine";

export interface SetupStep {
  id: StepId;
  state: StepState;
}

export interface SetupInput {
  /** null when the host has no accounts (desktop build) — see phase decision 2. */
  account: { name: string; email: string } | null;
  /** undefined while loading; null when the query failed. */
  workspace: { slug: string } | null | undefined;
  /** undefined while loading; null when the query failed. */
  machines: { id: string }[] | null | undefined;
  /** Same convention for the account: undefined = still resolving. */
  accountLoading?: boolean;
}

export function setupSteps(input: SetupInput): SetupStep[];
export function isSetupComplete(steps: SetupStep[]): boolean;
```

**`undefined` means loading, `null` means failed.** Two different renderings —
a skeleton and "couldn't check this" — so they cannot collapse into one value.
Callers pass react-query's `data` directly (which is `undefined` while loading)
and map `isError` to `null`.

### The three rules

```ts
// profile: done when the display name is not just the email local part.
const localPart = account.email.split("@")[0] ?? "";
const named = account.name.trim().toLowerCase() !== localPart.toLowerCase();

// workspace: done when the slug is no longer the bootstrap-generated one.
const BOOTSTRAP_SLUG = /^personal-[0-9a-f]{8}$/;
const named = !BOOTSTRAP_SLUG.test(workspace.slug);

// machine: done when at least one machine is PAIRED. Reachability is irrelevant.
const paired = machines.length > 0;
```

Phase decision 1 carries the reasoning for each. Three points the tests must
pin down:

- The profile comparison is **exact after case-folding and trimming**, not
  `includes`. A name of `"Srihari"` against `sriharicoder@…` is *done*; a name
  of `"sriharicoder"` is not.
- The workspace regex is the **exact** bootstrap shape — eight lowercase hex
  characters. A user's deliberate `personal-notes` slug is *done*.
- An empty machine array is `todo`. A `null` machine list is `unknown`, not
  `todo` — a failed query must never tell someone to pair a machine they
  already have.

### Ordering and `current`

Steps are always returned in the order profile → workspace → machine. Exactly
one is `current`: **the first that is not `done`**. Every step after it is
`todo`; every step before it is `done` (or `unknown`).

An `unknown` step is **not** eligible to be `current` and does **not** stop a
later step becoming `current` — if the workspace query failed but the machine
step is genuinely undone, the guide still points somewhere useful rather than
stalling on a step it cannot read.

`isSetupComplete()` is true only when **all three** are `done`. An `unknown`
anywhere means not complete — the card stays, because hiding it on a failed
query would look identical to being finished.

### What it does not do

No labels, no descriptions, no icons, no links. Those are rendering, they are
copy, and they change without the logic changing. The function returns ids and
states; the component owns the words.

## Checklist

- [ ] `packages/ui/src/lib/setup.ts` created with the types and both functions
- [ ] Doc comment recording *why* it is a pure function — no jsdom in this
      package ([`G-13`](../../KnownGaps.md)), so this is the only layer of the
      guide that can be proved without a renderer
- [ ] `packages/ui/src/lib/setup.test.ts` covering:
      all three done → no `current`, `isSetupComplete` true;
      none done → profile is `current`, other two `todo`;
      profile done only → workspace `current`;
      profile and workspace done → machine `current`;
      workspace query failed (`null`) → workspace `unknown`, machine still
      evaluated and able to be `current`;
      machine query failed → machine `unknown`, `isSetupComplete` false;
      still loading (`undefined`) → not `done`, not `unknown`;
      `account: null` (desktop host) → documented behaviour, whatever phase
      decision 2 implies for a host that never renders this;
      profile name exactly the email local part, different case → **not** done;
      profile name containing the local part but longer → **done**;
      slug `personal-a1b2c3d4` → not done;
      slug `personal-notes` → done;
      slug `personal-A1B2C3D4` (uppercase hex) → **done**, the regex is
      lowercase because `bootstrap_workspace` writes lowercase;
      empty machine array → `todo`
- [ ] `pnpm --filter @sparstrow/ui test` and `pnpm typecheck` green

## Traps

**`undefined` and `null` are different and the difference is user-visible.**
Collapsing them with `??` or a truthiness check produces a guide that shows
"couldn't check this" during every page load, or one that silently treats a
failed query as unfinished work. Both are worse than the extra branch.

**Do not read hooks here.** The moment this file imports `useQuery` it becomes
untestable in this package and the whole reason for its existence is gone.

**Do not put copy in this file.** A step's title and explanation will be edited
for tone; the logic will not. Mixing them means every wording change touches a
tested file.

**`account.email` can in principle have no `@`.** `split("@")[0]` then returns
the whole string, which is harmless — but the `?? ""` is there because
`noUncheckedIndexedAccess` may be on. Check the tsconfig rather than removing
it because it looks redundant.

## Verification

- [ ] `pnpm --filter @sparstrow/ui test` — every case above
- [ ] `pnpm typecheck` clean
- [ ] Rendering is proved in [T-M10-05](T-M10-05-verification.md). This task
      ticks logic only, and says so.

## On completion

- [ ] Tick 12.1 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
- [ ] Update this file's **Status** row and the phase README's task table

## Result

<!-- Filled in when the task lands. -->
