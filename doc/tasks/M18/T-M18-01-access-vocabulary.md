# T-M18-01 — the access vocabulary

| | |
|---|---|
| **Tag** | `[S]` — three tasks in two packages are written against these types; nothing else in M18 may start first |
| **Serves** | **foundational** — unblocks T-M18-02, 03, 04 and every story phase behind them |
| **Depends on** | — |
| **Blocks** | T-M18-02, T-M18-03, T-M18-04 |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

## Objective

Create `packages/shared/src/access/` holding the spec's Key entities as types
and Zod schemas: **Subject**, **Level of access**, **Scope**, **a rule**, and
**the resolved answer**. No behaviour changes; nothing imports this yet.

This is the task that makes `FR-012` real — the model must express a person
without a second vocabulary, even though no person-level control is built
anywhere in this plan.

## Decisions already made

### The five entities map one-to-one onto exported types, and the mapping is written down

The spec's Key entities section is the specification for this file. Each entity
gets a type whose doc comment quotes the spec's own words, so the vocabulary
cannot drift from the document that defines it:

| Spec entity | Type |
|---|---|
| Subject | `Subject` |
| Level of access | `AccessLevel` |
| Scope | `Scope` |
| A rule | `AccessRule` |
| The resolved answer | `ResolvedAccess` |

### `ResolvedAccess` is derived and is never persisted or accepted as input

The spec: *"This is what the owner reads and what the system enforces; it is not
itself something anyone sets."* So `ResolvedAccess` gets **no** insert/update
Zod schema, and no table. Only `AccessRule` is writable.

Give it a doc comment saying so. The next person to add a "save the resolved
answer" cache needs to meet that sentence first.

### `AccessLevel` is one ladder, ordered, for every kind of thing

`see` < `use` < `configure` < `administer`. The spec is explicit that it is
"the same ladder for every kind of thing, so it is learned once." Export a
comparison helper so no caller re-derives the ordering:

```ts
export function atLeast(held: AccessLevel, required: AccessLevel): boolean;
```

Rejected: a per-scope ladder (a machine having different levels from a project).
It reads more precise and it means four ladders to learn and four places for an
off-by-one.

### `Subject` includes `person` and nothing constructs one

`FR-012`. The variant is declared here and never built. `T-M18-06` proves this
was enough by writing `SC-006`'s sentence.

### This file is types only — no resolution, no I/O, no table

Resolution lives in `tool-policy.ts` (`T-M18-02`). Tables live in
`T-M18-04`. Keeping this task to a vocabulary is what lets the other three run
in parallel behind it.

## Checklist

- [ ] `packages/shared/src/access/types.ts` — `Subject`, `AccessLevel`, `Scope`, `AccessRule`, `ResolvedAccess`, each doc-commented with the spec's own words
- [ ] `packages/shared/src/access/types.ts` — `atLeast()` with its ordering as a single source
- [ ] `packages/shared/src/access/schemas.ts` — Zod schemas for `Subject`, `Scope`, `AccessRule`. **No schema for `ResolvedAccess`**
- [ ] `packages/shared/src/access/index.ts` re-exporting both, wired into the package's own entry point the way `tool-policy.ts` is
- [ ] Unit tests for `atLeast()` covering every ordered pair, including equality
- [ ] A test asserting `ResolvedAccess` has no exported Zod schema — a compile-level guard against it becoming writable by accident
- [ ] `packages/shared` typecheck and tests green

## Traps

**Do not model tool permissions with these types.** Tools are `ToolPolicy` in
[`tool-policy.ts`](../../../packages/shared/src/tool-policy.ts) and stay that
way — plan DD-7. `AccessRule` is the *general* statement (a subject, a level, a
scope); the tool allow/deny lists are a specific, already-working instance that
this phase does not rewrite. Conflating them means touching the security spine
in a task that was supposed to add a vocabulary.

**`Scope` is not a hierarchy.** It is a tagged union of things a rule can be
*about*. The Global → Agent → Project → Task **order** is the resolver's, and it
lives in `tool-policy.ts` where it is already documented. Encoding an ordering
into `Scope` here would create a second, competing statement of it — the exact
duplicated-doctrine failure `AGENTS.md` §3.13 names.

**`packages/shared` is imported by `apps/web`, `packages/core` and the daemon.**
Anything Node-only in this file breaks the browser build. Types and Zod only.

## Verification

- [ ] `pnpm typecheck` and `pnpm test` green for `packages/shared`
- [ ] `atLeast("use", "administer") === false` and `atLeast("administer", "see") === true`
- [ ] `grep -rn "kind: \"person\"" packages/ apps/` finds the declaration and **no construction** — the FR-012 posture, checkable
- [ ] Nothing outside `packages/shared/src/access/` imports these types yet

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
