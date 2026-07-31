# `radio-group` primitive

- **source:** owner decision during 6-pre Phase A
- **project:** factory
- **size:** S
- **date:** 2026-07-27
- **links:** `docs/specs/2026-07-27-intake-backlog-triage-and-sequencing.md` §3

**What:** shadcn/ui's `radio-group` primitive (`RadioGroup`, `RadioGroupItem`), listed in the 6-pre
audit among the absent components and scheduled alongside `checkbox` in the Phase A vendoring pass.
`checkbox` shipped; `radio-group` did not.

**Why deferred:** it has no consumer. A search of `packages/ui/src` found zero `type="radio"`
inputs and no hand-rolled single-select control anywhere in the tree — unlike `checkbox`, which had
four pages using raw `type="checkbox"` (`agents`, `imports`, `team-detail`, `teams`). Vendoring it
would have been speculative work of exactly the kind `CLAUDE.md`'s conduct bar forbids: building
for a need nobody has expressed yet. The audit listed it because Multica ships it, which is a
reason to expect it eventually, not a reason to have it now.

**Revisit when:** a surface actually needs mutually-exclusive single-select — a settings page
choosing one mode from several, or a creation flow picking one provider. Vendoring is roughly a
fifteen-minute job at that point (`@radix-ui/react-radio-group` plus one file following the same
adaptation conventions as `checkbox`), so there is no cost to waiting. Likely to surface during
Phase B, and likely in the same change as the deferred form primitives — see
`2026-07-27-form-primitives.md`, since `FieldSet`/`FieldLegend` exist partly to group radios.
