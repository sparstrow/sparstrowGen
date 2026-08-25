# T-M18-03 — the tool catalogue

| | |
|---|---|
| **Tag** | `[P]` — a new file in `packages/shared`; nothing else in this phase touches it |
| **Serves** | **foundational** — unblocks M19's US2, which is a picker with nothing to pick from without it |
| **Depends on** | T-M18-01 |
| **Blocks** | M19 |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

## Objective

Author `packages/shared/src/access/tool-catalogue.ts`: for each provider this
app supports, the real set of tools an agent may be granted or denied, each with
a human description. Plus `describeToolRule()`, which reports whether a rule can
have any effect.

**This is the largest piece of genuinely new work in the phase.** There is no
tool list anywhere in this repo today — `allowedTools` is
`z.array(z.string())` at every level, and the agent form is two `Textarea`s that
split on commas. The strings are passed straight through to the provider CLI,
which has always been the only thing that knew whether one was real.

## Decisions already made

### Per provider, because tool names are not portable

Plan DD-2. Claude Code's tool names are not Gemini's or Antigravity's. The
catalogue is keyed by provider id — the same ids
[`packages/core/src/providers/`](../../../packages/core/src/providers/) already
uses — and a tool id is only meaningful inside its provider's entry.

Read the provider adapters to source the real names. **Do not invent them from
memory of what a tool is usually called**, and do not use `context7` or the web
in place of reading what this repo actually passes to each CLI: what matters is
the string this app sends, not the string a vendor's docs mention.

### The shape

```ts
export interface CatalogueTool {
  id: string;              // exactly the string passed to the provider
  label: string;           // "Edit files"
  description: string;     // one sentence, plain language, owner-facing
  danger: "read" | "write" | "execute" | "network";
}

export type ToolCatalogue = Record<string /* providerId */, CatalogueTool[]>;
```

`danger` is a **classification, not a permission**. It exists so M19 can group
the picker and warn sensibly; nothing branches on it to decide access. Adding a
fifth axis of enforcement here would be the over-engineering `AGENTS.md` §9
rules out and is not what any FR asks for.

### An unknown tool id is flagged, never rejected

Plan DD-2, and `FR-005`: a rule that can have no effect *"MUST be flagged as
such at the moment it is set"* — flagged, not blocked.

```ts
export type RuleEffect =
  | { effect: "applies" }
  | { effect: "unknown-tool"; reason: string }      // not in this provider's catalogue
  | { effect: "already-denied-above"; by: PolicyLevel };  // granting what a higher level forbids

export function describeToolRule(input: {
  providerId: string;
  tool: string;
  intent: "allow" | "deny";
  higherLevels: ToolPolicyLevels;
}): RuleEffect;
```

Provider CLIs add tools between our releases. A hard validation would make the
app refuse a rule that would have worked — the spec asks to be *told*, not
*stopped*.

### The catalogue is versioned and its staleness is visible

Export `CATALOGUE_REVISION` (a date string) alongside it. When a provider adds a
tool we have not catalogued, every rule naming it reads as `unknown-tool` — the
right behaviour, and confusing without a way to see that the catalogue is simply
old. M19 renders the revision next to the picker.

### `describeToolRule` is pure and takes the higher levels as an argument

No database access, no provider process. It is called from a form on every
keystroke and from a server action on save; both must be able to call the same
function, which rules out anything that needs I/O.

## Checklist

- [ ] Read each adapter in `packages/core/src/providers/` and record which tool-name strings this app actually passes
- [ ] `packages/shared/src/access/tool-catalogue.ts` — `CatalogueTool`, `ToolCatalogue`, `TOOL_CATALOGUE`, `CATALOGUE_REVISION`
- [ ] An entry per provider this app supports, each tool with a one-sentence owner-facing description
- [ ] `describeToolRule()` implemented, returning `RuleEffect`
- [ ] Tests: a known tool `applies`; a mistyped one (`"Bahs"`) is `unknown-tool`; an allow of something denied at a higher level is `already-denied-above` naming that level
- [ ] A test asserting **every** catalogue entry has a non-empty description — an undescribed tool fails `FR-003`, which asks for "each with a short description"
- [ ] `packages/shared` typecheck and tests green

## Traps

**The description is owner-facing product copy, not a docstring.** `FR-003` and
the spec's Interface section both put this in front of the owner. "Executes bash
commands in the project working directory" is right; "Bash tool" is not a
description. `PRODUCT.md`'s register applies.

**Do not make the catalogue the source of truth for what is allowed.** It
describes what *can* be named. Enforcement stays exactly where it is —
`tool-policy.ts` resolving, the provider filtering. A catalogue that starts
gating anything has become a fifth policy level, which plan DD-7 forbids.

**`describeToolRule` must not report `unknown-tool` for a provider it has no
entry for at all.** An uncatalogued *provider* is a different situation from a
mistyped *tool*, and reporting the first as the second would tell the owner
their correct rule is broken. Return `applies` with no claim when the provider
is unknown, and cover it with a test.

**Every string here ships to users.** `AGENTS.md` §3.2 — if this catalogue names
a capability the app does not have, that is the overstating failure the
Knowledge Center rule calls the dangerous direction.

## Verification

- [ ] `pnpm typecheck` and `pnpm test` green for `packages/shared`
- [ ] For each provider, spot-check three catalogue ids against the strings the
      adapter actually passes — recorded in Result as file:line, not as "checked"
- [ ] `describeToolRule({ tool: "Bahs", … })` returns `unknown-tool`
- [ ] `describeToolRule` for an allow of a project-denied tool returns
      `already-denied-above` with `by: "project"`
- [ ] Every entry has a description (asserted by test, not by eye)

## On completion

> **Do not edit [`../MasterTaskQueue.md`](../MasterTaskQueue.md) from this
> branch.** Its Status column is a mirror, flipped at integration on
> `development` by whoever hands out the next wave (`AGENTS.md` §2.8).
> Sibling tasks in this band are adjacent rows in one table, so ticking your
> own row conflicts with every one of them. Record this task's outcome in the
> **Status** row and **Result** section of *this* file.

- [ ] Update this file's **Status** row and the phase README's task table

## Result

*Filled in when the task lands. Name the providers covered and the count of
tools per provider — M19's picker is graded against that number, and a provider
silently missing from the catalogue is a picker that silently offers nothing.*
