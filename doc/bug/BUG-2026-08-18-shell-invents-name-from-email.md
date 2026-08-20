# BUG-2026-08-18-shell-invents-name-from-email

**Status:** 🟢 resolved 2026-08-20
**Reported by:** agent — found while writing `T-M9-01`, confirmed while writing `T-M9-03`
**Reported:** 2026-08-18

## Symptom

The app shell's account name is derived from the signed-in user's **email
address** when no name has been supplied.
[`account-snapshot.ts:29-36`](../../apps/web/src/lib/auth/account-snapshot.ts:29):

```ts
const name =
  (typeof meta.full_name === "string" && meta.full_name) ||
  (typeof meta.name === "string" && meta.name) ||
  email.split("@")[0] ||     // <- here
  "Account";
```

This is the **same invention** `T-M9-01` just removed from
`bootstrap_workspace`, in a second store. FR-019 says nothing may derive a
person's name from their email address; the database now obeys that and the
shell does not.

It is currently invisible, because until M9's SQL is applied every account also
carries the same string in `public.users.name` and in auth metadata — three
copies that agree. It becomes visible the moment either of those is cleared.

## Reproduction

Not reproducible when this was filed: it needed `T-M9-01`'s SQL applied to
staging, which at the time was tracked as a `KnownGaps.md` entry numbered
`G-20` — since closed, and its number since reused for an unrelated finding
(see that file's "never reuse a `G-` number" note, which names this file as
one of the stale references left over from that). The SQL has since been
applied and this bug is fixed regardless; the sequence below is the historical
record of how it was found to be forthcoming, not a live reproduction:

1. Apply `0003_setup_identity_fields.sql` and
   `policies/012_no_invented_names.sql` to staging.
2. Sign up a new account, `someone@example.com`, with email/password (so no
   provider supplies `full_name`).
3. Open the app.
   - **Expected:** the account has no name — it has never been asked for one —
     and the setup guide's profile step is the thing that asks.
   - **Actual (predicted):** the shell shows **`someone`**, exactly as before.
     `public.users.name` is correctly `''`, so the profile form renders empty
     while the sidebar shows a name — two surfaces disagreeing on the same page.
4. Or, on an existing account: `PATCH /api/v1/me` with `{"name": ""}`.
   The row is cleared and auth metadata gets `full_name: ""`. Because `""` is
   falsy, the `||` chain skips both metadata keys and lands on
   `email.split("@")[0]`. **Clearing your name puts the invented one back.**

Step 4 is the one worth reading twice — the clear appears to fail.

## Investigation

Traced, not guessed:

- `toSnapshot()` is the only producer of `account.name`. It is called from the
  root layout (server) and rebuilt by `WebAccountProvider` on `USER_UPDATED`.
- `T-M9-03`'s `PATCH /me` writes `full_name` **and** `name` into auth metadata
  precisely so this chain finds a real name. That works for every non-empty
  value. It cannot work for `""`, because the chain tests truthiness, not
  presence.
- Two separate defects, and they need different fixes:
  1. the `email.split("@")[0]` fallback exists at all — that is the FR-019
     violation;
  2. `""` is indistinguishable from "unset" in a `||` chain — that is why
     clearing a name does not appear to clear it.
- **Ruled out** as the fix: having `PATCH /me` write `null` instead of `""` to
  metadata. It makes step 4 land on `"Account"` instead of the email, which is
  less wrong but still not right, and it leaves defect 1 untouched.
- **Not decided here:** what the shell should show for an account with no name.
  `"Account"`, the email in full, initials from the email, or a nameless avatar
  are all defensible and it is a design call, not an implementation one. That is
  why this is filed rather than fixed inline — see below.

## Impact

**Who:** every account with no name — which, after `T-M9-01` is applied, is
every new account and the owner's own.

**What breaks:** the app tells a user their name is something they never chose,
in the most persistent piece of UI there is. It also makes the setup guide look
wrong rather than right: US2 scenario 9 promises "nothing has been guessed on my
behalf", and the sidebar will be visibly guessing while the form it links to is
empty. A user who then clears their name sees it reappear, which reads as a
broken save.

**Severity:** not a crash, and no data is wrong — `public.users` is correct
throughout. But it directly contradicts the requirement M9 exists to satisfy,
and it is on screen at all times.

**Workaround:** set a name. Which is what the guide asks for anyway, so most
people will never see it — the exposed case is a brand-new account and anyone
who deliberately clears the field.

## Resolution

**Fixed — 2026-08-20, in `T-M10-04`.**
[`account-snapshot.ts:29-40`](../../apps/web/src/lib/auth/account-snapshot.ts:29)
no longer falls back to `email.split("@")[0]`. Removing that third link in the
`||` chain fixed both defects at once, not just the first: with only two
`(typeof x === "string" && x) || …` links left, an explicit `""` and an absent
key both fall all the way through to the final `""` — the presence-vs-truthiness
gap only existed because a *third*, truthy-by-construction fallback used to
catch what the first two missed.

The "what does an unnamed account look like" call landed as: `account.name` is
now genuinely `""` (matching the row, and matching every other identity field
this app has), and **display** sites decide what to show for that themselves —
`WorkspaceSwitcher`'s dropdown label falls back to `account.email`, a rendering
choice, not a re-invention of identity.

Verified: `apps/web/src/lib/auth/account-snapshot.test.ts` (5 tests, including
the exact reproduction — `full_name: "", name: ""` on an
`sriharicoder@example.com` account, which now returns `""` rather than
`"sriharicoder"`). `grep -rn 'email.split' apps/web/src packages/ui/src` has no
remaining name-from-email derivation.
