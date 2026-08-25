# T-M16-06 — Verification

| | |
|---|---|
| **Tag** | `[S]` sequential — needs all of M16 in place |
| **Depends on** | T-M16-01 … T-M16-05 |
| **Blocks** | M17 |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

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
- [ ] `pnpm typecheck` and `pnpm test` green across the monorepo

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

- [ ] Tick 20.6 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
- [ ] Update this file's **Status** row and the phase README's
- [ ] Mark the M16 band complete in the queue
- [ ] `KnownGaps.md` entry for §D's live half if it was not run, and for anything
      else ticked on weaker evidence than it asked for
- [ ] Update the plan's **Status** row to *In progress — M17 next*
- [ ] File any bug or security issue found, in the same turn, per `AGENTS.md` §5

## Result

*(filled in when the pass runs — name what was actually executed, not
"verified")*
