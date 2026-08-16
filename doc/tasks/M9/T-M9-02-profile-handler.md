# T-M9-02 — Profile display name

| | |
|---|---|
| **Tag** | `[P]` — a new handler file; shares nothing with T-M9-01 |
| **Serves** | **foundational** — unblocks M10's profile setup step |
| **Depends on** | — |
| **Blocks** | T-M9-03, and M10 |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

> ⚠️ **This task exists because of plan decision 7, which is flagged as
> consequential scope the spec did not ask for.** If the owner would rather the
> profile setup step read as already-done on signup, **delete this task and the
> profile half of `T-M10-02`** — nothing else in the plan depends on it. Do not
> soften it into a half-built version; either the step has a real action or it
> does not.

## Objective

Add `PATCH /api/v1/me` so the owner can set a display name, written to **both**
places a display name lives, in one call. This is what makes the guide's first
step completable rather than decorative.

## Decisions already made

Phase decision 3 and plan decision 8 are the source.

### Both stores, one handler

```ts
registerRoute({
  method: "PATCH",
  pattern: "/me",
  handler: async ({ supabase, body }) => {
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name) return fail(400, "A display name is required.");
    if (name.length > 60) return fail(400, "Display names are at most 60 characters.");

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return fail(401, "not authenticated");

    // 1. The session's metadata — this is what the shell reads.
    const { error: authError } = await supabase.auth.updateUser({
      data: { name, full_name: name },
    });
    if (authError) throw authError;

    // 2. The public.users row — this is what the cloud schema joins on.
    const { data, error } = await supabase
      .from("users")
      .update({ name, updated_at: new Date().toISOString() })
      .eq("id", user.id)
      .select("id, email, name, avatar_url")
      .single();
    if (error) throw error;

    return ok(data);
  },
});
```

**Both metadata keys.** `bootstrap_workspace` reads `full_name` first and
`name` second
([`004_bootstrap_rpc.sql:66-71`](../../../packages/shared/drizzle/policies/004_bootstrap_rpc.sql:66)),
so writing both means a future bootstrap finds the chosen name rather than the
email local part.

**Auth first, then the row.** If the row update fails, the handler throws and
the caller sees an error — a half-applied rename is visible rather than silent.
Reversed, a failing auth update after a successful row update would leave the
shell showing the old name with no error at all, which reads as "the save
didn't work" and is the harder failure to diagnose.

### No transaction, and that is a deliberate limitation

`supabase.auth.updateUser` writes to `auth.users` through GoTrue, not through
PostgREST; the two writes cannot share a transaction. The failure window is
narrow and the recovery is "press save again", which the UI can offer because
the handler reports the error rather than swallowing it. **Rejected:** a
Postgres trigger mirroring `auth.users.raw_user_meta_data` into `public.users`
— that is a schema change with its own security review, for a rename nobody
does twice a year.

### `GET /me` is not added

The shell already has the account from the session snapshot, server-rendered
([`account-provider.tsx`](../../../apps/web/src/components/auth/account-provider.tsx)).
A second source would be a second thing to disagree.

## Checklist

- [ ] `apps/web/src/lib/api/handlers/profile.ts` created with `PATCH /me`
- [ ] Imported in `handlers/index.ts` **before** the `./stubs` import
- [ ] Both stores written, in the order above
- [ ] `public.users` has an `updated_at` column — **confirm in
      `packages/shared/src/db/schema.ts` before writing to it**; drop that
      field from the update if it does not
- [ ] Validation: empty and >60 rejected with specific messages
- [ ] Unauthenticated request → `401`
- [ ] Router-level tests: valid rename; empty name; 61 characters; a
      whitespace-only name
- [ ] `pnpm --filter web test` and `pnpm typecheck` green

## Traps

**The shell will not show the new name until the session refreshes.**
`WebAccountProvider` is fed from a server-rendered snapshot and updated by
`onAuthStateChange`. `supabase.auth.updateUser` **does** emit `USER_UPDATED`,
so the client-side listener picks it up — but only in the tab that made the
call, and only because that listener exists. T-M10-02's control must not assume
a reload; verify the name changes in place.

**`public.users` is not `auth.users`.** They share an id and nothing else.
Updating the wrong one produces a rename that works everywhere except the
sidebar, or everywhere except the cloud schema — the two halves of the exact
bug phase decision 3 exists to prevent.

**RLS on `public.users`.** The row is the caller's own, so the member policy
should permit it — but confirm the policy actually allows `UPDATE` and not only
`SELECT` before assuming. If it does not, that is a policy addition in
`packages/shared/drizzle/policies/`, and per AGENTS.md §3.12 the
`supabase-postgres-best-practices` skill is loaded **before** writing it, not
after.

**Do not accept an `email` field.** Changing an email is an auth flow with a
confirmation loop and a re-verification step, and it completes no setup step.
Plan Scope boundaries.

## Verification

- [ ] `pnpm --filter web test` — every case in the checklist
- [ ] `pnpm typecheck` clean
- [ ] A live rename, confirmed in **both** stores — the shell's displayed name
      and a direct read of `public.users` — is proved in
      [T-M9-04](T-M9-04-verification.md)

## On completion

- [ ] Tick 11.2 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
- [ ] Update this file's **Status** row and the phase README's task table

## Result

<!-- Filled in when the task lands. -->
