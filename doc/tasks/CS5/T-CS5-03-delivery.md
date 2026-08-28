# T-CS5-03 — signed URL in the dispatch payload, daemon download, scoped Read

| | |
|---|---|
| **Tag** | `[S]` — needs T-CS5-01's bucket and T-CS5-02's attachment rows to exist |
| **Serves** | foundational — unblocks CS6 |
| **Depends on** | T-CS5-01, T-CS5-02 |
| **Blocks** | — |
| **Phase spec** | [README.md](README.md) |
| **Status** | done (2026-08-28) |

## Objective

Get an attachment's bytes from Supabase Storage onto the runtime's local
disk before its turn's CLI spawn starts, and make sure the CLI can actually
read it.

## Decisions already made

Plan decision 4 (signed URL in payload, not bytes) and 5 (place-on-disk,
scoped Read), refined against the real mechanism (correcting the phase
README's approximate framing — `EffectiveTools` is tool-name allow/deny
only; **path scoping comes from `cwd`/`addDirs` on the `Agent` passed to the
spawn**, exactly the mechanism `chatAgent()` already uses for `project`
sessions):

```ts
// packages/core/src/chat/service.ts's chatAgent(), or its cloud-dispatch
// equivalent — extend with an attachment-aware branch:
if (attachmentLocalPaths.length > 0) {
  if (kind === "project" && project?.rootDir) {
    // files already copied into rootDir by the download step below;
    // existing allowedTools: ["Read", "Grep", "Glob"] already reaches them
  } else {
    // free/agent: point the spawn at the turn's own tempDir and grant Read
    // ONLY for this turn — never persisted to the session or agent row
    return { ...base, cwd: opts.tempDir, allowedTools: ["Read"] };
  }
}
```

`assign_or_park_chat_turn`'s payload gains an `attachments` array — each
entry `{ storagePath, filename, signedUrl }` — built with
`storage.createSignedUrl(path, <short TTL, e.g. 300s>)` at dispatch time
(the SQL function itself cannot mint a Storage signed URL; this has to
happen in the **application code that calls** `enqueue_chat_turn`/triggers
dispatch, not inside the `plpgsql` function — confirm the exact call site
before assuming which layer owns this).

## The shape of what was found — three corrections to the plan, each load-bearing

### 1. No signed URL in the payload — a real ordering bug, not a style choice

The plan's own snippet said `assign_or_park_chat_turn`'s payload carries
`{storagePath, filename, signedUrl}`. Confirmed live: `assign_or_park_chat_turn`
can be re-invoked for a PARKED turn at any later time by
`rescan_waiting_chat_turns` (itself called from inside `claim_runtime_commands`
— every daemon poll, not just at send time). A short-lived signed URL minted
once at the original `enqueue_chat_turn` call would already be expired by the
time a later rescan actually dispatches it. Fixed: the payload carries only
the durable `storagePath`/`filename`; the daemon mints its own signed URL,
lazily, immediately before downloading, via a new
`POST /api/daemon/chat/attachments/sign` route.

### 2. A second, more urgent ordering bug found in ALREADY-MERGED T-CS5-02 code

`enqueue_chat_turn` calls `private.assign_or_park_chat_turn` **synchronously,
inside its own transaction** (confirmed by reading `014_chat_turn_dispatch.sql`
line ~484) — for the common case (a runtime already online), dispatch and
payload assembly happen INSIDE that call. T-CS5-02 shipped
`postChatTurnAction` inserting `chat_message_attachments` rows in a SEPARATE
step AFTER `enqueue_chat_turn` returns. That means the attachments array
would have been empty in the payload every single time a runtime was already
online — the common case, not the edge case this task's Trap anticipated.

Fixed by moving the attachment-row insert INSIDE `enqueue_chat_turn` itself
(new migration `026_chat_attachments_dispatch.sql`), in the same transaction,
before it calls `assign_or_park_chat_turn`. `enqueue_chat_turn`'s signature
gained `p_attachments jsonb default '[]'::jsonb`; the old 2-arg overload was
dropped explicitly (adding a parameter via `create or replace` alone would
have left it behind as a stale duplicate). `postChatTurnAction`'s own
separate insert step is removed — this task edits already-merged T-CS5-02
code, not just its own new files.

### 3. `retry_chat_turn` deliberately does NOT carry attachments forward

A retry creates a new `chat_messages` row with a new id, copying only the
original content — it was never in scope to also copy attachment references,
and CS5's Definition of Done never mentions retry. A retried turn's
`attachments` payload is `[]`; the turn still runs, it just proceeds without
the file. Documented here rather than left as a silent gap — see this file's
own migration header for the fuller reasoning.

### 4. A real, filed security gap found while satisfying this task's own Trap

The Trap below (unchanged from the plan) demanded confirming, not assuming,
that `Read` cannot escape `cwd`. Live-tested against a real `agy` process:
it can — `view_file` read an absolute path outside its spawn's `cwd` without
refusal, and `antigravity.ts` never wires `agent.allowedTools` into any spawn
at all (`agy` has no such flag). This predates CS5 and affects every
existing `antigravity` chat turn, not just attachments. Filed as
[`SEC-2026-08-28-antigravity-headless-tools-unrestricted`](../../security/SEC-2026-08-28-antigravity-headless-tools-unrestricted.md),
with the `claude-code` side of the same question left as
[`KnownGaps.md` G-51](../../KnownGaps.md) (that CLI's OAuth token is expired
in this environment — a pre-existing, unrelated limitation, not something to
fix here). The mechanism below is still implemented correctly for BOTH
providers — so the restriction takes effect the moment `antigravity`'s gap
closes — but is only honestly claimed as *working* for `claude-code`, and
even that is unconfirmed rather than proven.

## Checklist

- [x] Wherever a `chat.turn` command's payload is actually assembled
      (`private.assign_or_park_chat_turn`), it now embeds
      `{ storagePath, filename }` per attachment — no signed URL, see
      correction 1 above
- [x] `packages/core/src/cloud/chat-turn.ts`: before building the prompt,
      each attachment's signed URL is minted on demand
      (`POST /api/daemon/chat/attachments/sign`) and downloaded to local
      disk — into the project's `rootDir` for `project` sessions with one
      configured, or a fresh per-turn tempDir for everything else
      (`free`/`agent`/a `project` session with no `rootDir`)
- [x] The prompt text built for the turn names each attached file's real
      local path and its original filename
- [x] `free`/`agent` turns (and a `project` session with no `rootDir`) with
      an attachment get `cwd: tempDir, allowedTools: ["Read"]` for that
      call only — a fresh object, never written back to the session or
      agent's own stored configuration
- [x] Download has a bounded timeout (`ATTACHMENT_DOWNLOAD_TIMEOUT_MS`,
      30s) and fails the turn through the same `postResult({status:
      "failed", ...})` path a `completeOnce` failure already uses — a
      timeout is worded so `classifyTurnError` buckets it as `"timeout"`,
      the same bucket a spawn timeout gets
- [x] `packages/core` typecheck and tests green (762 tests, +5 new)

## Traps

- **A signed URL embedded in a payload row is still sensitive for its
  (short) lifetime** — resolved by NOT embedding one at all (correction 1).
  The daemon's own signed URL is minted fresh, used once, and never logged;
  its 300s TTL is enforced by the sign route itself, not by daemon-side
  discipline.
- **Don't grant `allowedTools: ["Read"]` broadly and just hope `cwd` scopes
  it** — confirmed live, not assumed, and the answer was worse than a gap:
  `antigravity` doesn't implement this restriction AT ALL (correction 4,
  filed as a security report). The mechanism is implemented correctly
  regardless, for forward-compatibility, but is not claimed as currently
  effective for that provider.
- **A `project` session's downloaded file must not silently collide with a
  real file already in the repo** — every downloaded file is named
  `<uuid>-<original-filename>`, confirmed live: the real download in this
  task's own end-to-end pass landed under a uuid-prefixed name in the
  scratch daemon's data dir, never the bare original name.

## Verification

- [x] **Full live, real end-to-end pass** — not mocked, not simulated: a
      real disposable workspace and chat session (`provider: "antigravity"`,
      the only CLI with a working auth token in this environment —
      `claude`'s is expired, see `KnownGaps.md`), a real file uploaded to
      `chat-attachments` containing a planted phrase
      (`PINEAPPLE-CARBURETOR-77`), a real scratch daemon paired and started
      against this task's own dev server. Dispatched via
      `enqueue_chat_turn` with `p_attachments` populated: the
      `runtime_commands` payload was confirmed (queried directly) to carry
      `attachments: [{filename, storagePath}]`; the real daemon claimed it,
      minted a real signed URL via the new route, downloaded the real file,
      and the real `agy` process's reply **quoted the planted phrase
      exactly** — proof the file that reached the model's context was the
      real uploaded one, not inferred. The turn's own scratch tempDir was
      confirmed, directly on disk, to no longer exist once the turn
      finished.
- [x] `project` session path verified two ways: a real filesystem write in
      this task's own unit test (a real temp directory, not a mocked `fs`),
      confirming the file lands under `rootDir` with the agent's
      `allowedTools`/`cwd` completely unchanged from `chatAgent()`'s
      existing project branch; and the general download/prompt mechanism
      already proven live above (same code path, different destination
      directory)
- [x] Download failure and timeout both unit-tested: a 404 from the signed
      URL fails the turn legibly without ever calling `completeOnce`; a
      hung connection is aborted by `ATTACHMENT_DOWNLOAD_TIMEOUT_MS` (30s)
      rather than riding along to `TURN_TIMEOUT_MS`, and the resulting
      error is worded so `classifyTurnError` reads it as a timeout
- [x] "A subsequent turn with no new attachment does not retain the
      grant/tempDir" — not separately live-tested; provable directly from
      the code instead: `effectiveAgent`/`attachmentTempDir` are local to
      one `executeChatTurn` call, a fresh per-turn tempDir is always
      created (never reused across turns), and nothing writes an override
      back to the session or agent row. There is no shared mutable state a
      later turn could inherit from.
- [x] `get_advisors` (security): `enqueue_chat_turn`'s new 3-arg signature
      appears in the same accepted "SECURITY DEFINER callable by
      authenticated" category its 2-arg predecessor already did — no new
      or different finding
- [x] Disposable workspace, session, turn, runtime, and command all
      cascade-deleted and re-verified empty; a small orphaned storage
      object was left in place (same accepted tradeoff every other CS5 task
      has recorded for this exact class of leftover)

## On completion

- [x] `pnpm typecheck` and `pnpm test` green
- [x] Update this file's **Status** row
- [ ] Open the PR into `band/26-chat-session-and-conversation-ux`, then
      `gh pr merge <n> --auto --squash`
- [ ] Update the phase README's task table

> **Do not edit [`../MasterTaskQueue.md`](../MasterTaskQueue.md) from a task
> branch.**

## Result

**2026-08-28 — done, three corrections and one filed security gap, all found
by reading the shipped code and testing live rather than assumed from the
plan.** Two were genuine ordering bugs in how `enqueue_chat_turn` dispatches
synchronously inside its own transaction — one in this task's own original
design (signed URL baked into a payload that can outlive its TTL across a
parked-then-rescanned turn), one in ALREADY-MERGED T-CS5-02 code (the
attachment row created too late to make the common, immediate-dispatch
case's payload). Both are fixed at the root: the payload carries only a
durable storage path, and the attachment row is created atomically inside
`enqueue_chat_turn` itself before dispatch, not after.

The task's own Trap — confirm `Read` cannot escape `cwd`, don't assume it —
found a real, pre-existing, filed security gap
(`SEC-2026-08-28-antigravity-headless-tools-unrestricted`): `antigravity`
implements no tool restriction at all, and `cwd` does not bound its file
access either, live-verified with a real `agy` process reading an absolute
path outside its own working directory. This predates CS5 and is not
something this task could fix (it would need either an `agy`-side flag that
does not exist today, or a process-level sandbox); it is recorded so nobody
downstream believes the "scoped Read" promise is honored for that provider
specifically.

Proved live end to end regardless: a real chat turn, on a real paired
daemon, downloaded a real attachment and answered from its real contents —
the full mechanical pipeline (SQL dispatch → daemon claim → signed-URL
mint → download → prompt → spawn → cleanup) works correctly, with the one
honestly-scoped caveat about which provider's access restriction can
currently be trusted.
