# T-M3-07 — Runtimes UI: pair, list, revoke

| | |
|---|---|
| **Tag** | `[P]` parallel — UI files, no overlap with the core tasks |
| **Depends on** | T-M3-01 |
| **Blocks** | T-M3-08 |
| **Phase spec** | [README.md](README.md) |
| **Status** | queued |

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

- [ ] `apps/web/src/lib/api/handlers/pairing.ts`:
  - [ ] `POST /api/v1/pairing-codes` → creates a code, returns it once
  - [ ] `GET /api/v1/runtimes` → machines with derived online status (T-M3-06's rule)
  - [ ] `DELETE /api/v1/runtimes/:id/token` → sets `revoked_at`
  - [ ] `PATCH /api/v1/runtimes/:id` → rename
  - [ ] Register in the router; follow the specificity ordering M2 established (static segments must outrank `:param`)
- [ ] Hooks in `packages/ui/src/api/hooks.ts` following the file's existing conventions
- [ ] `RuntimesCard` in `packages/ui/src/routes/pages/settings.tsx`, Workspace tab
- [ ] Code display: large, monospace, copy button, visible countdown to expiry
- [ ] The exact command to run shown next to it: `sparstrow pair <code>`
- [ ] Machine list: name, OS, capabilities, last seen (relative), online/offline
- [ ] Empty state that explains what pairing is for and how to start
- [ ] Rename inline; revoke behind `ConfirmDialog` naming the machine
- [ ] Theme-correct — tokens only, no hardcoded colors (the login page had this bug)

## Traps

**A consumed or expired code must not still look valid on screen.** The card
holds a code in component state; nothing invalidates it when the countdown hits
zero. Expire it in the UI too, or someone types a dead code into a terminal and
blames the CLI.

**Do not show the daemon token anywhere, ever.** The UI never receives it —
`daemon_tokens.token_hash` is not selectable by users (M1 revoked it), and the
plaintext only ever existed in the pairing response to the daemon.

## Verification

- [ ] Generate a code, pair a real machine with it, watch the machine appear
- [ ] Confirm the code becomes unusable after redemption, in the UI and the API
- [ ] Rename a machine; confirm the name survives a core restart (pairs with T-M3-05)
- [ ] Revoke; confirm the daemon's next request fails and the UI reflects it
- [ ] Sign in as a second user in a different workspace; confirm they see none
      of the first user's runtimes or codes
- [ ] Check both light and dark themes

## On completion

- [ ] Tick 5.7 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
