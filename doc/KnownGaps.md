# Known Gaps

Things that are **built but not fully proved**, and limitations we have accepted
knowingly. This is the register an agent reads before trusting that something
works, and before claiming it does.

It exists because the other files each answer a different question and none of
them answer this one:

| File | Holds |
|---|---|
| `OpenQuestions.md` | needs a decision from the owner |
| `Deferred.md` | agreed to build, deliberately not built yet |
| `runbooks/README.md` | only a human can do it (dashboards, secrets, OAuth apps) |
| **`KnownGaps.md`** | **built, but not verified — or verified to be limited** |

## How to use it

**Before relying on something, check whether it is listed here.** A gap entry is
not a bug report; it is a statement about the *strength of the evidence* behind a
piece of working code. `G-3` does not mean the snapshot hook is broken — it means
nobody has watched it fire.

**When you clear one, delete the entry** and say where the proof lives, exactly
like `OpenQuestions.md`. The length of this file is a real signal; a gap that
lingers because closing it was inconvenient is the whole failure mode this file
is meant to prevent.

**When you leave one, add it here in the same change that creates it.** A caveat
mentioned only in a chat message does not exist. If verification was skipped, say
so in the task's Result section *and* open an entry here.

Each entry carries: what is unproved, why it ended up that way, what it would
cost if the assumption is wrong, and the concrete thing that would close it.

---

## Unverified

### G-1 — Ctrl+C graceful shutdown, on Windows

**Raised:** 2026-08-10 (M3, `T-M3-08`).

Core's `draining` declaration on graceful shutdown was verified through
`POST /system/shutdown`. It was **not** verified through a console interrupt,
because Node cannot deliver a real SIGINT to a spawned child on Windows —
`child.kill("SIGINT")` terminates it outright and the handler never runs.

Both paths go through the same `registerShutdownHandler(shutdown)`, and the HTTP
route is what the desktop shell actually calls to stop core on Windows, so the
shared code *is* exercised. What is untested is the signal wiring itself.

- **If wrong:** a developer pressing Ctrl+C leaves a runtime reading `online`
  until `HEARTBEAT_STALE_AFTER` (90s) expires. Cosmetic, and self-correcting.
- **Clears when:** someone runs core in an interactive console, presses Ctrl+C,
  and confirms `shutting down` in the log and `draining` on the row. Two minutes
  of a human's time; no code needed.

### G-2 — The WIP snapshot settings card has never been seen in the UI that owns it

**Raised:** 2026-08-10 (WIP snapshots / OQ-1).

The card was read in the browser against the hosted app and its copy confirmed —
then it was deliberately gated to render **only** in the local, core-served UI
(see `G-6`). The local UI was never booted, so the card has not been observed in
the one place it is active.

The markup is identical in both hosts; the only difference is `account === null`.
Its one piece of logic (`isWipSnapshotEnabled`) is unit-tested in `shared`.

- **If wrong:** the toggle is unreachable or misrendered on the only surface that
  can change it — the feature would still work, silently, at its default.
- **Clears when:** core plus the local UI are booted and someone flips the switch
  and sees it persist.

### G-3 — The snapshot has never been triggered by a real agent run

**Raised:** 2026-08-10 (WIP snapshots / OQ-1). **The most load-bearing gap here.**

`snapshotWorkingTree()` is heavily tested directly, and the settings read is
verified against a real SQLite database. The **call site** is not: nothing has
exercised `RunManager.finalize()` end-to-end with a real agent editing a real
project, because that needs a provider binary, an agent, and a project row.

So what is proved is "the snapshot function works". What is assumed is "finalize
calls it with the right `rootDir`, on every terminal status".

- **If wrong:** the feature silently never fires, and the first anyone learns of
  it is when work is lost — precisely the scenario it was built to prevent. This
  is a failure that hides successfully.
- **Clears when:** a real run against a project with a dirty tree produces a
  `refs/sparstrow/wip/<run-id>` ref. **Owned by
  [`tasks/M4/T-M4-08-verification.md`](tasks/M4/T-M4-08-verification.md) §B**,
  where it is an assertion with a dirty tree as a setup precondition — not an
  observation made in passing.

### G-11 — Supabase has never been observed delivering an email

**Raised:** 2026-08-10, investigating "I can't create an account, no link arrives".

Every magic link used across M2 and M3 verification was minted with the **admin
API** (`generateLink`), which returns a token and sends no mail. That was the right
tool for an unattended browser pass, and it means the SMTP path was never once
exercised — while both milestones reported their auth verification as passing.

A live `signInWithOtp` to a real inbox was accepted by Supabase (no error), but
acceptance is not delivery, and nothing in this repo can read an inbox.

Sign-**up** is unaffected: "Confirm email" is off, so it needs no mail at all.
Magic-link sign-in and password reset both depend on this entirely.

- **If wrong:** two of the three sign-in routes are dead for everyone, and the
  built-in mailer's rule — deliver **only** to members of the project's Supabase
  org — means it can work for the owner and fail for every invited user, which is
  the worst shape of failure to debug later.
- **Clears when:** an email is confirmed arriving in a real inbox, or custom SMTP
  is configured. Procedure and the "Confirm email" interaction:
  [`runbooks/email-delivery.md`](runbooks/email-delivery.md).

### G-4 — A concurrent run can start while a snapshot is being taken

**Raised:** 2026-08-10 (WIP snapshots / OQ-1). Documented at the call site.

`finalize()` releases the busy key before the snapshot runs. Handoff is
explicitly chained *after* the snapshot, so the deterministic same-project
successor is safe — but an unrelated scheduler tick could still start a run on
that project mid-snapshot.

Closing it means holding the busy key across a git operation, which stalls the
queue for a backup. That trade was declined deliberately.

- **If wrong:** a snapshot captures a tree that is half-way into being modified
  by the next run. It is still strictly more than nothing was captured, which is
  why this was accepted rather than solved.
- **Clears when:** the busy key is held across the snapshot. **Owned by
  [`tasks/M4/T-M4-06-run-status.md`](tasks/M4/T-M4-06-run-status.md)**, which
  re-made the trade: dispatch makes concurrent same-project runs materially more
  likely, and the hold costs one identity plus one concurrency slot for the
  duration of bounded git plumbing.

---

## Accepted limitations

### G-5 — Untrusted runs are badged, not write-clamped

**Raised:** P5 (EH6/EH7). Already surfaced to users in
`packages/ui/src/content/knowledge/limitations.md`.

`isUntrustedRun()` stamps `runs.untrusted` and memory notes from those runs are
quarantined. There is no general *write* clamp: the strict clamp sandboxes get is
not applied to every untrusted run.

Note the structural reason, which is easy to miss — one of the three signals
(external-content tool use) is only knowable from the finished transcript, so it
**cannot** gate the run that produced it. Only `isSandbox` and `delegated` are
known at spawn and could be clamped there.

- **Clears when:** a spawn-time clamp is built for the two signals that are known
  at spawn. The third can never gate its own run; the quarantine is the mitigation
  for it, by design.

### G-6 — The WIP snapshot toggle exists only in the local UI

**Raised:** 2026-08-10 (WIP snapshots / OQ-1).

The switch is a row in one machine's SQLite and the snapshot happens on that
machine's disk. `apps/web` has no `/system/settings` route at all, so a card
rendered there would flip and then silently fail to reach the daemon it claims
to configure. It is hidden in the hosted app rather than shown broken.

- **Clears when:** M4's command spine carries the setting to a specific daemon.
  **Owned by
  [`tasks/M4/T-M4-07-ui-blocked-and-toggle.md`](tasks/M4/T-M4-07-ui-blocked-and-toggle.md)**,
  via an allowlisted `settings.set` command — a per-runtime control in the
  Machines card, not a workspace-wide setting, because the machines can
  legitimately disagree.

### G-7 — Leaked-password protection is unavailable on the current Supabase plan

Requires Pro; confirmed 2026-08-10 by signing up with `password123` and getting a
session. No SQL equivalent exists, so nothing in this repo can fix it, and the
advisor will keep flagging it. Recorded in full in
[`runbooks/README.md`](runbooks/README.md) and
[`tasks/MasterTaskQueue.md`](tasks/MasterTaskQueue.md) — listed here only so the
register is complete. Magic-link sign-in is a partial mitigation.

### G-8 — `apps/web` still uses `middleware.ts`, deprecated in Next 16

**Raised:** 2026-08-10 (auth work), noted and not acted on.

Next 16 deprecates `middleware` in favour of `proxy`. `apps/web/src/middleware.ts`
works today and carries the session-refresh and API-401 behaviour that M2 fixed.

- **If wrong:** nothing now; it breaks on a future Next major.
- **Clears when:** the rename is done deliberately, with the `/api/` passthrough
  re-verified — that behaviour is load-bearing (it is what makes API calls return
  JSON 401s instead of an HTML login page) and is easy to lose in a mechanical
  port.

---

## Documentation drift

*`G-9` — the in-app knowledge center predating the cloud control plane — was **closed
2026-08-10**. Seven articles were corrected against post-M3 reality and `AGENTS.md`
§3.2 was strengthened, because the rule requiring a Knowledge Center update already
existed and was followed; what it did not cover was a change **falsifying pages it
never opened**. That check is now explicit, and phase completion asserts it.*

### G-10 — Platform quota figures were published without a source

**Raised:** 2026-08-10, while closing `G-9`.

`providers-and-execution-modes.md` carried three precise-sounding limits — 30 auth
requests/minute/IP, 15 pooled connections, 200 concurrent Realtime sockets — with
nothing behind them. They may well be correct; there is no evidence either way, and
they were written as fact.

They have been replaced with "these come from the hosting plan, read them from the
dashboard", which is true and useful. That is a correct answer, not a complete one.

- **If wrong:** someone plans capacity against an invented number. Low harm, but it
  is the same class of error as the `pgvector` claim removed alongside it — a
  confident sentence nobody checked.
- **Clears when:** the real quotas are read off the Supabase dashboard for the
  current plan and written down with that provenance. Cheap; worth doing next time
  the dashboard is open anyway.
