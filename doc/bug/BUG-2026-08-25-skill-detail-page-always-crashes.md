# BUG-2026-08-25-skill-detail-page-always-crashes

**Status:** 🟢 resolved
**Reported by:** agent — found while verifying `T-WA-05`'s Server Action conversion live
**Reported:** 2026-08-25

## Symptom

Opening any skill's detail page (`/skills/<id>`) crashes with a full-screen
runtime error overlay: `Runtime TypeError: Cannot read properties of
undefined (reading 'map')`, at `SkillDetailPage.useMemo[tree]`
(`apps/web/src/app/skills/[skillId]/skill-detail.tsx:160`,
`skill.files.map((f) => f.path)`).

## Reproduction

1. Sign in, create or open any skill from `/skills`.
2. Click the skill's name/link to open `/skills/<id>`.
3. The page never renders — Next.js's error overlay shows the `TypeError`
   above immediately on mount.

Reproduced live 2026-08-25 against a freshly created skill (a fresh workspace,
so not data-dependent — every skill hits this).

## Investigation

`GET /skills/:id` (`apps/web/src/lib/api/handlers/skills.ts`) does a plain
`select("*")` on `skills` and returns the raw row — it never joins
`skill_files` or adds a `files` field. `SkillDetail`
(`packages/shared/src/schemas/skill.ts`) types the response as `skillSchema &
{ files: SkillFile[] }`, and `skill-detail.tsx` unconditionally calls
`skill.files.map(...)` to build the file tree. Since the handler never
populates `files`, `skill.files` is `undefined` for every skill, and the page
crashes on first render, every time.

Confirmed via `git log`/`git show` against `apps/web/src/lib/api/handlers/skills.ts`
that this handler is unchanged since `#80` ("M3 complete") — this predates
`T-WA-05` and is not a regression from that task's write-only conversion
(plan DD-5 leaves this GET handler untouched). `T-WA-05`'s own converted
writes on this page (`updateSkillAction` for the enabled toggle,
`deleteSkillAction`) could not be exercised live through the UI because the
page never successfully mounts to reach them — see `T-WA-05`'s task file for
what was verified instead (its list-page equivalents, which share the same
action code).

## Impact

**High for a page that exists in the product** — every skill's detail page is
completely unusable; anyone who clicks into a skill from the list gets a
crash screen instead of content. Given the crash is unconditional (not
data-dependent), this has likely been broken since the skill detail page was
first built and gone unnoticed because nothing has walked this specific route
live until now.

## Resolution

*Open. Fix: have `GET /skills/:id` join `skill_files` (matching the
`skillDetailSchema`'s shape) and return `files: [...]`, or compute it however
the original design intended. Whichever task next touches skill reads should
close this before touching anything else on the page — trying to build new
features on top of a page that crashes on mount is not productive.*
