# Owner action items

**Open this file when you're wondering "what do I need to go do?"** Everything
here needs you specifically — an account only you control, a dashboard setting,
a secret only you should type in. Nothing here is something an agent can or
should do on your behalf.

Each row is one action. Rows with a guide link to the step-by-step runbook.
Rows without one have nothing to click yet — the note explains why.

| Status | Action | Why it needs you | Guide |
|---|---|---|---|
| 🔲 pending | Register OAuth apps for GitHub and Google, paste the client secrets into Supabase | Social sign-in is built and verified; both providers are currently disabled at the provider level, so the buttons render disabled | [oauth-providers.md](oauth-providers.md) |
| ⛔ blocked | Enable leaked-password protection | Requires Supabase's Pro plan — confirmed 2026-08-10 there is nothing to enable on the current plan. Nothing to do until you upgrade; re-check the box below then. | — |

**Status legend:** 🔲 pending — do it whenever you're ready · ⛔ blocked — can't
be done yet, the reason is the whole action item · ✅ done — leave completed
rows here for a while rather than deleting; they're proof of what you already
handled if the same question comes up again.

---

## How this stays accurate

When a task or plan produces a step only the owner can do, it gets **one** row
here, and everywhere else that references it points back to this file instead
of repeating the status:

- `doc/tasks/MasterTaskQueue.md`'s "Blocked items" table
- `doc/Deferred.md`, if the item is also parked in principle

If you ever see the same action described differently in two places, that's
drift — the fix is deleting the duplicate, not editing both.
