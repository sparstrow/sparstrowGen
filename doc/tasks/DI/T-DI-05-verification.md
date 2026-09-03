# T-DI-05 — verification: the live pass that has never run

| | |
|---|---|
| **Tag** | `[S]` — needs all of DI in place |
| **Serves** | US1, US2, US3 — the first time any of them is checked |
| **Depends on** | T-DI-01 … T-DI-04 |
| **Blocks** | closing `G-47`, `G-48`, and the RLS bug |
| **Phase spec** | [README.md](README.md) |
| **Status** | blocked — `T-DI-02`'s SQL is applied and a real machine is paired (2026-08-28); blocked now on a newly-found platform issue, not on this band's own work — see Result |

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

- [x] `POST /api/daemon/realtime/token` with the machine's real daemon token
      returns a credential, and Realtime **accepts** it — the daemon's log shows
      a subscribed control channel, not a refused one — **done 2026-08-28**,
      see Result
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

- [x] Update this file's **Status** row and the phase README's
- [ ] **Close `G-47`** — **not done.** The terminal wire still does not
      complete a live round trip, so this stays open. What changed: `G-49`'s
      entry now records exactly which sub-parts are proven (RLS/identity, both
      races) versus which one still blocks it (the new relay bug)
- [ ] **Close `G-48`**'s first two clauses — **not done**, same reason as
      `G-47`. Its Resolution-adjacent text is unchanged; `G-49` carries the
      current state
- [x] **Resolve
      [`BUG-2026-08-27-daemon-realtime-token-cannot-pass-terminal-channel-rls`](../../bug/BUG-2026-08-27-daemon-realtime-token-cannot-pass-terminal-channel-rls.md)**
      — done. This bug's own scope (the RLS refusal) is proven fixed; a
      separate, still-open bug now blocks the rest of the wire
- [ ] Update the plan's **Status** row — deferred to when `T-DI-05` actually
      completes; today's status line ("code complete, unverified") is still
      accurate, just for a different reason than before
- [ ] Update **band 24's blocked row** in the queue — **deliberately not done
      from this branch**, per `AGENTS.md` §2 rule 9: `MasterTaskQueue.md` is
      only ever edited once per band, in the commit that lands the band
      branch on `development`, and `DI` already landed as its own band —
      this is a plain task branch cut directly from `development`. What the
      row should say once whoever does that edit gets to it: below
- [x] File any bug or security issue found, in the same turn, per `AGENTS.md` §5
      — four files: two resolved same-session fixes, one bug resolved (scope
      narrowed, not the whole wire), one new open finding

## Result

**2026-08-28 — partial. §A's first item passed live; everything after it is
blocked on a newly-found platform issue, not on this band's own work.**

**Deviation from this file's own instruction, explained:** run against
`development.sparstrow.com`, not the band branch's own Vercel preview. Band 25
(the `DI` band) had already merged into `development` and its branch/preview
were gone by the time this task ran — `development` **is** the band's
integrated code today, so it's the correct target now that circumstance
changed from when this file was written.

**What ran:**

1. Confirmed `supabase` CLI and MCP both authorized; confirmed project ref
   `pnymngoqseltgigcfevq` (sparstrowgen-staging) before and after every SQL
   statement.
2. Applied `018` (re-run, confirmed no-op — same six `pg_policies` rows),
   `019` (confirmed ten rows, all named correctly), `020` (both halves
   verified live inside a rolled-back transaction: a daemon identity refused
   `42501`, a genuinely new human user still provisioned normally).
   `get_advisors` after: one new item, an unindexed FK on
   `daemon_identities.workspace_id`, fixed in a new
   `021_daemon_identities_workspace_index.sql`, re-verified clean.
3. Cut a fresh worktree (`task/T-DI-05-live-verification`), paired a scratch
   daemon (its own `SPARSTROW_SECRETS_DIR`/`SPARSTROW_DATA_DIR`) against
   `development.sparstrow.com` using a disposable `@sparstrow.test` account
   signed in via `doc/runbooks/agent-browser-session.md`'s magic-link
   procedure, `agent-browser` for the browser side.
4. First connection attempt: refused, `Unauthorized … machine:<ws>:<runtime>`.
   Root-caused to a genuine, permanent client-side race — see
   [`BUG-2026-08-28-realtime-connect-races-channel-subscribe-auth`](../../bug/BUG-2026-08-28-realtime-connect-races-channel-subscribe-auth.md) —
   fixed and reverified live: the same daemon now reaches `SUBSCRIBED` with no
   refusal. **§A's first checklist item passes.**
5. Browser-side `terminal.list` then timed out ("machine didn't answer").
   Found a second, independent client-side race in `apps/web` — see
   [`BUG-2026-08-28-terminal-channel-sends-before-control-channel-joined`](../../bug/BUG-2026-08-28-terminal-channel-sends-before-control-channel-joined.md) —
   fixed. `terminal.list` still timed out afterward, now with a genuine
   WebSocket push (`canPush: true`, no REST-fallback warning) instead of the
   REST fallback.
6. Traced further: a standalone probe using the daemon's own `realtime-js`
   version, sending as an authenticated human admin (not the daemon, not
   `apps/web`'s code at all) to the same topic — still never received by a
   confirmed-`SUBSCRIBED` listener. A control test on a plain public
   (non-private) topic relayed correctly, first try. This isolates the defect
   to **private-channel broadcast relay on this project**, unrelated to the
   daemon, to `019`/`020`, or to any code in this repo. Full writeup:
   [`BUG-2026-08-28-private-broadcast-channels-not-relaying`](../../bug/BUG-2026-08-28-private-broadcast-channels-not-relaying.md).
   `T-DI-05` cannot proceed past §A's second item until that clears.
7. `pnpm typecheck` and `pnpm test` green across the monorepo with both fixes
   applied (one existing core test's assertion updated to match the corrected
   — now genuinely-once-then-again-on-refresh — `setAuth()` call count).

**§B–§E:** not reached. Everything past `terminal.list` succeeding is gated
behind the same blocker.

**Band 24's blocked row, updated:** its recorded blocker was "band 20 (M16)"
— true, and insufficient. The actual chain, as this pass found it: M16 built
the wire → band 25 (`DI`) fixed the identity/RLS layer and two real
connection-level races, all now proven live → the wire still doesn't carry a
message end-to-end because of a project-level Realtime setting (or an
unidentified deeper cause if that setting turns out not to be it), tracked in
`BUG-2026-08-28-private-broadcast-channels-not-relaying`. Band 24 stays
blocked on that bug, not on band 20 or band 25's own code.

**If wrong:** the "Allow public access" hypothesis in the new bug file is
unconfirmed — flagged explicitly as the strongest untried lead, not a proven
root cause. If disabling it doesn't fix delivery, the remaining path is a
Supabase support ticket; everything queryable from an agent session has been
checked.
