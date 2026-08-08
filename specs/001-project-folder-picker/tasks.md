---

description: "Task list for 001-project-folder-picker"
---

# Tasks: Project Root Directory Folder Picker

**Input**: Design documents from `specs/001-project-folder-picker/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

## Ordering note — this list is deliberately not test-first

The stock template puts a "write these tests FIRST, ensure they FAIL" phase ahead of each story.
**That ordering is not used here.** CLAUDE.md requires verification tasks to sit in the
Integration and Polish phases, because Principle I verifies the built artifact rather than
mandating test-first authoring. Tests still appear — a story is not done without them — but
whether a given test is written before or after its code is the implementer's call, and the
binding gate is the real-artifact verification that closes each phase.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel — different files, no dependency on an incomplete task
- **[Story]**: US1 / US2 / US3, mapping to the user stories in spec.md
- Every task names its exact file path

---

## Phase 1: Setup

**Purpose**: Satisfy the mandatory frontend prerequisites before any component is written, and
close the one gap planning left open.

- [ ] T001 Invoke the `/shadcn` skill and the Shadcn UI MCP, read `DESIGN.md` for tokens and motion and `PRODUCT.md` for register, and confirm the primitive set named in research R8 (`dialog`, `button`, `input`, `scroll-area`, `breadcrumb`, `empty`, `skeleton`, `alert`, `separator`) is all already vendored under `packages/ui/src/components/ui/` — this is Principle V's obligation, not a preference
- [ ] T002 [P] Retry `list_blocks` on the Shadcn UI MCP — it failed with a GitHub API error during planning — and record the outcome in `specs/001-project-folder-picker/research.md` under R8, either confirming or correcting the "no existing block covers this" claim

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The button and the surface decision, both of which every story needs.

**⚠️ No user story work can begin until this phase is complete.**

- [ ] T003 Create `packages/ui/src/lib/directory-picker.ts` exporting `nativePickerAvailable()`, which returns true only when `window.sparstrowDesktop?.dialogs?.pickDirectory` is a function — probing the function itself, not the `sparstrowDesktop` object, so a shell predating this feature degrades instead of throwing (research R7)
- [ ] T004 Create `packages/ui/src/lib/directory-picker.test.ts` covering `nativePickerAvailable()` for three cases: no `sparstrowDesktop` at all, `sparstrowDesktop` present without `dialogs` (the old-shell case), and the function present
- [ ] T005 Add the **Browse…** button beside the root directory input in `packages/ui/src/routes/pages/projects.tsx` (the field at ~line 351, present in all three modes including the "Clone into" label), rendered only when a picker surface is available so it is absent rather than inert until US1/US2 land — keep the input editable and never disable it (FR-002)

**Checkpoint**: The field has a button that correctly shows nothing yet, and the surface decision is tested.

---

## Phase 3: User Story 1 — Native Explorer dialog (Priority: P1) 🎯 MVP

**Goal**: Browse… opens the real Windows folder dialog in the packaged desktop app and fills the
field.

**Independent Test**: Build, install, and boot the packaged app; pick a folder; confirm the
absolute path lands in the field and a project provisions against it.

**Depends on**: Phase 2. Needs nothing from US2 or US3 — no core endpoint is involved.

- [ ] T006 [P] [US1] Create `packages/desktop/src/dialogs.ts` exporting `pickDirectory(win, defaultPath?)` that calls `dialog.showOpenDialog(win, { properties: ["openDirectory"], defaultPath })`, validates `defaultPath` is an absolute existing directory before passing it (omitting it otherwise, so a stale value never blocks the dialog), and returns `filePaths[0]` or `null` per [contracts/desktop-preload.md](./contracts/desktop-preload.md)
- [ ] T007 [US1] Register the `sparstrow:pick-directory` `ipcMain.handle` in `packages/desktop/src/main.ts`, passing `mainWindow` so the dialog is window-modal, following the handler shape already used in `packages/desktop/src/updater.ts`
- [ ] T008 [US1] Expose `dialogs.pickDirectory` on the `contextBridge` surface in `packages/desktop/src/preload.ts`, keeping it invoke-only and extending the existing comment to record this as the second deliberate exception to "HTTP/WS only" and why
- [ ] T009 [US1] Wire the Browse… button in `packages/ui/src/routes/pages/projects.tsx` to the native picker when `nativePickerAvailable()`, writing the resolved path into the field and leaving it untouched on `null` (FR-003, FR-004), passing the field's current value as `defaultPath` (FR-005)
- [ ] T010 [US1] **Verify on the packaged app** per [quickstart.md](./quickstart.md) §6 — build the distributable, install, boot, and drive all seven steps. A dev-mode Electron launch does not satisfy this (SC-009)

**Checkpoint**: US1 fully functional in the real artifact. Shippable alone.

---

## Phase 4: User Story 2 — In-app directory browser (Priority: P2)

**Goal**: Browse… opens a working directory browser everywhere the native dialog does not exist.

**Independent Test**: In a browser, navigate from home down two levels, select a folder, confirm
the field holds its absolute path.

**Depends on**: Phase 2. Independent of US1 — the two surfaces never call each other.

- [ ] T011 [P] [US2] Create `packages/shared/src/schemas/host-fs.ts` with zod schemas and inferred types for `Volume`, `DirectoryEntry`, `DirectoryListing`, and `CreateDirectoryRequest` per [data-model.md](./data-model.md), and export them from the shared package index — these live in `shared` because core validates them and the UI consumes them (Principle IV)
- [ ] T012 [P] [US2] Add `deployment: "local" | "hosted"` to `AppConfig` in `packages/core/src/config.ts`, read from `SPARSTROW_DEPLOYMENT` and defaulting to `"local"`, with a comment recording that this is the FR-022a registration gate and that bind-host inference was rejected because it carries the same reverse-proxy hole (research R1)
- [ ] T013 [US2] Create `packages/core/src/projects/host-fs.ts` with `listVolumes()` (probe `A:`–`Z:` in parallel via `fs.promises.access` on Windows, single `/` entry on POSIX, omitting anything unreadable) and `listHostDir(path?)` (defaults to `os.homedir()`, directories only, alphabetical case-insensitive, 500 cap with a `truncated` flag, `parent: null` at a volume root, hidden and system directories excluded) — **do not modify `packages/core/src/projects/files.ts`**, which stays project-scoped (research R3)
- [ ] T014 [US2] Create `packages/core/src/api/routes/host-fs.ts` with `GET /host-fs/volumes` and `GET /host-fs/dirs`, including the FR-022b loopback refusal on each handler, and the status codes in [contracts/host-fs-api.md](./contracts/host-fs-api.md)
- [ ] T015 [US2] Register `hostFsRoutes` in `packages/core/src/api/server.ts` **inside** the existing `requireAuth` scope so authentication is inherited rather than re-added, and **only when** `config.deployment === "local"` so a hosted core has no such route to refuse (FR-022a)
- [ ] T016 [US2] Create `packages/core/src/projects/host-fs.test.ts` covering directories-only, alphabetical ordering, the 500 cap returning `truncated: true`, `parent: null` at a volume root, an unreadable directory surfacing rather than throwing, and volume enumeration on the current platform
- [ ] T017 [US2] Create `packages/core/src/api/routes/host-fs.test.ts` covering contract assertions 1–3: **not found** (not 403) with `deployment: "hosted"`, `401` with no bearer token, and `403` from a non-loopback source address
- [ ] T018 [US2] Add `useHostVolumes()` and `useHostDir(path)` queries to `packages/ui/src/api/hooks.ts`, following the existing query conventions in that file
- [ ] T019 [US2] Extend `packages/ui/src/lib/directory-picker.ts` with `parentOf(path)` and the path-display helper, and extend `packages/ui/src/lib/directory-picker.test.ts` to cover them — same files as T003/T004, so this runs after them, not beside them
- [ ] T020 [US2] Create `packages/ui/src/components/directory-picker-dialog.tsx` as a nested Radix `Dialog` composing the vendored primitives confirmed in T001: current absolute path displayed (FR-011), scrollable directory list, up-navigation that offers the volume list at a root (FR-012), a one-action jump to volumes (FR-009), a `truncated` notice (FR-013), and **all four states** — `skeleton` loading, `empty` for no subdirectories (still selectable), `alert` for an unreadable directory (FR-014), populated. Semantic tokens only; lucide icons at `size-4`; filesystem names rendered as text (FR-024)
- [ ] T021 [US2] Wire the in-app picker into `packages/ui/src/routes/pages/projects.tsx` for the non-native case, opening at the field's directory when it resolves and at home otherwise (FR-005), filling the field on confirm and leaving it untouched on dismiss (FR-003, FR-004)
- [ ] T022 [US2] **Verify in a real browser** per [quickstart.md](./quickstart.md) §3 and §5 — the nine navigation steps, all four states, and the nested-dialog behaviour research R9 flags as most likely to break: Escape closes only the picker, focus returns to Browse…, keyboard-only operation, light and dark themes, no sideways scroll

**Checkpoint**: US1 and US2 both work, independently, on their own surfaces.

---

## Phase 5: User Story 3 — Create a folder from the in-app browser (Priority: P3)

**Goal**: The two modes that need a directory which does not yet exist can create one in place.

**Independent Test**: In "Start from scratch", create a new folder in a writable parent, select
it, and provision a project into it.

**Depends on**: Phase 4 — it extends the same core module, route file, and dialog.

- [ ] T023 [US3] Add `createHostDir(parent, name)` to `packages/core/src/projects/host-fs.ts` implementing the seven validation steps in [data-model.md](./data-model.md) in order, including the independent `path.dirname(path.resolve(parent, name)) === path.resolve(parent)` confirmation, and calling `fs.mkdirSync` **without** `recursive` so a missing parent chain fails instead of being created silently (research R5)
- [ ] T024 [US3] Add `POST /host-fs/dirs` to `packages/core/src/api/routes/host-fs.ts`, returning `201` with the new directory's `DirectoryListing` so the client navigates in without a second call (FR-020), mapping conflicts to `409` and OS refusals to `403`
- [ ] T025 [US3] Extend `packages/core/src/api/routes/host-fs.test.ts` with contract assertions 4–5: `name: "../escape"` returns `400` **and creates nothing on disk** — assert the filesystem, not just the status — and an existing name returns `409` leaving the existing directory untouched
- [ ] T026 [US3] Extend `packages/ui/src/lib/directory-picker.ts` with `canCreateFolder(mode)` (true for `scratch` and `clone` only) and `isSingleSegment(name)`, and extend `packages/ui/src/lib/directory-picker.test.ts` to cover both — including the `bind` case returning false, which is the assertion most likely to be forgotten
- [ ] T027 [US3] Add the **New folder** affordance to `packages/ui/src/components/directory-picker-dialog.tsx`, rendered only when `canCreateFolder(mode)`, navigating into the created folder on success (FR-020) and surfacing conflict and OS-refusal messages inline without disturbing the dialog (FR-018, FR-019)
- [ ] T028 [US3] Pass the active creation `mode` from `packages/ui/src/routes/pages/projects.tsx` into the picker so the affordance is gated correctly (FR-016)
- [ ] T029 [US3] **Verify in a real browser** per [quickstart.md](./quickstart.md) §4 — creation, conflict, `..` and `a\b` rejection, end-to-end provisioning into the new folder, **and the absence of New folder in "Use existing folder"**

**Checkpoint**: All three stories independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T030 [P] Update the Knowledge Center in `packages/ui/src/content/knowledge/` to document the folder picker in the project-creation flow — or record an explicit decision to skip it, since Definition of Done gate 6 requires the decision be stated rather than defaulted
- [ ] T031 [P] Run `pnpm typecheck && pnpm test` from a clean tree with no core server running, and read the output
- [ ] T032 Run the full [quickstart.md](./quickstart.md) end to end, including the §2 security checks that prove the hosted build returns **not found** rather than a refusal, and record the evidence
- [ ] T033 Confirm Definition of Done gates 3–8: `checklists/requirements.md` complete, real-artifact verification done for all three stories, design bar met, Knowledge Center current, architecture and security contract held, and every completion claim backed by output actually read

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)** — no dependencies
- **Foundational (Phase 2)** — after Setup; **blocks all stories**
- **US1 (Phase 3)** — after Phase 2. Independent of US2 and US3
- **US2 (Phase 4)** — after Phase 2. Independent of US1
- **US3 (Phase 5)** — after Phase 4; extends US2's module, route, and dialog
- **Polish (Phase 6)** — after every story being shipped is complete

### Story independence

US1 and US2 touch disjoint code except for `projects.tsx`, where each adds its own branch of the
surface decision. They can be built in either order or concurrently. US3 is the only story with a
hard predecessor.

### Within a story

Shared types → core logic → route → registration → tests → UI wiring → verification. The
verification task always closes the phase.

### Parallel opportunities

- T002 runs alongside T001
- T006 (desktop) is independent of everything in US2
- T011 and T012 touch different packages and can run together
- T030 and T031 are independent

**Same-file sequences that must not be parallelised**: T003 → T004 → T019 → T026 all edit
`directory-picker.ts`/`.test.ts`; T013 → T023 edit `host-fs.ts`; T014 → T024 edit
`routes/host-fs.ts`; T017 → T025 edit `routes/host-fs.test.ts`; T005 → T009 → T021 → T028 all
edit `projects.tsx`.

---

## Implementation Strategy

### MVP — User Story 1 only

1. Phase 1 → Phase 2 → Phase 3
2. **Stop and verify on the packaged app** (T010)
3. This alone removes hand-typed paths from the shipped product

### Incremental delivery

Add US2 → verify in a browser → add US3 → verify. Each increment stands on its own, and the
picker's absence in a surface degrades to the typed input rather than to a broken control.

### Note on concurrency

Per CLAUDE.md, deliberately splitting one unit of work across agents is not in use. The parallel
markers above describe tasks that *may* safely interleave within this single unit — they are not
an instruction to fan out.

---

## Notes

- Tick `[X]` as each task completes — `/speckit.converge` reads that state to work out what is
  left, and skipping it blinds the recovery path
- Halt on failure rather than continuing past it
- Do not create or edit ignore files; no task here calls for it
- Commit per task or per logical group; new commits over amends
