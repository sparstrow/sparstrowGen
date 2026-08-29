# T-AM1-01 — the produced-file contract

| | |
|---|---|
| **Tag** | `[S]` sequential — defines the constants, path helper and upload route that T-AM1-02 and T-AM1-03 are written against |
| **Serves** | **foundational** — unblocks AM2 (US1) |
| **Depends on** | — |
| **Blocks** | T-AM1-02, T-AM1-03 |
| **Phase spec** | [README.md](README.md) |
| **Status** | ✅ done 2026-08-29 |

## Objective

Settle where a produced file lives, how big it may be, what types are kept, and
how the daemon gets bytes into the bucket. Nothing sweeps or uploads yet — this
task exists so the two after it have one definition to share instead of two
that drift.

## Decisions already made

**The constants sit beside CS5's, as a sibling family — not a reuse of them.**
Phase decision 2 of the plan: one constant family, two honest values.

```ts
/**
 * AM1. Deliberately 5× `CHAT_ATTACHMENT_MAX_BYTES`: that limit is right for
 * what a person drags into a composer and wrong for what a model emits — a
 * generated PNG routinely exceeds 2 MB. Two names, two honest values; see
 * the plan's Decision 5 for why one shared limit was rejected.
 */
export const CHAT_PRODUCED_MAX_BYTES = 10 * 1024 * 1024;
```

`CHAT_PRODUCED_ALLOWED_TYPES` starts as `CHAT_ATTACHMENT_ALLOWED_TYPES`' map
plus `image/svg+xml` and `text/csv`. It is a **separate** map: the two lists
answer different questions ("what may a person upload" vs "what may we keep
from an agent") and will diverge.

**The path helper is shared and lives in `shared`, because two packages build
the same string.** The daemon composes it to upload; the web app never composes
it (it reads `storagePath` off the row) — but the sign-upload route validates
it, so the shape needs one owner.

```ts
/**
 * `<workspace_id>/<session_id>/<opaque>-<safe filename>` — exactly TWO path
 * segments, because `025_chat_attachments_storage.sql` enforces
 * `array_length(storage.foldername(name), 1) = 2` on both select and insert.
 * A third segment (e.g. `produced/`) is denied to the member who owns the
 * file, and it fails as an empty image rather than an error. See the phase
 * README, finding 3.
 */
export function producedStoragePath(
  workspaceId: string,
  sessionId: string,
  filename: string,
  opaqueId: string,
): string;
```

The filename is sanitised to a single path segment: no separators, no `..`,
collapsed whitespace, capped at 100 characters, extension preserved. The
opaque id prefix is what keeps two files named `chart.png` in one conversation
from overwriting each other — the spec's own edge case ("the same filename
twice in one conversation") is answered as **both kept**.

**The upload route mirrors the download route exactly.** New file, same
`/api/daemon/*` shape, same `authenticateDaemon` scope check:

```ts
// apps/web/src/app/api/daemon/chat/attachments/sign-upload/route.ts
const { data } = await db.storage
  .from(CHAT_ATTACHMENT_BUCKET)
  .createSignedUploadUrl(storagePath);
```

The `storagePath.startsWith(`${auth.scope.workspaceId}/`)` check from the
download route is **not optional here** and is the more important of the two:
without it a misbehaving daemon could obtain a working *write* URL into another
workspace's prefix. `daemonDb()` is service-role and bypasses RLS entirely, so
this check is the only boundary.

## Checklist

- [x] `CHAT_PRODUCED_MAX_BYTES` and `CHAT_PRODUCED_ALLOWED_TYPES` in
      `packages/shared/src/constants.ts`, beside CS5's, with the comment above
- [x] `producedStoragePath()` and its filename sanitiser, exported from
      `@sparstrow/shared`
- [x] Unit tests for the sanitiser: a path separator, a `..`, a name with no
      extension, a 300-character name, and two identical names producing two
      different paths
- [x] A test asserting `producedStoragePath()` output has exactly two segments
      under `storage.foldername` semantics — this is the one that catches a
      well-meaning `produced/` being added later
- [x] `sign-upload/route.ts`, with the workspace-prefix check and a test that a
      foreign prefix is refused with 403
- [x] `packages/shared` and `apps/web` typecheck and tests green

## Traps

**Do not widen `CHAT_ATTACHMENT_MAX_BYTES` instead of adding a sibling.** It is
reached from the composer's client-side validation (`checkChatAttachmentFile`)
and raising it invites 10 MB paste-ins into the chat box, which is the exact
trade the plan's Decision 5 rejected.

**`createSignedUploadUrl` and `createSignedUrl` are different methods with
similar names.** The upload variant returns a `token` alongside the URL and the
daemon must use `uploadToSignedUrl`. Getting this wrong produces a 400 from
storage that reads like a permissions problem and is not.

**The sanitiser must run before the path is composed, not after.** A filename
containing `/` that reaches `producedStoragePath` unsanitised silently creates
a three-segment path — which then fails RLS at read time, in the browser, hours
later, with no server-side error to find.

## Verification

- [x] `pnpm --filter @sparstrow/shared test` green, sanitiser cases included
- [x] `POST /api/daemon/chat/attachments/sign-upload` with a path outside the
      caller's workspace returns 403 and no URL (unit test with a stubbed
      `authenticateDaemon`)
- [x] The two-segment assertion test fails if a `produced/` segment is
      introduced — verify by temporarily adding one, seeing red, reverting

## On completion

- [x] `pnpm typecheck` and `pnpm test` green
- [x] Update this file's **Status** row
- [ ] Open the PR into `band/27-seeing-what-my-agent-made`, then
      `gh pr merge <n> --auto --squash`

> **Do not edit [`../MasterTaskQueue.md`](../MasterTaskQueue.md) from a task
> branch.** Its Status column is flipped once per band, in the commit that
> lands the band branch on `development`.

## Result

Added `CHAT_PRODUCED_MAX_BYTES` (10 MB), `CHAT_PRODUCED_ALLOWED_TYPES` (a
distinct object from `CHAT_ATTACHMENT_ALLOWED_TYPES`, spreading it plus
`image/gif` and `image/svg+xml`), `sanitizeProducedFilename`, and
`producedStoragePath` to `packages/shared/src/constants.ts`. Added
`apps/web/src/app/api/daemon/chat/attachments/sign-upload/route.ts`, mirroring
the existing `sign/route.ts` download route's auth and workspace-prefix-check
shape exactly, using `createSignedUploadUrl` instead of `createSignedUrl`.

**Verified the two-segment test is load-bearing, not decorative**, per this
task's own Verification item: temporarily changed `producedStoragePath` to
insert a `produced/` segment, confirmed `pnpm --filter @sparstrow/shared test`
turned red on exactly the three tests that check path shape, then reverted and
confirmed green again. The test genuinely catches the regression this whole
task exists to prevent.

14 new tests in `packages/shared/src/chat-produced.test.ts`, 5 new tests in
`apps/web/src/app/api/daemon/chat/attachments/sign-upload/route.test.ts`. One
typecheck fix needed: `sanitizeProducedFilename`'s regex-match extension
extraction narrowed to possibly-`undefined` under strict mode; guarded with
`?? ""`.

`pnpm --filter @sparstrow/shared test`: 334/334 passed.
`pnpm --filter @sparstrow/shared typecheck`: clean.
`pnpm --filter web typecheck`: clean.
`apps/web` full test suite: 484/484 passed (ran as part of `pnpm --filter web
test`, confirmed the new file's 5 tests are counted in that total by also
running it in isolation).

No UI surface exists yet — nothing here was verified in a browser, correctly,
per the phase README's Definition of done ("nothing in this phase is visible
to the owner").
