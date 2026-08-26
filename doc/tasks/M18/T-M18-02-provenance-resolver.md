# T-M18-02 — the provenance resolver

| | |
|---|---|
| **Tag** | `[P]` — `tool-policy.ts` is touched by nothing else in this phase |
| **Serves** | **foundational** — unblocks M19, which cannot satisfy `FR-002` without it |
| **Depends on** | T-M18-01 |
| **Blocks** | M19 |
| **Phase spec** | [README.md](README.md) |
| **Status** | ✅ done |

## Objective

Add `resolveEffectiveToolsWithProvenance()` to
[`tool-policy.ts`](../../../packages/shared/src/tool-policy.ts), returning each
tool with **the level that granted it and the level that denied it**. Prove it
agrees with the existing resolver on randomized input.

`FR-002` — *"every restriction shown MUST be attributed to the level that
imposed it"* — is unsatisfiable without this, anywhere downstream. The existing
`resolveEffectiveTools` discards origin inside the loop that builds its two flat
arrays; no amount of work in `apps/web` recovers information the function threw
away.

## Decisions already made

### The three existing exports are untouched. This is additive.

Plan DD-1. `resolveEffectiveTools`, `intersectEffectiveTools` and
`isToolPolicySubset` keep their signatures and their behaviour exactly.

The reason is concrete, not stylistic: `isToolPolicySubset` **is** the P3
delegation clamp, and `runs.effective_tools`
([`schema.ts:703`](../../../packages/shared/src/db/schema.ts:703)) already
holds serialized instances of the old shape on every run ever recorded. Widening
the return type in place would make a security function's behaviour depend on
whether a migration had run.

### The shape

```ts
export type PolicyLevel = "global" | "agent" | "project" | "task" | "delegation-bound";

export interface ToolProvenance {
  tool: string;
  /** Every level that granted it, in resolution order. Empty ⇒ provider default. */
  grantedBy: PolicyLevel[];
  /** Every level that denied it. Non-empty ⇒ denied, whatever grantedBy says. */
  deniedBy: PolicyLevel[];
}

export interface EffectiveToolsWithProvenance {
  tools: ToolProvenance[];
  /** True when no level granted anything — the provider's default set applies. */
  usesProviderDefault: boolean;
}
```

`deniedBy` is an **array**, not a single level, because two levels can deny the
same tool and the owner should be able to see that removing the project rule
would not re-grant it. A single "the level that denied it" field would make the
screen quietly lie in exactly the case the owner most needs the truth.

`usesProviderDefault` is a first-class field rather than something the UI infers
from an empty list, because `FR-004` and `SC-003` are entirely about **not**
letting an empty list be read as "can't do anything." Making the caller derive
it is making the caller responsible for the one thing the spec says must not go
wrong.

### `intersectEffectiveToolsWithProvenance` carries `delegation-bound`

A delegated run's clamp is a real reason a tool is unavailable, and the spec's
Edge cases ask whether the owner can see the resulting chain. Attributing it to
a named level is the cheapest way to make that answerable later without
re-opening the resolver.

### The agreement property test is a deliverable, not a nicety

```ts
// for randomized ToolPolicyLevels inputs:
expect(toLegacyShape(resolveEffectiveToolsWithProvenance(levels)))
  .toEqual(resolveEffectiveTools(levels));
```

`toLegacyShape` is exported so the equivalence is a checkable claim rather than
an assertion inside a test file. Without this, the two implementations drift and
the drift presents as "the screen says the project denied it but the run says
otherwise" — a security bug wearing a UI bug's clothes.

Use at least 200 randomized cases, seeded deterministically. `Math.random()`
without a seed makes a failure unreproducible.

## Checklist

- [ ] `PolicyLevel`, `ToolProvenance`, `EffectiveToolsWithProvenance` exported from `tool-policy.ts`
- [ ] `resolveEffectiveToolsWithProvenance(levels)` implemented
- [ ] `intersectEffectiveToolsWithProvenance(a, bound)` implemented, attributing to `delegation-bound`
- [ ] `toLegacyShape(withProvenance): EffectiveTools` exported
- [ ] Seeded property test, ≥200 cases, asserting equality with `resolveEffectiveTools`
- [ ] Explicit cases: empty everywhere; deny at two levels; grant at one and deny at another; a delegation bound tighter than the resolution
- [ ] The existing tests in `tool-policy.test.ts` are **unmodified** — if one needs editing, the change is wrong
- [ ] `packages/shared` typecheck and tests green

## Traps

**Deny-wins is absolute and order-independent, and provenance must not smuggle
an ordering in.** The file's header says the effective *set* is order-independent
precisely because deny-wins is absolute. `grantedBy` is in resolution order for
display; nothing may branch on its order to decide whether a tool is allowed.

**An empty allow-list means *inherit*, not *deny all*.** Documented in the file
header, and the counter-intuitive thing this whole phase is at risk of getting
backwards. `usesProviderDefault` exists to carry that meaning explicitly — do
not let it become "no tools."

**`intersectEffectiveTools`'s asymmetric empty-side rule is subtle.** Both empty
→ empty; one side empty → the *other* side's list, because the non-default side
is the tighter bound. The provenance version must reproduce that exactly, and
the property test is what proves it did.

**Do not import from `packages/shared/src/access/` here.** The vocabulary
(`T-M18-01`) and tool policy are deliberately separate — plan DD-7. This task
depends on 01 only for ordering in the queue, not for a symbol.

## Verification

- [ ] `pnpm test` green for `packages/shared`, with the pre-existing
      `tool-policy.test.ts` cases unedited
- [ ] The property test fails if `resolveEffectiveToolsWithProvenance` is
      deliberately broken (e.g. drop the deny filter) — **run it broken once and
      confirm it goes red**, so the test is known to have teeth
- [ ] A tool denied at both project and task level reports `deniedBy` of length 2
- [ ] A level set with no grants anywhere reports `usesProviderDefault: true`
- [ ] `git diff` shows no change to the three existing exported functions

## On completion

> **Do not edit [`../MasterTaskQueue.md`](../MasterTaskQueue.md) from this
> branch.** Its Status column is a mirror, flipped once per band in the commit
> that lands the band branch on `development` (`AGENTS.md` §2.9). Sibling
> tasks in this band are adjacent rows in one table, so ticking your own row
> conflicts with every one of them — including the parallel forks working
> beside you. Record this task's outcome in the **Status** row and **Result**
> section of *this* file.

- [ ] Update this file's **Status** row and the phase README's task table

## Result
✅ Finished and verified. Added `PolicyLevel`, `ToolProvenance`, and `EffectiveToolsWithProvenance` types. Implemented `resolveEffectiveToolsWithProvenance` and `intersectEffectiveToolsWithProvenance`. Tests pass with property-based testing comparing legacy outputs.
