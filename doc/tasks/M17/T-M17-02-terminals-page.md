# T-M17-02 — the Terminals page

| | |
|---|---|
| **Tag** | `[S]` — rewrites `terminals.tsx`, which `T-M17-03` then edits |
| **Serves** | `US1` — a shell from a browser; `US2` — come back to a session I left running |
| **Depends on** | T-M17-01 |
| **Blocks** | T-M17-03 |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

## The scenarios this satisfies

**US1**, all six, and **US2**, all five, from
[the spec](../../specs/2026-08-24-a-terminal-on-my-machine.md). `T-M17-06` walks
them verbatim; they are not paraphrased here.

## Objective

Re-plumb the existing page onto the channel client, give it the machine's name,
source its session list from the machine, and build the four distinct empty
states and the four distinct error states the spec asks for.

## Decisions already made

Phase decisions 1–4 govern this task. **Read the phase README's "shape of what
was found" first** — the xterm setup, fit addon, resize observer and session
chips already exist and are kept.

**Resolve all four facts before rendering anything.** Phase trap: *is any machine
paired / is one online / does it allow terminals / are there sessions*. Three come
from different places. A single up-front resolution picks one of the four
emptinesses; nesting conditionals as queries resolve makes the page flash through
the wrong one on every load.

**The status line already exists and gains the reconnection story.** The
`connecting | connected | closed` chip in `XtermView` is the right place for
phase decision 3: on disconnect the terminal goes read-only and the chip says so;
on recovery it re-issues `terminal.attach`.

**Session chips gain an age and lose their cloud origin.** They render
`TerminalSessionInfo` from the machine — id, agent name, age, whether anything
else is attached. FR-005 is satisfied by the list being the machine's, not this
tab's.

**Six refusal sentences, one per `TerminalRefusal`, no default branch.** Phase
decision 4. Write them as a `Record<TerminalRefusal, string>` so the compiler
fails when a seventh member is added rather than falling through at runtime.

**`terminal_access_disabled` links to that machine's page**; the unreachable
state links to Machines; the never-paired state links to the pairing flow. The
spec's dead end to avoid is an instruction with no link attached.

## Checklist

- [ ] `apps/web/src/api/hooks.ts` — delete `useTerminalSessions`,
      `useCreateTerminalSession`, `useKillTerminalSession` and their types
      (phase trap: they compile and return empty arrays)
- [ ] `terminals.tsx` re-plumbed onto `TerminalChannel`; the `window.location.host`
      WebSocket at line ~168 is gone
- [ ] The machine's name is rendered whenever a machine is being reached; a select
      appears beside it only when more than one is online (phase decision 2)
- [ ] Session list sourced from `terminal.list`, keyed in React Query by runtime
      id (phase decision 1), showing each session's age
- [ ] Open a shell → `terminal.open`; attach → `terminal.attach` with ring replay;
      close → `terminal.close`
- [ ] **All four empty states**, each with the right link
- [ ] **All four error states**, including the four distinct session-end reasons
- [ ] Loading state: a framed pane in the terminal's own colours naming the
      machine being waited on — not an anonymous spinner
- [ ] Read-only on disconnect, with re-attach on recovery and the
      `unknown_session` path saying *the machine restarted at …*
- [ ] Throttle banner with an interrupt action (US1.6)
- [ ] `ssr: false` in `page.tsx` untouched
- [ ] Verified in **both modes and at least the Paper and Mono surfaces**, per
      `AGENTS.md` §3.11
- [ ] `apps/web` typecheck and tests green

## Traps

**The empty state that exists today is a lie in three of the four cases.** *No
terminal attached* is rendered when no machine is paired, when the machine is
off, and when terminals are switched off. Replacing it with one better sentence
is not the ask; four states is.

**Two tabs on one session is now normal.** Sessions outlive tabs. The page must
not assume it owns a session or that its own `close` is the only way one ends.

**Do not re-resize on every ResizeObserver fire.** With two tabs attached, that
produces oscillating geometry. Resize on attach and on genuine container change.

**Do not tokenize the terminal's colours.** The existing comment explains why
xterm's theme is a literal and deliberately dark in both modes, citing
`DESIGN.md` §2.6. That reasoning stands.

**A refusal is not a timeout.** `T-M17-01` keeps them distinct; the page must
render them as different sentences, or FR-007's distinction dies here after
surviving everywhere else.

## Verification

- [ ] `pnpm --filter @sparstrow/web test` green
- [ ] Against the preview with a real machine: press Shell, get a prompt, type,
      see output
- [ ] All four emptinesses reached deliberately — unpair to reach one, stop the
      machine to reach another, switch access off for the third, close all
      sessions for the fourth
- [ ] Console clean on load in every one of those states
- [ ] `grep -ri "web app" apps/web/src/app/terminals/` returns nothing that tells
      the owner a feature is unavailable (SC-004, this page's half)

The full walk is [`T-M17-06`](T-M17-06-verification.md).

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
