# M17 — the terminal itself

| | |
|---|---|
| **Plan** | [`../../plans/2026-08-24-a-terminal-on-my-machine.md`](../../plans/2026-08-24-a-terminal-on-my-machine.md) (M17) |
| **Kind** | **serves US1–US4** — ends in a Terminals page the owner can open and use |
| **Spec** | [`../../specs/2026-08-24-a-terminal-on-my-machine.md`](../../specs/2026-08-24-a-terminal-on-my-machine.md) |
| **Depends on** | M16, entirely |
| **Blocks** | nothing |
| **Status** | not started |
| **Open questions** | none |

## The stories this serves

> **US1 — Open a shell on my machine from a browser** (P1)
>
> I open Terminals from any browser I am signed in on, press one button, and I
> am at a prompt on my machine. I type a command; it runs on that computer and
> prints back at me as it goes.

> **US2 — Come back to a session I left running** (P2)
>
> I start something long, close the tab, and come back later — from the same
> browser or a different one. My session is still there, still running, with
> what it printed while I was gone.

> **US3 — Open an interactive agent session** (P2)
>
> Instead of a bare shell, I start a session that drops me straight into one of
> my agents' command-line tools, running on my machine, and I talk to it
> directly.

> **US4 — Turn browser terminals off for a machine** (P3)
>
> On a machine's own page I can switch off its willingness to give out
> terminals, and the machine stops answering for them.

**Acceptance scenarios this phase must satisfy:** all of them, in the spec's own
words. `T-M17-06` walks them verbatim rather than paraphrased.

**Independent tests:** US1 — from a browser that is not the machine, press Shell,
type a slow-printing command, watch it arrive progressively. US2 — start
something long, close the tab, reopen in a different browser, find it running.
US3 — pick an agent, land inside its CLI. US4 — switch it off, be refused by the
machine.

## The four states

| Surface | Populated | Empty | Loading | Error |
|---|---|---|---|---|
| **Terminals** | A live shell; the machine's name above it; every live session on that machine listed with its age | Four distinct emptinesses — *never paired* (what a machine is for + pair link), *machine off* (name + last seen + retry), *machine on, no session yet* (the two buttons + one line), *terminals switched off here* (says so + link to the machine's page) | A framed pane in the terminal's own colours naming the machine being waited on | *Unreachable* (name + last-seen, Machines page wording); *not permitted*; *machine refused* (its own reason); *session ended* — distinguishing exited / closed / machine restarted / access switched off |
| **Machines → terminal access** | Toggle showing the machine's confirmed value | n/a — the card only exists for a machine that exists | The toggle's own pending state, as the WIP-snapshot one already does | The machine did not confirm the change; says so and keeps the old value |

The empty state is four states, not one. That is the single most important line
in this table: `terminals.tsx` today has one empty state saying *No terminal
attached*, which is true in all four situations and useful in none of them.

## Tasks

Run order and concurrency live in [`../MasterTaskQueue.md`](../MasterTaskQueue.md).

| Task | Tag | Serves | Depends on | Status |
|---|---|---|---|---|
| [T-M17-01 — the channel client](T-M17-01-terminal-channel-client.md) | `[S]` | foundational to this phase | M16 | done (2026-08-27) |
| [T-M17-02 — the Terminals page](T-M17-02-terminals-page.md) | `[S]` | US1, US2 | T-M17-01 | done except live shell verification (2026-08-27, `G-48`) |
| [T-M17-03 — agent terminals](T-M17-03-agent-terminals.md) | `[C]` | US3 | T-M17-02 | not started |
| [T-M17-04 — the per-machine off switch](T-M17-04-terminal-access-switch.md) | `[P]` | US4 | M16 | not started |
| [T-M17-05 — Knowledge Center](T-M17-05-knowledge-center.md) | `[P]` | all | T-M17-02 | not started |
| [T-M17-06 — verification](T-M17-06-verification.md) | `[S]` | all | T-M17-01…05 | not started |

`T-M17-03` is `[C]` rather than `[P]` because it edits `terminals.tsx`, which
`T-M17-02` writes. `T-M17-04` is `[P]` because its files — `machines.tsx` and
core's settings handling — are touched by nothing else here.

## Objective

Make Terminals work, and make every way it can fail say something true. The
transport is M16's; this phase is the surface, the states, the machine's name,
the session list, the off switch and the documentation.

## The shape of what was found

**The page is not a rewrite. It is a re-plumb plus four empty states.**
`terminals.tsx` already has the xterm setup, the fit addon, the resize observer,
the session chips and the kill button. What it does not have is any notion of
*which machine*, any list that came from the machine rather than from a cloud
query, and any empty state other than *No terminal attached*.

**Its data hooks point at the wrong thing.** `useTerminalSessions`,
`useCreateTerminalSession` and `useKillTerminalSession` in `@web/api/hooks` are
cloud queries against endpoints that do not exist. DD-5 says the machine is the
source of truth, so these are replaced by requests on the control channel — not
repointed at a new cloud route.

**`ssr: false` must stay.** `page.tsx` loads the page through `next/dynamic` with
`ssr: false` because `@xterm/addon-fit` touches `self` at module scope. Nothing in
this phase changes that, and a "cleanup" that removes it breaks the build in a
way that only shows at prerender.

**The dark terminal is deliberate and already argued.** `terminals.tsx` carries a
comment explaining that xterm's theme takes a colour string, not a CSS variable,
and that a terminal is a terminal — the same argument `DESIGN.md` §2.6 makes for
code syntax. That reasoning stands; do not "fix" it to tokens.

## Definition of done

- Every acceptance scenario in US1–US4 walked in the running app, from a browser
  on a computer that is not the machine
- All four states on Terminals, including **all four emptinesses** listed above
- All four states on the Machines terminal-access toggle
- The words "not available from the web app" appear nowhere on any terminal
  surface (SC-004)
- The Knowledge Center says what is now true, including the global-claim pages
- `pnpm typecheck` and `pnpm test` green

**Not in this phase:** project files and folder browsing (plan Scope boundaries —
they are the other spec's US1/US2, still blocked on `OQ-6`), a machine picker
beyond naming the machine and switching when more than one is on (spec
Assumptions, fourth bullet), and any cloud record of terminal activity
([`D-26`](../../Deferred.md)).

---

## Decisions already made

Plan decisions **DD-1** through **DD-9** govern this phase. Decided here:

### 1. The page asks the machine, and never caches the answer across a machine change

Session lists come from `terminal.list` on the control channel, held in React
Query keyed by **runtime id**. Switching machines is a different key, not a
refetch of the same one — a stale list from machine A rendered under machine B's
name is exactly the "whose computer is this" confusion FR-006 exists to prevent.

### 2. Which machine is chosen automatically, and shown always

If exactly one machine is online, it is used and named. If more than one is, the
most recently seen is used, named, and switchable from a plain select beside the
name. This is deliberately less than the other spec's US4 machine indicator —
naming is the honest minimum, and building a machine manager for a workspace with
one machine is what spec Assumptions rules out.

### 3. Reconnection is the page's job, and it must never accept keystrokes that go nowhere

US1.5. When the channel drops, the terminal goes read-only and says so in the
status line it already has. On recovery it re-issues `terminal.attach` for the
same session id: if the machine still has it, the ring replays and typing
resumes; if it answers `unknown_session`, the page says the session ended and why,
using the machine start time in that reply.

### 4. Refusals are rendered one sentence each, from the closed set

`TerminalRefusal` has six members and the page has six sentences. No default
branch that renders the raw token — the whole point of a closed set is that
falling through to "something went wrong" is impossible.

## Files

| Path | Change |
|---|---|
| `apps/web/src/lib/terminal-channel.ts` | new — subscribe, send, request/response with timeout |
| `apps/web/src/app/terminals/terminals.tsx` | edit — re-plumbed, four emptinesses, machine name, session list |
| `apps/web/src/app/terminals/page.tsx` | unchanged — `ssr: false` stays |
| `apps/web/src/api/hooks.ts` | edit — retire the three dead terminal hooks |
| `apps/web/src/app/machines/machines.tsx` | edit — the terminal-access toggle |
| `packages/core/src/cloud/commands.ts` | edit — accept `SETTING_TERMINAL_ACCESS`, kill sessions when it goes off |
| `apps/web/src/content/knowledge/terminals.md` | new or edit — see `T-M17-05` |
| `apps/web/src/content/knowledge/{what-is-sparstrowgen,first-run-setup,limitations,providers-and-execution-modes}.md` | edit — the four global-claim pages |

## Traps

**`useTerminalSessions` and friends look like they work.** They are typed, they
compile, and they return an empty array rather than throwing. Repointing them at
a new cloud route would produce a page that looks right and disagrees with the
machine the moment anything changes — DD-5. Delete them.

**The four emptinesses are distinguishable only if you have all four facts.** Is
any machine paired? Is one online? Does it allow terminals? Are there sessions?
The page needs all four before it can pick a state, and three of them come from
different places. Resolve them up front rather than nesting conditionals as each
query resolves, or the page flashes through the wrong empty state on every load.

**Two tabs on one session is the normal case now, not an edge case.** Sessions
outlive tabs, so reopening Terminals in a second tab attaches a second sink to a
live session. Both must work and both must see each other's typing — the manager
already supports multiple sinks; the page must not assume it owns the session.

**A resize from a second tab resizes the shell for everyone.** That is how a PTY
works and it is not a bug, but the page should not fight it by re-resizing on
every observer fire — that produces two tabs oscillating between geometries.
Resize on attach and on genuine container change only.

**Do not remove `ssr: false`.** It breaks at prerender, not at typecheck.

## Verification

1. Every US1–US4 acceptance scenario, walked verbatim in the app.
2. All four emptinesses on Terminals, reached deliberately.
3. Every refusal sentence rendered, none falling through to a generic error.
4. SC-001's echo latency, measured as a number.
5. SC-004: the forbidden sentence appears nowhere.
6. SC-007: the machine refuses when switched off, not the page hiding a button.

Full procedure in [T-M17-06 — verification](T-M17-06-verification.md).
