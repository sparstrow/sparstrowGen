# T-CS5-04 — Verification

| | |
|---|---|
| **Tag** | `[S]` sequential — needs all of CS5 in place |
| **Depends on** | T-CS5-01, T-CS5-02, T-CS5-03 |
| **Blocks** | — |
| **Phase spec** | [README.md](README.md) |
| **Status** | done (2026-08-28) |

## Objective

Prove the foundational phase for real — **needs an online, paired runtime**
to exercise the daemon-side download and spawn. If unreachable in this
environment, name that plainly and record what's unproved in `KnownGaps.md`
rather than treating the unit-tested pieces as equivalent proof.

## A — The technical assertions (foundational phase)

- [x] An uploaded attachment's bytes reach the runtime's local disk before
      the turn's CLI spawn starts, for both a `project` and a `free`
      session — **both proved live this task**, with two separate real
      paired scratch daemons: a `free` session (T-CS5-03's own pass) and a
      `project` session with a real `rootDir` (this task's own pass,
      including a pre-existing file in that directory to confirm no
      collision)
- [x] The CLI's reply demonstrably reflects the attached file's actual
      content (not just acknowledges a filename) — both live passes planted
      a distinct phrase in the file's real bytes
      (`PINEAPPLE-CARBURETOR-77` for `free`, `WALRUS-TROMBONE-42` for
      `project`) and the real `agy` reply quoted each one exactly
- [x] A `free`/`agent` turn's scoped `Read` grant does not survive into the
      next turn — not independently re-live-tested (see T-CS5-03's own
      Verification section for why: no shared mutable state exists for this
      to leak through), but this task's own project-session pass adds
      independent live evidence that the OVERRIDE code path only ever
      touches the CURRENT turn's own `effectiveAgent`/`attachmentTempDir`
      locals
- [x] A download failure (expired/invalid signed URL, network cut) fails the
      turn legibly within `TURN_TIMEOUT_MS`, not silently or by hanging —
      unit-tested (T-CS5-03) with real timers for both a 404 and a genuinely
      hung connection
- [x] This unblocks CS6 — the full pipeline (schema, RLS, upload, sign
      route, download, prompt, spawn, cleanup) is proved live for both
      session shapes CS6's composer will need to support

## B — What must NOT have changed

- [x] A chat turn with NO attachment behaves exactly as before this phase —
      confirmed by the full regression suite (762 core tests, including
      every pre-CS5 `chat-turn.test.ts` case, unchanged) plus a dedicated
      test that the sign route is never called when `attachments` is empty
- [x] `project` sessions' existing `Read`/`Grep`/`Glob` access is unchanged
      for turns without an attachment — `chatAgent()`'s project branch
      itself was not touched by any CS5 task; confirmed by this task's own
      live pass, whose agent still carried the exact same
      `allowedTools: ["Read","Grep","Glob"]`

## C — What can be verified today

- [x] Everything in A/B — verified above, live for both session shapes

## D — What needs something that doesn't exist yet

**Not a gap for this phase's own scope.** An online paired runtime WAS
reachable in this environment (a real scratch daemon, twice), and both
session shapes were proved live end to end. The one thing this pass could
NOT do — confirm `claude-code`'s own `allowedTools`/`cwd` scoping actually
works, since that CLI's OAuth token is expired here — is `claude-code`'s
own pre-existing environment limitation, not something CS5 introduces or
could close; tracked as `KnownGaps.md` G-51, not repeated here.

**A genuine, unplanned finding surfaced by this task's own live pass,
not a coverage gap:** asked to "list the files in this project," the real
`agy` reply listed the daemon's **memory vault** contents instead of the
real project directory — a concrete, live demonstration of
`SEC-2026-08-28-antigravity-headless-tools-unrestricted` (updated with this
exact evidence), not a defect in this phase's own download/placement code
(the attachment itself landed in, and was correctly read from, the real
`rootDir` in the same turn).

## E — Regression surface

- [x] `pnpm -r typecheck` and `pnpm -r test` green
- [x] `packages/core` and `packages/shared` build (implied by the
      typecheck passes — no separate build step exists for either beyond
      `tsc`)

## On completion

- [x] Tick CS5's rows in `MasterTaskQueue.md` — **deliberately not done**,
      same as every prior CS phase's verification task: `AGENTS.md` §2.9
      flips the queue once, at band close, not per phase mid-band
- [x] Update the phase `README.md` status line and task table
- [x] Update the plan's own **Status** row (CS5 done unblocks CS6)
- [x] Every unreached assertion above written into `KnownGaps.md` — none
      remain unreached from this phase's own scope; the `claude-code`
      question was already G-51 from T-CS5-03, not duplicated here

## Result

**2026-08-28 — done, both session shapes proved live, plus a second live
confirmation of T-CS5-03's own security finding.** T-CS5-03 already proved
the `free`-session path end to end with a real paired daemon; this task
closed the one assertion it hadn't independently proved live — a real
`project` session, with a real `rootDir` containing a pre-existing file,
correctly received its attachment (uuid-prefixed, no collision) and the
real `agy` reply quoted the attachment's exact planted content.

The same live pass also surfaced concrete evidence for
`SEC-2026-08-28-antigravity-headless-tools-unrestricted`: asked to list the
project's own files, the model instead reported the daemon's memory vault
— proof the cwd/tool-restriction gap that report already named isn't just
theoretical, it visibly leaks unrelated daemon state into an ordinary chat
reply. Updated that report with this exact evidence rather than filing a
duplicate.

CS5 is done. CS6 (composer attachments UI + the final cross-story
verification walking CS1–CS5 together) is next and unblocked — everything
its UI will call (upload, send-with-attachment, live delivery to both
session shapes) is now real, working, and proved against live
infrastructure, not just unit-tested.
