# Sparstrowgen Design System — changelog

Newest first. Record token changes, new components, and new prototypes.

## 2026-08-17

- Verified `designs/Machines/machines.dc.html` end-to-end with the new
  `frontend-verify` skill loop and fixed two findings: row status copy that
  had drifted from `runtimes-card.tsx` ("active"/"unreachable" instead of the
  real "online"/"last seen Xm ago"), and a stale header count when previewing
  Empty/Loading/Error via the prototype's devbar switcher. See
  `designs/Machines/machines.handoff.md`'s Verification section.
- Added `designs/Machines/machines.dc.html` — first `interactive-prototype`
  run, US1 of `doc/specs/2026-08-16-setup-and-machines.md`.
- Added the `frontend-verify` skill (`.claude/skills/frontend-verify/`) — the
  end-to-end browser verification loop that is now Definition of Done for any
  frontend work, referenced by `interactive-prototype` and this skill.
- System initialised in `mirror` mode.
