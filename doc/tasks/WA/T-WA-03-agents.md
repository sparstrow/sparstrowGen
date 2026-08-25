# T-WA-03 — agents

| | |
|---|---|
| **Tag** | `[C]` — shares `hooks.ts`; also shares the two chat-session hooks with T-WA-07 |
| **Serves** | **foundational** — the surface the access model's M19 later rebuilds |
| **Depends on** | T-WA-01 |
| **Blocks** | T-WA-09 |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

## Objective

Convert the agent list's writes and the create flow's. This is the surface
[the access model's M19](../../plans/2026-08-24-what-an-agent-is-allowed-to-do.md)
rebuilds, so leaving it on the old pattern would mean M19 converting it as a
side effect of unrelated work.

## Files and call sites

| File | Mutation hooks it calls |
|---|---|
| [`app/agents/agents.tsx`](../../../apps/web/src/app/agents/agents.tsx) | `useCreateAgent`, `useUpdateAgent`, `useDeleteAgent`, `useSetAgentSkills`, `useTestSpawnAgent` |
| [`app/agents/create/agent-create.tsx`](../../../apps/web/src/app/agents/create/agent-create.tsx) | `useCreateAgent`, `useCreateChatSession`, `useUpdateChatSession`, `useRetryAgentDraftTurn` |

## Decisions already made

### `useTestSpawnAgent` and the draft path are stub-backed and do not convert

`POST /agents/:id/test-spawn` and `POST /agents/draft` are 501 stubs in
[`stubs.ts`](../../../apps/web/src/lib/api/handlers/stubs.ts). Plan DD-6
excludes them. `useRetryAgentDraftTurn` sits on the same draft path — check its
handler before touching it and leave it if it resolves to a stub.

### The chat-session hooks are shared with `T-WA-07`, and that task owns them

`useCreateChatSession` and `useUpdateChatSession` are called from both
`agent-create.tsx` and `chat.tsx`. **`T-WA-07` writes `app/chat/actions.ts`;
this task consumes it.** Whichever task runs second deletes the hooks.

If this task runs first, convert `agent-create.tsx`'s two call sites to import
from `app/chat/actions.ts`, create that file with just those two actions, and
leave the hooks in `hooks.ts` with a one-line comment naming `T-WA-07` as the
deleter. **This is the single most likely place in the phase for two tasks to
collide** — check the queue before starting.

## Checklist

- [ ] `app/agents/actions.ts` — `createAgentAction`, `updateAgentAction`, `deleteAgentAction`, `setAgentSkillsAction`
- [ ] `agents.tsx` calls them under `useTransition`
- [ ] `agent-create.tsx`'s `useCreateAgent` converted; its chat-session calls point at `app/chat/actions.ts` (see above)
- [ ] `useTestSpawnAgent` and any stub-backed draft hook left untouched
- [ ] Delete the four converted hooks from [`hooks.ts`](../../../apps/web/src/api/hooks.ts) — **grep first**, `useAgent`/`useAgents` queries stay
- [ ] Delete the matching write handlers from `apps/web/src/lib/api/handlers/`; reads stay (plan DD-5)
- [ ] Keep the existing `invalidateQueries` calls in place (plan DD-1)
- [ ] `apps/web` typecheck and tests green

## Traps

**`allowedTools` and `disallowedTools` are comma-split strings in this form**
([`agent-create.tsx:60`](../../../apps/web/src/app/agents/create/agent-create.tsx:60)).
The action receives whatever the form sends today. **Do not add validation.**
Flagging a mistyped tool name is `FR-005`, built by the access model's M19 with
a real catalogue behind it; a guess here would ship a validation that model then
has to unpick.

**`useCreateAgent` has two consumers in this one task.** Both files call it.
Convert both before deleting the hook.

**The shared traps in [README.md](README.md) apply** and are not repeated here.

## Verification

- [ ] `grep -rn "useCreateAgent\|useUpdateAgent\|useDeleteAgent\|useSetAgentSkills" apps/web/src` returns nothing
- [ ] Create an agent with both tool boxes filled; the stored `allowed_tools` array matches what was typed, comma-split exactly as before
- [ ] Assign skills to an agent and reload — the assignment persisted
- [ ] Delete an agent that is referenced by a team: the same refusal message as today
- [ ] `pnpm typecheck` and `pnpm test` green
- [ ] `read_network_requests` shows no `POST`/`PATCH`/`DELETE` to `/api/v1/agents`
- [ ] Every converted button disables itself while its action is in flight

## On completion

> **Do not edit [`../MasterTaskQueue.md`](../MasterTaskQueue.md) from this
> branch.** Its Status column is a mirror, flipped once per band in the commit
> that lands the band branch on `development` (`AGENTS.md` §2.9). Sibling
> tasks in this band are adjacent rows in one table, so ticking your own row
> conflicts with every one of them — including the parallel forks working
> beside you. Record this task's outcome in the **Status** row and **Result**
> section of *this* file.

- [ ] Update this file's **Status** row and the phase README's task table

## Result

*Filled in when the task lands.*
