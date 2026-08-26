# What an agent is allowed to do — 2026-08-24

| | |
|---|---|
| **Spec** | [`../specs/2026-08-24-what-an-agent-is-allowed-to-do.md`](../specs/2026-08-24-what-an-agent-is-allowed-to-do.md) — **Owner-reviewed 2026-08-24, accepted** |
| **Status** | In progress — M19 next |
| **Trigger** | The owner, 2026-08-24, refusing to settle a machine's file-sharing boundary as a one-off rule: "we should not just think and [be] bound to only one access. We should [design] project access settings for users, agents on what level they can access and configure." |
| **Depends on** | M4 (the `settings.set` per-machine path US4 reuses), M16 (a machine can be asked a question — needed only by M21's folder enforcement, not by the model itself) |
| **Touches** | `packages/shared/src/tool-policy.ts`, `packages/shared/src/access/` (new), `packages/shared/src/db/schema.ts`, `packages/shared/drizzle/policies/`, `packages/core/src/agents/tool-resolution.ts`, `packages/core/src/orchestrator/`, `apps/web/src/app/agents/`, `apps/web/src/app/projects/[projectId]/`, `apps/web/src/app/machines/`, `apps/web/src/app/settings/`, `apps/web/src/content/knowledge/` |
| **Tasks** | [`doc/tasks/M18/`](../tasks/M18/README.md); M19–M21 outlined below, not decomposed yet |
| **Open questions** | none — [`OQ-6`](../OpenQuestions.md) closed 2026-08-24 by this spec's review, and lives as US4 |

## Summary

Serves [the access model spec](../specs/2026-08-24-what-an-agent-is-allowed-to-do.md).
The enforcement machinery already exists and is good —
[`tool-policy.ts`](../../packages/shared/src/tool-policy.ts) resolves
Global → Agent → Project → Task with deny-wins, and
[`tool-resolution.ts`](../../packages/core/src/agents/tool-resolution.ts)
snapshots the result onto the run and intersects it with the delegator's bound.
**None of that is rebuilt.** This plan adds the three things missing around it:
a vocabulary that can name a subject other than an agent, a resolver that
reports *which level* decided each outcome, and the surfaces that let the owner
read and set any of it.

## What the spec asks for that isn't obvious

### 1. "Show which level imposed this" is a resolver change, not a UI change

`resolveEffectiveTools` returns `{ allowed, disallowed }` — two flat string
arrays with every trace of origin discarded in the loop that builds them. FR-002
("every restriction MUST be attributed to the level that imposed it") therefore
cannot be satisfied anywhere downstream: the information does not survive the
function. No amount of work in `apps/web` recovers it.

So the first task in this plan is a **provenance-carrying resolver**, and the
non-obvious constraint is that it must be *additive*. `resolveEffectiveTools`,
`intersectEffectiveTools` and `isToolPolicySubset` are the security spine — the
delegation clamp depends on `isToolPolicySubset`'s exact semantics, and 
`effective_tools` snapshots already written to `runs` must keep deserializing.
The provenance version wraps them and is verified to agree with them on every
input, rather than replacing them.

### 2. There is no list of tools anywhere in this repo

FR-003 says the owner picks from "the real set of available things, each
described." Searching the workspace for a tool catalogue returns nothing —
`allowedTools` is `z.array(z.string())` at every level, and the agent creation
form is two `Textarea`s that split on commas
([`agent-create.tsx:60`](../../apps/web/src/app/agents/create/agent-create.tsx:60)).
The strings are passed through to the provider CLI, which is the only thing that
has ever known whether one is real.

**The catalogue has to be authored, and it is provider-specific.** Claude Code's
tool names are not Gemini's or Antigravity's. This is the single largest piece
of genuinely new work in the plan and it is why M18 is foundational rather than
a quick refactor.

### 3. "The workspace level" is a local SQLite settings row, not a cloud table

`readGlobalToolPolicy()` reads `tools.global.allowed` from **each daemon's own
SQLite `settings` table**
([`tool-resolution.ts:12`](../../packages/core/src/agents/tool-resolution.ts:12)).
The spec calls this level "workspace-wide" and expects one screen to set it —
but as built, two paired machines have two independent global policies, and the
cloud has never had a column for it.

Left alone, FR-007 would produce a settings screen that silently only affects
whichever machine happened to answer. The plan makes the cloud the source of
truth for this level and has the daemon read it from there, which is a real
behavioural change to a security-relevant path and is DD-3.

### 4. US4's two halves are not the same kind of thing, and only one is a permission

"What a machine shares" is a property of the **machine**, asked about no matter
who is asking. "Which agents may run here" is a rule about a **subject**. The
spec's Key entities section already separates them — *"a property of the
machine, not of the asker — which is why it sits beside the model rather than
inside its subject axis"* — and the plan keeps that separation in the schema.
Collapsing them into one table would be the tidier-looking mistake.

### 5. `users.role` must be resolved in this plan, and dropping it is cheap

FR-013 requires exactly one place describing a person's level.
[`G-35`](../KnownGaps.md) documents the two that exist, and notes that
`users.role` is read by nothing — no policy, no handler, and the profile route
has a test asserting it is stripped from the response. Its own "clears when"
says dropping it does not need the full model, only the decision that a
person's level lives on their workspace membership. **This plan takes that
decision** (DD-6) and drops the column in M18, rather than leaving a
permission-shaped column lying next to a new permission model.

## Work breakdown

### Foundational — blocks all stories

| Work | Why no story owns it |
|---|---|
| `packages/shared/src/access/` — the subject / level / scope vocabulary, as types and Zod schemas | A vocabulary. Nothing renders it until M19 |
| Provenance-carrying resolver, verified to agree with the existing one | A pure function; the owner sees its output only through M19's screen |
| The tool catalogue: per-provider tool ids, human descriptions, and a validator | Data plus a function. Its absence is why the boxes are free-text today |
| Cloud columns for the workspace-level policy, and the daemon reading them | A column and a fetch; behaviour is identical until something writes it |
| Drop `users.role`; record that a person's level lives on `workspace_members.role` | Removing an inert column — invisible by definition (`G-35`, FR-013) |
| `machine_shared_locations` + the agent↔machine restriction, schema and RLS | Tables. The screens that write them are M20 |

### Per story

| Story | Work | Delivers |
|---|---|---|
| **US1** — see what an agent may do | Agent → "What it can do" panel: resolved answer first, attributed, with the unrestricted case stated in words; all four states | The owner opens an agent and can answer "what is this allowed to do" without reading code |
| **US2** — choose from a real list | The two `Textarea`s replaced by a picker over the catalogue; save-time validation that flags a no-effect rule (FR-005) | The owner restricts an agent without typing a tool name, and is told when a rule cannot bite |
| **US3** — project rules, once | Project → Rules surface writing `projects.allowed_tools` / `disallowed_tools` / `is_sandbox`; what "sandbox" changes, stated | A restriction set on a project holds for every agent in it, including ones created later |
| **US4** — what a machine shares, and who may run there | Machine page: shared locations list with the pairing default; agent↔machine restriction; refusal reasons on dispatch | The owner sees and changes their machine's exposure — **this is `OQ-6`'s answer, shipped** |
| **US5** — restrain an untrusted run | Spawn-time clamp for the two signals knowable at spawn; the run's page says what it was restrained from, or that it could not be | `G-5` closes for the half that is closeable, and says so for the half that is not |

## Decisions

### DD-1 — The existing resolver is wrapped, never replaced

`resolveEffectiveToolsWithProvenance()` is a new export beside the three
existing ones. It returns each tool with the level that granted it and the level
that denied it; a thin adapter drops provenance to produce exactly the old
shape. **A property test asserts the adapter's output equals
`resolveEffectiveTools`'s for randomized inputs**, so the two cannot drift.

Rejected: changing `resolveEffectiveTools`'s return type in place. It is called
by the spawn path, the delegation clamp, and `isToolPolicySubset`; `runs.effective_tools`
holds serialized instances of the old shape. Widening it would make a security
function's behaviour depend on a migration having run.

### DD-2 — The catalogue is per-provider, versioned, and a rule naming an unknown tool is flagged rather than rejected

`packages/shared/src/access/tool-catalogue.ts` maps provider → tool id →
`{ label, description, danger }`. FR-005 requires a mistyped rule to be reported
as having no effect, so validation is **advisory at save time and never
blocking**: an unknown id is stored, shown struck through with "this doesn't
match any tool — it will have no effect", and still passed to the provider.

Rejected: rejecting unknown ids on save. Provider CLIs add tools between our
releases; a hard validation would make the app refuse a rule that would have
worked. The spec asks to be *told*, not to be *stopped*.

### DD-3 — The workspace-level policy moves to the cloud; the daemon reads it and caches it

Two new `jsonb` columns on `workspaces`. Core's `readGlobalToolPolicy()` reads
the cloud value (cached, refreshed on the existing command poll) and falls back
to its local `settings` rows when it has never reached the cloud.

The fallback direction is deliberate: **a machine that cannot reach the cloud
must not silently become less restricted.** Falling back to the local rows —
which today hold whatever was last set locally, usually nothing — could widen a
policy at exactly the wrong moment. So the fallback is to the *stricter* of
{last known cloud value, local rows}, and a machine that has never once fetched
the cloud value logs that it is running on local policy.

Rejected: leaving the level local and having the settings screen write to every
paired machine via `settings.set`. It makes the "workspace-wide" level a
fan-out that is partially applied whenever a machine is offline — a permission
level that is true on some computers and not others.

### DD-4 — A machine's shared locations are stored in the cloud and enforced on the machine

`machine_shared_locations` rows (runtime id, absolute path, added-at) are cloud
state so the owner can see them on the Machines page without the machine being
online — the spec's *"you can see that same list yourself, on the machine's
page, without asking anyone what you shared."*

**Enforcement is on the machine, always.** The daemon fetches the list and
refuses any path outside it, and the refusal names the reason. A cloud-side
check would be advice: the daemon is the thing holding the filesystem, and a
boundary enforced only by the caller is not a boundary.

Grant is **read-only**, per the spec's Recommendation. Nothing in either spec
needs to write outside a project.

### DD-5 — The pairing default is the parent of the first project registered, and it is visible immediately

SC-007 requires a newly paired machine to share something useful with no
configuration. At pairing the daemon nominates the parent directory of its
projects root; if there is no project yet, it nominates nothing and the Machines
page says so with a one-click "share my projects folder" offer.

The spec is explicit that the default is what matters: *"It must cover the
ordinary case on first pair, so most people never meet this feature at all."*

### DD-6 — `users.role` is dropped; a person's level is `workspace_members.role`

FR-013 and [`G-35`](../KnownGaps.md). The column is read by nothing, and the
profile route already strips it with a test asserting so
([`profile-routes.test.ts:258`](../../apps/web/src/lib/api/profile-routes.test.ts:258)).
Dropping it is a migration and a test edit.

Rejected: giving it meaning. Two vocabularies for one concept is the defect
`G-35` describes; picking the one already enforced by RLS is strictly cheaper
than teaching every policy a second one. Recorded so nobody later "restores"
it.

### DD-7 — The four levels are not renamed, and no fifth level is added

Global → Agent → Project → Task stays exactly as
[`tool-policy.ts`](../../packages/shared/src/tool-policy.ts) documents it. The
machine is **not** a fifth level in that chain: what a machine shares is a
property of the machine (DD-4), and which agents may run on it is a dispatch
check, not a tool policy. Adding a fifth level would change the resolver's
truth table, which is the one thing the spec's Assumptions rule out.

### DD-8 — US5 clamps only the two signals knowable at spawn, and says so on screen

`isSandbox` and `delegated` are known when the run starts;
external-content-tool-use is only knowable from a finished transcript, which is
[`G-5`](../KnownGaps.md)'s structural note. The clamp covers the first two. For
a run untrusted only in hindsight, the run page states plainly that it could
not have been restrained and that its memory was quarantined instead — FR-011
and the spec's second US5 scenario.

**This closes half of `G-5` and rewrites the other half in place** rather than
deleting the entry.

### DD-9 — People are designed for and not built, and SC-006 is a written artefact

The spec's own bar: if "a person with view-only access to one project" cannot
be expressed in one sentence using Subject / Level / Scope, the model is not
finished. M18's last task **writes that sentence into the phase README** as its
own deliverable. It is the cheapest possible test of FR-012 and the only one
available without building the person axis.

## Phases

### M18 — the model, the catalogue, and the columns (foundational)

Delivers the vocabulary, the provenance resolver, the tool catalogue, the cloud
columns for the workspace level, the two new tables, and the `users.role` drop.
Nothing here is visible to the owner; at the end of it every screen still looks
exactly as it does today.

Depends on nothing. Blocks M19, M20 and M21.

### M19 — see it, and set it (serves US1 + US2)

Both P1 stories on the same surface, so they ship together: the agent's "what
it can do" panel and the picker that replaces the two `Textarea`s. Ends with
the spec's US1 and US2 acceptance scenarios walked in a browser.

Depends on M18. **Not decomposed yet** — written once M18's catalogue shape is
real, per this repo's M13-before-M14 precedent.

### M20 — the other levels (serves US3 + US4)

Project rules, workspace defaults, machine shared locations, agent↔machine
restriction. **This is the phase that ships `OQ-6`'s answer**, so it is the one
to point at when asking whether that question is really closed.

Depends on M18, and on M19 for the attribution component it reuses. Its folder
*enforcement* half additionally needs M16 (a machine that can be asked a
question); the *nomination* half does not, and is buildable first.

### M21 — restrain an untrusted run (serves US5)

The spawn-time clamp, and the honest message for the case that cannot be
clamped. Depends on M18. Independent of M19 and M20.

## Scope boundaries

- **The combination rules are not reopened.** Strictest wins, denial anywhere is
  denial, frozen at spawn, delegation clamped — the spec's Assumptions, and
  DD-1/DD-7 here.
- **No person-facing permission control is built** (spec Assumptions; DD-9). The
  model admits people; the screens do not.
- **Approval gates are not permissions.** [`D-1`](../Deferred.md).
- **The settings *page* redesign is not here.** [`I-10`](../Ideas.md).
- **Multi-workspace is untouched.** [`D-7`](../Deferred.md).
- **Network/outside-service permissions are not modelled.** The spec's Edge
  cases raise it as an open shape ("is that the same kind of permission as a
  tool, or a different kind?") and no story requires it. Filed to
  [`Ideas.md`](../Ideas.md) rather than guessed at here.

## Verification

| Spec criterion | How it gets checked |
|---|---|
| **SC-001** — answer "what can this do" in 30s from one screen | M19 verification: open an agent with a project-level denial, read the resolved answer, time it |
| **SC-002** — a restriction actually restricts | M19: restrict a tool, dispatch a run that tries it, confirm the provider refuses — not just that the snapshot looks right |
| **SC-003** — unrestricted is never an empty list | M19: an agent with both boxes empty renders the words, asserted in a component test as well as by eye |
| **SC-004** — a mistyped rule is reported at save | M19: save `Bahs` and see the no-effect flag (DD-2) |
| **SC-005** — a project rule binds an agent created later | M20: set the rule, create a fresh agent, run it, confirm denial |
| **SC-006** — a person's grant expressible with no new vocabulary | M18's final task writes the sentence into `M18/README.md`. Fails if it cannot be written in one sentence |
| **SC-007** — a new machine shares something useful with no configuration | M20: pair a scratch machine and read its Machines page without touching settings |

**Named early:** SC-002 and SC-007 both need a real paired machine and a real
dispatched run — the same constraint `T-M11-01` solved with a scratch machine
against staging, and the same one `G-31` records for provider credentials. If
SC-002 cannot be proved because no usable provider credential exists in the
sandbox, that is a `KnownGaps.md` entry in the same change, not a ticked box.

## Result

*Filled in as the phases land.*

 # #   R e s u l t 
 
 * * M 1 8   f i n i s h e d   2 0 2 6 - 0 8 - 2 5 * * .   T h e   f o u n d a t i o n a l   v o c a b u l a r y ,   t o o l   c a t a l o g u e ,   p r o v e n a n c e   r e s o l v e r ,   s c h e m a ,   a n d   s t r i c t   c l o u d   f a l l b a c k   l o g i c   a r e   i m p l e m e n t e d   a n d   p r o v e n .   S C - 0 0 6   i s   s a t i s f i e d .  
 