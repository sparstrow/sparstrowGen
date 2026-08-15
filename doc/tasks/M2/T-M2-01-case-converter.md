# T-M2-01 — Case converter

| | |
|---|---|
| **Tag** | `[P]` parallel — no shared files |
| **Depends on** | nothing |
| **Blocks** | T-M2-03 |
| **Phase spec** | [M2/README.md](README.md) |
| **Status** | queued |

## Objective

supabase-js returns raw Postgres column names (`created_at`); every type in
`@sparstrow/shared` is camelCase (`createdAt`). Provide the deep converter both
directions, **without touching the inside of `jsonb` values**.

## Why this is its own task

Getting it wrong corrupts data rather than throwing. `run_events.payload` holds
provider output containing `tool_use`, `session_id`, `stop_reason`. Camel-casing
those yields `toolUse`, which breaks the transcript renderer and silently defeats
`GraphUsageLine` in `packages/ui/src/routes/pages/run-detail.tsx` — it matches on
`block.type !== "tool_use"`, so it just quietly reports "not used" forever.

The reverse is worse: `runs.injected_memory` already stores camelCase keys
(`projectSlug`), so a blanket snake-casing pass on write corrupts data that was
already correct.

## Checklist

- [x] Create `apps/web/src/lib/case.ts`
- [x] `toCamel(row, opaqueKeys)` — converts top-level and nested **object** keys
- [x] `toSnake(obj, opaqueKeys)` — inverse
- [x] Both skip any key listed in `opaqueKeys`, passing its value through by reference
- [x] Arrays of primitives pass through unchanged
- [x] `null` / `undefined` / `Date` values pass through unchanged
- [x] Export `OPAQUE_COLUMNS: Record<string, string[]>` — the per-table map below
- [x] Unit tests in `apps/web/src/lib/case.test.ts`

## Opaque columns

```ts
export const OPAQUE_COLUMNS = {
  run_events:       ["payload"],
  runs:             ["injected_memory", "effective_tools"],
  runtime_commands: ["payload"],
  agents:           ["mcp_servers", "specter_report"],
  tasks:            ["parent_effective_tools"],
  chat_sessions:    ["draft"],
  chat_messages:    ["meta"],
  goals:            ["world_state", "version_log"],
  plan_nodes:       ["position"],
} as const;
```

String-array jsonb columns (`allowed_tools`, `tags`, `capabilities`, `pre`,
`effects`, `add_dirs`) have no object keys and are safe either way. The rule that
covers everything: **convert the keys of a table row, never the interior of a
jsonb value.**

## Verification

- [x] `pnpm --filter web test` passes
- [x] Test asserts `toCamel({ created_at: 1 })` → `{ createdAt: 1 }`
- [x] Test asserts a `run_events` row with
      `payload: { message: { content: [{ type: "tool_use", name: "x" }] } }`
      survives a `toCamel` → `toSnake` round trip **byte-identical**
- [x] Test asserts `runs.injected_memory.notes[0].projectSlug` is still
      `projectSlug` after `toSnake`
