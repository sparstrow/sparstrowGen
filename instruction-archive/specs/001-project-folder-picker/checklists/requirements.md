# Specification Quality Checklist: Project Root Directory Folder Picker

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-08
**Feature**: [spec.md](../spec.md)

## Content Quality

- [X] No implementation details (languages, frameworks, APIs)
- [X] Focused on user value and business needs
- [X] Written for non-technical stakeholders
- [X] All mandatory sections completed

## Requirement Completeness

- [X] No [NEEDS CLARIFICATION] markers remain
- [X] Requirements are testable and unambiguous
- [X] Success criteria are measurable
- [X] Success criteria are technology-agnostic (no implementation details)
- [X] All acceptance scenarios are defined
- [X] Edge cases are identified
- [X] Scope is clearly bounded
- [X] Dependencies and assumptions identified

## Feature Readiness

- [X] All functional requirements have clear acceptance criteria
- [X] User scenarios cover primary flows
- [X] Feature meets measurable outcomes defined in Success Criteria
- [X] No implementation details leak into specification

## Notes

- Items marked incomplete require spec updates before `/speckit-clarify` or `/speckit-plan`.

### Re-validation after implementation (2026-08-08)

All 16 items still pass — 16/16, no regressions. The spec was not amended during the
build; every requirement was implementable as written.

**Two defects were found by driving the real surface, and both are the kind this
checklist cannot catch** — they are recorded here because "the spec was right" and "the
code was right" are different claims:

1. Closing the picker dropped focus to `<body>` instead of returning it to **Browse…**.
   Fails SC-007 (keyboard operability). Typecheck and 565 tests were green throughout.
2. A failed listing mid-navigation silently sent the owner to their home folder rather
   than reporting it. Fails FR-014 and SC-006. Caused by a fallback intended only for a
   stale path arriving from the field.

Both fixed and re-verified in the browser. They are the concrete argument for
Principle I: no automated gate in this repo would have surfaced either one.

**One pre-existing behaviour was observed and deliberately not fixed**: malformed JSON
on any `POST` returns `500 internal server error` rather than `400`, because
`server.ts`'s error handler special-cases `ZodError` and `HttpError` but not the
`SyntaxError` raised by the content-type parser. This affects every route, predates
this feature, and fixing it here would be exactly the adjacent-code change Principle
VII prohibits. Flagged to the owner instead.

### Re-validation after `/speckit.clarify` (2026-08-08)

Four clarifications were integrated. All 16 items still pass — 16/16 → 16/16, no newly passing
items and no regressions. What changed, and why none of it moved a checkbox:

- **FR-022 split into FR-022a/FR-022b** with an explicit prohibition on implementing the loopback
  check alone. This *strengthens* "requirements are testable and unambiguous" — the old wording
  said enforcement must exist without saying what would count.
- **SC-008 rewritten and SC-009 added.** Both remain outcome-shaped and free of mechanism, so
  "success criteria are technology-agnostic" still holds. SC-009 names an artifact (the packaged
  app), not a technology or an implementation.
- **Scope narrowed explicitly**, with the excluded caller named and a deferral written to
  `docs/deferred/`. "Scope is clearly bounded" was already checked; it is now bounded in writing
  rather than by omission.
- **FR-005/FR-009 and User Story 2** were made consistent about the opening location. Story 2's
  acceptance scenario 2 previously said the browser opens at the drive list, which the
  clarification contradicted; it was replaced rather than supplemented, so no stale alternative
  remains in the document.

### Definition of Done — final sign-off (2026-08-08)

1. **Typecheck clean** — `pnpm typecheck`, all 6 packages, after repairing a stale
   `node_modules` state left by the packaging step (`pnpm install`, unrelated to this
   feature's code).
2. **Tests green** — `pnpm test` from a clean tree with no core server running: 565
   tests across core (479+4 skipped), shared (59), ui (19), desktop (8).
3. **Checklists complete** — this file, 16/16, no incomplete items.
4. **Real-artifact verification** — all three stories driven live. US1 on the packaged
   desktop app (`electron-builder` distributable, installed build, real Windows folder
   dialog, path landed in the field, provisioned successfully) — required per this
   feature's own clarification (SC-009), since a dev-mode Electron launch does not
   count. US2/US3 driven in a real browser against the local core, including the two
   defects above, found and fixed there.
5. **Design and UI bar** — vendored shadcn primitives only (T001); all four states
   shipped (loading skeleton, empty, error/alert, populated); light and dark both
   verified with screenshots; keyboard operability verified (Escape, Enter-to-submit,
   focus restoration) as part of finding and fixing defect 1 above.
6. **Knowledge Center currency** — `projects-and-workspaces.md` updated in the same
   change, including the explicit note that the variant-fork field is not yet covered.
7. **Architecture and security contract** — `host-fs` schemas live in `shared`
   (Principle IV); FR-022a/FR-022b both implemented and both independently tested
   against the real `buildServer`, not a copy of the gate's condition (Principle VI).
8. **Evidence** — every claim above is backed by a command run and its output read in
   this session: typecheck/test output, live `curl` against the running core, and
   browser/computer-use screenshots of the actual behavior.

A third, pre-existing defect was found and deliberately **not** fixed here: the packaged
desktop app occasionally shows a fully blank window on first launch (empty DOM, Quirks
Mode, a single reload fixes it). It reproduces independently of this feature's changes —
confirmed by inspecting `main.ts`'s window-open sequence — and fixing an Electron
first-paint race is not what this feature's plan lists. Flagged as a separate task rather
than folded in here or left as a silent TODO.

### Validation notes (iteration 1 — all items pass)

- **"No implementation details"** — the spec names two *product surfaces*, "the packaged desktop
  app" and "a browser-based client", and one architectural boundary, "the core". These are the
  owner's own vocabulary for things that already exist and ship, not choices this feature makes.
  No framework, library, transport, route, or component is named anywhere in the requirements.
- **Deliberate exception, recorded rather than silently allowed**: the Assumptions section refers
  to the existing bearer-token authentication on the local core. It is stated as a dependency on
  an existing system — which the template's Assumptions section explicitly invites — and it is
  what makes FR-021 verifiable without inventing a second auth scheme.
- **Success criteria** carry no timings tied to a technology; SC-005's 1-second budget is a
  user-perceived one, and SC-008 is stated as an exposure outcome, not a mechanism.
- **Scope boundary is explicit and load-bearing**: FR-025 pins existing provisioning validation
  as unchanged and authoritative, so the picker cannot quietly become a second place where
  directory rules are decided.
