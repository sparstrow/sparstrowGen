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

> 2. Returning later: completed steps read done and I am pointed at the next.
> 3. A step completed elsewhere in the app reads as done. Real state, never a
>    checkbox I tick.
> 4. Fully set up: the guide is not in my way.
> 5. A step that cannot be completed yet says so and why.
> 9. A brand-new account's steps are empty and say so — nothing guessed on my
>    behalf.
> 11. An account that predates the guide reflects what it has actually done.

Scenarios 9 and 11 need no code *here*: M9 removed the invented names and
cleared the ones already written, so a pre-existing account is simply an account
with two empty names. The tests must **prove** that rather than assume it.

## Objective

One pure function in `packages/ui/src/lib/setup.ts` that turns the profile row,
the workspace row and the machine list into three steps with a state each. It
calls no hooks, does no I/O, and stores nothing — which makes FR-009 and FR-010
true by construction, and makes it testable in a package with no jsdom.

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
  /** From useProfile(). undefined = loading, null = the query failed. */
  profile: { name: string } | null | undefined;
  /** From useWorkspace(). Same convention. */
  workspace: { name: string } | null | undefined;
  /** From useRuntimes(). Same convention. */
  machines: { id: string }[] | null | undefined;
}

export function setupSteps(input: SetupInput): SetupStep[];
export function isSetupComplete(steps: SetupStep[]): boolean;
```

**`undefined` means loading, `null` means failed.** Two different renderings —
a skeleton and "couldn't check this" — so they must not collapse into one
value. Callers pass react-query's `data` directly (`undefined` while loading)
and map `isError` to `null`.

**It takes the profile ROW, not the account.** `useAccount()` is the session
snapshot the shell renders; `useProfile()` is the row the form edits. They can
briefly disagree during a save. The row is the truth (M9 phase decision 1).

### The three rules — plain emptiness, no heuristics

```ts
const profileDone   = profile.name.trim().length > 0;
const workspaceDone = workspace.name.trim().length > 0;
const machineDone   = machines.length > 0;
```

That is the whole rule set. M9's `T-M9-01` removed the two places the database
was inventing names, so an empty name means exactly one thing: nobody has typed
one yet.

**Do not compare anything against an email address.** An earlier draft of this
task did, and spec decision 6 replaced it. A comparison would also now be wrong:
after M9 the stored value is `''`, not the email local part.

**Only the name decides a step.** The avatar, logo, bio, description and context
are not consulted — FR-020, and it is the rule most likely to be "improved" into
requiring a complete profile.

### Ordering and `current`

Steps are always returned in the order profile → workspace → machine. Exactly
one is `current`: **the first that is not `done`**. Every step after it is
`todo`; every step before it is `done` (or `unknown`).

An `unknown` step is **not** eligible to be `current` and does **not** stop a
later step becoming `current` — if the workspace query failed but the machine
step is genuinely undone, the guide still points somewhere useful rather than
stalling on a step it cannot read.

`isSetupComplete()` is true only when **all three** are `done`. An `unknown`
anywhere means not complete: hiding the dashboard card on a failed query would
look identical to being finished.

### What it does not do

No labels, no descriptions, no icons, no links, no field lists. Those are
rendering, they are copy, and they change without the logic changing. The
function returns ids and states; the components own the words.

## Checklist

- [ ] `packages/ui/src/lib/setup.ts` created with the types and both functions
- [ ] Doc comment recording *why* it is a pure function — no jsdom in this
      package ([`G-13`](../../KnownGaps.md)), so this is the only layer of the
      guide provable without a renderer — **and** why the rule is an emptiness
      check rather than a heuristic (spec decision 6)
- [ ] `packages/ui/src/lib/setup.test.ts` covering:
      all three done → no `current`, `isSetupComplete` true;
      none done → profile `current`, other two `todo`;
      profile done only → workspace `current`;
      profile and workspace done → machine `current`;
      `name: ""` → not done;
      `name: "   "` (whitespace only) → not done;
      `name: "S"` → done (one character is a name);
      a name that happens to equal the email local part → **done** — the
      heuristic this replaces would have got this wrong;
      workspace query failed (`null`) → `unknown`, and the machine step still
      evaluated and able to be `current`;
      machine query failed → `unknown`, `isSetupComplete` false;
      still loading (`undefined`) → not `done`, not `unknown`;
      empty machine array → `todo`;
      a machine that is paired but unreachable → **done**
- [ ] `pnpm --filter @sparstrow/ui test` and `pnpm typecheck` green

## Traps

**`undefined` and `null` are different and the difference is user-visible.**
Collapsing them with `??` or a truthiness check produces a guide that shows
"couldn't check this" during every page load, or one that silently treats a
failed query as unfinished work. Both are worse than the extra branch.

**`name: ""` is a normal value, not a missing one.** Anything that substitutes
a default for it makes the step read done when it is not — which is the whole
failure M9 was built to remove.

**Do not read hooks here.** The moment this file imports `useQuery` it becomes
untestable in this package and its reason for existing is gone.

**Do not put copy in this file.** A step's title and explanation will be edited
for tone; the logic will not. Mixing them means every wording change touches a
tested file.

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
