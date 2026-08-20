# T-M9-06 — Verification

| | |
|---|---|
| **Tag** | `[S]` sequential — needs all of M9 in place |
| **Depends on** | T-M9-01 … T-M9-05 |
| **Blocks** | M10 |
| **Phase spec** | [README.md](README.md) |
| **Status** | 🟡 **partly done 2026-08-18** — SQL/RLS layer proved directly; the HTTP layer and the second account remain. See *Progress* below. |

## Objective

Prove the migration, the endpoints and the bucket work against a real database
with real RLS, so M10 builds on something exercised rather than something that
typechecks.

This is a **foundational** phase, so there are no acceptance scenarios to walk —
the assertions are technical, and the outcome that matters is *M10 is
unblocked*.

**What this pass can reach:** everything except rendered pixels, and it needs
none. These are API and SQL assertions, the shape M2 proved 40 endpoints with,
using a real signed-in session and the page's own `fetch`. Procedure for
obtaining that session:
[`../../runbooks/agent-browser-session.md`](../../runbooks/agent-browser-session.md).

**What it needs:** a signed-in session against `staging.sparstrow.com`, plus
**two throwaway accounts** — one to be the second party in the cross-workspace
and cross-user assertions, one created fresh to prove SC-008. M2's pass created
three accounts; follow the same route rather than skipping sections C and D.

## Progress — 2026-08-18

**Done, proved directly against `sparstrowgen-staging` as `postgres`** (results
recorded in each task's Result section, not restated here):

| Assertion | How |
|---|---|
| **SC-008** — a fresh account holds no name in either table | `bootstrap_workspace()` invoked under a throwaway user's JWT claims; `users.name`, `users.bio`, `workspaces.name`, `workspaces.context` all `''`, `logo_url` `NULL`, slug matching `^personal-[0-9a-f]{8}$`, role `owner` |
| A provider-supplied name still survives | second throwaway with `full_name: "Sri Hari"` → `users.name = 'Sri Hari'`, workspace still `''` |
| The one-time cleanup's blast radius | 1 `users` row, 8 `workspaces` rows — matching the dry-run exactly |
| `bootstrap_workspace` kept its security properties | `prosecdef` true, `search_path=""`, advisory lock present, grants `anon=false` / `authenticated=true` |
| Neighbouring grant invariants | `redeem_pairing_code`, `claim_runtime_commands`, `ack_runtime_command` all `false, false` |
| The bucket and its seven policies | applied; `array_length(...) = 2` guard added after verification found a `..` gap ([`SEC-2026-08-18`](../../security/SEC-2026-08-18-storage-policy-dotdot-segment.md)) |
| Storage predicate against ten crafted paths | evaluated against the expression read back from `pg_policy`; only the legitimate path allowed |
| `get_advisors` security + performance | no new findings; the 5 security warnings are all pre-existing and accepted |

**Both throwaway accounts deleted themselves completely**, so this pass added no
orphans — see [`BUG-2026-08-18-orphaned-account-rows-on-staging`](../../bug/BUG-2026-08-18-orphaned-account-rows-on-staging.md).

### What remains, and why

Everything left needs something SQL cannot substitute for:

1. **The HTTP layer.** `GET`/`PATCH /api/v1/workspace` and `/me` have never been
   called over HTTP. Their logic is covered by 53 unit tests against a fake
   Supabase client, and the SQL they emit is proved to work — but the round trip
   through `parseBody` → `toSnake` → handler → `toCamel` has not been exercised.
   Needs a signed-in session against a running app.
2. **A second account.** Every cross-workspace and cross-user denial (sections
   C/D, and the storage cross-account write) needs a second real party. One
   session cannot be two workspace members.
3. **The hooks returning real data**, which needs 1 and a rendered app.

None of this is blocked on a decision — it is blocked on a running app plus a
second account, exactly as M2's pass needed. It is **not** a `KnownGaps.md`
entry, because this verification task is itself the open record of it.

## A — SC-008: nothing is invented

**The headline assertion of this phase.** Checked against the database, not the
screen — the screen has display fallbacks and would look identical either way.

- [ ] Create a brand-new account with email and password on staging
- [ ] Read `public.users` for it directly: `name` is `''`. Not `sriharicoder`,
      not `User`, not `NULL`
- [ ] Read `public.workspaces` for it directly: `name` is `''`, and `slug`
      matches `^personal-[0-9a-f]{8}$`
- [ ] `bio` is `''`, `avatar_url` is `NULL`, `context` is `''`,
      `logo_url` is `NULL`
- [ ] Every `/api/v1` endpoint resolves for that account — `bootstrap_workspace`
      still works after being rewritten. Spot-check `/runtimes`, `/agents`,
      `/runs`, `/system/health`
- [ ] The **owner's pre-existing account** was cleaned: `users.name` and
      `workspaces.name` are both now `''`, its slug is unchanged, and nothing
      else about it moved
- [ ] The cleanup's row counts recorded in the Result

## B — The two handlers

### Workspace

- [ ] `GET /api/v1/workspace` returns `id, name, slug, description, context,
      logoUrl, createdAt` — camelCase on the wire
- [ ] `PATCH` with only `{ context: "…" }` changes only `context`
- [ ] `PATCH` with all four changes all four
- [ ] `PATCH { name: "Sri Workspace" }` on a never-named workspace sets the
      slug from the name
- [ ] A **second** rename changes the name and leaves the slug **unchanged** —
      the assertion most likely to be got wrong
- [ ] `PATCH { name: "" }` succeeds; `GET` returns `""`
- [ ] Over-length name / description / context each `400` with a message naming
      the limit
- [ ] A body containing `slug` is **ignored**, not rejected
- [ ] A body containing `owner_id` → `400` naming the key
- [ ] `GET` after each `PATCH` returns the new value — it persisted rather than
      being echoed

### Profile

- [ ] `GET /api/v1/me` returns `id, email, name, avatarUrl, bio`
- [ ] `PATCH` with only `{ bio: "…" }` changes only `bio` — the **name is not
      blanked**
- [ ] `PATCH { name: "Sri Hari Coder" }`: `public.users.name` holds it — read
      the row directly
- [ ] The **session metadata** holds it too: `user_metadata.name` and
      `user_metadata.full_name` both updated
- [ ] `bio` is **not** in the session metadata — it belongs to the row only
- [ ] The shell's displayed name changes **without a full page reload** in the
      tab that made the call, and survives a reload
- [ ] `PATCH { role: "admin" }` → `400`. `PATCH { email: … }` → `400`
- [ ] Over-length name / bio each `400`

## C — Cross-workspace and cross-user denial

**Needs a second account.** These are the security assertions; they are not
optional.

- [ ] Account B's `GET /workspace` returns B's own row, never A's
- [ ] A write issued by B does not change A's workspace — confirmed by reading
      A's row afterwards, not by trusting the response
- [ ] A `PATCH` that affects zero rows returns `404`, not a cheerful `200`
      (M2 found eleven handlers doing exactly that)
- [ ] `GET /me` as B returns B's row
- [ ] B cannot write A's `public.users` row through any path

## D — The bucket

**Skip this section entirely if `T-M9-04` was cut** — and say so, rather than
leaving it looking unrun.

- [ ] An avatar uploads and renders
- [ ] A workspace logo uploads and renders
- [ ] Replacing either removes the old object from the bucket
- [ ] A 3 MB file is refused client-side with a readable message
- [ ] A file over 2 MB pushed **directly at the storage API**, bypassing the
      client, is refused by the bucket
- [ ] A `.pdf` renamed `.png` is refused — MIME, not extension
- [ ] **As account B, write directly to `avatars/<A's id>/` through the storage
      API. Denied.** A public bucket with a wrong write policy is a public
      write endpoint; this is the assertion worth being paranoid about
- [ ] Same for `workspace-logos/<A's workspace id>/`
- [ ] `PATCH /me { avatar_url: "https://evil.example/x.png" }` → rejected by
      the storage-origin check
- [ ] `get_advisors` (security and performance) reports no new findings

## E — What must NOT have changed

- [ ] Every other `/api/v1` endpoint still resolves — the new modules were
      imported **before** `./stubs`, so no wildcard stub is shadowing a real
      handler and none is shadowed
- [ ] The multiple-workspace `400` in `getActiveWorkspaceId` is unchanged; no
      new path accepts a `workspaceId` in a body ([`D-7`](../../Deferred.md))
- [ ] Sign-out and account deletion still work — both touch `public.users`
- [ ] Magic-link and password sign-in both still work; the bootstrap rewrite
      did not disturb them

## F — Regression surface

- [ ] `pnpm -r typecheck` green
- [ ] `pnpm -r test` green, count recorded in the Result
- [ ] `pnpm --filter web build` succeeds

## On completion

- [ ] Tick 11.1–11.6 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md) and
      mark Band 11 complete
- [ ] Update the phase `README.md` status line and its task table
- [ ] Update the plan's **Status** row
- [ ] **State explicitly that M10 is unblocked** — that is what this phase
      exists for, and it belongs in the Result rather than being inferred
- [ ] Any unreached assertion written into
      [`../../KnownGaps.md`](../../KnownGaps.md)
- [ ] Any denial that did **not** hold → a file in
      [`../../security/`](../../security/README.md), in the same turn

No Knowledge Center pass here: this phase ships no user-visible surface. M10
does, and carries the pass.

## Result

<!-- Which host, which accounts, the test count, the exact column values read
     back for the fresh account, the cleanup's row counts, and what the storage
     denial attempts actually returned. -->
