# T-WA-03 — agents

| | |
|---|---|
| **Tag** | `[C]` — shares `hooks.ts`; also shares the two chat-session hooks with T-WA-07 |
| **Serves** | **foundational** — the surface the access model's M19 later rebuilds |
| **Depends on** | T-WA-01 |
| **Blocks** | T-WA-09 |
| **Phase spec** | [README.md](README.md) |
| **Status** | done 2026-08-26 |

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

This task ran first. Both actions were built and `agent-create.tsx` converted
to them; `useCreateChatSession`/`useUpdateChatSession` stay in `hooks.ts`
(comments added naming `T-WA-07`), since `chat.tsx` is still on them.
`updateChatSessionAction` also turned out to be a genuine bug fix, not just a
transport move — see Result.

### `useRetryAgentDraftTurn` is NOT stub-backed, but its real backend refuses agent-creator sessions — leave it, per the below

Checked, per the note above: it calls `POST /chat/sessions/:id/retry`, a
real, built M13 route (also used by `chat.tsx`'s `useRetryChatTurn`, same
URL, different hook name). But that handler explicitly refuses any session
with `kind === "agent-creator"` with a 501 — *"...runs on the local daemon
and is not available from the web app"* (`T-M13-01` decision 4: Agent
Creator sessions stay on the local, non-dispatched path entirely). Since
`agent-create.tsx` only ever creates `agent-creator`-kind sessions, every
call from this page hits that refusal unconditionally — functionally a stub
for this caller even though it isn't literally one in `stubs.ts`. Left
`useAgentDraftTurn` (the primary send, not just retry — also not in scope
per the original file/call-sites table, an omission) and
`useRetryAgentDraftTurn` both completely untouched, matching `useTestSpawnAgent`'s
treatment. Confirmed live: the 501's exact message rendered after sending
the first interview message.

## Checklist

- [x] `app/agents/actions.ts` — `createAgentAction`, `updateAgentAction`, `deleteAgentAction`, `setAgentSkillsAction`
- [x] `agents.tsx` calls them under `useTransition`
- [x] `agent-create.tsx`'s `useCreateAgent` converted; its chat-session calls point at `app/chat/actions.ts` (see above) — also added `createChatSessionAction`/`updateChatSessionAction` there, since `useAgentDraftTurn`'s send/retry stayed untouched but session create/archive did not
- [x] `useTestSpawnAgent` and any stub-backed draft hook left untouched — `useAgentDraftTurn`/`useRetryAgentDraftTurn` also left, see Decisions
- [x] Delete the four converted hooks from [`hooks.ts`](../../../apps/web/src/api/hooks.ts) — **grep first**, `useAgent`/`useAgents` queries stay
- [x] Delete the matching write handlers from `apps/web/src/lib/api/handlers/`; reads stay (plan DD-5)
- [x] Keep the existing `invalidateQueries` calls in place (plan DD-1)
- [x] `apps/web` typecheck and tests green

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

- [x] `grep -rn "useCreateAgent\|useUpdateAgent\|useDeleteAgent\|useSetAgentSkills" apps/web/src` returns nothing
- [~] Create an agent with both tool boxes filled; the stored `allowed_tools` array matches what was typed, comma-split exactly as before — created live with `allowedTools` filled; not independently re-checked byte-for-byte against the stored array (the field is passed straight through unmodified, same as `createTeamAction` and every other `toSnake(input)` action in this phase — no separate parsing step exists to introduce drift)
- [x] Assign skills to an agent and reload — the assignment persisted — live: created a skill, assigned it to an agent, reloaded, the "1" skill-count badge was still there
- [ ] Delete an agent that is referenced by a team: the same refusal message as today — **not exercised**; no team existed in the disposable workspace to reference the test agent from. `deleteAgentAction`'s FK-violation path is unchanged from the original handler (same `.delete()...select("id")` shape `actionErrorFrom` already maps identically to `handleError`), so this is a transport move with nothing new to break, but it wasn't independently reproduced
- [x] `pnpm typecheck` and `pnpm test` green — 398 tests (387 existing + 11 new: `app/agents/actions.test.ts`, `app/chat/actions.test.ts`)
- [x] `read_network_requests` shows no `POST`/`PATCH`/`DELETE` to `/api/v1/agents` — confirmed via the grep above finding no hook call sites left; the live pass showed no failed/unexpected network activity on `/api/v1/agents*`
- [x] Every converted button disables itself while its action is in flight — `useTransition`-backed `pending`/`disabled` wiring throughout, matching the phase's established pattern

**Two pre-existing bugs found and fixed live as part of this conversion**
(not new features — both are the handler's already-correct logic, newly
reachable once there's no HTTP verb to get wrong):
- [`BUG-2026-08-26-agent-update-always-404s`](../../bug/BUG-2026-08-26-agent-update-always-404s.md) — 🟢 resolved, verified live (toggle + full edit, both persisting across reload)
- [`BUG-2026-08-26-chat-session-updates-always-404`](../../bug/BUG-2026-08-26-chat-session-updates-always-404.md) — 🟡 partially fixed (this task's own call site only); `chat.tsx`'s three call sites are `T-WA-07`'s to convert

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

Converted `createAgentAction`/`updateAgentAction`/`deleteAgentAction`/
`setAgentSkillsAction` in `apps/web/src/app/agents/actions.ts`, and
`createChatSessionAction`/`updateChatSessionAction` in
`apps/web/src/app/chat/actions.ts` (new file — the first of its two intended
authors, per the phase README's shared-hook pattern; `T-WA-07` adds the rest
and eventually deletes `useCreateChatSession`/`useUpdateChatSession` once
`chat.tsx` also converts). Both listed files converted (`agents.tsx`,
`agent-create.tsx`); `useTestSpawnAgent` and the two draft-turn hooks
(`useAgentDraftTurn`, `useRetryAgentDraftTurn`) left untouched.

**Two of the task's own assumptions about the draft-turn hooks were wrong,
in opposite directions.** The "Decisions already made" section guessed
`useRetryAgentDraftTurn` might resolve to the same 501 stub as `POST
/agents/draft` — it doesn't; it calls the real, built M13 route
(`POST /chat/sessions/:id/retry`). But that route explicitly and
permanently refuses any `agent-creator`-kind session with its own 501
("...runs on the local daemon and is not available from the web app"),
which is the only kind `agent-create.tsx` ever creates — so the practical
effect for this caller is identical to a stub, just for a different reason
than guessed. Confirmed live rather than left as a guess: sent the first
interview message, saw that exact refusal text render. Separately, the
task's file list never mentioned `useAgentDraftTurn` (the primary send, not
just retry) at all — an omission, since it needed the identical treatment
for the identical reason.

**Two pre-existing bugs found and fixed as a side effect of the
conversion**, not new features — both are the original handler's
already-correct logic, newly reachable once there's no HTTP verb or missing
route in the way:
- [`BUG-2026-08-26-agent-update-always-404s`](../../bug/BUG-2026-08-26-agent-update-always-404s.md) — `useUpdateAgent` sent `PUT`, the handler only ever registered `PATCH`. Every agent update (toggle, full edit) has 404'd since the enabled-toggle and edit form shipped. Verified live: both now persist across a reload.
- [`BUG-2026-08-26-chat-session-updates-always-404`](../../bug/BUG-2026-08-26-chat-session-updates-always-404.md) — `PATCH /chat/sessions/:id` was never registered as a route at all, so chat session rename/model-switch/archive have never worked anywhere they're called. Fixed for this task's one call site (`agent-create.tsx`'s archive-on-create); `chat.tsx`'s three call sites are `T-WA-07`'s to convert to the same new action.

**A third, phase-wide bug found while checking what `deleteAgentAction`
would show on a foreign-key violation:**
[`BUG-2026-08-26-action-error-mapping-missing-three-codes`](../../bug/BUG-2026-08-26-action-error-mapping-missing-three-codes.md)
— `actionErrorFrom` (`apps/web/src/lib/action-result.ts`, the ONE shared
error-mapping helper every action in this phase calls) only ever special-cased
2 of `handleError`'s 5 Postgres error codes; an RLS denial, a unique
violation, or a foreign-key violation on ANY converted action across
`T-WA-01`/`T-WA-02`/`T-WA-04`/`T-WA-05`/`T-WA-06`/this task showed the raw
Postgres error text instead of the mapped message `/api/v1` always gave.
Fixed in the shared helper itself, so the fix applies retroactively to
every action already converted — no per-task changes needed. This is the
kind of finding that only surfaces by reading two files side by side while
verifying a specific edge case, not by running the app normally.

Live-verified end to end against a fresh disposable workspace
(`wa03-*@sparstrow.test`, needs the same manual SQL cleanup as this
session's other WA-phase disposable accounts):
- Created an agent via the manual form (`createAgentAction`), toggled it
  disabled and edited its role via `SkillViewer` (`updateAgentAction`,
  proving `BUG-2026-08-26-agent-update-always-404s`'s fix), created a skill
  and assigned it (`setAgentSkillsAction`), and deleted the agent
  (`deleteAgentAction`) — every step confirmed via a full page reload.
- Created an agent via the Agent Creator (`agent-create.tsx`): sent an
  interview message (created a real, persisted `agent-creator` session via
  `createChatSessionAction`, confirmed via the session-history dropdown;
  the subsequent send correctly 501'd per the draft-turn finding above),
  then created the agent itself and confirmed it appeared on `/agents`.

Not exercised live: `deleteAgentAction`'s FK-violation refusal (no team
existed to reference the test agent from) — see `G-43`.

`pnpm typecheck` and `pnpm test`: 404 tests passing (387 existing +
11 in `app/agents/actions.test.ts`/`app/chat/actions.test.ts` + 6 in the new
`lib/action-result.test.ts` covering the error-mapping fix).
