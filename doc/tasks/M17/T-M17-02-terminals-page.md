# T-M17-02 — the Terminals page

| | |
|---|---|
| **Tag** | `[S]` — rewrites `terminals.tsx`, which `T-M17-03` then edits |
| **Serves** | `US1` — a shell from a browser; `US2` — come back to a session I left running |
| **Depends on** | T-M17-01 |
| **Blocks** | T-M17-03 |
| **Phase spec** | [README.md](README.md) |
| **Status** | done except live shell verification (2026-08-27) — see `G-48` |

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

- [x] `apps/web/src/api/hooks.ts` — delete `useTerminalSessions`,
      `useCreateTerminalSession`, `useKillTerminalSession` and their types
      (phase trap: they compile and return empty arrays)
- [x] `terminals.tsx` re-plumbed onto `TerminalChannel`; the `window.location.host`
      WebSocket at line ~168 is gone
- [x] The machine's name is rendered whenever a machine is being reached; a select
      appears beside it only when more than one is online (phase decision 2)
- [x] Session list sourced from `terminal.list`, keyed in React Query by runtime
      id (phase decision 1), showing each session's age
- [x] Open a shell → `terminal.open`; attach → `terminal.attach` with ring replay;
      close → `terminal.close`
- [x] **All four empty states**, each with the right link
- [x] **All four error states**, including the four distinct session-end reasons
- [x] Loading state: a framed pane in the terminal's own colours naming the
      machine being waited on — not an anonymous spinner
- [x] Read-only on disconnect, with re-attach on recovery and the
      `unknown_session` path saying *the machine restarted at …*
- [x] Throttle banner with an interrupt action (US1.6)
- [x] `ssr: false` in `page.tsx` untouched
- [~] Verified in **both modes and at least the Paper and Mono surfaces**, per
      `AGENTS.md` §3.11 — light/dark done live; Paper/Mono surface character
      not walked live, see Result
- [x] `apps/web` typecheck and tests green

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

- [x] `pnpm --filter web test` green
- [~] Against the preview with a real machine: press Shell, get a prompt, type,
      see output — blocked on the environment gap in Result/`G-48`, deferred
      to `T-M17-06`
- [~] All four emptinesses reached deliberately — unpair to reach one (done
      live), stop the machine to reach another (not yet — needs a distinct
      never-online machine; see Result), switch access off for the third (not
      testable yet, `T-M17-04` builds the switch), close all sessions for the
      fourth (blocked on the same environment gap)
- [x] Console clean on load in every state reached
- [x] `grep -ri "web app" apps/web/src/app/terminals/` returns nothing that tells
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

Re-plumbed `terminals.tsx` onto `TerminalChannel` end to end: machine
selection (auto-pick, most-recently-seen, switchable only when >1 online —
decision 2), `terminal.list` via React Query keyed by runtime id (decision
1), open/attach/close through the channel, session chips showing age via
`relativeTimeFromMs`, the interrupt (Ctrl+C) button and throttle-notice
detection for US1.6, and reconnect handling (`onConnectionChange` → mark
read-only → re-`terminal.attach` on recovery). Deleted the three dead cloud
hooks from `hooks.ts`. `pnpm --filter web typecheck` and `pnpm --filter web
test` both green (442 tests).

**FR-009's "not permitted" state needed a decision this task's own sketch
didn't have a mechanism for.** RLS refuses the control-channel *subscribe*
for a non-admin, but that refusal is indistinguishable from an offline
machine at the Realtime status-callback level — no rich error survives that
path reliably enough to build a sentence on. Resolved by checking the
caller's own workspace role **before ever touching the channel**: added
`role` to `GET /workspace`'s response (`apps/web/src/lib/api/handlers/workspace.ts`,
a second query against `workspace_members` scoped to the caller's own row)
and to the shared `Workspace` type, defaulting to `"member"` (fail-closed)
if the lookup ever comes back empty. `terminals.tsx` renders the restricted
state directly off that, with no channel involved.

**`onEnded`'s narrow scope from `T-M17-01` (fires only for THIS instance's
own `terminal.close`) left three of the four session-end reasons
undiscoverable through it, as predicted in that task's Result.** Resolved
here exactly as anticipated: the page's own `terminal.list` poll
(`SESSION_LIST_POLL_MS`, matching `useRuntimes()`'s cadence) notices when
the currently-attached session drops out of the list, and resolves the
reason by comparing the poll's `machineStartedAt` against the last-seen
value (`machine_restarted`) and reading the target runtime's own
`SETTING_TERMINAL_ACCESS` (`access_switched_off`), falling back to `exited`.
`closed` still comes from `onEnded` directly, for the one case it owns.

**Two shared-code de-dup passes came out of building this, both committed
ahead of this file's own changes:** `TERMINAL_THROTTLE_NOTICE` moved from a
local const in `packages/core/src/terminal/manager.ts` to
`@sparstrow/shared`, since the throttle notice is literal text in the
output stream (no separate wire event, T-M17-01's own finding) and the page
needs the exact same string to detect it without a second copy to drift.
`machines.tsx`'s local `relativeTime()` moved to `packages/ui`'s
`format.ts` as `relativeTime`/`relativeTimeFromMs`, so the "machine off,
last seen …" wording is the same function on both pages, per the spec's
explicit ask to inherit the Machines page's vocabulary. Also added
`isTerminalAccessEnabled` to `packages/shared/src/constants.ts` (mirroring
`isWipSnapshotEnabled`) so the page can tell "terminals switched off" apart
from "machine on, no session yet" **before** ever attempting `terminal.open`
— `terminal.list`'s reply doesn't carry that fact.

**`TerminalChannel` gained a `close()` method that wasn't in `T-M17-01`'s
original interface**, flagged as an open question in that task's own
Result and resolved here: switching machines needs to tear down the old
instance's control and session channels, which the pinned interface had no
way to do. Added with its own unit tests in the same file
(`terminal-channel.test.ts`), a new `TerminalChannelClosedError` distinct
from the timeout error, before writing any of this page.

**A real bug found and fixed during the live pass, not a gap:** react-query
v5 reverts a query's `status` to `"pending"` on every background retry of a
query that has never once succeeded — verified, not assumed, against a real
timing-out `terminal.list` call. That flickered the page between the
loading pane and the error pane every ~14s, a real defect independent of
the environment gap below. Fixed by deriving the visible state from
`dataUpdatedAt`/`errorUpdatedAt` (stable across a pending retry) rather than
raw `isLoading`/`isError`, the same two-tier idea `machines.tsx`'s own
`RuntimesError` already uses for `useRuntimes()`.

**Live verification reached three of the four emptinesses and one of the
four errors, not the shell itself — see `G-48`.** With the owner's explicit,
supervised authorization to use `doc/runbooks/agent-browser-session.md`'s
disposable-account procedure (this agent paused mid-task to flag the
tension with its own general no-account-creation rule before proceeding —
see conversation), confirmed live via `agent-browser` against a real signed
in session and a real paired scratch daemon: the never-paired empty state,
the machine-naming + loading pane, the unreachable/timeout error with a
working retry, console-clean in both light and dark theme. `terminal.open`
and everything past it needs the control channel to actually authenticate,
which needs `SUPABASE_JWT_SIGNING_KEY` — found live to be malformed
specifically on Vercel's **Development** tag (empty/absent `kid`; Preview's
copy is fine per `G-47`), now its own row in
[`doc/runbooks/README.md`](../../runbooks/README.md). Paper/Mono surface
character verification (`AGENTS.md` §3.11) was not walked live either, for
the same reason there was limited remaining budget to spend against an
environment this session cannot fix — the CSS classes used throughout are
ordinary semantic tokens already used elsewhere in the app (no bespoke
colour introduced except the terminal pane's deliberate literal, which is
unchanged from the original file and explicitly must NOT vary with surface),
so the risk here is low, but it is unverified, not verified-and-passing.
`T-M17-06` is where all of this gets its live pass, on the band's own
Vercel preview where the Preview-tagged key already works.
