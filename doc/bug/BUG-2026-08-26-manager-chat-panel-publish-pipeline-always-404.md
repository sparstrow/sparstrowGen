# BUG-2026-08-26-manager-chat-panel-publish-pipeline-always-404

**Status:** 🟢 resolved
**Reported by:** agent — `T-WA-09`'s phase-wide sweep
**Reported:** 2026-08-26

## Symptom

Publishing a pipeline drafted through a team's Manager Chat (the "Publish"
button in `ManagerChatPanel`'s draft editor) always fails with a 404. The
panel shows "Publish failed: Not Found" and nothing is created.

## Reproduction

1. Open a team, start the Manager Chat in draft mode, get it to produce a
   valid draft pipeline.
2. Click "Publish".
3. Expected: the pipeline is created and appears in the team's pipeline
   list. Actual: `POST /api/v1/pipelines` 404s — the route was deleted.

## Investigation

`T-WA-06` converted `pipelines.tsx`'s create button to
`createPipelineAction` and correctly noticed `manager-chat-panel.tsx` was a
second, real consumer of `useCreatePipeline()` — its own Result explicitly
says the hook was kept in `hooks.ts` for that reason. What it missed: keeping
the *hook* alive is not enough when the *route* underneath it is deleted.
`handlers/pipelines.ts` no longer registers `POST /pipelines` at all (only
`GET /pipelines`, `GET`/`PATCH /pipelines/:id`, `GET /pipelines/:id/runs`
survive), so the hook's own `api<Pipeline>("/pipelines", { method: "POST" })`
call has 404'd since `T-WA-06` merged — `manager-chat-panel.tsx` was never in
that task's file list, so its own verification pass never exercised this
button.

Found by `T-WA-09`'s mandated sweep
(`grep -rnE "use(Mutation|Create|Update|...)...\(\)\)" --include=*.tsx`) —
exactly the cross-cluster class of defect that sweep exists to catch (see the
task's own "Why this task exists" section, `T-M13-05`/`T-VR-06` precedent).

## Impact

Every pipeline drafted via a team's Manager Chat has been unpublishable
since `T-WA-06` merged. The equivalent manual "New pipeline" flow on
`/pipelines` itself (`createPipelineAction`, `T-WA-06`) works — this is the
one alternate entry point that didn't.

## Resolution

Fixed by `T-WA-09`: converted `manager-chat-panel.tsx`'s `handlePublish` to
`callAction(() => createPipelineAction(draftToCreatePayload(draft, teamId)))`
under a `useTransition`, matching the pattern every other WA-phase call site
uses. `useCreatePipeline()` is now deleted from `hooks.ts` — this was its
last consumer, confirmed by grep.

Not verified live by actually clicking "Publish" in Manager Chat — this was
found via the sweep and fixed via code inspection + `pnpm typecheck`/
`pnpm test`, not by reproducing the original 404 and re-clicking after the
fix. `T-WA-09`'s Vercel-preview pass covered other surfaces (Teams, Projects,
Agents) before the preview became unreliable; see its own Result section for
what that pass did and did not reach.
