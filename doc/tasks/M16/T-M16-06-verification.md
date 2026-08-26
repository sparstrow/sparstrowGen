# T-M16-06 — Verification

| | |
|---|---|
| **Tag** | `[S]` sequential — needs all of M16 in place |
| **Depends on** | T-M16-01 … T-M16-05 |
| **Blocks** | M17 |
| **Phase spec** | [README.md](README.md) |
| **Status** | ⏸ deferred — see [`KnownGaps.md`](../../KnownGaps.md) G-47 (2026-08-26) |

## Objective

Prove that a browser-side client and a real paired machine can hold a live,
authenticated, two-way conversation, and that the policies refuse everyone who
should be refused. M16 is foundational: there is no page to click, so this pass
drives the channels from a script.

**What this pass cannot reach, named up front:**

- **The two-member role check, live.** FR-009 says owner/admin only. Asserting
  that in a running browser needs a second account in the same workspace, which
  does not exist — the same limitation `G-15` and `G-24` already record. §D
  asserts it in SQL against a synthetic session instead, which is real evidence
  but weaker evidence, and §D says which is which. If the SQL assertions pass and
  the live one is not run, **open a `KnownGaps.md` entry in this same change**
  following `G-24`'s shape.
- **Latency as a number.** SC-001's 200 ms is measured in a browser against a
  real machine, which is `T-M17-06`'s pass. This one only asserts that bytes flow
  and that they flow progressively.

## A — The wire works

Run against the **feature branch's own Vercel preview** with a real machine
paired to it, per `AGENTS.md` §2 rule 3. Not `development.sparstrow.com`.

- [ ] `POST /api/daemon/realtime/token` with the machine's real daemon token
      returns a credential, and Realtime **accepts** it — the daemon's log shows
      a subscribed control channel, not a refused one
- [ ] From a script signed in as the workspace owner: a `terminal.list` request
      on `machine:<ws>:<runtime>` is answered, with the machine's start time
- [ ] `terminal.open` with no `agentId` returns a session, and a shell is running
      on the machine — confirmed by looking at the machine's process list, not
      only by the reply
- [ ] An `input` message carrying `echo hello\r` produces `hello` back on the
      session topic
- [ ] A command printing for 10 seconds arrives in **more than one** output
      message — this is SC-002's mechanism, proved here at the wire and again in
      the browser at `T-M17-06`
- [ ] `terminal.close` ends the session, and the process is gone from the
      machine
- [ ] A request for a session id that does not exist is answered with
      `unknown_session` **and the machine's start time** — the reply the page
      needs to say *the machine restarted at …*

## B — The connection looks after itself

- [ ] With a short TTL forced, the credential refreshes and the connection stays
      up across the refresh — no re-subscribe, no dropped session
- [ ] Network dropped for 60 s: exactly **one** connectivity-edge warning in the
      log, and the connection returns unattended
- [ ] Network dropped for longer than the credential's TTL: core re-mints before
      reconnecting rather than retrying with an expired token
- [ ] Core restarted with the machine unpaired: no connection attempted, no
      error, and dispatched work still runs — the "unpaired is normal" rule
- [ ] Pairing revoked while connected: core stops, logs the existing re-pair
      guidance, and does not retry

## C — Nothing else moved

- [ ] The local `/ws/terminal/:id` route still works from a browser pointed at
      the machine directly — DD-6's regression check
- [ ] Run transcripts still stream on `run:<ws>:<run>` and chat replies still
      stream on `chat:<ws>:<session>`. **This is the check that catches a
      malformed daemon credential**: if a `sub` claim slipped in, these break
      before terminals does
- [x] `pnpm typecheck` and `pnpm test` green across the monorepo

## D — The policies refuse the right people

Both directions, both topic families. SQL-level assertions, run against the
preview's project.

- [ ] An admin of workspace A: **can** select and **can** insert an `input` event
      on `terminal:<A>:x`
- [ ] The same admin: **cannot** insert an `output` event on the same topic — the
      event pin from `T-M16-03`
- [ ] A `member`-role user of workspace A: **cannot** select and **cannot**
      insert on `terminal:<A>:x` or `machine:<A>:y`
- [ ] An admin of workspace B: **cannot** select or insert on either of A's topics
- [ ] `terminal_channel_admin_send` does not grant anything on a `run:` or
      `chat:` topic
- [ ] `select policyname, cmd from pg_policies where schemaname = 'realtime'`
      returns exactly six rows, and **none of them is an INSERT policy on a
      `run:` or `chat:` topic** — `010`'s instruction is still honoured

**Evidence strength.** These are SQL assertions against synthetic sessions, not a
second human signing in. Say so in Result, and open the gap entry named in the
Objective if the live walk is not also done.

## E — The lifetime change behaves

- [ ] A session with every sink detached is still alive after 15 minutes, and
      replays its scrollback on reattach — past the old 10-minute grace
- [ ] The eleventh concurrent session is refused with `session_limit_reached`
- [ ] `yes` in a session: the throttle notice arrives, the machine's memory does
      not grow without bound, Ctrl-C recovers it, and the **scrollback after
      recovery is complete** — the ring kept filling while throttled
- [ ] A session whose shell exits is closed with `"exited"` and disappears from
      `terminal.list`
- [ ] `SETTING_TERMINAL_ACCESS=false` on the machine: `terminal.open` is answered
      `terminal_access_disabled`, and existing sessions are killed

## On completion

> **Do not edit [`../MasterTaskQueue.md`](../MasterTaskQueue.md) from this
> branch.** Its Status column is a mirror, flipped once per band in the commit
> that lands the band branch on `development` (`AGENTS.md` §2.9). Sibling
> tasks in this band are adjacent rows in one table, so ticking your own row
> conflicts with every one of them — including the parallel forks working
> beside you. Record this task's outcome in the **Status** row and **Result**
> section of *this* file.

- [x] Update this file's **Status** row and the phase README's
- [x] `KnownGaps.md` entry for §D's live half if it was not run, and for anything
      else ticked on weaker evidence than it asked for
- [x] Update the plan's **Status** row to *In progress — M17 next*
- [x] File any bug or security issue found, in the same turn, per `AGENTS.md` §5
      — none found

## Result

**Named exactly, not "verified":** what actually ran this pass was
`pnpm typecheck` and `pnpm test` across the whole monorepo (green — 87 core
test files / 745 tests, 39 web test files / 417 tests, 16 shared test files
/ 313 tests, all reported in `T-M16-01`–`T-M16-05`'s own Results) plus a
re-read of every unit suite those five tasks wrote, confirming each one
actually exercises the behavior its own task claims rather than merely
existing. No bug or security issue was found while doing that.

**Everything else in §A, §B, §D, and the live-shell half of §E was not run**,
each for a specific, named reason — full account in
[`KnownGaps.md`](../../KnownGaps.md) **G-47**, opened in this same change per
this task's own Objective section (which flagged §D's live half as the
likely gap in advance) and per the completion checklist above:

- §A/§B need `SUPABASE_JWT_SIGNING_KEY` set on a real deployment (the owner
  action `T-M16-02` already added to `runbooks/README.md`) and a real
  machine paired against it. Neither exists yet.
- §D needs either a disposable local Postgres container (this repo's own
  house style for exactly this, per `verify-rls.sh`/`verify-command-spine.mjs`
  — Docker was not running in this environment and did not come up within
  this session) or fabricating synthetic auth/membership rows directly
  against the real project, which was deliberately not done given the
  smaller, safer alternative this repo already has a pattern for.
- §E's four points needing a live shell or a real 15-minute wait have strong
  proxy evidence instead — the identical code paths are driven directly in
  `manager.test.ts` with a fake PTY and fake timers, described task-by-task
  in `T-M16-05`'s own Result.

**This band is not being held for the gap.** Per this project's established
precedent (`G-13`, `G-15`, `G-24` — M5, M6 and M8 all merged with their own
verification tasks deferred the same way), a documented, honestly-scoped gap
is what lets the band move rather than what blocks it. M17 depends on M16's
*build* being done, not on this live pass — see the phase README and the
plan's Status row, both updated in this change.
