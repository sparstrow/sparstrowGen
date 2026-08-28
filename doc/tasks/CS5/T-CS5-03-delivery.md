# T-CS5-03 — signed URL in the dispatch payload, daemon download, scoped Read

| | |
|---|---|
| **Tag** | `[S]` — needs T-CS5-01's bucket and T-CS5-02's attachment rows to exist |
| **Serves** | foundational — unblocks CS6 |
| **Depends on** | T-CS5-01, T-CS5-02 |
| **Blocks** | — |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

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

## Checklist

- [ ] Wherever a `chat.turn` command's payload is actually assembled for a
      session that has pending attachments, mint a short-lived signed URL
      per attachment and include `{ storagePath, filename, signedUrl }` in
      the payload
- [ ] `packages/core/src/cloud/chat-turn.ts`: before building the prompt,
      download each attachment's signed URL to local disk — into the
      project's `rootDir` for `project` sessions (fresh, collision-avoided
      filename), or the turn's `tempDir` for `free`/`agent` sessions
- [ ] The prompt text built for the turn names the attached file's path and
      that it was just attached (e.g. "The user attached a file at
      `<path>`.")
- [ ] `free`/`agent` turns with an attachment get `cwd: tempDir,
      allowedTools: ["Read"]` for that turn only, per the snippet above —
      never written back to the session or agent's own stored configuration
- [ ] Download has a bounded timeout and a legible failure path
      (`classifyTurnError`-shaped) if it fails, rather than hanging the turn
- [ ] `packages/core` typecheck and tests green

## Traps

- **A signed URL embedded in a payload row is still sensitive for its
  (short) lifetime** — don't log the full payload anywhere that persists
  longer than the URL's TTL, and don't set the TTL longer than the daemon
  plausibly needs to claim and start the download (a few minutes, not
  hours).
- **Don't grant `allowedTools: ["Read"]` broadly and just hope `cwd` scopes
  it** — confirm (by reading the actual CLI provider's tool implementation,
  not assuming) that `Read` genuinely can't escape `cwd` for `claude-code`;
  if it can read arbitrary absolute paths regardless of `cwd`, this
  mechanism doesn't actually scope anything and the task isn't done.
- **A `project` session's downloaded file must not silently collide with a
  real file already in the repo** — use a uuid-prefixed or otherwise
  clearly-attachment-marked filename, not the original name unmodified, to
  avoid overwriting something the owner's actual project contains.

## Verification

- [ ] Dispatch a chat turn with a pending attachment for a `project`
      session; confirm the file lands in `rootDir` and the agent's reply
      reflects having read it
- [ ] Same for a `free` session; confirm the file lands in `tempDir`, the
      turn's `Read` grant works, and a **subsequent** turn in the same
      session (no new attachment) does NOT retain that grant or that file's
      accessibility
- [ ] Kill the network mid-download (or point at an expired signed URL);
      confirm the turn fails legibly rather than hanging past
      `TURN_TIMEOUT_MS`

## On completion

- [ ] `pnpm typecheck` and `pnpm test` green
- [ ] Update this file's **Status** row
- [ ] Open the PR into `band/26-chat-session-and-conversation-ux`, then
      `gh pr merge <n> --auto --squash`
- [ ] Update the phase README's task table

> **Do not edit [`../MasterTaskQueue.md`](../MasterTaskQueue.md) from a task
> branch.**

## Result

<!-- Filled in when the task lands. -->
