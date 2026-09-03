# FB-2026-08-27-forgot-password-breaks-tab-order

**Status:** 🟢 routed
**Reported by:** owner
**Reported:** 2026-08-27
**Area:** Auth — sign-in form (`/login`, sign-in mode)

## Raw feedback

> I want the forgot password button to moved after the password textbox. I
> have a habbit of writing email and clicking tab to go to the password box
> and type the password and hit enter to signin fast. But the forgot password
> button is in the middle so I had to hit tab twice.

## Context

On the sign-in form, "Forgot password?" currently sits between the Email and
Password fields (in the row alongside the Password label, but earlier in tab
order than the Password input itself — it sits between Email and Password in
the DOM). The owner's keyboard flow is: type email → Tab → type password →
Enter. Because "Forgot password?" is a focusable button positioned in that
same tab sequence before the password input, Tab lands there first instead of
in the Password field, breaking the fast keyboard flow.

Owner's expectation: move "Forgot password?" so it comes after the Password
textbox in tab order, so Email → Tab → Password → Enter works in one Tab
press.

## Triage

Worth building, and small enough to go straight to code rather than a spec —
a single form's DOM order, no product decision involved. Built directly on
`fix/auth-signup-reset-and-tab-order` alongside the two sibling auth items
reported the same day.

## Resolution

Done. "Forgot password?" moved out of the Password label row and below the
password input, right-aligned, so the DOM order is now Email → Password →
show/hide → Forgot password.

Kept as a real, tabbable `<button>` rather than removed from the tab order
with `tabIndex={-1}` — `DESIGN.md` §9.3 makes keyboard reachability
mandatory, and hiding the control from keyboard users would trade one
person's Tab press for another's inability to reach password recovery at all.

**Verified live** (`agent-browser`, port 3030): focused the email field,
pressed Tab, and confirmed `document.activeElement.id === "password"` — the
owner's Email → Tab → Password → Enter flow in one Tab press. Two further
Tabs reach "Show password" then "Forgot password?", so nothing became
unreachable.
