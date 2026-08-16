# T-M9-01 — Workspace read and rename

| | |
|---|---|
| **Tag** | `[P]` — a new handler file; shares nothing with T-M9-02 |
| **Serves** | **foundational** — unblocks M10's workspace setup step and the naming control |
| **Depends on** | — |
| **Blocks** | T-M9-03, and M10 |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

## Objective

Add `GET /api/v1/workspace` and `PATCH /api/v1/workspace` so the owner's
workspace row can be read and its name changed. Serves FR-017 and — via the
slug check — FR-018's "has this ever been named?" signal.

## Decisions already made

Phase decisions 1, 2 and 4 are the source. What the handler returns and
enforces:

### `GET /workspace`

```ts
registerRoute({
  method: "GET",
  pattern: "/workspace",
  handler: async ({ supabase, workspaceId }) => {
    const { data, error } = await supabase
      .from("workspaces")
      .select("id, name, slug, description, created_at")
      .eq("id", workspaceId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return fail(404, "Not Found");
    return ok(data);
  },
});
```

No id in the path — phase decision 1. `workspaceId` is already resolved and
authorized by the time a handler runs.

### `PATCH /workspace`

- `name`: trimmed, must be 1–60 characters with at least one non-whitespace
  character. Otherwise `400` with a message that names the limit.
- **Slug, set once:** read the current slug first. If it matches
  `/^personal-[0-9a-f]{8}$/` — the exact shape `bootstrap_workspace` writes
  ([`004_bootstrap_rpc.sql:92-98`](../../../packages/shared/drizzle/policies/004_bootstrap_rpc.sql:92)) —
  derive a new slug from the name and write it alongside. If it does not match,
  the workspace has already been named: **leave the slug untouched**.
- **Slug derivation:** lowercase, non-alphanumerics collapsed to `-`, trimmed
  of leading/trailing `-`, truncated to 40 characters. If the result is empty
  (a name of only punctuation or non-Latin script), keep the existing slug
  rather than writing an empty one.
- **Uniqueness:** `workspaces.slug` may carry a unique constraint — check the
  schema before assuming either way. If it does, catch SQLSTATE `23505` and
  retry once with `-<4 hex>` appended; if that also collides, keep the existing
  slug and still apply the name. **The name is the thing the owner asked for;
  never fail a rename over a slug they cannot see.**
- `.select()` after the update and return `404` if zero rows came back.
- Returns the updated row, same shape as `GET`.

### Nothing else is patchable

Not `description`, not `owner_id`, not `created_at`. `description` has no
surface and no requirement asks for one; adding it now is a field nothing
writes and nothing reads.

## Checklist

- [ ] `apps/web/src/lib/api/handlers/workspace.ts` created with both routes
- [ ] Imported in `handlers/index.ts` **before** the `./stubs` import
- [ ] Name validation with a specific message (`"A workspace name is
      required."` / `"Workspace names are at most 60 characters."`)
- [ ] Slug set only when the current slug matches the bootstrap pattern
- [ ] Slug derivation handles the empty-result case without writing `""`
- [ ] `23505` handled if the column is unique — confirmed against
      `packages/shared/src/db/schema.ts` first, not guessed
- [ ] Zero-row update returns `404`, not `200`
- [ ] Router-level tests: read; rename; rename twice (slug frozen after the
      first); empty name rejected; 61-character name rejected; whitespace-only
      name rejected; a name that slugifies to empty leaves the slug alone
- [ ] `pnpm --filter web test` and `pnpm typecheck` green

## Traps

**Read the slug before writing it.** A single `update` cannot express "set
this only if the current value looks like X" — it takes a read first, or a
conditional `.eq("slug", currentSlug)` guard. Writing the slug unconditionally
is a broken bookmark on every rename, which is the whole thing plan decision 6
avoids.

**The bootstrap pattern is `personal-` + the first 8 characters of a UUID**
(`pg_catalog."left"(v_workspace_id, 8)`), so it is hex, lowercase, exactly 8.
A looser regex like `/^personal-/` would treat a user's deliberate
`personal-notes` slug as unnamed and silently rewrite it.

**`body.name` arrives snake-cased-safe but nested keys do not.** Single-word
keys are unaffected by `toSnake`; this handler only has one, so it is fine —
noted so nobody adds `displayName` later and loses an afternoon (M4 did).

**Do not add a workspace picker or a `workspaceId` body field.**
`getActiveWorkspaceId` already handles the multiple-workspace case with a
deliberate 400 and no UI to escape through. Accepting an id here would be a
second, unaudited path to the same decision. [`D-7`](../../Deferred.md).

## Verification

- [ ] `pnpm --filter web test` — every case in the checklist
- [ ] `pnpm typecheck` clean
- [ ] Live round-trip and cross-workspace denial are proved in
      [T-M9-04](T-M9-04-verification.md) against staging, not here

## On completion

- [ ] Tick 11.1 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
- [ ] Update this file's **Status** row and the phase README's task table

## Result

<!-- Filled in when the task lands. -->
