# T-DI-05 — verification: the live pass that has never run

| | |
|---|---|
| **Tag** | `[S]` — needs all of DI in place |
| **Serves** | US1, US2, US3 — the first time any of them is checked |
| **Depends on** | T-DI-01 … T-DI-04 |
| **Blocks** | closing `G-47`, `G-48`, and the RLS bug |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

## Objective

Prove a real paired machine and a real browser hold a live, authenticated,
two-way terminal conversation — the check that has been deferred twice, once as
`G-47` and once as `G-48`, and that this whole phase exists to make possible.

**Run against the band branch's own Vercel preview with a real paired machine**,
per `AGENTS.md` §2 rule 3. Not `development.sparstrow.com`.

**What this pass still cannot reach, named up front:**

- **FR-009's live non-admin refusal.** Needs a second account in the same
  workspace. `G-15`, `G-24`, `G-47` and `G-48` all already record this same
  limitation; it stays open and stays `G-48`'s. Do not create an account to
  close it, and do not write a `workspace_members` row by hand — `G-47`'s own
  precedent ruled the latter out as beyond an agent's authority unsupervised.
- **SC-006 as literally worded** (a machine-service-only install) — that is
  `D-10`, not built. The weaker form the spec actually cares about (a browser
  reaching a machine it is not sitting on) is what every check here uses.

## A — The wire works

Inherited verbatim from [`T-M16-06`](../M16/T-M16-06-verification.md) §A, which
has never been run. These are still the right checks.

- [ ] `POST /api/daemon/realtime/token` with the machine's real daemon token
      returns a credential, and Realtime **accepts** it — the daemon's log shows
      a subscribed control channel, not a refused one
- [ ] From the browser as the workspace owner: `terminal.list` on
      `machine:<ws>:<runtime>` is answered, with the machine's start time
- [ ] `terminal.open` with no `agentId` returns a session and a shell is
      running — confirmed in the machine's own process list, not only by the reply
- [ ] `echo hello` produces `hello` back on the session topic
- [ ] A command printing for 10 seconds arrives in **more than one** output
      message (SC-002's mechanism)
- [ ] `terminal.close` ends the session and the process is gone
- [ ] An unknown session id is answered `unknown_session` **with the machine's
      start time**

## B — The connection looks after itself

Inherited from `T-M16-06` §B.

- [ ] The credential refreshes and the connection stays up across the refresh —
      no re-subscribe, no dropped session
- [ ] Network dropped for 60 s: exactly **one** connectivity-edge warning, and
      the connection returns unattended
- [ ] Network dropped for longer than the credential's TTL: core re-mints before
      reconnecting rather than retrying with an expired token
- [ ] Pairing revoked while connected: core stops, logs the existing re-pair
      guidance, does not retry — **and** the RLS refuses it independently, per
      `DI-3`. Both halves, since they are different mechanisms

## C — The spec's own scenarios

The half `T-M17-06` could not reach.

- [ ] **US1** — from a browser on a different computer, press Shell, type a
      slow-printing command, watch it arrive progressively
- [ ] **US2** — start something long, close the tab, reopen in a **different
      browser**, find it still running with what it printed while away
- [ ] **US3** — pick an agent, land inside its CLI
- [ ] **SC-001** — echo latency, **measured as a number**. This has never been
      measurable; record the figure, not "felt fast"
- [ ] **SC-007** — switch terminal access off on the Machines page, and be
      refused *by the machine* (its own log line), not by the page hiding a button
- [ ] Every refusal sentence that can be reached is rendered, and none falls
      through to a generic error
- [ ] Two tabs on one session: both work, both see each other's typing

## D — Nothing else moved

- [ ] Run transcripts still stream on `run:<ws>:<run>` and chat replies on
      `chat:<ws>:<session>`. **This is the check that catches a malformed daemon
      identity** — `010`/`015` call `current_workspace_ids()`, and a daemon
      identity that somehow acquired a membership would show up here first
- [ ] The daemon's own token still reads **nothing** from PostgREST, and
      `bootstrap_workspace` still refuses it (re-check of `T-DI-03`, now against
      a real minted credential rather than a test double)
- [ ] The local `/ws/terminal/:id` route still works from a browser pointed at
      the machine directly — `DD-6`'s regression check
- [ ] `pnpm typecheck` and `pnpm test` green across the monorepo

## E — Documentation

- [ ] The four global-claim Knowledge Center pages re-read against what is now
      true — `AGENTS.md` §3.2's rule about the articles you did *not* touch.
      Terminals move from "built but never demonstrated" to working, and
      `limitations.md` in particular may now be understating the product
- [ ] `terminals.md` checked for any transport claim that this phase falsified
- [ ] `SC-004` — the words "not available from the web app" appear nowhere on
      any terminal surface

## On completion

> **Do not edit [`../MasterTaskQueue.md`](../MasterTaskQueue.md) from this
> branch.** Record this task's outcome in the **Status** row and **Result**
> section of *this* file.

- [ ] Update this file's **Status** row and the phase README's
- [ ] **Close `G-47`** — delete the entry and say where the proof lives, per
      `KnownGaps.md`'s own rule that a closed gap is deleted rather than marked
- [ ] **Close `G-48`**'s first two clauses; leave the FR-009 clause open, as its
      own entry if that is all that remains
- [ ] **Resolve
      [`BUG-2026-08-27-daemon-realtime-token-cannot-pass-terminal-channel-rls`](../../bug/BUG-2026-08-27-daemon-realtime-token-cannot-pass-terminal-channel-rls.md)**
      — flip Status to 🟢, fill in Resolution with the commit/PR, leave the file
      in place
- [ ] Update the plan's **Status** row and the terminal plan's, which currently
      says M16/M17 are complete except a Vercel regression — a sentence this
      phase proves was wrong about the cause
- [ ] Update **band 24's blocked row** in the queue: its blocker was "band 20
      (M16)", which was true and insufficient. Say what it really was
- [ ] File any bug or security issue found, in the same turn, per `AGENTS.md` §5

## Result

*(filled in when the task lands)*
