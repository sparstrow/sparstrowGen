# T-D2-03 — approval status, six identity roles, the avatar rewired

| | |
|---|---|
| **Tag** | `[S]` |
| **Serves** | **US-T2** — telling agents apart, and telling "waiting for me" from "broken" |
| **Depends on** | `T-D2-01`, `T-D2-02` |
| **Blocks** | — |
| **Phase spec** | [README.md](README.md) |
| **Status** | ✅ done 2026-08-19 |

## Objective

Ship the two colour roles `DESIGN.md` added on 2026-08-19 answering `OQ-3`, and
stop actor avatars reading as status.

## What was built

- `--approval` at hue 310, both modes, plus a `Badge` `approval` variant.
- `--identity-1..6` at hues 50/135/185/235/285/335.
- `actor-avatar.tsx` rewired: a neutral fill with the identity colour on the
  mark and a 40% ring. The name hash is untouched, so an agent keeps the slot it
  always had — only the colour of that slot moved.

## Decisions made while building

**The doctrine's specified avatar form does not clear the floor.** §2.5 said "a
tint plus its own foreground"; measured, that reaches 3.91:1 in dark mode
because a 15% tint lifts the ground by more than the mark gains. Recorded as
`DD-013` with the two rejected alternatives and their numbers.

**Contrast against a colour's own tint is worst over the *lightest* ground in
the mode, not the darkest.** Measuring the darkest flatters it by nearly a
point. That error is why the form looked fine when it was written.

## Verification

- `design-brief/status-identity-solve.mjs` derives every value; the test asserts
  them.
- Rendered in the design-system viewer: the approval chip resolves to
  `oklch(0.78 0.15 310)` on `oklch(0.16 0 0)`, and the six identity swatches to
  their exact measured values.

## Result

**Three corrections to the mapping `T-D1-01` specified**, all found by reading
call sites rather than hues:

- **violet is the approval state, not an identity hue.** `attention-queue`, the
  node-shell approval ring and dot, and the tasks board Review column all used
  it that way.
- **`tasks.tsx` COLUMNS are task statuses, not actors.** The task document had
  them down as identity tokens; they are inbox/todo/in_progress/review/done/
  failed and map to the status roles.
- **A hardcoded `rgba()` emerald glow** sat inside an arbitrary Tailwind shadow
  in `node-shell.tsx`, where no palette-class grep would ever have found it.
