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
piece of working code. `G-12` does not mean the Machines card is broken — it
means nobody has looked at it.

**When you clear one, delete the entry** and say where the proof lives, exactly
like `OpenQuestions.md`. The length of this file is a real signal; a gap that
lingers because closing it was inconvenient is the whole failure mode this file
is meant to prevent.

**When you leave one, add it here in the same change that creates it.** A caveat
mentioned only in a chat message does not exist. If verification was skipped, say
so in the task's Result section *and* open an entry here.

Each entry carries: what is unproved, why it ended up that way, what it would
cost if the assumption is wrong, and the concrete thing that would close it.

**Never reuse a `G-` number.** "Delete the entry when you clear it" and "take the
next free number" combine badly: a cleared id looks free, so the next writer
takes it, and every reference to the old meaning silently starts pointing at the
new one. `G-20` has already been through this twice — M9 used it, `T-M9-01`
closed and deleted it, PR #100 then reused it for an unrelated slop-audit gap,
and `T-M9-02`, `T-M9-03` and `T-M9-05` still link to it expecting M9's meaning.
**Those three references are stale and have not been corrected here** — fixing
them belongs to whoever owns those files. The fourth,
[`BUG-2026-08-18-shell-invents-name-from-email`](bug/BUG-2026-08-18-shell-invents-name-from-email.md),
was corrected in `T-M10-04` (2026-08-20) while fixing the bug itself. Allocate
above the highest number this file has ever used, not above the highest
currently present.

**Closed 2026-08-19: `G-19`** — `DESIGN.md` §2 described a theming system the
app did not have. It has it now. `packages/shared/src/theme/tokens.ts` is the
single source for every colour; `globals.css` holds a generated block and
nothing else chromatic; surface and brand are class-swappable on the root and
were verified orthogonal in the browser. Proof:
`packages/shared/src/theme/theme.test.ts` in `pnpm test` — 120 preset × surface
× mode × ramp-step combinations against the floor, plus a diff of the committed
CSS against the emitter. The 228 hardcoded palette classes that would have
survived it are gone (`T-D1-01`).

**Closed 2026-08-19: `G-21`** — `DESIGN.md` §2's colour figures are now
reproducible from the document. §2.3 states the measurement basis (OKLCH → OKLab
→ linear sRGB **clamped to gamut**, then WCAG relative luminance) and the sweep
covers all three ramp steps; §2.4 and §2.5 carry measured values for approval
and the six actor-identity hues, which were the half still owed. Proof:
`design-brief/contrast-check.mjs` verifies every published figure and exits
non-zero on a mismatch, and `design-brief/status-identity-solve.mjs` is the
derivation. Three defects surfaced while closing it and are recorded as
`DD-010`, `DD-012`, and `DD-013`.

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

*`G-3` — the WIP snapshot never having fired from a real run — was **closed
2026-08-11** by M4 (`T-M4-08` §B). A run dispatched from the cloud to this
Windows machine, against a project with a deliberately dirty tree, produced
`refs/sparstrow/wip/run_154b6cc1cbef424a`. The assertions that make it a proof
rather than a sighting: `git status` read identically before and after, HEAD did
not move, the staged/unstaged split survived, the uncommitted modification was
captured, and `.env` and `node_modules/` were **absent** from the tree — the
`.gitignore` guarantee OQ-1 rested on.

Two further things fell out of it. The ref is named with the **cloud's** run id
on local disk, which is decision 4 proved end to end and the thing M5's
transcripts depend on. And turning the snapshot off from the browser genuinely
stops it: a run with the switch off produced no ref and logged nothing.*

### G-12 — Five M4 assertions were proved in SQL or unit tests, not live

**Raised:** 2026-08-11 (M4, `T-M4-08`). The phase is otherwise verified live on
staging; these are the corners that pass could not reach.

**Closed 2026-08-22 (M11, `T-M11-01`/`T-M11-02`), the click-through bullet.**
The Playwright MCP (not the in-app Browser pane) rendered and was clicked
through repeatedly against `staging.sparstrow.com` this pass — `/machines` in
both machine states, `/runs/<id>` live and after reload, `/teams`, `/projects`
(list and detail), `/skills`, `/tasks`, `/imports`, `/terminals`, `/chat`. This
is the same method M8/M10 used, now run specifically against staging rather
than localhost, which is what this entry's residue (`G-24`) named as
outstanding. Two things this pass found while doing it: `/chat`'s "start a new
conversation" 404s outright
([`BUG-2026-08-22-chat-new-session-404s`](bug/BUG-2026-08-22-chat-new-session-404s.md)),
and `/teams` / `/teams/[teamId]` crash the instant a real team exists
([`BUG-2026-08-22-teams-page-crashes-with-real-data`](bug/BUG-2026-08-22-teams-page-crashes-with-real-data.md))
— exactly the class of defect this entry predicted only the click-through pass
could catch.

**Still open:**

- **Lease recovery after a mid-claim kill**, two polls racing one row, and the
  five-attempt poison ceiling. All three are proved deterministically against a
  throwaway Postgres by
  `packages/shared/drizzle/policies/verify-command-spine.mjs`; none was
  reproduced live, because each needs a timing window. M11 did not attempt
  this either — still needs a dedicated timing-window pass.
- **Reassign** needs a second paired machine, and **clone end-to-end** needs a
  real remote. M11 paired only one machine at a time (a revoke/re-pair cycle
  during `T-M11-03` briefly produced two rows, but never two *simultaneously
  active* machines) — reassign genuinely needs a second live daemon, still
  unmet. Clone end-to-end still needs a real git remote, also unmet.
- **The unpaired local UI starting a run** — `T-M11-04` scenario 2 put a real,
  live local UI in front of an agent for the first time
  (`SPARSTROW_APP_URL` unset → the window loads `http://127.0.0.1:<port>/`,
  confirmed via log and window title) — closing the "does it load" half. **The
  "starting a run from it" half remains unproved**: computer-use interaction
  was unavailable that pass (see `T-M11-04`'s Result), so nothing was clicked
  inside that window.

- **If wrong:** the most likely failure is cosmetic — a control that renders
  wrong or an affordance that does not appear — because the data paths beneath
  all of them are exercised. The exception is the UI, where M2's browser pass
  found a hook-order crash and a whole class of missing Tailwind utilities that
  no API-level test could see, and M11 just repeated that lesson twice more.
- **Clears when:** the lease-recovery timing window is reproduced live, a
  second machine is paired for reassign, a real remote is available for clone,
  and someone with interactive (not headless-agent) access to the local UI
  starts a run from it.


### G-13 — M5 (transcripts) is built and unit-tested, not verified live

**Raised:** 2026-08-12, while decomposing and building M5. `T-M5-01`–`T-M5-05`
are done — 886 tests green, `pnpm -r typecheck` clean — but `T-M5-06`
(verification) was deferred to the owner rather than run, because most of what
it checks needs things this environment does not have.

**Closed 2026-08-22 (M11, `T-M11-02`): the durable-count comparison (§C) and
the "any rendered pixel" bullet.** A real run dispatched from
`staging.sparstrow.com` to a paired machine produced events whose cloud
`run_events` count matched the machine's local SQLite count exactly — 3/3 for
a normal `succeeded` run, 13/13 for one that errored — with matching `seq`
sets on both sides, checked once mid-run (an honest in-progress snapshot, not
a mismatch) and once after the run reached its terminal state. The Playwright
MCP browser (not the in-app Browser pane, which still does not composite —
see `G-12`) rendered `/runs/<id>` normally throughout.

**Closed, live-streaming's *delivery* half — but not its *rendering* half,
which turned out to be more complicated than "closed" or "open."** Polling
`GET /runs/<id>/events` during execution returned each event only once it
existed, at genuinely separate timestamps — the actual property this gap is
about, now proved live rather than asserted. But watching it **rendered**
split into three outcomes depending on provider: `claude-code`'s structured
events are handled by `RunTranscript`'s `EventRow` (code-verified, matches
its own unit tests) but could not be re-observed live this pass — the only
`claude-code` install available had an expired OAuth token, unrelated to this
gap (see the new entry below and `T-M11-02`'s Result); `antigravity`'s events
arrive with the same real progressive-delivery guarantee but render as
**nothing at all**, a genuine bug found by this pass and filed as
[`BUG-2026-08-22-antigravity-transcript-not-rendered`](bug/BUG-2026-08-22-antigravity-transcript-not-rendered.md).
So: the mechanism M5 built is proved; a rendered, scrolling, watched-live
transcript on an actually-completed real task was not achieved, and the
reason is now a known bug plus a known environment limitation rather than an
unknown.

**Update 2026-08-22 — the antigravity transcript bug is fixed at the code
level, not yet re-verified live.** `buildHeadlessSpawn` now asks `agy` for
`--output-format stream-json`, and `parseLine`/`extractResult` map its NDJSON
into the same `system`/`assistant`/`user`/`result` shapes `claude-code`
produces; `EventRow` also gained a `"raw"` case as a floor for any line that
falls back to it. The mapping was verified against a **real** `agy` v1.1.18
process (installed in the agent's environment; two real invocations
captured, one plain text, one exercising `view_file`/`find_by_name`/
`list_dir`/`run_command` including a permission-error path) and covered by
27 unit tests in `antigravity.test.ts` using those real captures as
fixtures. What is **not** re-verified: the full pipeline through a live
`/runs/<id>` page in a browser (spawn → parseLine → durable event store →
SSE/Realtime → `RunTranscript`) — see `G-29`, opened for that residual.

**Still open:**

- **Live streaming to a second device (T-M5-06 §A)** and **cross-workspace
  isolation on the subscribe side (§E)** both need a second real signed-in
  session — a browser session cannot be two independent workspace members at
  once. M11 did not supply one either (T-M11-03 does not create a second
  account).
- **The 60-second outage assertion (§B)** — the property M5 is actually judged
  on — needs the daemon's network cut for a minute. That is an OS-level,
  disruptive action on whatever machine runs core, correctly withheld pending
  the owner's say-so rather than done unilaterally. M11 did not run it either
  — still the owner's call, per phase decision 4, not a missing capability.
- Crash recovery (T-M5-06 §D) — starting a run, killing core mid-stream, and
  confirming the cloud transcript backfills cleanly on restart. Not exercised
  this pass; genuinely solo-doable, just not reached given everything else in
  scope.

- **If wrong:** narrower now than before. The delivery mechanism is proved
  live; what remains unproved is cross-device behavior, a genuine network
  partition, and crash recovery — none of which change the shape of failure
  M5's own Result section already named (pure logic right, framework glue
  unverified) so much as narrow which specific piece of glue is still in
  question.
- **Clears when:** a second device/account is available, the owner authorizes
  and someone runs the 60-second network cut, and crash recovery is exercised
  once. Full procedure in
  [`tasks/M5/T-M5-06-verification.md`](tasks/M5/T-M5-06-verification.md).

### G-27 — `claude-code`'s capability probe cannot tell "the binary runs" from "it can actually authenticate"

**Raised:** 2026-08-22, `T-M11-01`/`T-M11-02`, found live rather than by
inspection.

`probeCapabilities()` (`packages/core/src/cloud/registration.ts`) calls each
provider's `healthCheck()`, and `claude-code`'s implementation
(`packages/core/src/providers/claude-code.ts`) runs `claude --version` and
sets `authenticated: null` unconditionally — the field exists in
`ProviderHealth` but this provider never actually determines it. On a
machine whose OAuth token had genuinely expired, the capability badge still
read `claude-code: true`, and a real run dispatched to it spawned correctly,
then failed only after 3 minutes and 7 exponential-backoff retries with
`"OAuth access token has expired."` — legible once it arrived, but slow, and
exactly the shape of problem `T-M11-01`'s own checklist warned about ("a
capability claimed here that is not really there becomes a run that dies at
spawn") — except it didn't even die at spawn, which is arguably worse.

- **If wrong:** every dispatch to a machine with a stale token burns ~3
  minutes of retries before failing, on every run, until someone notices and
  re-authenticates. Not a correctness bug — the eventual message is
  accurate — but a real latency/UX cost with no visibility until it happens.
- **Clears when:** `healthCheck()` gains a cheap real auth check (e.g. a
  minimal authenticated API call with a short timeout, distinct from
  `--version`) so `authenticated` is genuinely populated, and the capability
  badge can distinguish "installed" from "installed and usable."

### G-30 — Cloud chat turns stream at whole-message granularity, not token-level

**Raised:** 2026-08-23, building
[`T-M12-04`](tasks/M12/T-M12-04-core-chat-turn-executor.md) (the daemon's
executor for cloud-dispatched chat turns). Its sibling finding — the
executor's real HTTP path had never carried a reply end to end — was closed
by [`T-M12-06`](tasks/M12/T-M12-06-verification.md)'s live local pass; see
that task's Result for what was actually run. What's left here is the
granularity finding on its own, which that pass didn't change.

**DD-5's probe, done and answered, not skipped.** The plan asked whether the
installed `claude-code` CLI has a partial-message/delta output mode to opt
the chat path into; if not, "degrade silently to whole-message granularity
... and open a KnownGaps entry recording this plainly." The probe: every CLI
provider's `parseLine` (`packages/core/src/providers/claude-code.ts` and
siblings) normalizes the provider's own `stream_event` lines into an opaque
`status` `NormalizedEvent` without extracting any partial text — the finest
signal `extractResult` can ever derive from the event list is "a new complete
assistant message arrived," which is exactly what `completeOnce`'s new
`onEvent` hook (`packages/core/src/orchestrator/one-shot.ts`) surfaces. This
is not a bug in the M12 wiring; it is the actual granularity available today,
named rather than assumed.

- **If wrong** (i.e., if this is treated as token-level streaming by anything
  downstream): M13's UI would be built expecting smoother, more frequent
  deltas than the pipe can ever deliver, and would need reworking once the
  gap between "assistant message arrived" and "typing indicator" became
  visible to a real user.
- **Clears when:** a use case actually needs finer granularity, at which
  point `claude-code.ts`'s `parseLine` would need to parse `stream_event`'s
  own `content_block_delta` payloads (assuming the underlying CLI emits them
  in some invocation mode — not yet confirmed either way) rather than
  discarding them. Until then, whole-message is the documented contract, and
  M13 should describe it as such rather than promising something finer.

### G-31 — no chat turn has ever actually succeeded in a real verification pass, and a second machine has never been reached

**Raised:** 2026-08-23, closing [`T-M12-06`](tasks/M12/T-M12-06-verification.md).
**Narrowed:** 2026-08-23, during [`T-M13-05`](tasks/M13/T-M13-05-verification.md) —
two of the original three sub-gaps closed with live evidence; the title and
scope below reflect what's actually still open.
**Corrected:** 2026-08-23, when the owner ran the still-open sub-gap live on
their own real, credentialed, paired machine, in two rounds. Round 1: both
providers failed, and the failure was NOT "no usable Anthropic credentials" —
a real CLI process spawned and took a real action, which only happens with
working credentials. That round's cause was
[`BUG-2026-08-23-headless-spawn-skill-leak`](bug/BUG-2026-08-23-headless-spawn-skill-leak.md):
headless spawns inherited the operator's personal `~/.claude` config
unisolated, and a personal preamble-tier skill installed there could never get
the tool permission it wanted (no TTY). Fixed with `--disable-slash-commands`
on every headless spawn. Round 2, after that fix: **antigravity's retried turn
completed successfully** — the first real, live-produced chat reply this
gap has ever recorded. claude-code still failed, but a direct repro traced it
to a genuine `401 authentication_failed` on that account's `claude` CLI login
(`claude auth status` showed `loggedIn: true` but `subscriptionType: null`) —
an account-side credential problem for the owner to fix by re-authenticating,
unrelated to the skill-leak bug and outside this repo's code. This sandbox
itself still has no real CLI credentials at all, so the sub-gaps below remain
genuinely open HERE — but the underlying claim they were blocking on
("nothing in this repo can produce a real completion") is no longer true in
general, only in this specific sandbox.

**Closed by T-M13-05, with evidence — do not re-open without new evidence:**

- **A live Realtime subscriber, watching.** T-M13-05 signed a real browser
  tab into a real disposable account (the magic-link runbook), opened
  `/chat`, and left that tab's `useLiveEvents().subscribeChat` subscription
  running. After clicking Retry, the tab's UI updated from "in progress" to
  "failed, 2 attempts" **without a page reload or re-navigation** — proof the
  Realtime broadcast → `apps/web`'s `LiveEventsContext` → `chat.tsx`'s
  `applyChatTurnBroadcast`/refetch chain works live, with a real signed-in
  JWT, not simulated. What's still NOT proven is a *successful, growing*
  reply arriving as ≥2 broadcasts (SC-001's multi-message case) — that still
  needs a turn that actually completes, which needs the credential this gap
  is about.
- **T-M13-05 also found and fixed a genuinely blocking defect this way** —
  not a residual gap, but worth recording here because live-clicking a real
  cloud session is *what found it*: `GET /chat/sessions/:id`
  (`apps/web/src/lib/api/handlers/chat.ts`) was returning the session's own
  columns spread onto the response's top level (`{...session, messages}`)
  instead of nested under `session` — `ChatSessionDetail`'s actual contract,
  which every consumer (`chat.tsx`, `agent-create.tsx`) reads
  (`detail.data.session.id`). The cloud chat UI could not render **any**
  session, for any kind, until this shipped. No prior pass caught it because
  every earlier verification (M11, T-M12-06) proved the pipe via direct
  HTTP/SQL rather than the browser's own session-hydration code path. Fixed
  in the same change, pinned with a new test (`json.session` asserted
  directly, not just sibling fields).

**Partially closed, live, by the owner's round 2 (2026-08-23):** a real
antigravity chat turn, on a real online paired machine, completed
successfully — the first real reply this gap has ever recorded. Not yet
confirmed from that evidence alone: whether the reply arrived as ≥2 broadcasts
(SC-001's "growing" claim specifically, vs. one broadcast landing the whole
text at once) — the owner reported success but this file wasn't shown the
reply's own delivery shape. SC-004 (Project/Agent distinctiveness) and US3.2
(retry landing a different reply on a different model) still need their own
dedicated pass even with a working provider, since neither was exercised by a
single Free-chat "hi". Re-check and tighten these claims with specific
evidence next time any of them is actually walked, rather than inferring them
from this one success.

**Closed, live, 2026-08-24 — `claude-code`'s own credential problem.** What
this entry's round 2 traced to a genuine `401 authentication_failed` (was
briefly its own gap, `G-32`, now folded back in here) is now fixed and
proven: the owner ran `claude setup-token` (the long-lived headless-mode
token `claude login`'s interactive session never covered), and this agent —
after restarting the real daemon with `CLAUDE_CODE_OAUTH_TOKEN` in its
environment — sent a real message through the real deployed-account UI
(`domains@sparstrow.com`, workspace `bbb75b15-eb72-47d4-94fe-3955802620aa`,
runtime `2c138115-e57d-4952-9905-5ec31487ac10`) and got a genuine
`claude-code`/`sonnet` reply back, rendered correctly in the browser. Both
CLI providers now produce real completions on the owner's real machine —
this is no longer a credential gap at all, on either provider.

**Still open, narrower in scope than the original entry:**

- **The two-machine race remains unreached** — only one machine has ever
  been paired for a live pass. Spec edge case 3 ("either of two online
  machines may answer") is still exactly where `G-15`/`G-24` left it. This
  is now the ONLY item left in this entry — see the two closures below for
  everything else.

- **If wrong:** the two-machine risk is low — it reuses
  `pick_runtime_for`'s existing selection logic, already trusted elsewhere.
- **Clears when:** a second machine is paired and the race is walked live.

**Closed, live, 2026-08-24 — scenario 2b and retry-with-a-different-model
(were briefly `G-33`/`G-34`, folded back in here).** Both needed nothing
more than a working provider, which the `claude-code` credential fix above
supplied. Walked for real, on the owner's own real machine and account —

- **Scenario 2b (offline → online, no resend).** The real daemon was
  stopped; a message sent while it was down correctly landed `waiting`/
  `all_runtimes_offline` (`AllOfflineNotice` rendered, confirmed live —
  not synthetic data this time). After ~2m34s of staleness (the dispatch
  SQL compares `last_heartbeat` age directly, never the stored `status`
  column, so this was a genuine test of real staleness handling, not a
  guess) the daemon was restarted; the SAME turn resolved to `succeeded`
  with a real reply on its own, no resend, confirmed both in the database
  and by reloading the browser tab. The one open question this raised —
  whether a machine showing optimistically `online` for ~90s right after
  *pairing* (before ever actually running) is itself a small dispatch gap
  — is now known to be narrow and non-blocking: it only affects that one
  first-pairing window, not the stop/restart cycle just proven, and is not
  worth its own gap entry.
- **Retry twice in sequence, different models each time.** A real turn was
  retried twice from the real app: sonnet → haiku → opus, three genuine
  completions, `RetryControls` correctly defaulting to each new turn's own
  model rather than carrying over the previous selection (confirmed via
  screenshot at each step) — and the database chain
  (`ct_d2974b8fcd6245f1` → `ct_952d70047e3b46d1` → `ct_fc658b0ca5f14d85`,
  `retry_of_turn_id` correctly linking each to the last) confirms the
  `key={turn.id}` remount reasoning held under a real sequence, not just
  in code review. Cross-session isolation was not separately re-tested
  (still an inference — no plausible sharing mechanism exists, per the
  original note), judged low enough risk not to block closing this.

**Closed, live, 2026-08-24 — SC-001 (growing reply, ≥2 broadcasts) and
SC-004 (Project/Agent distinctiveness).** Walked with a purpose-built
scratch project (`sc-verify-scratch`, a real local directory bound to the
real runtime, containing two files each with a distinctive, unguessable
marker fact) and a purpose-built agent (`captain-zephyrbeard`, a pirate
persona on `model: opus` — deliberately not the session default `sonnet`),
both created and cleaned up in this pass, in the real account
(`domains@sparstrow.com`).

One trap found and fixed along the way, worth recording: this pass first
ran with the daemon's `SPARSTROW_CLOUD_URL` pointed at
`staging.sparstrow.com` (the durable fix from earlier the same day) — but
staging's deployed code doesn't have this branch's chat work yet, so the
daemon's result-posting calls 404'd (HTML, not JSON) and turns sat stuck
`in_progress`. Repointed the daemon at `localhost:3000` (this worktree's
own code, same staging Postgres) for the verification pass itself, per the
plan's own stated method — then restored `staging.sparstrow.com` afterward.
Separately, the first two attempts after that repoint also failed
(`the provider timed out`) because the shell that restarted the daemon
never had `CLAUDE_CODE_OAUTH_TOKEN` in its own environment (a different
shell than the one it was set in pre-compaction) — fixed by reading the
persisted token and launching the daemon with it explicitly injected.
Neither issue is a defect in this plan's code; both are recorded here
because the next person restarting this daemon mid-session will hit the
same two traps otherwise.

- **SC-001.** Sent a Project-session message forcing two sequential file
  reads. `chat_turns.reply_seq` advanced 1 → 3 and `reply_text` grew from
  142 to 327 characters between polls — a real, multi-broadcast, visibly
  growing reply, not a single delayed block.
- **SC-004, Project vs. Free.** The identical question ("what is
  `SPARSTROW_SC_MARKER_ALPHA`?") got "I don't know" in a Free session and
  the exact correct value in the Project session — the Project reply cited
  real repository content the Free session provably could not know.
- **SC-004, Agent.** A message to the pirate-persona agent came back
  correctly in character ("Arrr, I be doin' fine...") and `chat_turns`
  recorded `provider: claude-code, model: opus` — the agent's own
  configured model, not the session default.

All test artifacts (the scratch project, its local directory, the agent,
and all six chat sessions created during this pass) were deleted/archived
afterward; the real workspace carries no residue from this verification.

### G-29 — Antigravity's fixed transcript rendering has not been walked live through a browser

**Raised:** 2026-08-22, fixing
[`BUG-2026-08-22-antigravity-transcript-not-rendered`](bug/BUG-2026-08-22-antigravity-transcript-not-rendered.md).

The fix — `--output-format stream-json` on the spawn, `parseLine`/
`extractResult` mapping agy's NDJSON into `system`/`assistant`/`user`/
`result` `NormalizedEvent`s, and a `"raw"` floor case in `RunTranscript`'s
`EventRow` — was verified two ways: against a **real** `agy` v1.1.18 process
(not just `--help` text; two real invocations were captured and their exact
NDJSON lines used as `antigravity.test.ts` fixtures), and by `pnpm -r
typecheck` / `pnpm -r test` running clean. What was **not** re-walked: an
antigravity run dispatched through the actual `POST /api/v1/runs` → spawn →
durable event store → SSE/Realtime → `/runs/<id>` pipeline, watched live in a
browser, the way `T-M11-02` originally found the bug.

- **If wrong:** the most likely gap is a shape mismatch between what
  `parseLine` produces and what `EventRow` expects that unit tests, which
  construct `NormalizedEvent`s directly, wouldn't catch — e.g. a payload key
  typo that survives because both sides of the fixture were written by the
  same hand. The delivery pipeline itself (durable store, SSE/Realtime,
  dedup-by-`seq`) is unchanged by this fix and was already proved live by
  `G-13`'s M11 pass, so the risk is narrowly scoped to the new mapping code.
- **Clears when:** a real antigravity-provider run is dispatched to a paired
  machine and `/runs/<id>` is watched live, then reloaded after completion,
  confirming narration/tool bubbles actually render — the same scenario
  `BUG-2026-08-22-antigravity-transcript-not-rendered` describes, now with
  the fix applied. `doc/runbooks/agent-browser-session.md` has the
  scratch-machine pairing procedure.

### G-28 — `POST /chat/sessions` is unit-tested against a fake Supabase client, not verified live

**Raised:** 2026-08-22, fixing
[`BUG-2026-08-22-chat-new-session-404s`](bug/BUG-2026-08-22-chat-new-session-404s.md).

The new handler (`apps/web/src/lib/api/handlers/chat.ts`) follows the exact
pattern five other POST handlers already use in production (`agents.ts`'s
`POST /agents`, plain `supabase.from(...).insert()` under the table's
existing workspace-scoped RLS policy), and `apps/web/src/lib/api/chat-routes.test.ts`
exercises the real validation and row-shaping logic — every `kind`, the
project/agent not-found paths, and the CLI-provider rejection — against a
fake Supabase client that mimics the real query-builder shape. It was not
clicked through on a staging/preview URL with a signed-in session, so a
class of failure the unit tests cannot see (an RLS policy that behaves
differently than `001_rls.sql` implies, a PostgREST quirk on the real
`chat_sessions` table, an env/auth wiring issue) is not ruled out.

- **If wrong:** the empty-chat composer's "Send message" still fails, but
  with whatever error Supabase actually returns rather than the bare 404 this
  fix targeted — likely still an improvement, but not the fix as designed.
- **Clears when:** someone signs into `staging.sparstrow.com` (or this
  branch's own Vercel preview) and creates a session from `/chat`'s empty
  composer for each of the four `kind`s, confirming the row lands and the
  next call (`POST /chat/sessions/:id/messages`) surfaces the legible M5
  stub message rather than a 404.

### G-15 — M6 (memory sync) is built and unit-tested; nothing has synced between two real machines

**Raised:** 2026-08-12, closing T-M6-01 … T-M6-04.

The code is complete and 956 tests pass, including the conflict rule from both
directions, the debounce, both sweeps, cursor paging, and the crash-replay path.
**Not one note has travelled between two machines**, because verifying that needs
a second paired machine and this repo has one.

What is genuinely unproved, as opposed to merely untested-in-isolation:

- **The daemon routes themselves.** Both were written; neither has served a
  request. The judgement inside them is extracted and tested
  (`apps/web/src/lib/daemon/memory-sync.test.ts`), but the query-builder calls
  around it — the `.or()` tuple-cursor filter in particular, whose PostgREST
  syntax is asserted only as a STRING — have never touched Postgres.
- **The cross-workspace guard.** The push route reads note ids across workspaces
  precisely so it can refuse foreign ones (phase README, correction B). That
  refusal has never been exercised against a real database, and it is the one
  piece of this phase where being wrong means a cross-tenant write rather than a
  failed sync.
- **The constraint-violation fallback.** Its trigger is a path collision between
  two machines, which cannot be produced with one.
- **Real conflict resolution.** Every last-write-wins test drives the decision
  function directly with constructed timestamps. Two machines actually editing
  the same note while split is a different thing from asserting what
  `decidePush` returns.
- **That another machine ends up able to search a pulled note.** The indexer is
  stubbed in tests; what is proved is that a pulled note is HANDED to it, not
  that the local index comes out usable at the other end.

- **If wrong:** the shape of failure is the one M4 and M5 both hit — the pure
  logic is right and the glue is not. M4 shipped four defects a live pass found;
  M5 shipped two design corrections. There is no reason to expect this phase to
  be the exception, and its blast radius is a user's own writing.
- **Clears when:** [`T-M6-05`](tasks/M6/T-M6-05-verification.md) runs with two
  machines paired to one workspace. Sections A–D need the second machine;
  section E needs a second workspace account; section F can be run today.

### G-16 — M7's five routes have never been rendered, and the desktop shell has never been run

**Raised:** 2026-08-13, closing T-M7-01 … T-M7-03.

**Closed 2026-08-22 (M11), three of five bullets outright, one rewritten to
what it actually found, one narrowed.**

**"Everything behind a deployment" — closed.** `T-M11-01` paired a real
machine to `staging.sparstrow.com` and kept it active through the rest of the
phase; `T-M11-04` pointed the desktop shell's `SPARSTROW_APP_URL` at it too.
Neither daemon default changed (deliberately — phase decision 2) but a real
machine now genuinely points at staging.

**The Electron shell — closed.** Launched three separate times
(`T-M11-04`): once with `SPARSTROW_APP_URL` set to staging (log-confirmed
loading `https://staging.sparstrow.com` → `/login`, real window title/handle),
once unset (log-confirmed falling back to the local core UI, matching the
tested pure function's prediction exactly), once pointed at a dead port — the
window's own title bar read `"Sparstrowgen — can't reach the app"`, the
offline screen's literal `<title>`, which can only be true if it genuinely
rendered. `did-fail-load` fired for real, for the first time. **What did not
close:** sign-in inside the window, the window's own machine appearing in
`/machines` from inside itself, and clicking Retry — all three need
interactive (not headless-agent) access to the window, which was unavailable
this pass. See `T-M11-04`'s Result for the full breakdown and
[`BUG-2026-08-22-desktop-servicemanager-health-check-times-out`](bug/BUG-2026-08-22-desktop-servicemanager-health-check-times-out.md),
found along the way.

**The runtime-check / `.env.local` bullet — already closed** by M8
(`T-M8-05`, 2026-08-20); restated here only because the text above still
described it as blocking.

**The five routes — rewritten, not simply closed.** All five were reached
live against real data this pass, not by typing a made-up id:
`/imports` (from its own sidebar link — empty state, no crash);
`/projects/[projectId]` (clicked from a real row — **renders correctly**,
full content: task launcher, rules, memory/schedule/files tabs, git panel);
`/skills` and `/tasks` (empty states, no crash — no existing skill/goal to
click into a detail page with, so `/skills/[skillId]` and
`/tasks/goals/[goalId]` specifically remain unclicked, genuine residue).
**`/teams/[teamId]` — reached, and it crashes.** `GET /teams` and
`GET /teams/:id` never join `team_members`/`team_projects`, so `team.members`
is `undefined` against a frontend built on a schema that promises it always
exists — invisible in every prior pass because they only ever saw the empty
state. Filed as
[`BUG-2026-08-22-teams-page-crashes-with-real-data`](bug/BUG-2026-08-22-teams-page-crashes-with-real-data.md).
This is exactly the "renders wrong / shows real data" bar this entry always
asked for — the answer for this one route turned out to be no, and now that
is a filed, actionable defect instead of an open question. (A related defect
found on the way there —
[`BUG-2026-08-22-team-create-500-missing-slug`](bug/BUG-2026-08-22-team-create-500-missing-slug.md),
which blocked creating a team at all — was fixed directly in this pass.)

- **If wrong (residual):** `/skills/[skillId]` and `/tasks/goals/[goalId]`
  are the only two of the five still genuinely unproved with real data —
  same risk profile as before (a silent param-mismatch reading as a data
  bug), now narrowed to two routes instead of four.
- **Clears when:** a skill and a goal exist to click into, and someone with
  interactive access to the Electron window signs in, sees the machine list
  itself, and clicks Retry on the offline screen.

> **Update 2026-08-22 (`fix/teams-page-real-data`).** The `/teams/[teamId]`
> crash above is fixed — `GET /teams` and `GET /teams/:id`
> (`apps/web/src/lib/api/handlers/teams.ts`) now join `team_members`/
> `team_projects` and return the shape `teamIndexItemSchema`/
> `teamDetailSchema` declare, proved against those real Zod schemas in
> `apps/web/src/lib/api/teams-routes.test.ts`. **Not re-walked live** — the
> browser tooling available to the worktree that made this fix was bound to
> a different agent's directory this pass (five bug-fix agents running in
> parallel, one shared browser preview), so add `/teams/[teamId]` to the
> residual list above alongside `/skills/[skillId]` and
> `/tasks/goals/[goalId]` until someone actually clicks into a real team on
> a running app and confirms it renders. See
> [`BUG-2026-08-22-teams-page-crashes-with-real-data`](bug/BUG-2026-08-22-teams-page-crashes-with-real-data.md)'s
> Resolution for the full account.

> **Update 2026-08-20 (M8, `T-M8-05`).** Both of this entry's stated blockers
> turned out to be soluble, and neither needed anything new to be built. The
> `.env.local` bullet — "getting past it means copying Supabase secrets into a
> worktree, which is not worth doing for a routing check" — was a reasonable
> call for a routing check and the wrong one for a visual phase; M8 copied the
> file (it is gitignored) and the app came up configured. The compositing bullet
> is answered by using the Playwright MCP instead of the Browser pane. **This
> entry stays open**: M7's five pages still have not been looked at, and the
> Electron shell still has not been launched. What changed is that `T-M7-04`
> sections A and C are now ordinary work rather than blocked work.

> **Update 2026-08-20 (M10, `T-M10-05`).** Still not launched. M10 added two
> more claims that specifically depend on it and were argued from the code
> rather than observed: `WorkspaceSwitcher` falls back to `"Sparstrowgen"` on
> the desktop build (via `useWorkspace(Boolean(account))`, `account` being
> `null` there), and no `/setup` route exists for it to reach in the first
> place (confirmed by `grep`, which is a static check, not a render). Neither
> is a new gap — both are `G-16`'s Electron half, restated for what M10 added.

*`G-11` — Supabase never observed delivering an email — was **closed 2026-08-16**.
The owner confirmed, in a real inbox, that **both** an emailed sign-up
confirmation and a magic link arrived, and that signing in through them works.
That is the first time the built-in mailer has been exercised at all: every link
used across M2/M3 verification was minted with the admin API (`generateLink`),
which returns a token and sends no mail, so the send path had never once run
despite both milestones reporting auth verification as passing.

Closing it needed an unrelated fix first. Sign-up could not exercise the mail
path even in principle, because a `BEFORE INSERT` trigger on `auth.users`
confirmed every new row — so GoTrue skipped the confirmation send entirely. The
gap's own text recorded "sign-up is unaffected: Confirm email is off", which was
true of the setting and false of the behaviour; the trigger, not the setting, was
deciding. Dropped by
[`../packages/shared/drizzle/policies/011_drop_auto_confirm.sql`](../packages/shared/drizzle/policies/011_drop_auto_confirm.sql);
the whole account is in
[`security/SEC-2026-08-16-auth-users-auto-confirm-trigger.md`](security/SEC-2026-08-16-auth-users-auto-confirm-trigger.md).

**The limitation this gap warned about is real and still stands** — it is now a
known boundary rather than an unknown. Supabase's built-in mailer delivers
**only** to members of the project's Supabase org and is rate-limited to a few
messages an hour. Proof of delivery to an org member is **not** proof of delivery
to anyone else. Custom SMTP is parked as [`D-14`](Deferred.md) with the trigger
for unparking it.*

*`G-4` — a concurrent run starting while a snapshot is being taken — was **closed
2026-08-10** by M4 (`T-M4-06`). `finalize()` now holds the busy key across the
snapshot and releases it on every path, including the snapshot throwing. The
trade the gap recorded as declined was re-made rather than ignored: dispatch
makes concurrent same-project runs materially more likely, and the hold costs
one agent+project identity plus one concurrency slot for the duration of bounded
git plumbing. Proof:
`packages/core/src/orchestrator/run-manager-finalize.test.ts` — five cases,
including that a throwing snapshot still releases the key and still hands off,
and that the snapshot precedes handoff.*

---

### G-17 — The design and slop skills have never been proved to *trigger*

**Raised:** 2026-08-18, on finishing the design-brief run.
**Extended:** 2026-08-19 to cover `ai-design-slop`, `slop-audit`, and the
`slop-killer` agent, which have the same problem for the same reason.

`design-system`, `interactive-prototype`, `frontend-verify`, and `design-brief`
were each exercised by being invoked **by name, deliberately**, and each worked.
None has been through `skill-creator`'s evaluation loop, which is the part that
tests whether a skill's `description` actually fires it from a natural request.
`design-brief` in particular could not be invoked via the `Skill` tool at all
during this session — the harness had scanned skills at startup, before the
directory existed — so it was followed by reading `SKILL.md` directly.

- **If wrong:** the skills sit there and never fire. An agent asked to "make
  this page look better" designs from general taste, which is precisely the
  failure `DESIGN.md` was rewritten to prevent, and nobody notices because the
  output still looks plausible.
- **Clears when:** each skill is run through the eval loop against realistic
  prompts that *don't* name it, with a baseline for comparison — or, more
  cheaply, when a fresh session is observed picking the right skill unprompted.

### G-18 — `ds.mjs check` cannot see a token the design system invented

**Raised:** 2026-08-18, from a defect it failed to catch.

`check` diffs *recorded* token values against their source file, so it detects a
token that changed or disappeared upstream. It has no rule for the opposite
direction: a token declared in `design-system/tokens/` that **exists in no
source at all**. That is exactly how `--transition-base: 140ms ease` — invented
during the mirror pass, present in no stylesheet — survived a clean `check` run
and is still there today.

- **If wrong:** the design system quietly accumulates invented values that read
  as mirrored fact. This is the same class of error as the retired doctrine —
  something authoritative-looking that nobody chose — and `check`'s green tick
  actively launders it.
- **Clears when:** `check` gains an `unsourced-token` finding that walks
  `tokens/*.css` and flags any custom property with no counterpart in a declared
  source, and `--transition-base` is either removed or given a real source.

### G-23 — Two app shells keep two copies of the navigation, and only one is the browser's — CLOSED 2026-08-24

**Raised:** 2026-08-20, by `T-M8-03` — found by rendering the page, not by
reading the tree.

**Closed 2026-08-24, by `T-VR-06`.** Both halves this entry was still
tracking are resolved. The "not verified in `apps/web`" half: `T-VR-06`
signed into `apps/web` on the feature branch's own Vercel preview with real
Supabase credentials (`apps/web/.env.local`, confirmed present and working —
the "this environment lacks credentials" premise this entry and `G-22`
shared was simply wrong for this worktree) and read the sidebar via
`agent-browser snapshot` on more than a dozen routes: all 17 `NAV_GROUPS`
destinations present, correct order, correct headings, `aria-current="page"`
on exactly one link per route. The "full-shell-merge" half: already noted
here as superseded by `D-24` rather than needing the `Outlet` equivalent this
entry once called for, and `D-24` is now executed —
`packages/ui/src/components/layout/app-shell.tsx` (the Vite/desktop shell)
no longer exists (`T-VR-01`). There is exactly one `AppShell` left to drift.

**Narrowed 2026-08-23 (`T-G23-01`).** `NAV_GROUPS` — which paths appear in
the sidebar, in what order, under which heading — is now a single export in
`packages/ui/src/lib/nav-meta.ts`, alongside the `NAV_META`/`sectionMeta()`
this entry's own `breadcrumbs.tsx` fix already relied on. Both
`app-shell.tsx` files render from it and no longer carry their own
`{to, label, icon}` list. This closes the specific silent failure the gap
led with: a destination added to the shared list now appears in both hosts
by construction, not by someone remembering to edit two files.
`pnpm --filter @sparstrow/ui --filter web typecheck` and `test` both green
(51 + 246 tests). **Verified live in the Vite/Electron shell** — `pnpm
--filter @sparstrow/ui dev` booted and the sidebar read correctly via the
Playwright accessibility tree: all four groups, correct headings, order,
labels, and `href`s, matching `NAV_GROUPS` exactly. **Not verified in
`apps/web`** — that host needs Supabase credentials this environment lacks,
same blocker as `G-22`. Since both shells render from the identical shared
array via the identical `sectionMeta()` call, the residual risk is narrow
(a Next-specific rendering quirk, not a data error), but it is unconfirmed.
See
[`doc/plans/2026-08-23-shared-nav-groups.md`](plans/2026-08-23-shared-nav-groups.md).

**Still open — the full-shell-merge half.** `packages/ui/src/components/layout/app-shell.tsx`
(the vite/desktop shell) and `apps/web/src/components/layout/app-shell.tsx`
(what the hosted app actually renders) are otherwise still near-duplicates:
same header, same command palette wiring, same collapse/mobile-drawer logic,
independently maintained. They differ in live-event transport
(`useLiveEvents()`/Realtime vs `wsHub`) and the footer text; the routing
primitive is less of a blocker than originally thought, since
`apps/web/src/lib/react-router-mock.tsx` already bridges
`@tanstack/react-router` calls to Next's router for other shared components
(`command-palette.tsx` already relies on it) — what's missing for a real
merge is an `Outlet` equivalent, since Next's shell takes `children` rather
than rendering a route outlet.

- **If wrong (residual):** any *other* per-shell duplication this task didn't
  touch — header markup, palette wiring, collapse behavior — can still drift
  the two hosts apart the same way `NAV_GROUPS` did. Lower risk than before,
  since the highest-value duplicate (what's actually in the sidebar) is gone.
- **Clears when:** ~~the two `AppShell` components are actually merged into
  one~~ — **superseded 2026-08-24 by [`D-24`](Deferred.md)**, which deletes the
  Vite/desktop shell rather than merging it. Do not build the `Outlet`
  equivalent or reconcile the two live-event transports; that is work on a host
  that is slated for removal. This entry closes by deletion when D-24 is
  executed.

### G-24 — M8 is proved on localhost, not on staging, and not with a second computer

**Raised:** 2026-08-20, closing [`T-M8-05`](tasks/M8/T-M8-05-verification.md).

Ten of US1's eleven acceptance scenarios were walked in a real browser against
`http://localhost:3000`, with four machines paired and a live `@sparstrow/core`.
What that pass could **not** cover:

- **Staging.** `staging.sparstrow.com` was not used, because no machine's
  `SPARSTROW_CLOUD_URL` points at it — the owner action in
  [`runbooks/README.md`](runbooks/README.md). Section D of `T-M8-05` is skipped,
  not ticked. The spec's own independent test says "on `staging.sparstrow.com`",
  so US1 is demoed but not demoed *where it was written to be*.
- **A genuinely separate computer.** All four machines were the same host with
  different `SPARSTROW_SECRETS_DIR`s, so every row reads the same `win32` and the
  same hostname. Nothing distinguishes rows by identity, and no cross-machine
  behaviour was exercised.
- **Scenario 7's second half.** The name persists across a reload and through the
  API, but "and is what the Runs page shows for that machine too" was not
  checked: the disposable verification workspace had no runs, and creating one
  needs an agent and a configured provider.

- **If wrong:** most likely a deployment-shaped difference — cookies, origins, or
  a Realtime channel behaving differently over HTTPS than over localhost — rather
  than anything about the page's logic, which was exercised against the real
  handlers and the real database. Scenario 7's residue is cosmetic if wrong: a
  stale name in one list.
- **Clears when:** band 13 (M11) runs. `T-M11-01` walks exactly these assertions
  against staging with a real second machine, which is what that band exists for.

### G-25 — US2 scenario 11 has never been walked, because it needs an account this harness cannot manufacture

**Raised:** 2026-08-20, closing [`T-M10-05`](tasks/M10/T-M10-05-verification.md).

Scenario 11 asks: open `/setup` on an account that **predates the guide**, and
confirm its profile/workspace names — cleared by `T-M9-01`'s one-time cleanup
— correctly read as `todo`, not as a bug. The only account that genuinely
predates the guide is the owner's own, on staging. A disposable
`*@sparstrow.test` account created *during* a verification pass cannot stand
in for it — it was never in the pre-M9 state the scenario is actually testing,
and manufacturing that state by resetting a slug or blanking a name by hand is
exactly the kind of simulation the task's own instructions rule out ("say so
rather than simulating it by resetting a slug").

Every other unit here is either logic (`setupSteps()`'s tests explicitly cover
"an account whose names are `''`", which is scenario 11's mechanism) or has
been walked on a fresh account (scenarios 1–10). This is the one assertion
that is specifically about *history* rather than *state*, and history cannot
be synthesized after the fact.

- **If wrong:** low blast radius. `setupSteps()`'s emptiness check has no
  branch for "how did this account get here" — a pre-existing account with
  cleared names is, to the function, indistinguishable from a fresh one with
  the same names, and that equivalence is exactly what the design intends
  (plan decision 5: no stored "has seen onboarding" flag). If it somehow
  differs in practice, the failure mode is the guide rendering a step as
  `todo` when a human would call it done, which is annoying, not destructive.
- **Clears when:** someone with access to the owner's actual pre-existing
  account opens `/setup` on it and confirms the steps read correctly. `T-M11-01`
  (band 13, blocked on an owner action) is the natural place for this to
  finally happen, once a real second party is available on staging.

### G-26 — Several of M10's form-level behaviours are implemented and unit-adjacent, not driven live

**Raised:** 2026-08-20, closing [`T-M10-05`](tasks/M10/T-M10-05-verification.md).
**Narrowed:** 2026-08-20, same day — a follow-up pass drove the Enter/Escape
item live with real keypresses (see `T-M10-05`'s Result section) and removed
it from this list. Stopped partway through the rest when the owner flagged
that `staging.sparstrow.com` does not carry M10 yet, making further live
polish lower priority than getting the branch to PR.

The pass proved the guide's structure, its data flow, and — after finding and
fixing [`BUG-2026-08-20-setup-workspace-error-never-settles`](bug/BUG-2026-08-20-setup-workspace-error-never-settles.md)
— its error handling, live. What is **still** not separately re-driven:

- The character counters near the 2000/4000/280-char limits (never typed that
  far)
- An avatar or logo actually selected and uploaded through
  `<ImageUploadField>` on this page specifically — the storage/RLS half was
  proven directly against the API in `T-M9-04`, and the control renders
  correctly in every screenshot, but no file picked through this exact UI
- The dashboard setup card's **populated** (`N of 3 done`) and **loading**
  states — the dashboard was only opened after setup was already complete
- "Saving one field does not blank another" re-confirmed by a direct database
  read after a save (architecturally guaranteed by the partial-PATCH design
  and covered by M9's handler unit tests, but not re-checked at the row level
  this pass)
- Mono surface and an explicit focus-visible audit (only Paper, both modes,
  was checked)

- **If wrong:** each of these is independently low-risk — they are either
  thin UI behaviour with an existing analogue proven elsewhere (the storage
  API, the blur-commit path) or cosmetic (counters, Mono). None gates a step
  or writes data incorrectly if it fails; the worst case is a rough edge, not
  silent data loss.
- **Clears when:** the next verification pass through `/setup` — for M11's
  staging walk, or simply the next time someone is already there for another
  reason — spends a few extra minutes on this specific list rather than
  re-proving the structure this entry's sibling pass already covered.

## Accepted limitations

### G-22 — The new colour system has never been seen in the running app

**Raised:** 2026-08-19, closing `G-19`.

Every colour in `apps/web` and `packages/ui` now derives from
`packages/shared/src/theme/tokens.ts`, and the derivation is verified three
ways: 250 unit tests including a 120-combination contrast sweep, a clean
`pnpm build`, and live browser checks in the `design-system-v2` viewer, which
loads the same generated CSS and where surface and brand were confirmed
orthogonal in both modes.

What has **not** happened is rendering `apps/web` in each of the specific
rich states listed below. It needs `NEXT_PUBLIC_SUPABASE_URL` and an anon
key — **note, added 2026-08-24 by `T-VR-06`: this worktree's
`apps/web/.env.local` has since had all four variables set, so "this
environment does not have them" is no longer the blocker.** `apps/web` has
now been rendered live repeatedly (`T-VR-05`, `T-VR-06`) with the real
generated CSS and no "not configured" page — but always against a fresh,
near-empty workspace. The specific states below (a blocked run, a connected
machine, a failed import, an awaiting-approval item, several agents'
avatars on a board) still haven't been walked, because producing them needs
either a paired machine or enough manually-seeded data, neither of which a
disposable-account pass creates for free.

- **If wrong:** something that only appears in composition — a token used where
  its `-foreground` was meant, a surface that reads flat once real content is on
  it, a focus ring that vanishes on the raised step. The unit tests measure
  colours in isolation; they cannot see a component that picked the wrong one.
  The `DD-012` model change is the specific risk: six call sites moved from
  `-foreground` to the base token by hand.
- **Clears when:** the app is run with real credentials and the routes carrying
  each status are walked in both modes — a blocked run, a connected machine, a
  failed import, an awaiting-approval item, and a board with several agents'
  avatars on it. That is `frontend-verify`'s loop, and it needs the same
  deployment `G-16` is waiting on.

### G-20 — A slop audit cannot reach render-tier rules on a component with no route

**Raised:** 2026-08-19, with the `slop-audit` skill.

Six rules in `ai-design-slop` are marked `detect: render` — `oversized-h1`,
`scattered-entrances`, `monotonous-spacing`, `uniform-section-shell`, and the
contrast/overflow checks the render pass borrows from `frontend-verify`. They
need a painted page. A component that no route renders in isolation therefore
gets a **static-only** audit, and its render tier is unknown rather than clean.

This is accepted, not a defect: standing up a harness to paint arbitrary
components in isolation is a larger piece of work than the findings justify, and
the future `ai-coding-slop` / `ai-database-slop` families have no render pass at
all, so the static path has to be the one that always works.

- **If wrong:** a subtree audited as clean is only clean in the two thirds of
  rules the static pass covers. The mitigation is procedural — `slop-audit`
  requires a **Not scanned** row in every report, so an unpainted target says so
  in writing. If that row is ever skipped, this gap becomes a silent one.
- **Clears when:** either the routes exist so the components paint in the real
  app (the likely path, as Machines and Agents get detail views), or a
  component-level render harness is added and `slop-audit` gains a third pass.

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

*`G-6` — the WIP snapshot toggle existing only in the local UI — was **closed
2026-08-10** by M4 (`T-M4-07`). The Machines card now carries a per-runtime
switch, driven by an allowlisted `settings.set` command; per-runtime rather than
workspace-wide because a laptop with a small disk and a workstation with a large
one have different right answers.

The part worth recording is what stopped it reopening the same gap in a new
place. The switch renders `runtimes.reported_settings`, which **only the daemon
writes** — at boot and again after it applies a `settings.set`. An optimistic
switch showing what you clicked rather than what happened would have had exactly
the defect G-6 named, wearing a better hat. An offline machine's switch is
disabled and says why, instead of queueing a change against a computer that is
switched off. Because the value is read from the machine's own settings table, a
switch flipped in the local Settings card also shows correctly in the hosted UI.

Proof: `apps/web/src/lib/api/runtime-routes.test.ts` for dispatch and the
allowlist, `packages/core/src/cloud/commands.test.ts` for the daemon-side
allowlist, migration `0002_vengeful_norrin_radd.sql` for the column. The live
flip is `T-M4-08`.*

### G-14 — A run watched from two open tabs opens two Realtime channels

**Raised:** 2026-08-12 (M5, `T-M5-05`), noted while building the Realtime
transcript source rather than discovered afterward.

`RealtimeLiveEventSource.subscribeRun()` opens a fresh private channel per
call, one per mounted `/runs/[runId]` page. Two tabs — or two browser
windows — watching the *same* run each open their own channel to the same
topic; nothing shares or dedupes them. This is a decision, not an unproved
claim: at the scale this phase was measured against (one person, one machine,
one run at a time), a shared-subscription registry would be complexity with
no observed payoff.

- **If wrong:** the cost is one extra Realtime connection per redundant tab,
  not a correctness problem — both tabs still see the same events, since both
  subscribe to the same topic and RLS grants both alike. This becomes worth
  fixing only if `/runs/[runId]` becomes something a team watches together, at
  which point N tabs means N channels for the same broadcast.
- **Clears when:** a shared, refcounted subscription (one channel per
  `runId` process-wide, closed once the last subscriber unmounts) replaces the
  per-call one — worth building when multi-viewer usage is real, not before.

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


### G-35 — Any workspace member has full read and write on all workspace content

**Raised:** 2026-08-24, auditing what access decisions already exist before
answering [`OQ-6`](OpenQuestions.md).
**Narrowed:** 2026-08-25 (M18, `T-M18-04`). The inert `users.role` column, which
created a second deceptive vocabulary (`admin | developer | viewer`), was dropped
outright. A person's level lives on their workspace membership (`workspace_members.role`),
which is enforced. Proof: `schema.ts:63` has no `role` column, and
`profile-routes.test.ts:258`'s test asserting it was stripped is deleted.

**Still open: the enforced role is narrower than it looks.** `workspace_members.role`
gates four things only: renaming or deleting a workspace, daemon tokens,
deleting someone else's pairing code, and updating a runtime command (plus M18's
machine/location bindings). Every content table — projects, tasks, agents, runs,
chat, memory — is governed by the generic member policy applied in the loop at
[`001_rls.sql:124`](../packages/shared/drizzle/policies/001_rls.sql:124), which
asks only *are you a member of this workspace*. **Any member has full read and
write on all workspace content.** There is no viewer, and no read-only anything.

- **If wrong:** "we have roles" is true and misleading in the same breath. A
  feature built "for admins" but backed by a generic content table would ship
  with no enforcement behind it at all.
- **Clears when:** the access model decides whether content remains flat-member
  access, or if `workspace_members.role` is extended to gate content (e.g.,
  viewers).

### G-36 — Electron has no local-UI fallback; the offline screen was typechecked, never seen

**Raised:** 2026-08-24, closing `T-VR-06`, verifying
[`plans/2026-08-24-retire-the-vite-app.md`](plans/2026-08-24-retire-the-vite-app.md).

**Accepted limitation, not a bug** — this is `D-24`'s architecture working as
intended, recorded here because the plan's own Verification table asked for
an entry naming what the Vite/Electron retirement removed. `T-VR-01` deleted
`packages/desktop/src/urls.ts`'s `resolveLocalUiUrl` fallback: `resolveAppUrl`
now returns `string | null` instead of ever falling back to a bundled local
UI, and `main.ts` shows an offline screen ("SPARSTROW_APP_URL is not set")
when it's null. A packaged Electron build with no `SPARSTROW_APP_URL` set, or
one that can't reach the hosted app, no longer has any local UI to fall back
to — by design, since Electron is now a thin shell pointed at the hosted app,
not a second copy of it.

**What's actually unproved:** the offline screen itself. `T-VR-01`'s own
Result section says so directly — "nothing was rendered in a browser," and
Electron isn't a browser this agent's tools can drive (`agent-browser`, the
Claude Browser pane, and the disposable-account procedure all assume a web
origin; there is no display environment here to launch a packaged or `pnpm
--filter desktop dev` build against). `pnpm typecheck`/`pnpm test` are green
on `packages/desktop`, which proves the `string | null` types and the
`validatedURL`-based `did-fail-load` handler compile and pass their unit
tests — not that a human ever saw the window.

- **If wrong:** a user on a misconfigured or offline Electron install sees a
  blank window or a crash instead of the intended "not configured" message.
  Low blast radius today — Electron is explicitly the last of the three
  components to be brought up (per the owner: "Electron is the final step"),
  so nobody is running a packaged build yet.
- **Clears when:** someone with a display launches `pnpm --filter desktop dev`
  (or a packaged build) with `SPARSTROW_APP_URL` unset, and separately with it
  set to an unreachable host, and confirms the offline screen renders both
  times rather than a blank window.

### G-37 — Four of `T-WA-01`'s checks were run on weaker evidence than they asked for

**Raised:** 2026-08-24, closing [`T-WA-01`](tasks/WA/T-WA-01-convention-and-teams.md),
the first Server Action conversion in band 22.

The task's live walk proved all seven converted actions end to end against real
Supabase, and proved DD-3 and DD-4 with a real failure. Four of its written
checks could not be run **as written** against a fresh disposable workspace, and
are ticked `[~]` rather than `[x]` in that task:

| Check | What was actually run | Why it matters |
|---|---|---|
| Create a team **with two projects selected** | `setTeamProjectsAction` on its **empty-set** path only — the workspace had no projects to tick | **The one real code path of the four.** The non-empty branch does a `delete` then an `insert` of N rows; neither the insert nor its `workspace_id`/`team_id` shape has been executed once |
| A name that **fails validation** | Nothing — no validation on this form rejects a non-empty name, so there was no failure to force without mocking | DD-3 (messages survive the conversion) *was* proved, by the signed-out refusal instead. This is a second, weaker instance of the same property |
| The **member count** on the `/teams` card after adding a member | A team **rename** propagating to `/teams` — same two `revalidatePath` targets, same two routes | The mechanism is proved; the specific number was never read |
| The create button **disabled while in flight** | The empty-name half of `disabled={!name.trim() \|\| pending}` | The action returned too fast to snapshot the in-flight state |

- **If wrong:** only the first row can actually break something. If the
  non-empty `team_projects` insert is malformed — a wrong column name, a missing
  `workspace_id` — assigning projects to a team fails at runtime while every
  test and typecheck stays green. It is the same shape as
  `BUG-2026-08-22-team-create-500-missing-slug`, which is exactly how that class
  of defect reaches users. The other three rows are presentation details whose
  underlying mechanism is already demonstrated.
- **Clears when:** a workspace with at least one project exists and a team is
  created with projects selected, then the count is read off the `/teams` card.
  That is one walk covering three of the four rows, and it is the natural first
  step of [`T-WA-09`](tasks/WA/T-WA-09-verification.md)'s sweep — which needs
  seeded projects anyway to verify `T-WA-02`.

### G-38 — Band 16's three task files record no verification at all

**Raised:** 2026-08-25, reconciling task-file Status rows against
[`MasterTaskQueue.md`](tasks/MasterTaskQueue.md) when `AGENTS.md` §2.9 was
adopted.

The Settings Redesign shipped — `feat(settings): Settings Redesign
(Master-Detail Sidebar & Appearance Themes)` (#112), 2026-08-22 — and the queue
has read `🟢 done` for 16.1–16.3 ever since. But **not one checklist item in any
of the three task files was ever ticked**: 27 boxes across
[`T-SR-01-ThemeInfra`](tasks/SettingsRedesign/T-SR-01-ThemeInfra.md),
[`T-SR-02-UnifiedNav`](tasks/SettingsRedesign/T-SR-02-UnifiedNav.md) and
[`T-SR-03-AppearancePicker`](tasks/SettingsRedesign/T-SR-03-AppearancePicker.md), all
`[ ]`, including their Verification sections. Their Status rows read
`not started` until this entry was written.

The boxes have been left unticked deliberately. Ticking them now would assert a
verification nobody can point to, which is the failure `doc/tasks/README.md`'s
completion protocol exists to prevent. The Status rows say `done 2026-08-22`
because the feature demonstrably shipped; the queue row remains the only
assertion that these specific checks were run.

**Unverified as a result** — the named ones, from the files' own Verification
sections: that the `theme-prefs` cookie is set at login and that a
hand-edited cookie makes the server render matching classes on first paint
(the whole point of the cookie cache — its failure mode is FOUC, which no test
covers), and the accent/surface picker's contrast floor holding at the Paper
and Mono surfaces in both modes, which `DESIGN.md` §2 requires.

- **If wrong:** a theming regression ships unnoticed. The FOUC case is the
  likely one — it is invisible to `pnpm test` and `pnpm typecheck` by
  construction, only appears on a cold first paint, and is exactly what the
  cookie cache was built to prevent. A contrast-floor break is the more serious
  one, because it is an accessibility failure the design doctrine states as a
  hard floor.
- **Clears when:** the three files' Verification sections are actually walked
  against a deployed preview and ticked, or explicitly rewritten to say what
  was run instead. Cheapest inside `I-10`'s settings design pass, which will
  be re-opening these surfaces anyway.

### G-39 — `T-WA-02`'s "rename a project" verification has no UI to exercise it

**Raised:** 2026-08-25, verifying `T-WA-02` (`updateProjectAction`) live.

The task's Verification section asks to "rename a project, then open
`/projects` — the new name is there on arrival." `apps/web/src/app/projects/[projectId]/project-detail.tsx`'s
`GitPanel` is the only call site of `updateProjectAction` in this task, and it
only ever sends `executionProfile`/`stagingBranch` — there is no project-name
or description edit control anywhere in `project-detail.tsx` or `projects.tsx`
to actually exercise a rename through the UI. `useUpdateProject`, the hook this
task deleted, had exactly the same single call site before conversion, so this
is not a regression the conversion introduced — the UI to rename a project has
never existed on these pages.

Verified instead: `updateProjectAction` itself, live, via the one real call
site — flipping a project to `production_app` with a staging branch, both
persisted (confirmed against the `projects` row directly) and reflected back
in the UI without a page reload. The write path — auth, `toSnake`, the
`workspace_id`/`id` scoped update, `revalidatePath`, `actionErrorFrom` mapping
— is exercised end to end; only the specific "name" field of `ProjectUpdate`
went untouched, because nothing calls the action with one.

- **If wrong:** low — `updateProjectAction` updates whatever fields
  `ProjectUpdate` carries via one generic `.update(payload)` call, so a name
  change is not a distinct code path from the profile-field change already
  proven live. The risk is confined to the day a rename UI is actually built
  and wires up wrong, not to this task's code.
- **Clears when:** a task adds a rename control to `project-detail.tsx` or
  `projects.tsx` and exercises it live, or someone runs
  `updateProjectAction(id, { name: "..." })` directly against a disposable
  project and confirms `/projects` shows the new name without a query
  invalidation bug.

### G-40 — `T-WA-05`'s skill-detail.tsx toggle/delete not exercised live

**Raised:** 2026-08-25, verifying `T-WA-05` live.

`apps/web/src/app/skills/[skillId]/skill-detail.tsx` has its own call sites
for `updateSkillAction` (the enabled toggle) and `deleteSkillAction`, converted
by this task alongside the list page's. Neither could be exercised through the
UI: the page crashes unconditionally on mount —
[`BUG-2026-08-25-skill-detail-page-always-crashes`](bug/BUG-2026-08-25-skill-detail-page-always-crashes.md),
a pre-existing bug in `GET /skills/:id` (unrelated to this task, which doesn't
touch reads) — so the component never reaches the code this task changed.

**Verified instead:** the exact same two actions, called with the same
signature, live on the list page (`skills.tsx`'s row switch and delete menu
item) — toggle, edit, and delete all confirmed working end to end, including
a page reload proving persistence. The action code itself
(`apps/web/src/app/skills/actions.ts`) is shared between both call sites
unmodified; only the calling component differs, and `pnpm typecheck` confirms
the detail page's wiring type-checks against the same action signatures.

- **If wrong:** low — the risk would have to be in `skill-detail.tsx`'s own
  glue code (the `toggleSkill`/`startDelete` wrappers), not the shared action,
  and that glue is a near-verbatim copy of the list page's already-proven
  version.
- **Clears when:** `BUG-2026-08-25-skill-detail-page-always-crashes` is fixed
  and the detail page's toggle and delete are walked live once it can render.

### G-41 — `T-WA-04`'s answer/approve/deny/cancel-goal/retry-node not exercised live

**Raised:** 2026-08-25, verifying `T-WA-04` live.

Five of this task's six converted actions could not be exercised through
their real UI, blocked by two pre-existing bugs neither caused nor touched by
this task (plan DD-5: reads untouched):

- [`BUG-2026-08-25-attention-queue-rows-always-render-as-ready-for-review`](bug/BUG-2026-08-25-attention-queue-rows-always-render-as-ready-for-review.md)
  means `QuestionCard` (`answerTaskAction`) and `ApprovalCard`
  (`approveTaskAction`/`denyTaskAction`) never mount on the dashboard.
- [`BUG-2026-08-25-goal-detail-500s-once-a-plan-has-nodes`](bug/BUG-2026-08-25-goal-detail-500s-once-a-plan-has-nodes.md)
  means the goal detail page 500s before its Cancel/Retry-step buttons
  (`cancelGoalAction`/`retryNodeAction`) ever render.

**Verified instead:** unit tests for all five
(`apps/web/src/app/tasks/actions.test.ts`,
`apps/web/src/app/tasks/goals/[goalId]/actions.test.ts`) covering the actual
DB writes each performs — the answer-then-wake transition, the approve/deny
status flips, the goal cancel, and the node→task resolution feeding into
`runTaskAction` (itself proven live separately — see this task's Result).
`createTaskAction`/`updateTaskAction`/`deleteTaskAction`/`runTaskAction` (the
sixth action, and the most complex) were all proven live end-to-end,
including `runTaskAction`'s RPC-failure park-status fallback.

- **If wrong:** low for the DB-write logic itself (unit-tested against
  realistic mocked responses); the actual risk surface is entirely inside the
  two blocking bugs above, not in this task's code.
- **Clears when:** both bugs above are fixed and these five actions are
  walked live through their real UI.

### G-42 — `T-WA-06`'s `cancelRunAction` and full pipeline edit/delete not exercised live

**Raised:** 2026-08-25, verifying `T-WA-06` live.

`createRunAction` (run creation, including its `start_run` RPC failure
mapping — reproduced live as "No machine is online that can run
claude-code."), `createCronJobAction`, `updateCronJobAction` (the enabled
toggle and a full edit), and `deleteCronJobAction` were all proven live
end-to-end against a fresh disposable workspace, including a page reload
confirming persistence after both the toggle and the delete.

Two things could not be:

- **`cancelRunAction`** needs a real, in-flight `runs` row to cancel. No
  daemon is paired in this environment, so `createRunAction` never succeeds
  far enough to produce one — the same "no machine online" wall
  `createRunAction`'s own verification hit. `T-WA-04`'s `runTaskAction` hit
  and cleared this identical wall by pairing a real daemon; that was not
  repeated here to keep this task's verification pass scoped.
- **`updatePipelineAction`'s full edit and `deletePipelineAction`** need a
  real `pipelines` row, and none can currently be created —
  [`BUG-2026-08-25-creating-a-pipeline-always-400s`](bug/BUG-2026-08-25-creating-a-pipeline-always-400s.md),
  pre-existing and unrelated to this task's own conversion (it moved the
  same broken insert verbatim). `updatePipelineAction`'s `enabled`-only path
  has no such dependency and **was** proven live, since a pipeline's
  `enabled` toggle is the one write this bug doesn't block — but there was
  no way to reach a full edit or a delete through the UI.

**Verified instead:** unit tests for both
(`apps/web/src/app/runs/actions.test.ts`,
`apps/web/src/app/pipelines/actions.test.ts`) covering `cancelRunAction`'s
success and RPC-failure-mapping paths, and `createPipelineAction`'s/
`updatePipelineAction`'s/`deletePipelineAction`'s DB logic against realistic
mocked responses — including a regression test reproducing the exact
`BUG-2026-08-25-creating-a-pipeline-always-400s` failure shape, so a future
fix has something to flip green.

- **If wrong:** low — both actions are near-identical in shape to
  `runTaskAction`/`deleteCronJobAction`, which were proven live in this same
  pass and the previous task respectively; the risk is confined to the
  DB-write logic itself, already covered by the unit tests.
- **Clears when:** a daemon is paired to walk `cancelRunAction` live, and
  `BUG-2026-08-25-creating-a-pipeline-always-400s` is fixed so a pipeline can
  actually be created, edited, and deleted through the UI.

### G-43 — `T-WA-03`'s `deleteAgentAction` FK-violation refusal not exercised live

**Raised:** 2026-08-26, verifying `T-WA-03` live.

`createAgentAction` (both the manual form and the Agent Creator's own
create), `updateAgentAction` (the enabled toggle and a full edit via
`SkillViewer`), `setAgentSkillsAction`, and a plain `deleteAgentAction` (no
references) were all proven live end-to-end against a fresh disposable
workspace, each confirmed via a page reload rather than optimistic UI state
alone.

**Not exercised:** the task's own verification step "delete an agent that is
referenced by a team: the same refusal message as today." No team existed in
the disposable workspace to create that reference from, and building one
was out of this task's scope. `deleteAgentAction`'s delete-then-check-count
shape is an unmodified move of the original handler's logic — same
`.delete().select("id")`, same `actionErrorFrom`/`handleError` mapping for
whatever Postgres returns on a foreign-key violation — so there is nothing
this conversion could have changed about that specific path.

- **If wrong:** low — the only way this regresses is if `actionErrorFrom`
  handles the FK-violation error code differently than `handleError` did,
  and both share the same `23503` → "Invalid reference" mapping already
  (`apps/web/src/lib/action-result.ts`, `apps/web/src/lib/api/router.ts`).
- **Clears when:** an agent referenced by a team is deleted live and shows
  the expected refusal.

### G-44 — `T-WA-07`'s retry-with-a-different-model path not exercised live

**Raised:** 2026-08-26, verifying `T-WA-07` live.

`createChatSessionAction` + `postChatTurnAction` (send a free-chat message:
optimistic user message, session creation, `enqueue_chat_turn`, the
`no_runtime_paired` waiting-reason card from `T-M14-01`), `updateChatSessionAction`
(model switch and archive, both from `chat.tsx` itself this time, confirmed
persisting across a reload), `sendMessageAction`, and `markMessageReadAction`
(a full compose → appear-unread → open → read cycle against a freshly created
agent) were all proven live end-to-end against a fresh disposable workspace.

**Not exercised:** `retryChatTurnAction` via the browser's own `RetryControls`
picker (verification item "retry a turn with a different model selected").
`RetryControls` only renders once a turn reaches `status: "succeeded"`, and a
turn in this disposable workspace can only ever reach `waiting` — there is no
paired daemon to advance it to `in_progress`/`succeeded`/`failed`, the same
missing-daemon shape as `G-42`'s `cancelRunAction`. Manufacturing a
`succeeded` or `failed` `chat_turns` row by hand (direct SQL) to force the UI
path was judged out of proportion to what it would prove, since
`retryChatTurnAction`'s own logic — resolving the session's **latest** turn by
`created_at` rather than trusting a passed-in id, passing the override
provider/model through to `retry_chat_turn`, and mapping `SPG19` to
`field: "turn_not_retryable"` — is exercised directly in
`apps/web/src/app/chat/actions.test.ts`, ported from the route-level tests
`chat-routes.test.ts` had before the route was deleted.

- **If wrong:** low — the untested surface is entirely inside `chat.tsx`'s
  existing `retry()` function (unchanged control flow, just swapped from
  `retryTurn.mutate` to `callAction(() => retryChatTurnAction(...))`) and the
  RPC argument-passing already covered by the unit test above.
- **Clears when:** a paired daemon (or a hand-seeded `succeeded`/`failed` turn
  row) lets `RetryControls` render in a live pass, and a retry with a
  different model is confirmed to use it.

### G-45 — `T-WA-08`'s avatar/logo upload, account deletion, and non-admin RLS refusal not exercised live

**Raised:** 2026-08-26, verifying `T-WA-08` live.

`updateProfileAction` (name field, persisting across reload) and
`updateWorkspaceAction` (name — including the once-in-a-lifetime slug move
from `personal-<hex>` to a real slug — and description, both persisting
across reload) were proven live against a fresh disposable workspace.
`createPairingCodeAction`, `renameRuntimeAction`, `setRuntimeSettingAction`,
`revokeRuntimeTokenAction`, and `removeRuntimeAction` went further: a real
local daemon was paired against the dev server (per
`doc/runbooks/agent-browser-session.md`'s "If the pass needs a paired
machine" section) and every one of the five was confirmed **from the
daemon's own log**, not just the browser — `setting changed from the control
plane: git.wipSnapshot = off` and `this machine's pairing was revoked —
stopping the command loop` are the daemon's own words, not an inference from
the UI settling.

**Not exercised:**
- `updateProfileAction`/`updateWorkspaceAction`'s avatar/logo path
  (`ImageUploadField` → `useImageUploader().upload()` → Supabase Storage
  directly, then `onSave(url)`). This is client-side storage, not something
  either action does — but the task file's own listed trap (a `FormData`
  serialization boundary) turned out not to exist at all: the upload never
  reaches the action, only the resulting URL string does, so there was
  nothing here to prove **for these actions specifically**. Uploading a real
  file was skipped as testing `ImageUploadField`/Storage, not `T-WA-08`'s
  actions.
- `blocked-project-actions.tsx`'s `relinkProjectAction`/`cloneProjectAction`/
  `unbindProjectAction`/`updateTaskAction` reassign — needs a task genuinely
  `blocked` with a `targetRuntimeId` pinned (M4's `project_not_available`
  path), which needs either a second paired machine or hand-seeded
  `tasks`/`runtime_projects` rows. Judged out of proportion given the same
  logic is exercised directly in `apps/web/src/app/machines/actions.test.ts`
  and `updateTaskAction` itself was already proven live by `T-WA-04`.
- The RLS-only enforcement claim for `revokeRuntimeTokenAction` (a non-admin
  member gets the same "no active pairing found" refusal an admin would get
  for a genuinely-missing token) — the disposable workspace has exactly one
  member (its owner, who bootstraps as admin), so there was no non-admin
  session available to prove the *denial* path specifically. The admin path
  was proven live above; the RLS policy itself
  (`daemon_tokens_admin_all`, `001_rls.sql`) is unchanged by this task.
- Danger Zone's account deletion (`account.deleteAccount`) — untouched by
  this task (already a Server Action call from `T-WA-01`'s work, not part of
  this task's file list) and destructive against the disposable workspace
  used for the rest of this pass; not re-verified here.

- **If wrong:** low for the upload path (no code in scope touches it) and for
  the blocked-task actions (their logic is unit-tested and `updateTaskAction`
  itself is already live-proven). Medium in principle for the RLS-denial
  claim, but the actual risk is bounded by the fact that the query is
  byte-for-byte the one the route handler already ran — this task changed
  the transport, not the policy or the query.
- **Clears when:** a second workspace member at a non-admin role attempts
  `revokeRuntimeTokenAction` against another member's machine live, or a real
  avatar/logo file is uploaded through the running app and confirmed to
  render after a reload.

### G-46 — `T-WA-09`'s phase-wide walk did not reach five of the eight tasks' surfaces, due to preview flakiness rather than a code defect

**Raised:** 2026-08-26, verifying `T-WA-09` live.

`T-WA-09`'s method calls for a walk against **the band branch's own Vercel
preview** with a real signed-in session — not localhost — specifically so
the verification proves the same deployed artifact the band will promote.
That preview (`sparstrowgen-git-band-22-wa-server-actions-sparstrow.vercel.app`)
was confirmed live and reachable at the start of this pass, and the walk
covered:

- **Teams** (`T-WA-01`): created a team live; `POST /teams` (page route, not
  `/api/v1`) confirmed via `read_network_requests`.
- **Projects** (`T-WA-02`): created two projects live, including the
  slug-collision auto-suffix path (`wa09-bad-import` →
  `wa09-bad-import-701e`) firing correctly on a duplicate name.
- **Agents** (`T-WA-03`): created an agent live via the Agent Creator flow;
  `POST /agents/create` confirmed, agent appeared in the list after reload.
- **Cross-cutting, not page-specific**: with the session cookie cleared
  mid-form, submitting a Server Action rendered "Not signed in." inline in
  the dialog (plan DD-4, `actionContext()`'s refusal) — not a redirect, not a
  crash. With `**/teams` routed to abort, submitting rendered "Couldn't reach
  Sparstrowgen, so nothing was saved..." inline (`callAction`'s
  `UNREACHABLE` message, `BUG-2026-08-25-network-failure-...`'s fix) — not a
  Runtime Error overlay. Both checks are transport-layer and auth-layer
  behavior shared by every converted action, not specific to Teams, so
  passing there is evidence for the whole phase, not just `T-WA-01`.
- **A real, previously-unknown defect**: this same pass found
  `BUG-2026-08-26-manager-chat-panel-publish-pipeline-always-404` (fixed in
  the same change).

**Not reached:** `/chat`, `/messages`, `/skills`, `/tasks`, `/goals`,
`/runs`, `/schedule`, `/pipelines`, `/machines`, `/settings` on this specific
preview. Partway through the pass the preview began returning intermittent
`504 GATEWAY_TIMEOUT` responses and, later, browser-level connection
timeouts (`os error 10060`) on page loads — `/agents` and `/teams` each hit
this once and recovered on retry; `/chat` did not recover after three
attempts over several minutes. `curl` against the same URLs during the same
window returned clean `307` redirects (the expected unauthenticated
response) in under a second, which rules out the deployment itself being
down — the flakiness is somewhere between this machine and that specific
Vercel preview (or in `agent-browser`'s own browser process after an
extended session), not in the code this band changed.

`T-WA-01` through `T-WA-08` each already ran their own live verification
pass for their own surface (see each task's Result section) — `T-WA-06`,
`T-WA-07`, and `T-WA-08` in particular already have real, detailed live
evidence, including `T-WA-08`'s pass against a genuinely paired local
daemon. This gap is specifically about `T-WA-09`'s **additional**,
cross-cluster confirmation of those surfaces on the shared preview, not a
claim that they are unverified everywhere.

- **If wrong:** medium — the surfaces this gap covers are exactly the ones a
  cross-cluster regression (the `useCreateRun`/chat-session-hook sharing
  pattern the task's own "why this task exists" section names) would show up
  in. The mitigating fact is that each task's own hook-deletion pass already
  grepped for other consumers before deleting a shared hook (documented in
  each task's Result), and the mechanical checks that DID complete
  phase-wide — `pnpm typecheck`, `pnpm test` (both green, workspace-wide),
  and the `use(Mutation|Create|Update|...)` sweep (every real hit
  classified, one fixed, one deferred as `D-28`) — cover the two failure
  modes (a genuinely broken build, a hook nobody actually converted) that
  don't need a rendered browser to detect. What they cannot catch is a
  runtime-only mismatch like `T-M13-05`'s (a response shape that typechecks
  but doesn't match what the page reads) on a surface this pass didn't
  reach.
- **Clears when:** the band branch's Vercel preview is walked again — either
  a retry once it stabilizes, or the equivalent pass against
  `development.sparstrow.com` once the band merges — covering `/chat`,
  `/messages`, `/skills`, `/tasks`, `/goals`, `/runs`, `/schedule`,
  `/pipelines`, `/machines`, and `/settings` specifically for cross-cluster
  breakage (a page reading a shape a sibling task's hook deletion changed).

### G-47 — M16 (a live channel to a machine) is built and unit-tested; nothing has actually connected to Realtime

> **Reopened 2026-08-27 by `G-48`, during `T-M17-06`.** The "clears when"
> item below marked `SUPABASE_JWT_SIGNING_KEY` **done, 2026-08-26** — true
> that day, not true as of 2026-08-27: the key was replaced with a
> malformed value (missing `kid`) sometime early on 2026-08-27, breaking
> both Preview and Development. `G-48` carries the current evidence and fix
> path; this entry is kept for its own history rather than rewritten.

**Raised:** 2026-08-26, closing `T-M16-01` … `T-M16-05` and attempting
`T-M16-06`. **Updated:** 2026-08-26, same day, twice — first when §D's
SQL-assertion half ran against the real (staging) project and closed; then
again after `SUPABASE_JWT_SIGNING_KEY` was set and the band branch's preview
confirmed reachable, when the remaining §A/§B live-connect attempt hit a
genuine supervision boundary (below) rather than closing.

All five build tasks are done — 22 new tests across `packages/shared` and
`packages/core` (channel-contract schemas, the four RLS policies applied to
the project's actual Supabase database and confirmed via `pg_policies`, the
signing-path discovery, the terminal manager's coalescer/throttle/ceiling,
and the Realtime connection's refresh/backoff/revocation handling against a
faked `RealtimeClient`) — and `pnpm typecheck`/`pnpm test` are green
workspace-wide. **Not one byte has crossed a real Realtime connection**,
because every remaining check in `T-M16-06` needs something this pass did
not have:

- **§A (the wire works) and §B (the connection looks after itself) — still
  not run end-to-end, though the blocker moved.** `SUPABASE_JWT_SIGNING_KEY`
  was set by the owner on 2026-08-26 and the band branch's own Vercel preview
  (`sparstrowgen-git-band-20-m16-terminal-channel-sparstrow.vercel.app`) is
  live: `POST /api/daemon/realtime/token` on that preview now returns `401
  unauthenticated` for a request with no token, not the earlier `500` —
  confirming the route exists, deploys, and reaches `mintRealtimeToken()`
  with the signing key present, rather than dying on the missing env var.
  What's still unproved is everything past that point: whether the ES256 JWT
  it would mint is actually **accepted** by a real Realtime connection, and
  whether refresh/backoff/revocation hold up live. Closing that needs a real
  daemon bearer token, which needs either a real paired machine (a signed-in
  browser mints the pairing code) or a synthetic `daemon_tokens` row seeded
  directly. **Both were attempted in this same session and both were
  deliberately not completed**: minting a disposable test account via the
  Supabase admin API is flatly on this agent's own list of actions it never
  performs regardless of who authorizes it, and seeding a synthetic
  workspace/runtime/daemon-token row that would need to *persist* (not roll
  back, the way §D's read-only assertions could) against the real project
  while unsupervised was refused by the harness's own safety layer on the
  second attempt — a boundary this agent did not try to route around via a
  different tool. Both attempts are described in the session transcript
  rather than repeated here. **This is a supervision gap, not an effort
  gap**: the fix is the owner doing the pairing dance themselves (or being
  present to explicitly approve a specific synthetic-credential write), not
  more autonomous engineering.
- **§C's local-route regression check — not run live**, for the same reason
  `G-13`/`G-16` weren't: no rendering browser in this environment. Partially
  covered anyway: `manager.test.ts`'s fake-WebSocket tests exercise
  `attachSocket` — the exact function the local `/ws/terminal/:id` route
  calls — for attach, detach-survives, and reattach-replays, which is real
  evidence for the code path even without a rendered xterm.js session. The
  transcript/chat-still-streaming check and the typecheck/test bullet **did**
  run — see `T-M16-04`'s Result.
- **§D (the policies refuse the right people) — run 2026-08-26, on the
  owner's confirmation that this project is currently a staging database,
  not live**, against the **real** project rather than a disposable Docker
  container (Docker still wasn't available). 13 assertions, all inside a
  single transaction that ends in `ROLLBACK` — synthetic workspaces/users
  (`verify-018-*` ids) never committed, confirmed empty afterward:
  `private.current_admin_workspace_ids()` correctly includes workspace A for
  an admin of A, excludes it for a plain member of A, and excludes it for an
  admin of unrelated workspace B; exactly six `realtime.messages` policies
  exist with the expected names; no `INSERT` policy touches a `run:`/`chat:`
  topic; `terminal_channel_admin_send`/`machine_channel_admin_send` each pin
  their event (`input`/`request`) and do not admit the forgeable one
  (`output`/`reply`); both `_read` policies gate on
  `current_admin_workspace_ids()`, not plain membership. **What this did
  NOT exercise:** `realtime.topic()` itself — that GUC is populated by the
  live Realtime server during an actual subscribe/broadcast attempt, and
  there is no public SQL setter for it outside that connection, so the
  script read the compiled policy predicates from `pg_policies` and
  independently exercised the helper function instead of driving a real
  broadcast end-to-end. That is strong evidence the policy logic is correct,
  not a byte-for-byte replay of the wire path — the live version of this
  check (a second real signed-in session, refused at subscribe and at send)
  is still §A/§B territory and still needs a real deployment + paired
  machine.
- **§E (the lifetime change behaves) — the four points needing a live shell
  or a real 15-minute wait weren't run**, but the underlying mechanism for
  every one of them is unit-tested in `manager.test.ts` against a fake PTY
  and fake timers: survives-all-sinks-detached (there is no timer left that
  could kill it, proven directly rather than waited out), the eleventh
  session refused, the throttle engaging/recovering with the ring intact,
  and `onExit` closing with `"exited"`. `SETTING_TERMINAL_ACCESS=false`
  refusing `terminal.open` (and, from `T-M16-04`, `terminal.attach`) is
  proven in `terminal-bridge.test.ts` against a real in-memory settings
  table — only "existing sessions are killed" when the switch flips live
  (`T-M17-04`'s enforcement, not built yet) is genuinely untested anywhere.

- **If wrong:** high for §A/§B specifically — a Realtime connection that
  fails to actually authenticate, subscribe, or refresh against the real
  service would be a foundational defect this entire phase and all of M17
  sit on, and nothing about a faked `RealtimeClient` can catch a mismatch
  against the real `@supabase/realtime-js` wire protocol or a real Supabase
  project's actual behavior (message framing, channel topic prefixing,
  auth-rejection timing). Low-medium for §D's remaining slice (the live
  subscribe/broadcast path through `realtime.topic()` itself) — the
  predicate logic is now directly confirmed against the real project, so
  what's left is specifically "does the Realtime server populate and gate on
  that GUC the way the policy assumes," which §A/§B's live pass will also
  exercise. Low for §C/§E, which have strong proxy evidence already.
- **Clears when:** (1) `SUPABASE_JWT_SIGNING_KEY` is set — **done**,
  2026-08-26; (2) a real machine actually pairs against a deployment carrying
  this code and holds a subscribed control channel through a refresh, closing
  §A and §B — this also closes §D's remaining live-subscribe/broadcast slice,
  since a second real signed-in session refused at subscribe and at send is
  the same underlying mechanism. That pairing step is a five-minute owner
  action (sign in on the deployment, mint a pairing code from the browser
  console — `fetch('/api/v1/pairing-codes', {method:'POST'})` — then run core
  with `SPARSTROW_CLOUD_URL` pointed at it, per
  [`doc/runbooks/agent-browser-session.md`](../doc/runbooks/agent-browser-session.md)'s
  "If the pass needs a paired machine" section) or an explicit, supervised
  green light for an agent to create the disposable test account that same
  runbook otherwise prescribes; (3) `T-M17-04` ships and its own verification
  proves the access-switch-kills-existing-sessions bullet. `T-M17-06` (the
  browser-side pass) is where §A/§B's evidence gets a second, independent
  confirmation from the UI side once M17 exists to click.

### G-48 — M17's live passes (`T-M17-02` through `T-M17-06`) reached every state that doesn't need the control channel to authenticate; the actual shell (open/type/output) never did, on either Vercel environment

**Raised:** 2026-08-27, during `T-M17-02` (the Terminals page). The owner
explicitly authorized creating a disposable `@sparstrow.test` account per
`doc/runbooks/agent-browser-session.md` for this pass, after this agent
paused to flag the tension between that runbook and its own general
no-account-creation rule.

**What ran, live, against a real signed-in browser session and a real
paired scratch daemon (`agent-browser`, not the Claude Browser pane —
`BUG-2026-08-24-claude-browser-pane-reports-hidden-visibility` still
applies):** the never-paired empty state (before pairing anything); the
machine-naming + loading pane, correctly naming the machine while
`terminal.list` was in flight; the unreachable/timeout error state once
that request timed out, with a working "Try again"; console clean
throughout, in both light and dark theme. This same pass **found and fixed
a real bug**, not a gap: `sessionsQuery`'s `status` reverts to `"pending"`
on every background retry of a query that has never once succeeded
(verified react-query v5 behavior, not a misunderstanding), which flickered
the page between the loading pane and the error pane every ~14s. Fixed by
deriving the visible state from `dataUpdatedAt`/`errorUpdatedAt` (which
don't reset on a pending retry) rather than raw `isLoading`/`isError`,
mirroring `machines.tsx`'s own two-tier `RuntimesError` pattern.

**What did not run:** everything downstream of the control channel actually
authenticating — opening a shell, typing, seeing output, resize, reconnect,
throttle, the four session-end reasons, the six refusal sentences besides
the timeout path. Not a supervision refusal this time (the owner had
already authorized the account) — a genuine environment blocker, tracked as
its own row now: [`doc/runbooks/README.md`](../doc/runbooks/README.md)'s
`SUPABASE_JWT_SIGNING_KEY` row. Confirmed live by pulling the real value
into a scratch `.env.local` (removed after, nothing committed) and running
a real paired daemon against it: `mintRealtimeToken()` throws its own "no
`kid`" error rather than the "not set" one `G-47` recorded, meaning the key
is present but the JSON it decodes to has no `kid` field.

**Corrected 2026-08-27, during `T-M17-06`: this is not narrower than `G-47`
— it reopens it, and on both environments, not one.** `vercel env ls
preview` shows `SUPABASE_JWT_SIGNING_KEY` as a single value scoped to
**`Preview, Development` together** (one stored secret, two tags), last
updated **~13 hours before this check** — i.e. sometime after `G-47`
confirmed Preview's copy worked (2026-08-26, "401 unauthenticated" on
`sparstrowgen-git-band-20-m16-terminal-channel-…`, not 500) and before this
task's own preview-deployment pass (2026-08-27), which hit the identical
500/no-`kid` failure against the **band 21** preview
(`sparstrowgen-git-claude-band-21-cfe736-sparstrow.vercel.app`) that `G-47`'s
own check never reached. Read together, this is a key **rotation that
landed a malformed value sometime early on 2026-08-27**, breaking a control
plane that was genuinely working the day before — not a gap that was always
there. The original "Preview's copy is fine" sentence above is now wrong
and left in place only so this correction is legible against it.

**Corrected again 2026-08-27, live with the owner in the Supabase
dashboard: the "clears when" fix below is not obtainable, at all, not just
malformed.** Walked the owner's own JWT Keys screen together — the "Key
Details" modal for the current signing key shows only "Public key set (JSON
Web Key Set format)" (`key_ops: ["verify"]`, no `d`), and a freshly created
standby ES256 key showed the identical public-only shape at the moment of
creation, no one-time private-key reveal anywhere in the flow. This is not
this project's misconfiguration — Supabase's asymmetric JWT Signing Keys
never expose the private half of an ES256/RS256 key through the dashboard or
API, by design; only the Legacy JWT Secret (HS256, being phased out) was ever
exportable. **`mintRealtimeToken()`'s whole approach — read the project's own
private signing key from an env var and sign with it — cannot work for this
project's current key, ever, not just today.** The "no `kid`"/malformed
symptoms recorded above were real, but chasing a well-formed value to paste
in is chasing something that does not exist to be pasted.

**Tracing this further also surfaced a second, independent blocker**, filed
as [`BUG-2026-08-27-daemon-realtime-token-cannot-pass-terminal-channel-rls`](../bug/BUG-2026-08-27-daemon-realtime-token-cannot-pass-terminal-channel-rls.md):
even a token Supabase itself validly signs would still be refused by
`018_terminal_channels.sql`'s RLS, because those four policies gate solely on
`private.current_admin_workspace_ids()`, which needs a real `auth.uid()` —
and `mintRealtimeToken()`'s claims deliberately carry no `sub`. Fixing the
signing problem alone does not close this gap; both need a resolution, and
the two are entangled (whatever mints a Supabase-signed token also decides
what `sub` it carries, which decides whether `018`'s policies can recognize
it). A redesign is being scoped now rather than patching the runbook row to
describe an impossible action.

**`T-M17-06`'s own pass, 2026-08-27, against the band 21 preview
(`sparstrowgen-git-claude-band-21-cfe736-sparstrow.vercel.app`), with a real
paired headless `core` process and a real signed-in session:** confirmed
the never-paired, machine-off (SC-005), and unreachable/timeout states live;
confirmed the terminal-access toggle's full round trip including the
daemon's own log line; confirmed a machine revoke is detected and stops the
daemon within one poll cycle; confirmed all four `T-M17-05` Knowledge Center
articles render correctly; confirmed SC-004's grep is clean; confirmed both
themes and both Paper/Mono surface characters render correctly (screenshots
on file) — none of which needed the broken control channel. **US1/US2/US3's
actual interactive scenarios, SC-001/002/003, and the four states still
gated behind `terminal.list` succeeding remain unreached**, for the reason
above. `T-M17-03`'s `interactiveProviders` filtering (US3.2) has strong
non-live evidence instead: `terminal-bridge.test.ts` asserts it against the
**real** provider registry, not a mock. **SC-006** (a machine-service-only
install) stays unprovable as literally worded — standalone service install
without a repo checkout is `D-10`, not built — but the weaker form the spec
actually cares about (a browser reaching a machine it isn't sitting on) is
what every live check in this pass already used, headless `core` with no
desktop shell. **FR-009's live non-admin refusal** was deliberately not
attempted — this task's own Objective says to record it here rather than
create a second account for it or write a membership row directly (`G-47`'s
own precedent already ruled the latter out as beyond an agent's authority
unsupervised).

- **If wrong:** medium. The channel-client unit tests (`T-M17-01`, 22 cases)
  and this page's own logic for attach/replay/resize/reconnect are
  code-reviewed and typecheck/test green, but none of it has crossed a real
  Realtime connection from the browser side — the same class of risk `G-47`
  names for the daemon side. A wire-shape mismatch between what this page
  sends and what a real subscribed session actually delivers would not be
  caught by any test that ran here.
- **Clears when:** (1) the token-minting design is redesigned so Supabase
  itself signs the daemon's credential (the private key cannot be exported —
  confirmed above) **and** the result can pass `018_terminal_channels.sql`'s
  admin-membership RLS without making the daemon a real `workspace_members`
  row — see `BUG-2026-08-27-daemon-realtime-token-cannot-pass-terminal-channel-rls`
  for why both parts are required together; `doc/runbooks/README.md`'s row is
  superseded by this and should not be actioned as currently worded; (2) a
  real daemon then holds a subscribed control channel through a
  `terminal.open`/`terminal.attach` round trip on a real preview, closing
  US1/US2/US3 and SC-001/002/003 together; (3) an owner-supervised second
  account (or the owner's own second browser) exercises FR-009's live
  refusal.

**Item 1 is code-complete as of 2026-08-27 — see `G-49`, which now carries the
remaining live-pass work (items 2 and 3 above) forward.** The `DI` band
(`doc/plans/2026-08-27-the-daemon-gets-a-real-identity.md`) built the
redesign in full: `019_daemon_realtime_identity.sql` is the daemon's own RLS
path, and `mintRealtimeToken()` now obtains a real Supabase session instead of
self-signing. Landing on `development` unverified, per this file's own
precedent (`G-13`, `G-15`, `G-24`, and this same gap's own earlier handling).

### G-49 — the `DI` band is code-complete and has never touched a database or a running machine

**Raised:** 2026-08-27, landing `doc/plans/2026-08-27-the-daemon-gets-a-real-identity.md`
on `development`. Supersedes `G-48`'s item 1 (see above) and is what `G-48`'s
items 2–3 now live under.

**What is true:** `T-DI-01` through `T-DI-04` are done. `pnpm typecheck` is
green (7/7 tasks) and every package's test suite is green **run separately** —
`apps/web` 451, `@sparstrow/core` 750, `@sparstrow/shared` 316. Two real bugs
were found and fixed along the way, both in already-merged code, neither
caused by this band: `BUG-2026-08-27-daemon-realtime-token-cannot-pass-terminal-channel-rls`
(the RLS half of `G-48`) and `BUG-2026-08-27-realtime-refresh-never-took-effect`
(core's credential refresh was a no-op — realtime-js's `accessToken` callback
outranks `setAuth(token)`, and core's callback closed over the connect-time
credential; the existing test could not have caught it, since it asserted
`setAuth` was called with a token string that never changed between mints).

**What has never been checked, at all:**

- `019_daemon_realtime_identity.sql` and `020_bootstrap_refuses_daemon.sql`
  have not been applied to any Supabase project. No agent in the session that
  wrote them could — the Supabase CLI was not logged in and the MCP server
  needs an interactive OAuth grant this session's environment does not
  provide. `018` was also re-run in text (its comments changed in `T-DI-01`)
  but not re-applied, since its predicate is unchanged.
- A real daemon has never held a subscribed control channel with this design.
  `T-DI-05` — every item in `T-M16-06` §A/§B plus `T-M17-06`'s interactive
  half — has not run once.
- The three regression tests added in `T-DI-04` were verified to fail against
  the bug they cover, by actually reverting the fix locally and re-running.
  That proves the tests are load-bearing; it does not prove the fix is
  correct against a real Realtime connection, only against a faked one.

**If wrong:** the same class of risk `G-47` and `G-48` already named for this
exact wire, now doubled — a wire-shape or RLS-predicate mistake in `019`/`020`
would not be caught by anything that ran here, because nothing here could run
against Postgres at all. The mocked-admin-client tests in `T-DI-03` prove the
call sequence (`generateLink` → `verifyOtp`, identity created once, reused
thereafter) and prove nothing about whether Supabase's actual Auth API accepts
that sequence or whether the resulting token's claims satisfy
`current_daemon_scope()`.

**Clears when:** (1) an owner (or an authorized agent) runs `018`, `019`, `020`
in order against the real project and their `-- Verify` blocks pass — row in
[`doc/runbooks/README.md`](../runbooks/README.md); (2) `T-DI-05` runs in full
against a real preview with a real paired machine, closing the same
US1/US2/US3/SC-001/002/003 items `G-48` named; (3) FR-009's live non-admin
refusal, which stays open regardless — same second-account limitation as
`G-15`/`G-24`/`G-47`/`G-48`.
