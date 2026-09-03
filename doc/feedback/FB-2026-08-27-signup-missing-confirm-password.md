# FB-2026-08-27-signup-missing-confirm-password

**Status:** 🟢 routed
**Reported by:** owner
**Reported:** 2026-08-27
**Area:** Auth — sign-up form (`/login`, sign-up mode)

## Raw feedback

> On the create account, we need to have confirm password textbox aswell

(Shared alongside a screenshot of the "Create an account" card, showing Email
and Password fields with no confirmation field.)

## Context

The sign-up form only ever asked for a single Password value with a
show/hide toggle. A typo in that one field is invisible until the
confirmation email round-trip fails or the person can't sign back in later —
there was no earlier point to catch it.

## Triage

Worth building, straight to code — one field on one form, no product decision
involved. Built on `fix/auth-signup-reset-and-tab-order` alongside the two
sibling auth items reported the same day.

## Resolution

Done. A "Confirm password" field now renders in sign-up mode only, with:

- a mismatch checked **before** `signUp` is called, so a typo never reaches
  Supabase (which would otherwise create the account with whichever value was
  in the first box, exactly the silent failure this asked for);
- inline feedback as soon as the two diverge, plus `aria-invalid` so it is
  not colour-only;
- the existing show/hide toggle reused rather than a second one added —
  revealing the password is what lets someone compare the two values, so a
  separate toggle would be redundant;
- the field cleared on mode switch, so a half-typed value cannot follow the
  user into a mode that does not show it.

**Verified live** (`agent-browser`, port 3030): typing mismatched values
shows "Those passwords don't match." and sets `aria-invalid="true"`;
correcting the second field clears both. Submitting while mismatched fired
**zero** `auth/v1/signup` requests — the guard holds. Also checked at 375px
in dark mode: renders cleanly, no horizontal overflow.
