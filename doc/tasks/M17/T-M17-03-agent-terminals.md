# T-M17-03 — agent terminals

| | |
|---|---|
| **Tag** | `[C]` — edits `terminals.tsx`, which `T-M17-02` writes; one worker at a time on that file |
| **Serves** | `US3` — open an interactive agent session |
| **Depends on** | T-M17-02 |
| **Blocks** | — |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

## The scenarios this satisfies

> 1. **Given** an enabled agent whose tool has an interactive mode, **When** I
>    start an agent session for it, **Then** I land inside that tool on my
>    machine and can interact with it.
> 2. **Given** an agent whose provider has no interactive mode, **When** I look
>    at the agent list here, **Then** it is not offered — I am not allowed to
>    pick something that will fail.

## Objective

Make the *Agent terminal* button work end to end, and stop offering agents that
cannot serve one.

## Decisions already made

**The machine already knows how to do this.**
[`routes/terminal.ts`](../../../packages/core/src/api/routes/terminal.ts) resolves
the agent, checks `provider.kind === "cli"`, calls
`provider.buildInteractiveSpawn`, and handles the `viaCmdShell` wrapping. M16's
`terminal.open` carries `agentId` into the same path. **No new spawn logic.**

**Scenario 2 is filtered in two places, on purpose.** The page filters the picker
so an unusable agent is never offered; the machine still refuses with
`agent_not_interactive` if one arrives anyway. The page filter is the experience;
the machine's refusal is the guarantee — a browser is not a place to enforce
anything.

**The picker needs a fact the cloud agent list does not carry.** Whether a
provider has an interactive mode is `provider.kind === "cli"`, which is core's
registry, not a column on the cloud `agents` row. Two ways to get it, and the
second is the one to take:

1. Add a field to the cloud agent contract — a schema change and a sync problem,
   for a fact that is a property of the *machine's* provider registry and can
   differ between machines.
2. **Ask the machine.** `terminal.list`'s reply already carries machine facts;
   extend it with the set of provider kinds this machine can serve
   interactively, and filter the picker against the machine currently selected.

Option 2 also gets scenario 2 right when two machines disagree, which option 1
cannot. It is a small addition to `T-M16-01`'s `terminal.list` reply — **if
`T-M16-01` has already landed, this is a contract change and needs its own
follow-up**; flag it rather than widening the schema quietly.

**An agent session is a session.** Everything US2 gives a shell — surviving the
tab, appearing in the list, replaying its ring — it gives an agent session, with
no special-casing. The session chip shows the agent's name where a shell shows
"shell", which the existing `agentName()` helper already does.

## Checklist

- [ ] `terminal.list`'s reply carries the machine's interactive-capable provider
      kinds (coordinate with `T-M16-01` if it has landed)
- [ ] The agent picker is filtered to enabled agents whose provider that machine
      can serve interactively
- [ ] *Agent terminal* issues `terminal.open` with `agentId`
- [ ] `agent_not_interactive` and `agent_not_found` render their own sentences
      from `T-M17-02`'s map — they are already two of the six
- [ ] An agent session appears in the session list with the agent's name and
      behaves exactly as a shell session does for US2
- [ ] The picker's own empty state: no enabled agent can serve one on this
      machine, said in those words rather than an empty dropdown
- [ ] `apps/web` typecheck and tests green

## Traps

**`buildInteractiveSpawn`'s `viaCmdShell` path is Windows-shaped and already
correct.** It wraps the command in `cmd.exe /d /s /c`. Do not touch it from the
browser side and do not reimplement the decision — the machine owns it.

**The agent id in a session is the *machine's* agent id.** `terminals.tsx`
already resolves it against the cloud agent list and falls back to `shortId()`
when it misses. `T-M16-01`'s `TerminalSessionInfo` carries the name for exactly
this reason — use it, and let the cloud lookup go.

**An empty dropdown is an empty state.** If no agent on this machine can serve an
interactive session, say so. A picker with no options and a button that does
nothing is the failure shape this whole spec exists to remove.

## Verification

- [ ] Against the preview with a real machine: pick a `claude-code` agent, press
      *Agent terminal*, land inside the CLI, have an exchange with it
- [ ] An agent whose provider is direct-API is **not** in the picker
- [ ] Forcing `terminal.open` with such an agent's id from the console is refused
      `agent_not_interactive` — the machine's guarantee, not the page's filter
- [ ] An agent session survives closing the tab and is reattachable, same as a
      shell

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

*(filled in when the task lands)*
