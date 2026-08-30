# BUG-2026-08-29-bootstrap-workspace-020-reverted-012

**Status:** 🟢 resolved
**Reported by:** agent — found while replaying `packages/shared/drizzle/policies/*.sql` in order onto a fresh production Supabase project (`doc/plans/2026-08-29-two-channel-desktop-release.md`, Band C)
**Reported:** 2026-08-29

## Symptom

Every new signup since 2026-08-28 gets an invented name and an invented workspace name — `'Personal Workspace'` for the workspace, and the email's local-part (or the literal string `'User'`) for the user — even though `012_no_invented_names.sql` (2026-08-19) specifically removed this, and the M10 setup guide's completeness check ("is this name empty?") depends on it staying removed. An invented name is indistinguishable from one the person actually typed, so the setup guide reports the profile step done for an account whose owner never touched the field.

## Reproduction

Not reproduced against a live signup (would require creating a real account). Confirmed directly against the live database instead:

```sql
select prosrc from pg_proc where proname = 'bootstrap_workspace' and pronamespace = 'public'::regnamespace;
```

Run against `pnymngoqseltgigcfevq` (staging) on 2026-08-29, the live function body contained `'Personal Workspace'` and `coalesce(..., split_part(u.email, '@', 1), 'User')` — the exact strings `012` removed.

## Investigation

`020_bootstrap_refuses_daemon.sql`'s own header says: "This is 004's function verbatim with the guard inserted... Diff it against 004 before applying; if 004 has changed since this file was written, this file is stale and re-copying it is the fix." It had changed — `012_no_invented_names.sql` rewrote the same function nine days earlier — and whoever wrote `020` copied `004`'s body (the pre-`012` version) instead of the version actually live in the database, then applied it. `create or replace function` gave no warning; nothing failed, no advisor fired, because the resulting function is perfectly valid SQL — it's just the wrong SQL.

This is the same class of bug `027_restore_chat_auto_title.sql` already found and fixed once, for `enqueue_chat_turn` (`024` and `026` each silently dropped the auto-title block by copying an older version of that function). `027`'s own header names the general failure mode explicitly. This bug is a second instance of it, on a different function, not caught at the time because nothing re-walked `012`'s acceptance scenario after `020` landed.

## Impact

Every workspace and user bootstrapped between 2026-08-28 (when `020` was applied) and 2026-08-29 (this fix) on `staging`/`development`'s shared project carries an invented name, silently marking the M10 setup guide's name step "done" for accounts whose owner never set one. Low severity (cosmetic/UX, not a security boundary), but exactly the failure `012` was built to prevent, now recurring.

## Resolution

New file `packages/shared/drizzle/policies/028_restore_no_invented_names_after_020_regression.sql` — `020`'s body (daemon-identity guard kept, DI-5 unchanged) with `012`'s fix layered back on top, plus the same narrow cleanup UPDATE `012` used (clears only names that are exactly the email local-part with no provider-supplied name, and only the literal `'Personal Workspace'` name with a still-bootstrap-generated slug).

Applied directly to both `pnymngoqseltgigcfevq` (staging) and `styichgxhecmatkholvi` (prod) on 2026-08-29. Verified by re-reading `pg_proc.prosrc` for `bootstrap_workspace()` on both — confirmed `''` defaults, no `'Personal Workspace'` or `split_part`/`'User'` fallback.

`policies/README.md`'s apply-order list should be updated to include `028` the next time it's touched (not done in this pass — see the plan doc's scope boundaries on why the queue/README weren't fully regenerated in this change).
