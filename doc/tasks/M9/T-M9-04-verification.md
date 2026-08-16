# T-M9-04 — Verification

| | |
|---|---|
| **Tag** | `[S]` sequential — needs all of M9 in place |
| **Depends on** | T-M9-01, T-M9-02, T-M9-03 |
| **Blocks** | M10 |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

## Objective

Prove the three endpoints work against a real database with real RLS, so M10
builds on something exercised rather than something that typechecks.

This is a **foundational** phase, so there are no acceptance scenarios to walk —
the assertions are technical, and the outcome that matters is *M10 is
unblocked*.

**What this pass can reach:** everything. No browser rendering is required —
these are API assertions, exactly the shape M2 proved 40 endpoints with, using
a real signed-in session and the page's own `fetch`. Procedure for obtaining
that session:
[`runbooks/agent-browser-session.md`](../../runbooks/agent-browser-session.md).

**What it needs:** a signed-in session against `staging.sparstrow.com`, and a
**second account** for the cross-workspace assertions. M2's pass created three;
follow the same route rather than skipping section C.

## A — Technical assertions

### Workspace

- [ ] `GET /api/v1/workspace` returns the caller's row with `id`, `name`,
      `slug`, `description`, `createdAt` — camelCase on the wire
- [ ] On a never-renamed workspace, `name` is `"Personal Workspace"` and `slug`
      matches `^personal-[0-9a-f]{8}$` — the signal FR-018 depends on
- [ ] `PATCH /api/v1/workspace` with `{ name: "Sparstrow HQ" }` returns 200 and
      the updated row
- [ ] The slug changed on that first rename, and is derived from the name
- [ ] A **second** rename changes the name and leaves the slug **unchanged**
      (phase decision 2 — the one assertion most likely to be got wrong)
- [ ] `GET` after `PATCH` returns the new name — it persisted, not just echoed
- [ ] Empty name → 400 with a message naming the requirement
- [ ] 61-character name → 400
- [ ] Whitespace-only name → 400
- [ ] A name of only punctuation (`"!!!"`) → 200, name applied, slug **not**
      set to an empty string

### Profile

- [ ] `PATCH /api/v1/me` with `{ name: "…" }` returns 200
- [ ] `public.users.name` for that user now holds the new value — read it
      directly, do not infer it from the response
- [ ] The **session metadata** holds it too — `supabase.auth.getUser()` shows
      `user_metadata.name` and `user_metadata.full_name` both updated
- [ ] The shell's displayed name changes **without a full page reload** in the
      tab that made the call (the `USER_UPDATED` path — T-M9-02's trap)
- [ ] It survives a full reload
- [ ] Empty name → 400; 61 characters → 400

## B — What must NOT have changed

- [ ] Every other `/api/v1` endpoint still resolves — the new modules were
      imported **before** `./stubs`, so no wildcard stub was shadowed and none
      is shadowing a real handler. Spot-check `/runtimes`, `/agents`, `/runs`
- [ ] `getActiveWorkspaceId`'s bootstrap path still works: sign in with a
      brand-new account and confirm a workspace is created
- [ ] The multiple-workspace 400 is unchanged — no new path accepts a
      `workspaceId` in a body ([`D-7`](../../Deferred.md))
- [ ] Sign-out and account deletion still work (they touch `public.users`)

## C — Cross-workspace denial

**Needs a second account.** This is the security assertion; it is not optional
and M2's pass proved the pattern is worth running.

- [ ] Account B cannot read account A's workspace: `GET /workspace` as B
      returns B's own row, never A's
- [ ] A rename issued by B does not change A's workspace — confirmed by reading
      A's row afterwards, not by trusting the response
- [ ] If a way exists to address A's workspace explicitly, it is denied and
      **reports** the denial. A `PATCH` that affects zero rows must return 404,
      not a cheerful 200 — M2 found eleven handlers doing exactly that

## D — Regression surface

- [ ] `pnpm -r typecheck` green
- [ ] `pnpm -r test` green, count recorded in the Result
- [ ] `pnpm --filter web build` succeeds

## On completion

- [ ] Tick 11.1–11.4 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md) and
      mark Band 11 complete
- [ ] Update the phase `README.md` status line and its task table
- [ ] Update the plan's **Status** row
- [ ] **State explicitly that M10 is unblocked** — that is what this phase
      exists for, and it belongs in the Result rather than being inferred
- [ ] Any unreached assertion written into
      [`../../KnownGaps.md`](../../KnownGaps.md)

No Knowledge Center pass here: this phase ships no user-visible surface. M10
does, and carries the pass.

## Result

<!-- What was actually run: which host, which accounts, the test count, the
     exact requests made and what came back. -->
