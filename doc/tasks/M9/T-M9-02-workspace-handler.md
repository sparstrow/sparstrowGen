# T-M9-02 — Workspace read and update

| | |
|---|---|
| **Tag** | `[P]` — a new handler file; shares nothing with T-M9-03 |
| **Serves** | **foundational** — unblocks M10's workspace form and its step-2 completion rule |
| **Depends on** | T-M9-01 |
| **Blocks** | T-M9-05, and M10 |
| **Phase spec** | [README.md](README.md) |
| **Status** | ✅ done (2026-08-18) — live round-trip deferred to `T-M9-06` |

## Objective

`GET /api/v1/workspace` and `PATCH /api/v1/workspace`, carrying the four fields
the workspace setup form owns: **logo, name, description, context** — plus the
slug, which is returned and never accepted.

Serves FR-017, FR-020 and FR-022.

## Decisions already made

Phase decisions 1 and 4 and plan decision 8 are the source.

### `GET /workspace`

```ts
.select("id, name, slug, description, context, logo_url, created_at")
.eq("id", workspaceId)
.maybeSingle();
```

No id in the path — phase decision 1. `workspaceId` is already resolved and
authorized before a handler runs.

### `PATCH /workspace` — four accepted fields

| Field | Rule |
|---|---|
| `name` | trimmed. **May be empty** — clearing a name is legitimate, and the setup step simply reverts to not-done. Max 60 characters |
| `description` | trimmed, max 280 characters. One line about what the workspace is for |
| `context` | trimmed, max 4000 characters. Agent-facing background; the longest field here on purpose |
| `logo_url` | a URL this app produced, or `null` to clear. Written by `T-M9-04`'s upload; see the trap below |

Every field is **optional in the body** — a `PATCH` sending only `context`
changes only `context`. Build the update object from the keys actually present,
not from a fixed shape with `undefined` holes.

**Empty name is allowed and this is the decision most likely to be reversed by
reflex.** `T-M9-01` makes `''` the starting state; rejecting it here would mean
the API refuses to write the value the database already holds, and would make
"clear this and think about it later" impossible. The *setup step* is what
treats empty as not-done — that is a UI-layer reading of the data, not a
constraint on it.

### Slug: returned, derived once, never accepted

`slug` in a request body is **ignored**, not rejected — a client that sends the
whole object back is a normal thing to write, and 400-ing it would be hostile.

The slug is set **only** when the workspace gains its first non-empty name and
its current slug still matches `^personal-[0-9a-f]{8}$` — the exact shape
`bootstrap_workspace` writes. After that it never moves (plan decision 8,
FR-022).

- **Derivation:** lowercase, non-alphanumerics collapsed to `-`, trimmed of
  leading/trailing `-`, truncated to 40 characters.
- **Empty result** (a name of only punctuation or non-Latin script): keep the
  existing slug rather than writing `''` into a `notNull().unique()` column.
- **Uniqueness:** `workspaces.slug` **is** `.unique()` — confirmed in
  `schema.ts`. Catch SQLSTATE `23505` and retry once with `-<4 hex>` appended;
  if that also collides, keep the existing slug and **still apply the name**.
  The name is what the owner asked for; never fail their edit over a slug they
  cannot see.

### Nothing else is patchable

Not `owner_id`, not `created_at`, not `id`. Reject unknown keys with a `400`
naming them rather than silently ignoring them — silent ignoring is how someone
spends an afternoon on a field that was never wired up.

## Checklist

- [x] `apps/web/src/lib/api/handlers/workspace.ts` created with both routes
- [x] Imported in `handlers/index.ts` **before** the `./stubs` import
- [x] Partial `PATCH`: only the keys present are written
- [x] Per-field length validation with specific messages naming the limit
- [x] Empty `name` accepted
- [x] `slug` in the body ignored; slug set only on the first non-empty name
      while the bootstrap pattern still matches
- [x] Slug derivation handles the empty-result case without writing `''`
- [x] `23505` handled with one retry, then name-wins fallback
- [x] Unknown body keys → `400` naming them
- [x] Zero-row update returns `404`, not `200`
- [x] Router-level tests: read; set each field alone; set all four; name to
      empty; 61-char name; 281-char description; 4001-char context; name set
      twice (**slug frozen after the first**); a name that slugifies to empty;
      a body containing `slug` (ignored, not an error); a body containing
      `owner_id` (400)
- [x] `pnpm --filter web test` and `pnpm typecheck` green

## Traps

**`logo_url` accepts a URL, which means it accepts *any* URL.** A caller could
store `https://evil.example/x.png` and every member of the workspace would
render it — an SSRF-adjacent tracking pixel at minimum. Validate that the value
is either `null` or a URL under this project's own Supabase storage origin.
`T-M9-04` owns the upload; this handler owns the check, and it must exist even
if `T-M9-04` is cut. If it is cut, `logo_url` accepts only `null`.

**Read the slug before writing it.** A single `update` cannot express "set this
only if the current value looks like X" — it takes a read first, or an explicit
`.eq("slug", currentSlug)` guard.

**The bootstrap pattern is `personal-` + 8 lowercase hex.** A looser
`/^personal-/` would treat a deliberate `personal-notes` slug as unnamed and
rewrite it.

**Bodies arrive snake-cased.** `parseBody` → `toSnake` runs before a handler
sees the body, so the browser's `logoUrl` arrives as `logo_url`. Reading the
camelCase name makes every well-formed request a 400 — M4 lost time to exactly
this.

**A `PATCH` that affects zero rows must not report success.** M2 found this
across eleven handlers. `.select()` after the update; check the array.

**Do not accept a `workspaceId` in the body.** `getActiveWorkspaceId` already
resolves it, and a second path to that decision would be unaudited.
[`D-7`](../../Deferred.md).

## Verification

- [ ] `pnpm --filter web test` — every case in the checklist
- [ ] `pnpm typecheck` clean
- [ ] Live round-trip and cross-workspace denial are proved in
      [T-M9-06](T-M9-06-verification.md) against staging, not here

## On completion

- [ ] Tick 11.2 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
- [ ] Update this file's **Status** row and the phase README's task table

## Result

**Landed 2026-08-18.** `GET`/`PATCH /api/v1/workspace` in
[`handlers/workspace.ts`](../../../apps/web/src/lib/api/handlers/workspace.ts),
registered before `./stubs`. **31 tests**, all green
([`workspace-routes.test.ts`](../../../apps/web/src/lib/api/workspace-routes.test.ts));
`pnpm typecheck` and the full `pnpm --filter web test` (193 tests) green.

### Two deviations, both deliberate

**1. The storage-origin check is a shared module, not inline.** M9 decision 3
says validation is "inline and shared with nothing". The six ordinary fields
follow that exactly — every length and type rule is inline in its own handler.
`isOwnStorageUrl` is not one of those six: it is a **security** check with three
consumers (`PATCH /workspace`, `PATCH /me`, and `T-M9-04`'s upload), and
decision 4 requires the identical rule in at least two of them. Two hand-copied
origin checks drift, and the direction they drift is *accepts more*. It lives in
[`api/storage-url.ts`](../../../apps/web/src/lib/api/storage-url.ts) with the
reasoning in its header. Decision 3's actual target — a generic field validator
— was not built.

It is also **narrower than decision 4 asked for**: the check pins the bucket
(`public-images`), not just the origin. A URL under a *different* bucket of this
same project would pass an origin-only test, and that bucket need not carry
`T-M9-04`'s write policies.

**2. Validation is an exported pure function, not a closure.** `parseWorkspacePatch`,
`slugify` and `withCollisionSuffix` are exported so the rules are testable
without a Supabase session — the same shape `enqueueFailureFrom` uses in
[`api/enqueue.ts`](../../../apps/web/src/lib/api/enqueue.ts). Still inline in the
sense that matters: the rules live in the handler's own file and no other handler
imports them.

### Tests go one level deeper than the repo's other route tests

`runtime-routes.test.ts` asserts dispatch only, on the stated grounds that
handler bodies need a Supabase session. That is true of *those* handlers. Here
the two things worth proving — what a body may contain, and whether the slug
moves — need only `.select().eq().maybeSingle()` and
`.update().eq().select().maybeSingle()`, so a ~25-line fake buys real coverage
of the slug-freeze rule. **That rule fires exactly once in a workspace's
lifetime and is frozen forever after**, so getting it wrong is not something a
later edit repairs. Dispatch-only tests would have left it entirely unproved.

The collision path is covered too, including the give-up branch: with all 65,537
candidate slugs taken, the third attempt drops the slug and **still applies the
name**.

### Not proved here

RLS, cross-workspace denial, and the live round-trip — `T-M9-06`, against
staging, and currently behind [`G-20`](../../KnownGaps.md) (nothing in M9 has
touched a database). Note in particular that `logo_url` cannot round-trip at all
until `T-M9-04`'s bucket exists: today every non-null value is correctly refused,
because no URL can yet satisfy the check.
