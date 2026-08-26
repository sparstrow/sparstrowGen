# BUG-2026-08-26-agent-update-always-404s

**Status:** 🟢 resolved
**Reported by:** agent — converting `T-WA-03`'s `agents.tsx`/`agent-create.tsx` writes to Server Actions
**Reported:** 2026-08-26

## Symptom

Every update to an existing agent silently fails with a 404: the enabled/
disabled toggle switch on the Agents list, and the full edit form in
`SkillViewer` (rename, change model, change prompt, anything). The switch
snaps back to its previous state and the edit form's error banner shows
"Not Found".

## Reproduction

1. Open `/agents`, toggle any agent's Enabled switch, or open an agent and
   edit it.
2. Expected: the change persists. Actual: `PUT /api/v1/agents/<id>` 404s —
   no such route.

## Investigation

`useUpdateAgent()` (`apps/web/src/api/hooks.ts`) sends `PUT
/agents/${id}`. `apps/web/src/lib/api/handlers/agents.ts` registers the
update route as **`PATCH /agents/:id`**, not `PUT` — the router
(`apps/web/src/lib/api/router.ts#matchRoute`) matches on exact HTTP method,
so a `PUT` never finds that route at all. The handler's own update logic
(a plain `.update(body)` against `agents` scoped to `workspace_id` + `id`)
is correct and complete; only the verb the two sides agreed on differs.

Both call sites in `agents.tsx` share the one `useUpdateAgent()` hook
instance, so this affected both the toggle and the full edit identically.

## Impact

Agents could be created but never modified afterward through the UI — no
disabling a misbehaving agent, no correcting a typo in its prompt, no model
change. High-friction for anyone managing more than a couple of agents.

## Resolution

Fixed by `T-WA-03`'s Server Action conversion: `updateAgentAction`
(`apps/web/src/app/agents/actions.ts`) calls the database directly — there
is no HTTP verb in the path to mismatch, so moving the handler's already-
correct update logic into the action fixes this as a side effect of the
conversion, not a separate change.

Verified live 2026-08-26 against a fresh disposable workspace: toggled an
agent's enabled switch off, reloaded the page — stayed off. Edited its role
field via `SkillViewer`, reloaded — the new text was there. Both persisted
across a hard reload, not just optimistic client state.
