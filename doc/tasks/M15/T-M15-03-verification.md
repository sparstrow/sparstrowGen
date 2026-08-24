# T-M15-03 — Verification

| | |
|---|---|
| **Tag** | `[S]` sequential — needs all of M15 in place |
| **Depends on** | T-M15-01, T-M15-02 |
| **Blocks** | — |
| **Phase spec** | [README.md](README.md) |
| **Status** | 🟢 done — "retry twice in a row" closed live 2026-08-24 |

## Objective

Prove US3's two acceptance scenarios live, against a real paired machine
where possible — same preview/account approach as
[T-M13-05](../M13/T-M13-05-verification.md) and
[T-M14-03](../M14/T-M14-03-verification.md): this branch's own feature
preview, signed in via the magic-link runbook.

A genuine chat completion needs a working provider — originally written
with an `antigravity` fallback in mind in case headless `claude-code` auth
was still broken (it was, at the time — `D-21`/former `G-32`). The owner
fixed it (`claude setup-token`) before this task ran, so the pass below
used `claude-code` directly throughout, no fallback needed.

## A — The acceptance scenarios

- [x] **US3 scenario 1** — Given a turn that failed partway through, When
      the owner presses retry, Then the same message is resent (not
      retyped) and a fresh attempt starts (verified via `TurnErrorBanner`'s
      unchanged plain-retry path — see T-M15-01's Result)
- [x] **US3 scenario 2** — Given a completed reply, When the owner retries
      with a different model selected in `RetryControls`, Then the new
      reply uses that model and the original reply is still visible,
      unchanged, above it
- [x] The retry request's actual body carries the selected `{ provider,
      model }` — confirmed by reading the resulting row back from the
      database (`provider: claude-code`, `model: opus`, `retry_of_turn_id`
      pointing at the original), not just by watching the UI re-render
- [x] The browser console has no errors across both scenarios

## A2 — The four states

- [x] `RetryControls` (succeeded) and `TurnErrorBanner`'s retry (failed) are
      each legible on their own — a succeeded turn's retry row must not
      read as an error, and a failed turn's retry must not read as neutral
- [~] Both light and dark themes, at least Paper and Mono surfaces
      (`DESIGN.md`) — light and dark checked; Mono not separately re-checked
      for `RetryControls` specifically (it reuses `Button`/`GhostSelect`
      unchanged, both already Mono-verified by T-M14-03 and elsewhere in
      this same file, so judged low-risk rather than re-walked)

## B — What must NOT have changed

- [x] `TurnExpiredNotice`'s plain retry (T-M14-01) still works, unchanged —
      T-M15-01 deliberately did not add a picker there (see its Traps)
- [x] M14's three waiting-reason cards and TTL-expiry distinction still
      render correctly — confirmed as a side effect of T-M15-01's own retry
      test (the retried turn landed correctly in `all_runtimes_offline`)
- [ ] A second, unrelated retry (on a different session) does not bleed
      `RetryControls`' local provider/model state across sessions — not
      reached; judged low-risk (independent component instances, no
      plausible sharing mechanism) rather than blocking, per T-M15-01's
      Result

## C — What can be verified today

- [x] Everything in section A — the credential fix landed before this task
      ran, so `claude-code` was used directly throughout

## D — What needs something that doesn't exist yet

Nothing known. Unlike M14, M15 has no two-machine dependency.

## E — Regression surface

- [x] `pnpm -r typecheck` and `pnpm -r test` green (all 7 typechecked
      workspaces clean; 84 files / 718 passed + 4 skipped in
      `packages/core`, 19 files / 299 passed in `apps/web`, 6 files / 61
      passed in `packages/ui`)
- [x] `packages/ui` builds — covered by its own passing `tsc --noEmit`

## On completion

- [x] Tick 18.18 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md) and mark
      Band 18's M15 rows done
- [x] Update [`M15/README.md`](README.md)'s **Status** row and task table
- [x] Update the plan's own **Status** row
      ([`../../plans/2026-08-23-chat-message-sending.md`](../../plans/2026-08-23-chat-message-sending.md))
      — "retrying twice in a row" closed live 2026-08-24 in a follow-up
      pass (see Result); cross-session state isolation remains genuinely
      unreached but judged low-risk, not blocking the plan's completion
- [x] Every unreached assertion above written into
      [`../../KnownGaps.md`](../../KnownGaps.md) with what it would cost if
      wrong and the concrete thing that closes it

## Result

Ran the full live pass described in section A/B against **staging**
(`pnymngoqseltgigcfevq`), through this branch's own local dev server plus
the Playwright MCP — see
[T-M15-01's Result](T-M15-01-retry-affordance.md) for the detailed walk
(the DB-level proof that a picker selection actually reaches
`retry_chat_turn`, screenshots, and the exact method). Summary here:

- **Reached and confirmed**: both US3 scenarios, the retry request's actual
  body (verified by reading the resulting row back from the database, not
  just watching the UI), the failed-turn regression (`TurnErrorBanner`
  unchanged), and M14's cards continuing to work correctly (confirmed as a
  side effect — the retried turn correctly landed in
  `all_runtimes_offline`). Full monorepo typecheck/test green.
- **Closed in a follow-up pass, 2026-08-24**: retrying twice in a row from
  two different succeeded turns, once the owner's credential fix
  (`D-21`/former `G-32`) supplied a working provider. Real sequence —
  sonnet → haiku → opus — with `RetryControls` correctly defaulting to
  each new turn's own model each time; database chain confirmed
  (`retry_of_turn_id` linking all three). See `KnownGaps.md`'s `G-31`
  "Closed, live" note.
- **Not reached**: cross-session state isolation — judged low-risk (no
  plausible mechanism for two independent component instances to share
  state) rather than worth blocking on.

M15 is functionally complete and is the plan's last phase. Both sub-cases
this task originally left open are now resolved or judged low-risk — see
the plan's own Status row.
