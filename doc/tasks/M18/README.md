# M18 — the model, the catalogue, and the columns

| | |
|---|---|
| **Plan** | [`../../plans/2026-08-24-what-an-agent-is-allowed-to-do.md`](../../plans/2026-08-24-what-an-agent-is-allowed-to-do.md) (M18) |
| **Kind** | **foundational** — at the end of this phase every screen looks exactly as it does today |
| **Spec** | [`../../specs/2026-08-24-what-an-agent-is-allowed-to-do.md`](../../specs/2026-08-24-what-an-agent-is-allowed-to-do.md) |
| **Depends on** | — |
| **Blocks** | M19 (US1 + US2), M20 (US3 + US4), M21 (US5) |
| **Status** | not started |
| **Open questions** | none — [`OQ-6`](../../OpenQuestions.md) closed 2026-08-24 |

## What this phase is for

The spec's own finding is that **the machinery is good and every control around
it is missing**. This phase builds the parts that are neither machinery nor
screen: a vocabulary, a resolver that reports its reasoning, a catalogue of what
can be permitted, and the columns the three story phases write to.

Nothing here is visible. That is correct, and it is why the phase's Definition
of done is technical outcomes plus a named unblocking, not an acceptance
scenario.

## Phase decisions

The plan's DD-1 through DD-9 govern this phase and are **not restated** — read
them there. What follows is the detail decomposition surfaced.

### The vocabulary is types before it is tables

`packages/shared/src/access/` holds the four entities from the spec's Key
entities section as TypeScript types and Zod schemas:

```ts
export type Subject =
  | { kind: "agent"; id: string }
  | { kind: "person"; id: string }      // FR-012 — declared, never constructed in M18
  | { kind: "machine"; id: string };

export type Scope =
  | { kind: "workspace"; id: string }
  | { kind: "project"; id: string }
  | { kind: "machine"; id: string }
  | { kind: "agent"; id: string }
  | { kind: "run"; id: string };

/** The ladder, learned once, same for every kind of thing (spec: Level of access). */
export type AccessLevel = "see" | "use" | "configure" | "administer";
```

**The `person` variant exists in M18 and is constructed by nothing.** That is
`FR-012` executed: the model admits people without a second vocabulary, and
`SC-006` is the test that it really does.

### The four levels are Global → Agent → Project → Task and are not touched

Plan DD-7. A machine is **not** a fifth level. `Scope` above includes `machine`
because a *rule* can be about a machine; the tool-policy resolution chain is
unchanged, and changing it is what the spec's Assumptions rule out.

### Provenance is additive and is proved equal to the existing resolver

Plan DD-1. `resolveEffectiveToolsWithProvenance()` is a new export in
[`tool-policy.ts`](../../../packages/shared/src/tool-policy.ts), beside — never
instead of — `resolveEffectiveTools`, `intersectEffectiveTools` and
`isToolPolicySubset`.

The agreement test is not optional and not a formality: `runs.effective_tools`
already holds serialized instances of the old shape, and `isToolPolicySubset`
is the delegation clamp. A drift between the two implementations is a security
bug that presents as a UI inconsistency.

## Traps that apply across this phase

**`tool-policy.ts` is the security spine.** Its header documents a locked truth
table — deny-wins is absolute, an empty allow-list means *inherit*, not *deny
all*. Every task here must leave those three exported functions behaving
identically. If a change makes one of their tests need editing, the change is
wrong.

**"Empty allow list means unrestricted" is counter-intuitive and is the single
most likely thing to be got backwards.** `FR-004` and `SC-003` exist because of
it. Any code in this phase that treats an empty array as "denied everything" is
a defect, including in a type's doc comment.

**A migration here touches a security-relevant path.** `AGENTS.md` §3.12: load
the `supabase` and `supabase-postgres-best-practices` skills **in the turn the
SQL is written**, not from memory of a previous session. M1 found three real
defects that way — per-row RLS function calls, `SECURITY DEFINER` helpers
reachable as public RPC, and 25 unindexed foreign keys.

**Dropping `users.role` will break a test that asserts it is stripped**
([`profile-routes.test.ts:258`](../../../apps/web/src/lib/api/profile-routes.test.ts:258)).
That test is *correct today* and becomes meaningless when the column is gone —
delete it with the column, and say so in the task's Result. Do not weaken it.

## Tasks

Run order and concurrency live in [`../MasterTaskQueue.md`](../MasterTaskQueue.md).

| Task | Tag | Serves | Depends on | Status |
|---|---|---|---|---|
| [T-M18-01 — the access vocabulary](T-M18-01-access-vocabulary.md) | `[S]` | foundational | — | not started |
| [T-M18-02 — the provenance resolver](T-M18-02-provenance-resolver.md) | `[P]` | foundational | T-M18-01 | not started |
| [T-M18-03 — the tool catalogue](T-M18-03-tool-catalogue.md) | `[P]` | foundational | T-M18-01 | not started |
| [T-M18-04 — schema: workspace policy, shared locations, agent↔machine, drop `users.role`](T-M18-04-schema-and-policies.md) | `[P]` | foundational | T-M18-01 | not started |
| [T-M18-05 — core reads the workspace policy from the cloud](T-M18-05-core-cloud-policy.md) | `[C]` | foundational | T-M18-04 | not started |
| [T-M18-06 — verification, and the `SC-006` sentence](T-M18-06-verification.md) | `[S]` | foundational | T-M18-01…05 | not started |

`T-M18-01` is `[S]` and gates the phase for the same reason `T-M16-01` gates
M16: three tasks in two packages are written against its types. 02, 03 and 04
are genuinely disjoint — different files, different packages, hand them to three
workers. 05 is `[C]` because it edits
[`tool-resolution.ts`](../../../packages/core/src/agents/tool-resolution.ts),
which nothing else here touches but which sits on the spawn path.

## Definition of done

- The vocabulary exists and expresses a person without any code constructing one.
- The provenance resolver agrees with the existing resolver on randomized input,
  proved by a property test.
- A tool catalogue exists for every provider this app supports, with a
  description per tool.
- The workspace-level policy is a cloud column, read by the daemon, with the
  stricter-of fallback the plan's DD-3 specifies.
- `users.role` is gone and [`G-35`](../../KnownGaps.md) is rewritten to name
  what is left of it.
- **`SC-006`'s sentence is written into this file** by `T-M18-06`. If it cannot
  be written in one sentence using Subject / Level / Scope, the model is not
  finished and this phase does not close.

## The `SC-006` sentence

> *Filled in by [`T-M18-06`](T-M18-06-verification.md). Until then this heading
> is deliberately empty — an unfilled heading is a visible unmet criterion,
> which is the point.*
