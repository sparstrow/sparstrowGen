# Implementation Plan: Project Root Directory Folder Picker

**Branch**: `WT001-project-folder-picker` | **Date**: 2026-08-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-project-folder-picker/spec.md`

## Summary

Give the New project dialog's root directory field a **Browse…** button that fills it, so no
absolute Windows path is ever typed by hand.

Two surfaces behind one button. Inside the packaged desktop app it opens the real Explorer
directory dialog through a new, narrow preload channel. Everywhere else it opens an in-app
directory browser served by three new endpoints on the local core — list volumes, list one
directory level, create one folder — with the create action offered only in the two creation
modes whose target is meant not to exist yet.

The security shape is the part that drives the design: host directory enumeration is registered
**only** when the core declares itself local, and refuses non-loopback callers on top of that.
Those are two independent layers because either one alone fails behind a reverse proxy.

## Technical Context

**Language/Version**: TypeScript 5.x on Node 24 (better-sqlite3 / node-pty native ABI)

**Primary Dependencies**: Fastify + zod (core), React 18 + TanStack Query + Tailwind v4 +
shadcn/ui (ui), Electron (desktop). **No new runtime dependency is introduced by this feature.**

**Storage**: None. This feature reads the host filesystem and creates one directory; it writes
no rows and needs no migration.

**Testing**: vitest — `packages/core/src/**/*.test.ts` for the listing logic and the route gate,
`packages/ui/src/lib/*.test.ts` for the extracted UI decisions.

**Target Platform**: Windows 11 desktop (packaged Electron app) plus the Vite dev server in a
browser. The code paths are cross-platform; only Windows is verified.

**Project Type**: Local-first desktop application — Fastify core, React UI, Electron shell.

**Performance Goals**: A directory listing renders within 1 second for a typical directory
(SC-005). Volume enumeration must not spawn a child process, which rules out the obvious
Windows approaches (see research R2).

**Constraints**: Bounded listings (500 entries, matching the existing project file tree) with an
explicit truncation signal; no persisted picker state; the typed input stays editable throughout.

**Scale/Scope**: One new core module and route file, one new preload channel, one new UI
component plus a small pure-logic module. Roughly 400–500 lines including tests.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Gate | Verdict |
|---|---|---|
| **I. Verified by the Real Artifact** | Story 1 verified on the built-and-booted packaged app (SC-009); Stories 2–3 driven in a real browser. Regression tests for the security gate; golden-path coverage for listing and name validation. | **PASS** — see [quickstart.md](./quickstart.md) |
| **II. Evidence Over Assertion** | Every gate has a command in quickstart.md that produces readable output. | **PASS** |
| **III. Owner-Gated Delivery** | Spec reviewed and accepted 2026-08-08; four clarifications recorded. No `main` interaction. | **PASS** |
| **IV. Architectural Integrity** | No new dependency, no stack change. Shared request/response types go in `packages/shared` because core and UI must agree on them; dependency direction stays one-way. | **PASS** |
| **V. Frontend Is First-Class** | Composed only from already-vendored shadcn primitives (research R8). All four states ship together; light and dark verified; full keyboard operation; semantic tokens only. | **PASS** |
| **VI. Security and Trust Boundaries** | Two-layer containment (FR-022a/b), single-segment name validation, directory-creation only, filesystem names rendered as text. | **PASS** — the reasoning is research R1 and R5 |
| **VII. Scope Discipline** | One surface only. The second hand-typed path field is excluded in writing at `docs/deferred/2026-08-08-variant-fork-folder-picker.md`. | **PASS** |

**No violations. Complexity Tracking is therefore empty and omitted.**

Post-design re-check (after Phase 1): still **PASS**. The design added no dependency, no
abstraction layer, and no configuration surface beyond the single `SPARSTROW_DEPLOYMENT`
variable that FR-022a requires. The one judgement call worth naming is that host browsing lives
in its own module rather than extending the existing project file tree — research R3 explains
why that is the safer arrangement rather than the more elaborate one.

## Project Structure

### Documentation (this feature)

```text
specs/001-project-folder-picker/
├── plan.md              # This file
├── spec.md              # Feature specification (accepted 2026-08-08)
├── research.md          # Phase 0 — the decisions and what was rejected
├── data-model.md        # Phase 1 — entities and validation rules
├── quickstart.md        # Phase 1 — how to verify this feature
├── contracts/
│   ├── host-fs-api.md   # The three HTTP endpoints
│   └── desktop-preload.md  # The Electron preload channel
├── checklists/
│   └── requirements.md  # Spec quality checklist (16/16)
└── tasks.md             # Created by /speckit.tasks, not by this command
```

### Source Code (repository root)

```text
packages/shared/src/schemas/
└── host-fs.ts                      # NEW — zod schemas + types both sides share

packages/core/src/
├── config.ts                       # EDIT — add `deployment: "local" | "hosted"`
├── projects/
│   ├── files.ts                    # UNCHANGED — project-scoped tree, left alone (R3)
│   ├── host-fs.ts                  # NEW — volume enumeration, one-level listing, mkdir
│   └── host-fs.test.ts             # NEW — listing, validation, truncation, volumes
└── api/
    ├── server.ts                   # EDIT — register host-fs routes only when local
    └── routes/
        ├── host-fs.ts              # NEW — GET volumes, GET dirs, POST dirs
        └── host-fs.test.ts         # NEW — 404 when hosted, 401 unauth, non-loopback refused

packages/desktop/src/
├── preload.ts                      # EDIT — expose `dialogs.pickDirectory`
├── main.ts                         # EDIT — register the ipcMain handler
└── dialogs.ts                      # NEW — showOpenDialog wrapper, window-modal

packages/ui/src/
├── lib/
│   ├── directory-picker.ts         # NEW — pure decisions (surface, mode, name, parent)
│   └── directory-picker.test.ts    # NEW — tests for exactly those decisions
├── api/hooks.ts                    # EDIT — queries for volumes/dirs, mutation for mkdir
├── components/
│   └── directory-picker-dialog.tsx # NEW — the in-app browser
└── routes/pages/projects.tsx       # EDIT — the Browse… button beside the field
```

**Structure Decision**: The feature spans four of the five packages and follows the existing
one-way dependency direction. Shared request/response shapes live in `packages/shared` because
core validates them and the UI consumes them, which Principle IV requires rather than permits.
Host browsing gets its own core module and its own route file instead of extending
`packages/core/src/projects/files.ts`, for the reason set out in research R3. The UI's decision
logic is extracted to `packages/ui/src/lib/directory-picker.ts` so it can be tested without a DOM
harness, following the `lib/chat-pending.ts` pattern named in CLAUDE.md.
