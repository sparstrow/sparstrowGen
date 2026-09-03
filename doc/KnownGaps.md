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
piece of working code.

**When you clear one, delete the entry** and say where the proof lives, exactly
like `OpenQuestions.md`. The length of this file is a real signal; a gap that
lingers because closing it was inconvenient is the whole failure mode this file
is meant to prevent.

**When you leave one, add it here in the same change that creates it.** A caveat
mentioned only in a chat message does not exist. If verification was skipped, say
so in the task's Result section *and* open an entry here.

Each entry carries: what is unproved, why it ended up that way, what it would
cost if the assumption is wrong, and the concrete thing that would close it.

**Never reuse a `G-` number.** A cleared id looks free, so the next writer takes
it, and every reference to the old meaning silently starts pointing at the new
one. Allocate above the highest number this file has **ever** used — currently
`G-64` — not above the highest currently present.

---

## The 2026-09-02 restructure closed 35 entries at once

The [restructure plan](plans/2026-09-02-multica-architecture-restructure.md)
replaces the surfaces most of this register was describing: the Next.js-coupled
web UI, the Electron-wraps-Next desktop shell, the Supabase-Realtime transports,
and the `staging` environment. An entry saying *"this surface was built and never
run"* is not information about a surface that is being rebuilt — it is noise that
the next agent has to read and discard.

**What was closed, and why.** Nothing here was closed because it was
inconvenient; each names the reason it stopped being a statement about the code
we are keeping.

*Superseded — the surface is being rebuilt, and Phase 4 of the restructure proves
the replacement live:* `G-2`, `G-12`, `G-13`, `G-16`, `G-22`, `G-25`, `G-26`,
`G-28`, `G-29`, `G-31`, `G-36`, `G-38`, `G-49`, `G-50`, `G-55`.

*Superseded — the WA server-action conversion that produced them is itself
superseded:* `G-37`, `G-39`, `G-40`, `G-41`, `G-42`, `G-43`, `G-44`, `G-45`,
`G-46`.

*Superseded — the subsystem is parked (see `Deferred.md`):* `G-15` (memory sync),
`G-47` and `G-48` (terminals and the Realtime control channel), `G-10` (Knowledge
Center).

*Superseded — the mechanism is being replaced:* `G-14` (per-tab Realtime channels
— the server owns the WS now).

*Superseded — the process rule that created them is suspended:* `G-17`, `G-18`,
`G-20` (design/slop skill chain).

*No longer true or no longer relevant:* `G-23` (already closed 2026-08-24, text
left behind), `G-24` and `G-54` and `G-60`'s staging half — `staging` is retired
and verification no longer depends on a deployed host.

**`G-60` survives in narrowed form** — its staging half is moot, but the broken
`drizzle-kit migrate` path applies to the one Supabase project we are keeping.

**`G-61` was opened and closed the same day.** It recorded that `pnpm dev:up`
had never been run, because Docker's daemon was not accepting connections. Docker
finished starting later that session, and the whole path was then exercised:
local Supabase up, `pnpm db:reset` building all 42 tables with RLS *and* grants
asserted, the app signed in as `agent@sparstrow.com` via the magic-link procedure
in [`runbooks/agent-browser-session.md`](runbooks/agent-browser-session.md), and
Settings → Profile rendering real data from an authenticated query. Running it
found three defects that inspection had not: missing role grants after a schema
rebuild, a stale `apply-to-supabase.sql`, and the RLS abort recorded in
[`SEC-2026-09-02-rls-bootstrap-aborts-leaving-dispatch-unprotected`](security/SEC-2026-09-02-rls-bootstrap-aborts-leaving-dispatch-unprotected.md).
Which is the entry's own point, made twice: written and typechecked is not run.

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
- **Clears when:** someone runs the daemon in an interactive console, presses
  Ctrl+C, and confirms `shutting down` in the log and `draining` on the row. Two
  minutes of a human's time; no code needed.

### G-27 — `claude-code`'s capability probe cannot tell "the binary runs" from "it can actually authenticate"

**Raised:** 2026-08-22, `T-M11-01`/`T-M11-02`, found live rather than by
inspection.

`probeCapabilities()` calls each provider's `healthCheck()`, and `claude-code`'s
implementation runs `claude --version` and sets `authenticated: null`
unconditionally — the field exists in `ProviderHealth` but this provider never
actually determines it. On a machine whose OAuth token had genuinely expired, the
capability badge still read `claude-code: true`, and a real run dispatched to it
spawned correctly, then failed only after 3 minutes and 7 exponential-backoff
retries with `"OAuth access token has expired."` — legible once it arrived, but
slow, and exactly the shape of problem `T-M11-01`'s own checklist warned about
("a capability claimed here that is not really there becomes a run that dies at
spawn") — except it didn't even die at spawn, which is arguably worse.

- **If wrong:** every dispatch to a machine with a stale token burns ~3 minutes
  of retries before failing, on every run, until someone notices and
  re-authenticates. Not a correctness bug — the eventual message is accurate —
  but a real latency/UX cost with no visibility until it happens.
- **Clears when:** `healthCheck()` gains a cheap real auth check (e.g. a minimal
  authenticated API call with a short timeout, distinct from `--version`) so
  `authenticated` is genuinely populated, and the capability badge can
  distinguish "installed" from "installed and usable."

**Restructure note:** this is squarely on the carried path — the slice's whole
premise is "pick an agent and it runs on my machine" — so it is a strong
candidate to close during Phase 4 rather than survive it.

**CONFIRMED with direct evidence, 2026-09-03 (Phase 4).** This was previously a
prediction from reading `healthCheck()`. It is now measured:

- the daemon registered with `capabilities: ["claude-code","antigravity","ollama"]`
  — the probe said claude-code was available
- a real chat turn was enqueued, assigned to that runtime, claimed by the daemon
  in under 10 seconds, and executed
- it ran to the full `TURN_TIMEOUT_MS` (120s) and failed with
  `"the provider timed out"` — no output at all
- **`claude -p "Reply with exactly one word: ready"` run directly in the same
  shell produced nothing in 100 seconds either**, while `claude --version`
  returned `2.1.90` instantly

So the gap is exactly what it said: `--version` succeeding proves the binary
runs and nothing more, and a capability derived from it will happily route work
to a machine that cannot complete it.

⚠️ **Caveat on the environment, so this is not over-read.** That measurement was
taken inside a running Claude Code session, and a nested non-interactive
`claude -p` may be blocked by that context rather than by anything about the
owner's setup. What is proved is the *shape* — the probe cannot tell a runnable
binary from a usable one — not that this machine's CLI is broken.

**What the same run DID prove**, and it is the more important half: enqueue →
runtime assignment → daemon claim → execution → failure reported back to the
control plane all work, end to end, in under ten seconds. The dispatch spine is
sound; only the provider's own readiness is unverified.

### G-51 — `claude-code`'s `--allowedTools`/`cwd` scoping for a chat turn is unverified live; `antigravity`'s is confirmed NOT to work at all

**Raised:** 2026-08-28, while implementing `T-CS5-03` (Band 26, CS5 chat
attachments), whose own Trap demands confirming (not assuming) that `Read`
genuinely cannot escape `cwd` before calling the free/agent attachment scoping
"done."

**`antigravity` is not a gap — it's a confirmed, filed defect**:
[`SEC-2026-08-28-antigravity-headless-tools-unrestricted`](security/SEC-2026-08-28-antigravity-headless-tools-unrestricted.md).
Live-verified that `agy`'s `view_file` reads an absolute path outside its spawn's
`cwd` without refusal, and that `allowedTools`/`disallowedTools` are never wired
into that provider's spawn at all — `agy` has no equivalent flag. This predates
CS5 and affects every existing `free`/`project`/`agent` antigravity chat turn,
not just attachments.

**`claude-code`'s side of the same question is a genuine gap, not a defect**:
this environment's `claude` CLI has an expired OAuth token, the same pre-existing
limitation `G-27` describes — re-authenticating a real Claude subscription is
outside this repo's code and not something an agent should do unattended.
Whether `--allowedTools Read` genuinely refuses an absolute path outside `cwd`
for `claude-code` specifically was therefore **not** confirmed either way.

**If wrong (i.e. if `claude-code` also does not enforce this):** high. The entire
free/agent half of the attachment delivery mechanism — the only half meant to
grant scoped rather than full access — would be security theater on both
supported CLI providers, not just one.

**Clears when:** the `claude` CLI is re-authenticated in a test environment and
the exact same live probe run against `antigravity` above is repeated against a
real `claude-code` headless spawn. A refusal closes this entry outright; a
successful read promotes it to a second `doc/security/` entry at least as severe
as antigravity's.

### G-52 — no chat turn has ever been proved to USE an attached file's content

**Raised:** 2026-08-28, closing `T-CS6-02`.

The strong bar is: attach a file with a distinctive fact, ask about it, and
confirm the reply names that fact rather than merely acknowledging that an
attachment exists. **That assertion is unproved.**

Everything up to the model is proved, and the boundary is worth stating
precisely rather than as "couldn't test it". A real runtime was paired and
`active`, it claimed the turn, and the server log shows it fetching the
attachment through the signing route before running. So delivery — upload, row,
storage path, signed fetch, hand-off — is genuinely exercised end to end.

What failed is the last hop: every turn ended `status = failed`,
`error = "the provider timed out"`, because neither `claude-code` nor `agy` is
authenticated in this environment. The file reached the CLI's doorstep and no CLI
answered.

**If wrong:** moderate. A failure here would mean the file arrives but is scoped,
pathed or permissioned such that the CLI's `Read` tool cannot open it. The
feature would look complete and do nothing useful. Related: `G-51` already
records that `antigravity`'s tool scoping is confirmed not to work at all.

**Clears when:** any pass runs a chat turn with an attachment on a machine with an
authenticated CLI provider, and the reply names a fact that exists only inside the
attached file.

---

## Accepted limitations

### G-5 — Untrusted runs are badged, not write-clamped

**Raised:** P5 (EH6/EH7). Surfaced to users in the Knowledge Center's
`limitations.md`.

`isUntrustedRun()` stamps `runs.untrusted` and memory notes from those runs are
quarantined. There is no general *write* clamp: the strict clamp sandboxes get is
not applied to every untrusted run.

Note the structural reason, which is easy to miss — one of the three signals
(external-content tool use) is only knowable from the finished transcript, so it
**cannot** gate the run that produced it. Only `isSandbox` and `delegated` are
known at spawn and could be clamped there.

- **Clears when:** a spawn-time clamp is built for the two signals that are known
  at spawn. The third can never gate its own run; the quarantine is the
  mitigation for it, by design.

**Restructure note:** this matters more now, not less. Cutting the HITL gate
removed one of the three mitigations for cloud-canonical dispatch; workspace-scoped
RLS and the `effectiveTools` spawn clamp are what remain. See `Deferred.md`'s HITL
entry.

### G-7 — Leaked-password protection is unavailable on the current Supabase plan

Requires Pro; confirmed 2026-08-10 by signing up with `password123` and getting a
session. No SQL equivalent exists, so nothing in this repo can fix it, and the
advisor will keep flagging it. Recorded in full in
[`runbooks/README.md`](runbooks/README.md) — listed here only so the register is
complete. Magic-link sign-in is a partial mitigation.

### G-8 — `apps/web` still uses `middleware.ts`, deprecated in Next 16

**Raised:** 2026-08-10 (auth work), noted and not acted on.

Next 16 deprecates `middleware` in favour of `proxy`. `apps/web/src/middleware.ts`
works today and carries the session-refresh and API-401 behaviour that M2 fixed.

- **If wrong:** nothing now; it breaks on a future Next major.
- **Clears when:** the rename is done deliberately, with the `/api/` passthrough
  re-verified — that behaviour is load-bearing (it is what makes API calls return
  JSON 401s instead of an HTML login page) and is easy to lose in a mechanical
  port.

**Restructure note:** Phase 1 turns `/api/v1/[...path]` into a proxy to `server/`,
which touches this file's neighbourhood. Worth closing while in there.

### G-30 — Cloud chat turns stream at whole-message granularity, not token-level

**Raised:** 2026-08-23, building the daemon's executor for cloud-dispatched chat
turns.

Every CLI provider's `parseLine` normalizes the provider's own `stream_event`
lines into an opaque `status` `NormalizedEvent` without extracting any partial
text — the finest signal derivable from the event list is "a new complete
assistant message arrived". This is not a bug in the wiring; it is the actual
granularity available today, named rather than assumed.

- **If wrong** (i.e. if this is treated as token-level streaming by anything
  downstream): the UI would be built expecting smoother, more frequent deltas
  than the pipe can ever deliver, and would need reworking once the gap between
  "assistant message arrived" and "typing indicator" became visible.
- **Clears when:** a use case actually needs finer granularity, at which point
  `claude-code.ts`'s `parseLine` would need to parse `stream_event`'s own
  `content_block_delta` payloads rather than discarding them. Until then,
  whole-message is the documented contract.

**Restructure note:** Phase 2's `packages/views` chat surface must be designed
against whole-message granularity, not a typing indicator that implies tokens.

### G-35 — Any workspace member has full read and write on all workspace content

**Raised:** 2026-08-24. **Narrowed:** 2026-08-25 (M18, `T-M18-04`) — the inert
`users.role` column, which created a second deceptive vocabulary, was dropped
outright. A person's level lives on their workspace membership
(`workspace_members.role`), which is enforced.

**Still open: the enforced role is narrower than it looks.**
`workspace_members.role` gates four things only: renaming or deleting a
workspace, daemon tokens, deleting someone else's pairing code, and updating a
runtime command (plus machine/location bindings). Every content table —
projects, tasks, agents, runs, chat — is governed by the generic member policy
applied in the loop at
[`001_rls.sql:124`](../packages/shared/drizzle/policies/001_rls.sql:124), which
asks only *are you a member of this workspace*. **Any member has full read and
write on all workspace content.** There is no viewer, and no read-only anything.

- **If wrong:** "we have roles" is true and misleading in the same breath. A
  feature built "for admins" but backed by a generic content table would ship
  with no enforcement behind it at all.
- **Clears when:** the access model decides whether content remains flat-member
  access, or if `workspace_members.role` is extended to gate content.

**Restructure note:** this is the entry that gates re-introducing the HITL gate.
It is also why the HITL cut is safe *today* and not safe once a second person
joins a workspace.

### G-53 — deleting a chat session leaves its attachment objects in the bucket

**Raised:** 2026-08-28, while verifying CS1's delete during `T-CS6-02`.

Deleting a session cascades correctly in Postgres — verified directly, with
**zero** orphaned attachment rows. The `storage.objects` in the
`chat-attachments` bucket are a separate store with no foreign key to any of
that, and nothing deletes them, so the bytes remain after the row describing them
is gone.

Not filed as a bug: nothing behaves incorrectly against what was built, and the
objects are unreachable through the app once their rows are gone (the bucket is
private and every read path joins through `chat_message_attachments`). Accepted
limitation, not wrong behaviour.

**If wrong:** low today, growing. The cost is storage the owner pays for and
cannot see or clear from the UI, plus content that outlives a conversation the
owner believes they deleted — a privacy expectation more than a security
boundary, since the objects stay unreachable.

**Extended 2026-08-29.** A second, narrower way to reach an orphaned object: the
daemon uploads each produced file to storage, then binds it via a POST. If that
POST never lands, the objects sit in the bucket with no row ever created for
them, indistinguishable from the session-delete case once orphaned.

**Clears when:** session deletion also removes the bucket objects under that
session's `<workspace_id>/<session_id>/` prefix, and a test confirms a deleted
session's prefix is empty. Whatever closes one cause should close both — the fix
(a scheduled sweep of unreferenced objects, or tightening the POST's delivery
guarantee) is the same shape.

### G-64 — the desktop installer still ships a whole Node runtime, for four native modules it mostly does not use

**Raised:** 2026-09-03, restructure Phase 3, when the plan's instruction to
delete the bundled Node runtime turned out to be only half safe.

Phase 3 deleted the bundled **Next.js server** — the thing that actually made
this app unbuildable — but the bundled **`node` binary** had to stay, and the
reason is worth writing down so nobody deletes it again hoping.

The daemon imports four native addons:

| Module | For | Status |
|---|---|---|
| `better-sqlite3` | its own execution store | carried, genuinely needed |
| `node-pty` | terminals | **parked** ([`D-37`](Deferred.md)) |
| `fastembed` | memory embeddings | **parked** ([`D-31`](Deferred.md)) |
| `sqlite-vec` | vector search | **parked** ([`D-31`](Deferred.md)) |

A native addon is compiled against one Node ABI, and Electron's differs, so the
daemon cannot run as Electron-as-Node and a packaged install must carry an
interpreter for it. Three of the four belong to subsystems that are parked and
that nothing in the carried product calls — but the modules are still
**imported at module scope**, so they are still loaded, and the runtime is
still required.

**If wrong:** nothing breaks. This is installer weight and build complexity, not
a correctness or security problem. The cost is roughly a Node binary per install
plus the prebuild-staging step in `prepare-resources.mjs` that verifies them.

**Clears when** — and the order matters, because the last step is the cheap one:

1. the parked subsystems' imports are removed from the daemon's module graph
   (unwiring, not deleting — the code stays per `D-31`/`D-37`),
2. `better-sqlite3` is replaced by Node 22's built-in `node:sqlite`,
3. the daemon then has **no** native addons, can run as Electron-as-Node, and
   `node-runtime` leaves `extraResources` along with `nodeBin`.

The restructure plan predicted exactly this — *"`better-sqlite3` is the only
native module left, and Node 22 ships `node:sqlite` built in"* — it was simply
premature by one phase: parking a subsystem is not the same as unwiring it.

### G-62 — two different `slugify`s, and `projects.slug` gets whichever one the caller happened to import

**Raised:** 2026-09-02, restructure Phase 1, when moving `apps/web/src/lib/slug.ts`
into `@sparstrow/shared` put both functions in one namespace for the first time
and the compiler refused the collision.

There are two slug derivations, and they disagree:

| | `schemas/common.ts` `slugify` | `slug.ts` `slugifyShort` (was also `slugify`) |
|---|---|---|
| Truncates at | 80 chars | 40 chars |
| Trailing `-` after truncation | **can leave one** | cleaned up |
| Used by | `server/src/api/routes/*`, `agents/ingestion.ts`, `memory/*`, `projects/provision.ts` | `server/src/routes/handlers/*`, the web Server Actions |

They were never importable from the same place, so nothing ever compared them.
**The consequence is real and already shipped:** `server/src/routes/handlers/
projects.ts` derives `projects.slug` with the 40-char one while
`server/src/api/routes/projects.ts` derives it with the 80-char one — so the
same project gets a different slug depending on which path created it, and a
name between 40 and 80 characters produces two different URLs for one thing.

Phase 1 renamed the moved one to `slugifyShort` and **changed no behaviour**.
That is deliberate: slugs are already written to a not-null unique column and
already in URLs, so picking a winner is a data decision, not a refactor.

**If wrong:** low severity, awkward to fix later. Nothing breaks today — both
produce valid slugs and the unique constraint holds. The cost is that a project
created through one path cannot be found by a link built from the other, and
that unifying later either rewrites existing slugs (breaking saved links) or
leaves a permanent split.

**Clears when:** the owner decides which behaviour is canonical (recommendation:
the 40-char one, because the trailing-dash cleanup is a strict improvement and
40 is already the tighter constraint), the loser is deleted, and a migration
either backfills the affected rows or the decision to leave them is recorded
here.

### G-63 — `apps/web` still reads the database directly in three places

**Raised:** 2026-09-02, restructure Phase 1, while auditing what stops `apps/web`
being a thin client.

AGENTS.md §1 rule 1 says only `server/` talks to the database. Three surfaces in
`apps/web` still do not obey it, and each needs a different fix:

1. **`lib/chat-attachments.ts`'s `sessionAttachments`** — called with the
   *browser's* Supabase client from `chat.tsx`, relying on RLS for scoping. A
   real client→database query, the shape the restructure exists to remove.
2. **`app/teams/page.tsx`** — a Server Component that resolves the workspace and
   queries directly, rather than going through a route. It was built as the
   deliberate worked example of the old `apps/web/CLAUDE.md` pattern, which that
   file now says is forbidden.
3. **the 44 Server Actions** across 18 `actions.ts` files — the main body of the
   work, already scheduled as Phase 5.

The audit's good news, recorded so it is not re-done: only **7** files in
`apps/web/src` have a *runtime* `@supabase/*` import, not the 16 the plan
counted — the other 9 are `import type`. Of those 7, three are the auth plumbing
(`utils/supabase/{client,server,middleware}.ts`) which is genuinely web-only and
stays, and one is a test. The real remaining surface is small.

**If wrong:** this is not a security gap — RLS governs every one of these reads,
and `G-35`'s "any member has full access" limitation is the boundary that
actually matters. It is an architecture gap: each of these is a screen the
desktop and mobile apps cannot have, which is precisely the failure the
restructure is correcting.

**Clears when:** all three are routes in `server/` called through
`packages/core`, and `grep -rl "@supabase/" apps/web/src` returns only the auth
plumbing.

### G-59 — the full test suite fails intermittently under parallel turbo

**Raised:** 2026-09-02.
**Diagnosed and mitigated 2026-09-02** (restructure Phase 0c). **Narrowed, not
closed** — read what was and was not proved before trusting it.

**What was proved.** The flake is CPU contention between vitest worker pools, not
a logic error in the three routes. Same commit, three invocations:

| Invocation | Result |
|---|---|
| `turbo run test` (5 packages in parallel) | `apps/web` failed 1 test file |
| `turbo run test --filter=web` (alone) | 529/529 |
| `turbo run test --concurrency=1` | all 5 packages green, **4 consecutive runs** |

Each package spawns its own full vitest worker pool, so five at once
oversubscribes the CPU on Windows. This is the disposition the entry's own
"closes when" clause named as the tooling outcome.

**The mitigation.** `pnpm test` is now `turbo run test --concurrency=1`
(root `package.json`, with the reasoning inline next to it). `pnpm test:parallel`
is kept to reproduce the flake deliberately. Cost: ~54s serial versus ~53s
parallel — the packages were never the bottleneck, the contention was.

**A confounder worth naming.** The same change unified vitest from a 3/4 major
split to 4 everywhere via the pnpm catalog, and fixed two genuine vitest-4
breakages in `packages/core/src/cloud/realtime.test.ts` (an arrow function used
as a mocked constructor; `restoreAllMocks` no longer clearing `vi.fn()` call
history). So "mixed vitest majors" cannot be fully separated from "worker
contention" as the original cause. The serial-vs-parallel result above is
measured on the *unified* tree, so it isolates contention on today's code — but
it does not retroactively prove which of the two caused the original reports.

**What is still unproved:** four consecutive green serial runs, not ten. The
original entry asked for ten runs of the parallel invocation on a base commit;
that specific test is now moot, since the parallel invocation is no longer what
`pnpm test` does.

- **If wrong:** a real race in `realtime/token`, `chat/attachments/sign-upload`
  or `chat/turns/[id]/result` is now merely *less likely to be observed* rather
  than absent. Serialising reduces the interleaving that would expose it.
- **Closes when:** ten consecutive green `pnpm test` runs, **or** the three
  routes are read for shared state directly. Whoever adds CI should cap
  concurrency there too — the flake is a property of the machine, not the repo.

---

<!-- original text of G-59, preserved -->

**Original report, 2026-09-02:**

`pnpm test` (turbo, all packages in parallel) intermittently reports 1–4 failures
in `apps/web`, and **a different set each run**. The same suites pass
deterministically when run any other way:

| How it was run | Result |
|---|---|
| `pnpm test` (turbo, parallel) | 1 failure, then 4 different failures |
| `pnpm turbo run test --filter=web`, twice | 528/528 both times |
| `pnpm turbo run test --concurrency=1` | web passed |
| `npx vitest run` in `apps/web`, three times | 529/529 every time |
| the named failing files alone | 15/15 |

The failing tests vary across `realtime/token`, `chat/attachments/sign-upload`
and `chat/turns/[id]/result` — files with no shared state, whose only common
property is being vitest workers competing for CPU with other packages' suites on
Windows.

**Not attributed to any one change, and not proved to predate them either.** The
evidence is strong circumstantial evidence of harness contention rather than a
logic error, but the decisive test — running the suite the same way on a base
commit — was not done.

- **If wrong:** a real race in one of those three routes would be masked as flake
  and shipped.
- **Closes when:** the same parallel invocation is run ten times on a base
  commit. If it flakes identically, this becomes a tooling entry (vitest worker
  concurrency on Windows) and the CI config caps concurrency. If it does not, the
  three routes get looked at properly.

**Restructure note: this one blocks the plan's own verification story.** Phase 0's
`make check` is worthless if `pnpm test` is nondeterministic. Cap turbo
concurrency in Phase 0 and see whether it goes away.

### G-60 — `drizzle-kit migrate` cannot be used on the shared Supabase project

**Raised:** 2026-09-02. **Narrowed 2026-09-02** by the restructure: the entry
originally described `staging`, which is retired. The finding survives because it
was never really about `staging`.

`packages/shared/drizzle/policies/README.md` documents the apply order as
`drizzle-kit migrate`, then two `psql -f` invocations. **Step 1 does not work
against the shared project and evidently never has.** Checked directly on
`pnymngoqseltgigcfevq`: `drizzle.__drizzle_migrations` holds **zero rows** while
`public` holds **42 tables**. The database was built by pasting
`apply-to-supabase.sql`, not by running the migration sequence, so drizzle
believes nothing has ever been applied and would start at `0000` — aborting on
the first `CREATE TABLE "agent_instances"`, which already exists.

**Any environment bootstrapped from that bundle has the same problem.** Nobody
noticed because every migration until now either went into a fresh database or
was applied by hand. Compounding it: **`psql` is not installed** on the
maintainer's Windows machine, so steps 2 and 3 as written don't run there either.

**Worked around, not fixed.** `packages/shared/drizzle/apply-pending.mjs` applies
named SQL files directly, in one transaction, with a post-condition check. It
deliberately does **not** write to the journal, because filling in a journal that
is already wrong would hide this rather than fix it.

**If wrong (i.e. left as is):** every future migration needs the same manual
handling, and the README keeps telling people to run a command that fails in a
confusing way — it reports a table collision, which reads as "someone else
already applied this" rather than "the journal is empty". The real risk is
someone resolving that confusion by dropping the colliding table.

**Closes when:** the journal is backfilled with the hashes of `0000`–`0012` on
every environment built from the bundle, so `drizzle-kit migrate` resumes being
the true apply path — and `policies/README.md` either regains accuracy or says
plainly which environments it applies to.

**Restructure note: read this before Phase 0c.** Dropping the HITL columns is the
first migration of the rebuild, and it must go through `apply-pending.mjs`, not
`drizzle-kit migrate`. Local Docker Supabase per feature branch is a fresh
database and does not have this problem — which is a second reason to prefer it.

---

## G-65 — Two desktop installs cannot both run; the daemon port is a single hardcoded constant

**Opened:** 2026-09-03, by running the app on a machine that already had one.

`packages/shared/src/constants.ts` fixes `DEFAULT_PORT = 48750` for every
install. Stable and Staging were separated at every other level — `appId`,
`productName`, `userData` — and each separation was verified; the runtime port
was not among them, and nothing ever ran both at once to find out.

Adoption cannot paper over it either: `ServiceManager.start()` adopts an
already-listening runtime, but only via `probeHealth`, which authenticates with
the **per-install** `.api-token`. A second install's token gets a 401, which is
indistinguishable from "nothing is listening".

**Mitigated in the same change, not fixed.** The second install now fails fast
with a sentence naming the cause instead of crash-looping into EADDRINUSE for a
minute, and the window no longer waits for the runtime before opening. It still
has no runtime, so it cannot execute agent work.

Full writeup, including the ~60 s invisible-window failure it presented as:
[`BUG-2026-09-03`](bug/BUG-2026-09-03-two-desktop-installs-fight-over-the-daemon-port.md).

**Operationally, right now:** uninstall "Sparstrowgen Staging" before installing
0.3.0. That channel was retired with the `staging` branch on 2026-09-02 and will
never receive another release.

**If wrong (i.e. left as is):** the moment a second Sparstrowgen exists on any
machine — a staging build kept for testing, a second account, a future beta
channel — one of them silently has no runtime. That is exactly the "installed
side by side without conflicting" claim `0.2.0`'s changelog already makes, so
the documentation is currently ahead of the behaviour.

**Closes when:** the port is per-install rather than global — derived from the
channel, or negotiated at first start and written to a file the way `.api-token`
already is — and two installs are proved to run their runtimes simultaneously on
one machine. Touching it means touching the daemon, `core-client.ts`,
`memory-cli`, `memory-mcp` and the packaged resources together.

---

## G-66 — The Windows installer is unsigned, deliberately and indefinitely

**Decided:** 2026-09-03, by the owner, closing `OQ-10`: *"keep it free. This app
is an agent harness, is only for me."*

`Sparstrowgen-Setup-<version>.exe` carries no Authenticode signature. A code
signing certificate is a real recurring cost (OV around $200–400/year, EV more)
and it buys reputation with SmartScreen for an audience of one person who built
the thing.

**What this actually means when installing:**

- Windows SmartScreen shows **"Windows protected your PC"** on first run.
  Getting past it is *More info* → *Run anyway*.
- Some browsers flag the download.
- **Auto-updates are unaffected.** electron-updater verifies the installer
  against the `sha512` in `latest.yml`, which is integrity, not identity — it
  proves the file is the one the release published, not who published it. The
  update path does not need a certificate to be safe against corruption or a
  swapped asset; it needs one to be safe against a compromised release pipeline,
  which is a different threat and not one signing an unsigned-until-now app
  addresses either.

**This is not a bug and should not be "fixed" opportunistically.** It is a
priced decision, and the price is paid annually.

**Reconsider when** the app is installed by someone who did not build it —
someone with no reason to trust an unknown publisher, and no way to check. The
SmartScreen warning is correct in that situation and telling a stranger to click
past a security warning is a bad habit to teach. Until then it costs one extra
click, once, on one machine.

---

## G-67 — CLOSED 2026-09-03: a packaged install now runs its own `server/`

**Was:** a packaged install shipped only the daemon. The renderer pointed at
`127.0.0.1:8080`, where nothing listened, and the daemon pointed at
`https://sparstrow.com`, which answers **402 Payment Required**. The app worked
on exactly one machine in the world — the developer's — and only while a
checkout happened to be running beside it. Every desktop verification before
this was performed in that borrowed environment.

**Closed by** shipping `server/` as a second bundle (`dist/server.js`)
supervised by the app beside the daemon, configured from credentials in the OS
credential store, with both halves pointed at it. `channel.cloudUrl` is dead
alongside `appUrl`.

**Proof — the INSTALLED build, on a machine with nothing running.** Ports
checked empty first (`8080: 0  48750: 0`), then
`Sparstrowgen Setup 0.3.2.exe` installed silently and launched from the Start
Menu path, no environment variables, no checkout involved:

```
[main] loading window: …\Programs\Sparstrowgen
esourcespp.asar\out
enderer\index.html
[server] spawned pid=48096
[service] spawned core pid=44308 (detached)
[server] healthy
[service] core is healthy
[claim] launch: this computer is in 1 workspace(s) (mach_9fac26a1…)
```

and the daemon's own account of itself:

```json
{"connected":true,"machineId":"mach_9fac26a1…","workspaces":1,
 "cloudUrl":"http://127.0.0.1:8080","uptimeMs":85522}
```

`cloudUrl` is the local server, not the host that answers 402. That single
field is the whole gap, closed.

**What this deliberately does NOT claim.** The machine was already signed in.
A *first* sign-in on a new computer still needs `apps/web`, because the
`/connect` confirm page is a Next page — see `G-68`. And the test machine is
the one the app was built on; a genuinely foreign computer has still never run
this, so "no checkout involved" is proved and "no developer tooling installed
anywhere" is not.

---

## G-68 — CLOSED 2026-09-03: `server/` serves the confirm page itself

**Was:** pairing needed no web app, but the `/connect` confirm page a FIRST
sign-in opens was a Next.js page in `apps/web`. A packaged install ships no
Next.js, so a computer that had never been connected could not get a credential.
The owner hit it exactly as described: *"Could not reach http://localhost:3000:
fetch failed"*.

**Closed by** serving the page from `server/`, plus three routes it needs:
`/connect/attempt` (what am I approving), `/connect/signin` (Supabase's own auth
endpoint, proxied so the anon key stays server-side), and `/connect/approve`.

**The approval runs with the USER's token, never the service role**, so
`connect_attempts_approve` (policies/033) is what decides whether it is allowed:
pending, unexpired, and stamped with the approver's own id. The route could not
bypass RLS if it tried. The callback is read from the row rather than the
request, so an approved attempt can only ever hand its credential to the machine
that created it.

`SPARSTROW_APP_URL` now defaults to this machine's own server instead of
`http://localhost:3000`, which is what made the old failure inevitable on a
packaged install.

**Verified** with every `SUPABASE_*` and `SPARSTROW_*` variable unset:

```
[main] sign-in requested via http://127.0.0.1:8080
server: POST /api/daemon/connect      → attempt created
server: GET  /connect                 → confirm page served
server: POST /api/daemon/connect/attempt → page named the machine
POST /api/daemon/connect/signin  (agent account) → accessToken
POST /api/daemon/connect/signin  (wrong password) → 401 "Invalid login credentials"
```

### The compromise, stated rather than glossed

**The confirm page asks for a password.** The app's own rule is unchanged and
still holds: no password field in the native window, because a native window
asking for credentials cannot be told apart from one phishing them. This is a
browser page, on loopback, with the address bar visible.

But the better answer is the identity provider's own screen — magic link,
GitHub, Google — and that needs a redirect URL the provider will accept. A
loopback address is not one. So OAuth and magic link are unavailable until
hosting exists (`D-40`), and this is the honest smallest thing that works
meanwhile.

The sign-in screen's copy was corrected in the same change: it promised
"nothing is typed here" and "you are already signed in", and the second half
stopped being true the moment this page began asking for a password.
