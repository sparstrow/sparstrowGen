# Sparstrowgen Design System — changelog

Newest first. Record token changes, new components, and new prototypes — *what*
changed. **Why** it changed goes in [`DECISIONS.md`](DECISIONS.md), which is the
file to read before altering a design choice.

## 2026-08-18

- **`DESIGN.md` was written** (`design-brief`), replacing the retired doctrine.
  This system has **not yet been rebuilt against it** — its type and spacing
  tokens still carry values transcribed from the retired prose, and
  `--transition-base` remains an invented token present in no real stylesheet.
  Tracked as `doc/KnownGaps.md` **G-18** (the checker's blind spot) and **G-19**
  (the doctrine's theming contract not existing in `globals.css`).
- Added `DECISIONS.md` — 8 entries, `DD-001`…`DD-008`.
- Added `designs/Machines/` prototype and `design-brief/` boards.

## 2026-08-17

- **This system is built partly against a doctrine that has since been
  retired.** `DESIGN.md`'s previous contents were generic tool output nobody
  chose; see that file for the full story. Concretely, what needs revisiting
  once `design-brief` produces the new doctrine:
  - `tokens/typography.css` and `tokens/spacing.css` — values sourced from the
    retired prose, not from the real stylesheet.
  - `tokens/spacing.css`'s `--transition-base: 140ms ease` — **invented during
    the mirror pass; it does not exist in the real stylesheet.** A mirror-mode
    violation of this skill's own rule. The app's four real animations
    (`spg-slide-in-right`, `spg-fade-in`, `spg-pulse`, `spg-turn-in` in
    `packages/ui/src/styles/globals.css`) are documented nowhere and should
    become the new Motion section's source.
  - `guidelines/*.card.html` and several `.prompt.md` files cite the retired
    doctrine by name (One Accent Rule, Flat-By-Default, Line-Length Rule).
  - `ds.mjs check` did not catch the invented token, because it only diffs
    *recorded* tokens against source — it has no rule for "the system declares
    a token the source lacks." Real gap in the checker.
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
