# T-AM1-04 — Verification

| | |
|---|---|
| **Tag** | `[S]` sequential — needs all of AM1 in place |
| **Depends on** | T-AM1-01, T-AM1-02, T-AM1-03 |
| **Blocks** | — |
| **Phase spec** | [README.md](README.md) |
| **Status** | ✅ done except live-dispatch checks → `G-55` (2026-08-29) |

## Objective

Prove the phase for real: a file an agent writes into the outbox ends up in the
bucket, bound to the right message, with the right provenance — and a file it
writes into a project folder does not.

**What this pass cannot reach.** AM1 ships no UI, so nothing here is verified
by looking at the app. Every assertion is checked at the database, the bucket,
or the daemon log. That is correct for a foundational phase and is not a gap —
the owner-visible path is graded by `T-AM2-03`.

**One thing genuinely at risk.** Section A5 (FR-016) needs a `project` chat
bound to a real project with a real `rootDir` on the verifying machine. If no
such project exists, **create one** — do not skip it and do not substitute a
`free` chat, because FR-016 is the requirement this whole spec turns on and the
`project` path is the only one where it can fail.

## A — The technical assertions

**None of A1, A3, A5, A6 are reached.** Every one needs a real chat turn
dispatched to a paired, authenticated daemon, which does not exist in this
environment — the same root cause `G-55` already names for `T-AM1-02` and
`T-AM1-03`. Rather than leave these silent, each is annotated below with the
strongest evidence that does exist: what `chat-turn.test.ts` proves at the
code level (real files on a real filesystem, real `sweepOutbox`/upload-path
logic, only the network boundary — `fetch`/`completeOnce` — mocked), which
is meaningfully stronger than reading the code and assuming it's right, but
is not the same claim as "a real turn produced a real row."

- [ ] **A1 — the happy path.** NOT reached. Needs a live daemon and a real
      Postgres round-trip. The two-segment path shape is proven at the unit
      level (`T-AM1-01`'s `chat-produced.test.ts`, deliberately verified by
      reintroducing a `produced/` segment and watching the test fail), and
      the SQL function's binding logic is proven by direct inspection (below,
      section C) — but no real object has ever been created by a real turn.
- [ ] **A2 — files with no text (FR-004).** NOT reached at the database
      layer. **The code-level claim IS reached and verified as load-bearing**:
      `chat-turn.test.ts`'s FR-004 test asserts `status: "succeeded"` for a
      files-only turn; closing `T-AM1-03` I reverted the status-condition fix,
      confirmed that exact test turned red, and restored it. What remains
      unreached is the Postgres side — that `ingest_chat_turn_reply` actually
      creates the row when called for real, which section C's static read of
      the live function body supports but does not prove by execution.
- [ ] **A3 — partial work survives failure (FR-013).** NOT reached at the
      database layer, for the same reason as A2. Code-level equivalent
      reached: `chat-turn.test.ts` has a dedicated test asserting `produced`
      is populated and `status: "failed"` together when `completeOnce`
      reports `isError: true` after a file was already written to the outbox.
- [ ] **A4 — the refusal is told, not swallowed (FR-011).** Reached at the
      code level, not via a live daemon: `chat-turn.test.ts`'s oversized-file
      test writes a real 11 MB buffer to a real temp directory and exercises
      the real (unmocked) `sweepOutbox`; only `completeOnce`/`fetch` are
      mocked. The reply-text refusal and the absence of an upload call for
      that file are both directly asserted.
- [ ] **A5 — FR-016, the one that matters.** NOT reached. Needs a live daemon
      dispatching against a real bound project. The structural argument (the
      outbox is a fresh `mkdtemp` directory, never the project's `cwd`, under
      any session kind) is covered by a unit test asserting the two paths
      never coincide, but no real agent has ever been asked to edit a real
      project file during a real turn to confirm nothing leaks.
- [ ] **A6 — the attachment/produce interaction.** Reached at the code level:
      `chat-turn.test.ts`'s clamp-interaction test asserts `allowedTools`
      contains `Write` when an attachment is present, and a real file written
      to the outbox in that same turn is picked up by the real sweep. Not
      reached via a live daemon actually reading an attachment and writing a
      reply file in the same real process.
- [ ] **A7 — nothing produced costs nothing (SC-005).** Reached at the code
      level: a text-only mocked turn produces `produced: []`, no upload call,
      and unmodified `replyText`. The **rendering** half of SC-005 (that the
      UI shows nothing extra) has no UI to check yet — that's `T-AM2-03`.

## B — What must NOT have changed

- [ ] CS5's inbound attachments still work end to end: attach a file in the
      composer, the daemon places it, the agent reads it (this is band 26's
      `T-CS6-02` path, re-walked). NOT reached — needs a live daemon. The
      code path is unchanged by this phase (AM1 never edits
      `placeAttachments`/`downloadToFile`) and the full existing attachment
      test suite in `chat-turn.test.ts` (pre-dating this band) still passes
      unmodified, which is the closest available evidence
- [x] `enqueue_chat_turn`'s auto-titling still fires on the first message.
      **Corrected 2026-08-29:** `029` never touches `enqueue_chat_turn` at
      all — only `ingest_chat_turn_reply` — so this is not the same clobber
      risk finding 6 originally (wrongly) attributed to this function.
      **Reached by direct inspection**, not a live turn: dumped
      `enqueue_chat_turn`'s live `prosrc` from staging and confirmed the
      auto-title block (`if v_session.title = '' then update ... set title =
      private.chat_auto_title(p_content) ...`) is fully intact — `029`'s
      migration made no change here, as expected
- [x] A failed turn with no produced files still creates **no** assistant
      message, exactly as before. **Reached, by static verification**: the
      live `ingest_chat_turn_reply` body (dumped in section C) reads `if
      p_status = 'succeeded' or jsonb_array_length(coalesce(p_produced,
      '[]'::jsonb)) > 0` — for `status='failed'` and an empty `p_produced`,
      this is false on both sides, so the insert block is skipped exactly as
      it was before this migration. Also directly exercised at the
      daemon/TypeScript layer by `chat-turn.test.ts`'s
      "genuinely no text and no produced file is still failed" test
- [x] Chat turn `seq` still advances across the terminal call; no turn is left
      `in_progress`. **Reached**: the original M12 tests asserting this
      (`chat-turn.test.ts`, pre-dating band 27) are unmodified and pass in the
      full 776-test run below

## C — What can be verified today

- [x] `get_advisors` clean on staging after `029` — re-ran 2026-08-29 closing
      this task: no new finding; the pre-existing WARN entries (`bootstrap_workspace`,
      `cancel_run`, `delete_own_account`, `enqueue_chat_turn`, `retry_chat_turn`,
      `start_run`, leaked-password-protection) are unrelated RPCs this band
      never touches
- [x] `select prosrc from pg_proc where proname = 'ingest_chat_turn_reply'`
      contains **both** the original success-path behaviour (message created
      on `succeeded`) and the new produced-file block — the concrete check
      that `029` was written from the live body and not from `014`'s file.
      **Corrected 2026-08-29:** this function never carried auto-title
      logic — that's `enqueue_chat_turn` — so the earlier "auto-title-adjacent"
      wording was checking the wrong thing. **Reached**: dumped live 2026-08-29,
      confirmed both blocks present verbatim
- [x] A foreign-workspace `storagePath` is refused by `sign-upload` with 403 —
      reached via `T-AM1-01`'s existing route test
      (`sign-upload/route.test.ts`), re-run clean in the full suite below

## D — What needs something that doesn't exist yet

**Needs AM2.** Nothing in AM1 can show the owner anything.

- [ ] A produced image is visible in the reply — `T-AM2-03`
- [ ] SC-003 (phone, machine off) — `T-AM3-02`

## E — Regression surface

- [x] `pnpm -r typecheck` green across all 8 workspace projects
      (`@sparstrow/core`, `@sparstrow/shared`, `apps/web`, `@sparstrow/ui`,
      `@sparstrow/desktop`, `memory-cli`, `memory-mcp`)
- [x] `pnpm -r test` green: `@sparstrow/shared` 334/334,
      `@sparstrow/core` 776/780 (4 pre-existing skips, unrelated to this
      band), `apps/web` 498/498, `@sparstrow/desktop` 28/28. `@sparstrow/ui`
      has no test files (pre-existing, unaffected)

## On completion

- [x] Update the phase `README.md` status line and its task table
- [x] Update the plan's **Status** row
- [x] **Every unreached assertion written into
      [`../../KnownGaps.md`](../../KnownGaps.md)** with what breaks if the
      assumption is wrong and what closes it — folded into `G-55` rather than
      opened separately, since the root cause (no paired daemon) is identical
- [x] No Knowledge Center pass is due for this phase — it ships no user-visible
      behaviour. `AGENTS.md` §3.2's article update belongs to `T-AM2-03`, which
      is where the feature becomes real to a reader. Said so explicitly rather
      than leaving the box unticked and ambiguous

> The queue flip happens once, in the commit that lands
> `band/27-seeing-what-my-agent-made` on `development` — not here.

## Result

**Corrected two stale claims in this task's own draft before running it**,
left over from before `T-AM1-03` corrected the phase README's finding 6:
this task's checks for section B/C previously said `028` (should be `029`)
and asked to confirm "auto-title-adjacent behaviour" survived in
`ingest_chat_turn_reply` — that function never carried auto-title logic at
all, so the check was aimed at the wrong function. Both fixed before
executing, so the pass below grades against accurate assertions.

**What was actually run:**

1. Dumped `ingest_chat_turn_reply`'s live `prosrc` from staging
   (`pnymngoqseltgigcfevq`) directly — confirmed it contains both the
   original success-path insert and the new produced-file block, verbatim,
   matching `029`'s source exactly.
2. Dumped `enqueue_chat_turn`'s live `prosrc` — confirmed its auto-title
   block is fully intact and untouched by `029`, which is expected since
   `029` never redefines that function.
3. Re-ran `get_advisors(type: security)` on staging — no new finding beyond
   the pre-existing WARN set this band never touches.
4. `pnpm -r typecheck` — clean across all 8 workspace projects.
5. `pnpm -r test` — `@sparstrow/shared` 334/334, `@sparstrow/core` 776/780
   (4 pre-existing skips, unrelated), `apps/web` 498/498, `@sparstrow/desktop`
   28/28, `@sparstrow/ui` no test files (pre-existing).

**What could not be run, named precisely rather than rounded up:** every
assertion in section A that requires a live chat turn dispatched to a
real, paired, authenticated daemon — A1 (the happy path), A5 (FR-016 in a
real project chat, "the one that matters"), A6 (attachment+produce with a
real agent), and section B's CS5 re-walk. This is the same root cause
`T-AM1-02` and `T-AM1-03` already hit and recorded in `G-55`; extended that
entry rather than opening a new one, naming exactly these four checks as
what remains once `T-AM1-04` itself is done.

**What partially substitutes, and why it is not the same claim:** several of
these assertions have a strong code-level equivalent already proven in
`chat-turn.test.ts` — real files on a real filesystem, the real
(unmocked) `sweepOutbox`/clamp logic, only the network boundary mocked. That
is meaningfully more than "read the code and assumed it was right" (in
particular, the FR-004 status-condition fix was verified load-bearing by
deliberately reverting it and watching the specific test go red), but it is
not proof that a real agent, a real daemon, and a real Postgres round-trip
produce the row this phase exists to create. Section A above states this
distinction assertion-by-assertion rather than collapsing it into one blanket
disclaimer.

**AM1 is complete except for that live-dispatch gap.** All three
implementation tasks (`T-AM1-01`, `T-AM1-02`, `T-AM1-03`) landed on
`band/27-seeing-what-my-agent-made`, the monorepo is green end to end, and
the database change is live on staging and independently verified by direct
inspection. AM2 is unblocked.
