# BUG-2026-08-25-skills-list-file-count-is-nan

**Status:** 🟢 resolved
**Reported by:** agent — found while verifying `T-WA-05`'s Server Action conversion live
**Reported:** 2026-08-25

## Symptom

The Skills list page (`/skills`) shows "NaN" in the Files column for every
skill, instead of a file count.

## Reproduction

1. Sign in, create any skill (or view an existing one) on `/skills`.
2. The Files column reads "NaN" for that row's `title` tooltip and cell text.

Verified live 2026-08-25 against a fresh skill just created through the New
skill dialog: the inserted `skills` row and the `GET /skills` response both
lack a `file_count`/`fileCount` field entirely (confirmed via a direct
Postgres query — `skills` has no such column,
`packages/shared/src/db/schema.ts`'s `skills` `pgTable` confirms the same).
`apps/web/src/app/skills/skills.tsx` reads `skill.fileCount + 1` — `undefined
+ 1` is `NaN`.

## Investigation

- `GET /skills` (`apps/web/src/lib/api/handlers/skills.ts`) does a plain
  `select("*")` on `skills`, which has no `file_count` column — only
  `GET /skills/:id` returns a `files: SkillFile[]` array (joined from
  `skill_files`), and only the detail page computes a count from
  `.files.length`, not from a `fileCount` field.
- `SkillCreate`/`skillSchema` (`packages/shared/src/schemas/skill.ts`) declare
  `fileCount: z.number().int().default(0)`, but that's a Zod *parse* default —
  nothing in this handler runs data through the schema at runtime, so a real
  row missing the column stays `undefined`, not `0`.
- Pre-existing: this is the same handler and the same schema `T-WA-05` moved
  verbatim into `createSkillAction`/found already in place for the list read
  (which this task's scope does not touch — plan DD-5, writes only). Not a
  regression from the Server Action conversion.

## Impact

Cosmetic but visible on every row of a page every user sees — "NaN" reads as
broken software. No functional break (nothing depends on the count besides its
own display), no data loss.

## Resolution

*Open. Fix belongs to whichever task next touches the skills list read: either
have `GET /skills` join/aggregate a real count from `skill_files`, or stop
displaying a count on the list and reserve it for the detail page where
`files.length` is already correct.*
