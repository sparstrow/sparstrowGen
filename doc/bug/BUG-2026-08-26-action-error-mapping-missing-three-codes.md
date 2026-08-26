# BUG-2026-08-26-action-error-mapping-missing-three-codes

**Status:** 🟢 resolved
**Reported by:** agent — verifying `T-WA-03`'s `deleteAgentAction` (checking what message a foreign-key-violated delete would show)
**Reported:** 2026-08-26

## Symptom

Any converted Server Action that hits a Row Level Security denial (Postgres
code `42501`), a unique-constraint violation (`23505`), or a foreign-key
violation (`23503`) shows the raw Postgres error text — something like
`update or delete on table "agents" violates foreign key constraint
"task_assigned_agent_id_fkey" on table "tasks"` — instead of the short,
user-facing message the same operation showed before conversion:
"Forbidden by Row Level Security", "Resource already exists (unique
violation)", or "Invalid reference (foreign key violation)" respectively.

## Reproduction

Not reproduced through a live UI action (would need, e.g., an agent
referenced by a team, then a delete attempt). Found by reading
`apps/web/src/lib/action-result.ts`'s `actionErrorFrom` next to
`apps/web/src/lib/api/router.ts`'s `handleError` side by side while checking
what `deleteAgentAction` would show on a foreign-key violation, and noticing
the two functions' mappings didn't match.

## Investigation

`actionErrorFrom`'s own doc comment says it exists to match `handleError`'s
status-to-message mapping "already applies to the `/api/v1` handlers these
actions replace" — the whole point of the function, and the plan's own
"no behaviour changes" checkability rule. But it only ever special-cased two
of `handleError`'s five codes (`PGRST116`, `PGRST204`/`42703`); `42501`,
`23505`, and `23503` all fell through to the generic branch
(`actionFail(e?.message || "Internal Server Error")`), which uses whatever
raw text Postgres/PostgREST attached to the error rather than the mapped
message.

`actionErrorFrom` was built by `T-WA-01` and is the ONE shared helper every
task in this phase calls (`app/*/actions.ts` across `T-WA-01`, `T-WA-02`,
`T-WA-04`, `T-WA-05`, `T-WA-06`, `T-WA-03`) — this is a phase-wide gap, not
specific to any one task's conversion. It would only have been hit by a
caller whose write actually triggers one of those three Postgres codes, and
no prior task's verification pass happened to exercise one live.

## Impact

Low-to-moderate: functionally nothing breaks (the action still correctly
reports failure), but the message shown is a raw database error instead of
a legible one — worse for the owner, and a genuine "no behaviour changes"
violation versus the pre-conversion `/api/v1` handler for these three
specific failure shapes. Every converted write across the whole WA1 phase
carried this exposure whenever a delete hit a real reference, a create hit
a real uniqueness constraint, or RLS denied a request that reached this far.

## Resolution

Fixed in the same change that found it: `actionErrorFrom`
(`apps/web/src/lib/action-result.ts`) now special-cases all three remaining
codes with the exact same messages `handleError` uses. Since this is the one
shared helper, the fix applies retroactively to every action already
converted in `T-WA-01`, `T-WA-02`, `T-WA-04`, `T-WA-05`, and `T-WA-06` — no
per-task changes needed. Not independently re-verified live against a real
FK/unique/RLS failure in any of those tasks' surfaces (see `G-43` in
`doc/KnownGaps.md` for `deleteAgentAction` specifically); the fix is a
direct copy of `handleError`'s own already-correct mapping, so the risk is
confined to a typo, and none of the three added lines differ from their
`router.ts` counterparts.
