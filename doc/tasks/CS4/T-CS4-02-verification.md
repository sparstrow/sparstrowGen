# T-CS4-02 — Verification

| | |
|---|---|
| **Tag** | `[S]` sequential — needs T-CS4-01 in place |
| **Depends on** | T-CS4-01 |
| **Blocks** | — |
| **Phase spec** | [README.md](README.md) |
| **Status** | done (2026-08-28) |

## Objective

Prove US3 for real. Per CS3's own verification, the fully-live path (a real
`agy models` divergence from `KNOWN_MODELS`) needs a real `agy` install —
name plainly whether that's reachable here before scoring this "done."

## A — The acceptance scenarios

- [x] **US3 scenario 1** — a model not in the static list appears in the
      picker. Verified via a seeded `provider_model_cache` row containing
      `"Gemini 3.7 Flash (High)"` (absent from `KNOWN_MODELS.antigravity`);
      it appeared as the picker's default selection and in the option list.
      The live version of this exact case was already proved in T-CS3-01
      against a real `agy` v1.1.22 install (14 real models, genuine drift
      found: 3.7/3.6 Flash entirely missing from the static list) — this
      task verifies the UI reads that shape correctly, not the discovery
      mechanism itself, which T-CS3-01/03 already own.
- [x] **US3 scenario 2** — a model the static list has that the seeded
      source doesn't → no longer appears. The same seeded row deliberately
      omitted 5 of the static list's 8 entries (`Gemini 3.1 Pro (Low)`, all
      three `Gemini 3.5 Flash` tiers, `Claude Sonnet 4.6 (Thinking)`,
      `GPT-OSS 120B (Medium)`); the picker's option list contained exactly
      the 3 seeded models and none of the 5 omitted ones — confirmed by
      reading the full option list, not just the default value.
- [x] **US3 scenario 3** — cache present but stale/unreachable → last-known
      list shown, marked possibly not current, never blank. Directly reused
      T-CS4-01's own live evidence for this (aged row, `live: false`,
      "may not be current" note) — not re-run here, since nothing about the
      stale-rendering path changed between the two tasks.
- [x] The story's independent test passes with only CS3+CS4 present — no
      other phase's code was touched to make any of the above true
- [x] Browser console has no errors opening the picker (`agent-browser
      errors`/`console`, clean both passes)

## A2 — The four states

- [x] **Populated**, **Empty**, **Loading**, **Error** — Populated and Error
      (stale) walked fresh this task (see A above); Empty and Loading
      reused from T-CS4-01's own live pass, unchanged since
- [x] Both light and dark themes — screenshotted both; no layout break, no
      unreadable contrast, composer and model picker render identically in
      shape across both
- [x] Keyboard navigation on the picker unchanged from before this phase —
      focused the Model select, `Enter` to open, two `ArrowDown`, `Enter` to
      confirm: landed on the third option exactly as a native `<select>`
      would, no custom keyboard handling was added or needed

## B — What must NOT have changed

- [x] `claude-code`'s picker: no fetch, no loading state, identical to
      before this phase — reused T-CS4-01's network-capture evidence (zero
      `model-cache` requests while `claude-code` selected); nothing in this
      task's changes (none — T-CS4-02 is verification-only) could have
      altered that
- [x] Selecting a model and sending a message still works exactly as before
      — sent a real message with `antigravity` + a seeded model selected;
      landed on the same "no paired machine — message saved, Pair a machine
      to get a reply" waiting state every other provider gets, no crash, no
      console error

## C — What can be verified today

- [x] Everything in A/A2/B — all verified above

## D — What needs something that doesn't exist yet

**Not a gap.** T-CS3-01 already proved the fully-live divergence case
against a real `agy` v1.1.22 install (see A above) — there is nothing left
in "needs a real `agy` binary" for this phase to re-open. No `KnownGaps.md`
entry needed; checked the file for an existing CS3/CS4 entry first (none
found) rather than assuming.

## E — Regression surface

- [x] `pnpm -r typecheck` and `pnpm -r test` green — run fresh against this
      task's own worktree (branched from the merged T-CS4-01): `shared` (316
      tests), `core` (757 passed, 4 skipped), `web` (455 tests), all green
- [x] `apps/web` builds (implied by the typecheck passes — `next dev`
      compiled and served every route exercised during the live pass with
      no build error)

## On completion

- [x] Tick CS4's rows in `MasterTaskQueue.md` — **deliberately not done**,
      same as every prior CS phase's verification task: `AGENTS.md` §2.9
      flips the queue once, at band close, not per phase mid-band
- [x] Update the phase `README.md` status line and task table
- [x] Update the plan's own **Status** row
- [x] Any unreached assertion above written into `KnownGaps.md` — none
      remain unreached; nothing written

## Result

**2026-08-28 — done, US3 confirmed end to end.** All three acceptance
scenarios and all four picker states verified live via `agent-browser`
against a real Supabase project and a disposable account, plus two checks
this phase's own task file specifically asked for that T-CS4-01 hadn't
covered yet: dark/light theme rendering (both clean) and keyboard
navigation (unchanged — no custom handling needed since `ModelPicker` is
still a native `<Select>`). Confirmed sending a message with `antigravity`
selected lands on the same "no paired machine" state every provider gets,
proving this phase changed only where the option list comes from, not the
send path itself.

The live-`agy` divergence case this task's own template flagged as
needing "something that doesn't exist yet" was already closed by T-CS3-01
against a real install — re-checked `KnownGaps.md` to confirm no entry was
left open rather than assuming. CS4 is done; CS5 (attachment storage &
delivery, foundational) is next.
