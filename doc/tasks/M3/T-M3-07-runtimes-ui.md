# T-M3-07 — Runtimes UI: pair, list, revoke

| | |
|---|---|
| **Tag** | `[P]` parallel — UI files, no overlap with the core tasks |
| **Depends on** | T-M3-01 |
| **Blocks** | T-M3-08 |
| **Phase spec** | [README.md](README.md) |
| **Status** | done - verified in the browser 2026-08-10 |

## Objective

The owner can generate a pairing code, see their machines, and revoke one.
Without this M3 is invisible — a paired machine that appears nowhere is
indistinguishable from a pairing that failed.

## Decisions already made

**The browser side uses the ordinary session-cookie path**, not the daemon API.
`POST /api/v1/pairing-codes` is a category-A endpoint in M2's sense: a normal
handler in `apps/web/src/lib/api/handlers/`, running as the signed-in user, with
RLS doing the work. The existing policies already fit —
`pairing_codes_own_insert` requires `created_by_user_id = auth.uid()` and
workspace membership.

**Codes are short-lived and readable aloud.** 10 minutes, and a format someone
can retype into a terminal on another machine without ambiguity — no `0`/`O`,
no `1`/`l`. This is a code a person carries between two machines, so entropy
must come from length rather than alphabet: aim for ≥ 60 bits after excluding
confusable characters.

**Revocation sets `revoked_at`; it does not delete the row.** The history of
which machine was paired when is worth keeping, and T-M3-02 checks `revoked_at`
on every request so a revoked token stops working immediately. Deleting would
also orphan the `runtimes` row.

**Revoking is a confirm-gated destructive action.** Use the existing
`ConfirmDialog` from `packages/ui/src/components/ui/confirm-dialog.tsx` — the
component every other destructive action in the app already routes through.

**Lives in Settings → Workspace.** That tab already holds `FactoryHealthCard`
and `SystemCard`, which is the same category of information. Do not invent a
new top-level route for it.

## Checklist

- [x] `apps/web/src/lib/api/handlers/pairing.ts`:
  - [x] `POST /api/v1/pairing-codes` → creates a code, returns it once
  - [x] `GET /api/v1/runtimes` → machines with derived online status (T-M3-06's rule)
  - [x] `DELETE /api/v1/runtimes/:id/token` → sets `revoked_at`
  - [x] `PATCH /api/v1/runtimes/:id` → rename
  - [x] Register in the router; follow the specificity ordering M2 established (static segments must outrank `:param`)
- [x] Hooks in `packages/ui/src/api/hooks.ts` following the file's existing conventions
- [x] `RuntimesCard` in `packages/ui/src/routes/pages/settings.tsx`, Workspace tab
- [x] Code display: large, monospace, copy button, visible countdown to expiry
- [x] The exact command to run shown next to it: `sparstrow pair <code>`
- [x] Machine list: name, OS, capabilities, last seen (relative), online/offline
- [x] Empty state that explains what pairing is for and how to start
- [x] Rename inline; revoke behind `ConfirmDialog` naming the machine
- [x] Theme-correct — tokens only, no hardcoded colors (the login page had this bug)

## Traps

**A consumed or expired code must not still look valid on screen.** The card
holds a code in component state; nothing invalidates it when the countdown hits
zero. Expire it in the UI too, or someone types a dead code into a terminal and
blames the CLI.

**Do not show the daemon token anywhere, ever.** The UI never receives it —
`daemon_tokens.token_hash` is not selectable by users (M1 revoked it), and the
plaintext only ever existed in the pairing response to the daemon.

## Verification

- [x] Generate a code, pair a real machine with it, watch the machine appear
- [x] Confirm the code becomes unusable after redemption, in the UI and the API
- [x] Rename a machine; confirm the name survives a core restart (pairs with T-M3-05)
- [x] Revoke; confirm the daemon's next request fails and the UI reflects it
- [x] Sign in as a second user in a different workspace; confirm they see none
      of the first user's runtimes or codes
- [x] Check both light and dark themes

## On completion

- [x] Tick 5.7 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)

## Result - verified in a real browser session, 2026-08-10

34 API assertions (`scratchpad/runtimes-api.mjs`) plus a live UI pass.

### The trap fired, and was caught by exercising it

The task doc warned: *"A consumed or expired code must not still look valid on
screen."* The first implementation handled **expiry** and missed
**consumption** - after a machine paired successfully, the panel kept showing
the used code, still counting down. Someone would have read a dead code onto a
third machine and blamed the CLI for saying "already used".

Fixed by retiring the panel when a new machine appears, which the list already
polls for, and replacing it with a named confirmation. Re-verified end to end:
generate -> pair -> panel gone, no stale countdown, "Second Machine is paired."

### Verified in the browser

- Empty state renders and explains what pairing is for
- Generate -> copy -> `sparstrow pair <code>` -> the machine appears **without a
  manual refresh**, showing os, hostname, core version, and its probed
  capabilities as badges
- `--name "Second Machine"` carried through to the list
- The first machine flipped to "last seen 1m ago" on its own once it stopped
  beating - liveness derived, nothing written to the row
- Revoke opens a confirm dialog, and the machine **stays listed** afterwards
- No console errors; the card inverts correctly between light and dark, so it
  is on tokens rather than the hardcoded colours the login page once had

### Verified through the API

Cross-workspace isolation re-proved over HTTP in all four directions: B cannot
list, rename, revoke or delete A's machine (404 each), A's row is untouched,
and A's daemon token still works afterwards.

A re-registering daemon updates capabilities and core version but **does not
stomp a name the owner chose** - the reason `register()` never sends `name`.

Revoking twice returns 404 rather than a false success, the same false-204 class
of bug M2 found across eleven DELETE handlers.
