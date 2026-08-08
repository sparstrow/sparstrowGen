# Feature Specification: Project Root Directory Folder Picker

**Feature Branch**: `WT001-project-folder-picker`

**Created**: 2026-08-08

**Status**: Draft

**Input**: User description: "A folder picker for the 'Root directory (absolute path)' field in the New project dialog, so the owner never has to type an absolute Windows path by hand. Two surfaces: (1) inside the packaged desktop app, a Browse… button opens the real Windows Explorer directory-selection dialog; (2) everywhere else — the dev server in a browser, and any future hosted web client — a Browse… button opens an in-app directory browser that navigates the local machine's filesystem one level at a time. The in-app browser must also be able to create a new folder, but only for the 'Start from scratch' and 'Import from GitHub' modes, because both target a directory that does not exist yet. The typed-path input stays as-is in both surfaces — the picker fills it, never replaces it."

## Clarifications

### Session 2026-08-08

- Q: How should the system enforce that host directory browsing can never be reached from a hosted, multi-tenant deployment? (FR-022) → A: Both layers — the capability is registered only when the core runs in local/desktop mode (absent entirely, 404, in a hosted build), and it additionally refuses non-loopback callers at request time. The registration gate is the load-bearing control, because a hosted deployment behind a reverse proxy presents loopback source addresses and would defeat a loopback check used on its own.
- Q: What counts as real-artifact verification for the native Explorer half of this feature? (User Story 1) → A: The packaged desktop application. A dev-mode Electron launch is not acceptable evidence for Story 1, because this feature adds a preload bridge entry and packaging changes how preload scripts are resolved and bundled — the exact class of failure that passes typecheck, passes tests, and appears only in the installed app.
- Q: Should the variant fork field on the project detail page get the same Browse… affordance in this unit of work? (scope) → A: No — hold scope to the New project dialog. The variant fork field keeps its typed input. Deferral recorded at `docs/deferred/2026-08-08-variant-fork-folder-picker.md`.
- Q: What should the in-app directory browser show when it opens with nothing useful in the field? (FR-005, FR-009) → A: The home directory of the account the core runs as, with the volume list reachable in one action from there. Opening at a bare drive list would cost several navigations to reach a typical project folder, which undercuts the speed that justifies Story 2; opening at home keeps the common case fast without making anything unreachable.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Pick a folder with the real Explorer dialog (Priority: P1)

The owner opens **New project** in the packaged desktop app, clicks **Browse…** next to the root
directory field, and the familiar Windows folder-selection dialog appears. They navigate with
everything Explorer already gives them — the drive list, Quick Access, pinned folders, the
address bar, and Explorer's own **New folder** button. On confirming, the dialog closes and the
absolute path of the chosen folder appears in the field, ready to submit.

**Why this priority**: The packaged desktop app is the artifact that ships to users, and the
native dialog is both the best experience available and the least code to reach it. This story
alone removes hand-typed paths from the real product, so it is a viable standalone release even
if nothing else in this feature is built.

**Independent Test**: Build the distributable, install and boot **the packaged desktop app**,
open the New project dialog, click Browse…, choose any folder, and confirm the field is
populated with that folder's absolute path and that the project can then be created against it.
A dev-mode Electron launch does not satisfy this test — see SC-009.

**Acceptance Scenarios**:

1. **Given** the New project dialog is open in the packaged desktop app in any of the three
   creation modes, **When** the owner clicks Browse…, **Then** the operating system's directory
   selection dialog opens.
2. **Given** the operating system dialog is open, **When** the owner selects a folder and
   confirms, **Then** the dialog closes and the root directory field contains the absolute path
   of that folder.
3. **Given** the operating system dialog is open, **When** the owner cancels it, **Then** the
   field keeps whatever value it already had and nothing else in the New project dialog changes.
4. **Given** the field already holds a valid existing directory, **When** the owner clicks
   Browse…, **Then** the dialog opens positioned at that directory rather than at a default
   location.
5. **Given** the owner is in "Start from scratch" mode, **When** they use the operating system
   dialog's own new-folder affordance and confirm, **Then** the newly created folder's absolute
   path lands in the field.

---

### User Story 2 - Pick a folder without a native dialog (Priority: P2)

The owner is running the app in a browser rather than the packaged desktop shell. Clicking
**Browse…** opens an in-app directory browser instead. It starts at their home directory, and
lets the owner step into a folder, step back up, jump to the machine's drive list in one action,
and read the full path of wherever they currently are. Choosing a folder closes the browser and
fills the field.

**Why this priority**: It removes hand-typed paths from every surface the desktop dialog cannot
reach, including day-to-day development against the dev server and any future web client. It
depends on nothing in Story 1 and can ship on its own.

**Independent Test**: Open the app in a browser, open the New project dialog, click Browse…,
navigate from a drive root down two or more levels, select a folder, and confirm the field
contains that folder's absolute path.

**Acceptance Scenarios**:

1. **Given** the app is not running inside the packaged desktop shell, **When** the owner clicks
   Browse…, **Then** an in-app directory browser opens rather than an operating system dialog.
2. **Given** the root directory field is empty, **When** the in-app browser first appears,
   **Then** it opens at the home directory of the account the core runs as, and displays the
   full absolute path of that location.
2a. **Given** the in-app browser is open at any location, **When** the owner activates the
   volumes affordance, **Then** it shows the drives or volumes available on the machine the core
   is running on, in a single action from wherever they were.
3. **Given** the in-app browser is showing a folder, **When** the owner activates a listed
   subfolder, **Then** the browser navigates into it and shows that folder's immediate
   subfolders.
4. **Given** the in-app browser is inside a nested folder, **When** the owner activates the
   go-up affordance, **Then** the browser navigates to the parent folder; at a drive root the
   affordance returns to the drive list or is disabled rather than failing.
5. **Given** the owner has navigated to the folder they want, **When** they confirm the
   selection, **Then** the browser closes and the root directory field contains that folder's
   absolute path.
6. **Given** the in-app browser is open, **When** the owner dismisses it without selecting,
   **Then** the field keeps whatever value it already had.
7. **Given** the field already holds a valid existing directory, **When** the owner clicks
   Browse…, **Then** the browser opens at that directory.
8. **Given** the owner navigates into a folder the operating system refuses to read, **When**
   the listing fails, **Then** the browser stays usable, names what failed, and offers a way
   back rather than emptying or crashing the dialog.

---

### User Story 3 - Create the target folder from inside the in-app browser (Priority: P3)

The owner is creating a project in "Start from scratch" or "Import from GitHub" mode, where the
target directory is not supposed to exist yet. Inside the in-app browser they navigate to the
parent they want, use **New folder**, name it, and the browser creates it, moves into it, and
lets them select it.

**Why this priority**: Without it, the in-app browser can only express modes that bind an
existing folder, so the owner still hand-types the final path segment for the two modes that
need a fresh directory — which is the exact case in the reported problem. It is last because
Stories 1 and 2 each deliver value without it, and it is the only part of this feature that
writes to disk.

**Independent Test**: In the browser-based client, choose "Start from scratch", open the in-app
browser, navigate to a writable parent, create a folder with a new name, and confirm the field
is populated with the new folder's absolute path and the project provisions successfully into it.

**Acceptance Scenarios**:

1. **Given** the creation mode is "Start from scratch" or "Import from GitHub", **When** the
   in-app browser is open, **Then** a New folder affordance is available.
2. **Given** the creation mode is "Use existing folder", **When** the in-app browser is open,
   **Then** no New folder affordance is offered, because that mode requires a directory that
   already exists.
3. **Given** the owner is in a writable parent folder, **When** they create a folder with a name
   that does not already exist there, **Then** the folder is created, the browser navigates into
   it, and it can be selected.
4. **Given** the owner is in a parent folder, **When** they try to create a folder whose name
   already exists there, **Then** the browser refuses with a message naming the conflict and
   creates nothing.
5. **Given** the owner enters a name the operating system cannot use as a folder name, or one
   that would step outside the folder currently being shown, **When** they submit it, **Then**
   the browser refuses with a message and creates nothing.
6. **Given** the owner is in a folder the operating system will not let the app write to,
   **When** they attempt to create a folder, **Then** the failure is reported plainly and
   nothing else in the dialog is disturbed.

---

### Edge Cases

- **The field is empty or holds a path that does not exist.** The picker opens at a sensible
  default location rather than failing or opening at an arbitrary place.
- **The typed path and the picked path disagree.** The picker overwrites the field's value on
  confirm; the owner remains free to edit the result by hand afterwards, since the input is never
  disabled or made read-only.
- **The chosen folder violates the mode's own rule** — e.g. picking an existing, non-empty folder
  in "Start from scratch" mode. The picker is not the place this is decided; the existing
  creation-time validation still rejects it, with its existing message.
- **A folder contains an enormous number of entries.** The listing stays responsive and bounded
  rather than attempting to render every entry.
- **A folder or drive cannot be read** (permission denied, a disconnected network drive, an empty
  removable-drive slot). It is reported and skipped; it never breaks the surrounding listing.
- **A folder is empty.** The browser says so plainly and still allows it to be selected — an
  empty folder is a legitimate choice, and the required one for "Start from scratch".
- **The core is running on a machine other than the one showing the interface.** The paths
  offered are the core's, not the viewer's, and the interface must not imply otherwise.
- **The packaged desktop app fails to open the native dialog.** The failure is surfaced and the
  owner can still type the path by hand.

## Requirements *(mandatory)*

### Functional Requirements

#### The affordance

- **FR-001**: The New project dialog MUST offer a browse affordance attached to the root
  directory field, in all three creation modes, including the mode where the field is labelled
  "Clone into (absolute path)".
- **FR-002**: The root directory field MUST remain a directly editable text input in every
  surface. The browse affordance fills it; it never disables, hides, or replaces it.
- **FR-003**: Confirming a selection MUST place the selected directory's absolute path into the
  field, in the path form native to the machine the core runs on.
- **FR-004**: Cancelling or dismissing the picker MUST leave the field's existing value and the
  rest of the New project dialog untouched.
- **FR-005**: Where the field already contains a path to an existing directory, the picker MUST
  open at that directory; otherwise it MUST open at the home directory of the account the core
  runs as — not at the volume list, which costs several navigations to reach a typical project
  folder.

#### Surface selection

- **FR-006**: When running inside the packaged desktop app, the browse affordance MUST open the
  operating system's own directory-selection dialog.
- **FR-007**: When not running inside the packaged desktop app, the browse affordance MUST open
  the in-app directory browser instead.
- **FR-008**: The choice between the two MUST be made from what the running surface actually
  offers, so that a single build behaves correctly in both, with no configuration step and no
  broken affordance in either.

#### The in-app directory browser

- **FR-009**: The in-app browser MUST be able to list the drives or volumes available on the
  machine the core runs on. This is its top level for reaching anywhere on the machine, and MUST
  be reachable in a single action from any location — but per FR-005 it is not where the browser
  opens by default.
- **FR-010**: The in-app browser MUST list the immediate subdirectories of one directory at a
  time, and MUST NOT list files, which cannot be chosen as a project root.
- **FR-011**: The in-app browser MUST display the absolute path of the current location at all
  times.
- **FR-012**: The in-app browser MUST offer navigation into a listed subdirectory and back up to
  the parent, with the up affordance resolving to the drive list — or disabled — at a drive root.
- **FR-013**: The in-app browser MUST bound the number of entries it lists for any one directory
  and MUST indicate when a listing was truncated rather than silently showing a partial result.
- **FR-014**: The in-app browser MUST report a directory it cannot read without losing the
  current listing or closing the dialog.
- **FR-015**: The in-app browser MUST present the loading, empty, error, and populated states of
  a listing distinctly.

#### Creating a folder

- **FR-016**: The in-app browser MUST offer a create-folder action when, and only when, the
  active creation mode is "Start from scratch" or "Import from GitHub".
- **FR-017**: A created folder MUST be created directly inside the directory currently being
  shown. A submitted name that would resolve anywhere other than a direct child of that
  directory MUST be rejected and nothing created.
- **FR-018**: A create-folder request whose name already exists in the target directory MUST be
  rejected with a message naming the conflict, and MUST NOT modify anything on disk.
- **FR-019**: A create-folder request that the operating system rejects — an invalid name, a
  read-only or protected location — MUST surface the failure plainly and leave the dialog usable.
- **FR-020**: On success, the browser MUST navigate into the newly created folder so it can be
  selected without further navigation.

#### Trust boundary

- **FR-021**: The ability to enumerate directories and create folders on the host machine MUST
  be reachable only by an already-authenticated caller, on the same footing as the rest of the
  local core's interface.
- **FR-022**: This capability MUST be scoped to a core running locally on the owner's own
  machine, and MUST NOT be exposed by a hosted, multi-tenant deployment, where enumerating the
  server's filesystem would cross a tenant boundary. The constraint MUST be enforced by the
  system, not left as a note for a future reader, using **two independent layers**:
  - **FR-022a (registration gate — load-bearing)**: The capability MUST be registered only when
    the core is running in its local/desktop mode. In a hosted deployment the route MUST NOT
    exist at all, answering as an unknown route rather than as a refused one.
  - **FR-022b (loopback refusal — defence in depth)**: Where the capability is registered, it
    MUST additionally refuse any caller whose source address is not loopback.
  - This MUST NOT be implemented as FR-022b alone. A hosted deployment behind a reverse proxy
    presents loopback source addresses for internet-originated requests, so a loopback check
    used on its own would admit every tenant while appearing to be a working control.
- **FR-023**: The create-folder capability MUST create directories only. It MUST NOT be usable
  to write, move, rename, overwrite, or delete any file or existing directory.
- **FR-024**: Directory names and paths returned by the host filesystem are data. They MUST be
  displayed as text and MUST NOT be interpreted as markup, instructions, or commands.

#### Existing behaviour preserved

- **FR-025**: Creation-time validation of the root directory MUST remain unchanged and remain
  the authority: "Start from scratch" and "Import from GitHub" still require a target that is
  absent or empty, and "Use existing folder" still requires one that exists. The picker MUST NOT
  duplicate, pre-empt, or weaken these rules.

### Key Entities

- **Volume**: A drive or mount point on the machine the core runs on — the entry point for
  navigation. Has a display name and an absolute root path.
- **Directory listing**: One level of navigation. Has the absolute path of the location, its
  immediate subdirectories, and whether the listing was truncated.
- **Subdirectory entry**: A single navigable child. Has a display name and enough information to
  navigate into it. Files are not represented, because they are not selectable.
- **Picker selection**: The absolute path handed back to the New project dialog on confirm.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The owner can bind a project to an existing folder anywhere on the machine without
  typing a single character of the path.
- **SC-002**: The owner can create a project in a brand-new folder, in both modes that require
  one, typing only the new folder's name — never any part of its parent path.
- **SC-003**: Setting the root directory by pointing at a known folder takes under 30 seconds
  from opening the New project dialog, in both surfaces.
- **SC-004**: Path-typing mistakes — wrong separator, misspelled folder, a relative path where an
  absolute one is required — are eliminated for any project created via the picker, because the
  path is never transcribed by hand.
- **SC-005**: Each navigation step in the in-app browser presents its result within 1 second for
  a directory of typical size, and never leaves the surface blank while working.
- **SC-006**: A directory that cannot be read, and a folder that cannot be created, are each
  reported to the owner in words that name what failed — with the dialog still usable afterwards
  in every case.
- **SC-007**: Both surfaces work correctly in light and dark themes and are fully operable from
  the keyboard alone, including opening the picker, navigating, and confirming.
- **SC-008**: No surface exposes host directory enumeration to an unauthenticated caller.
  Both containment layers are demonstrated independently: with the core not in local/desktop
  mode the capability is absent rather than merely refused, and with the capability present a
  non-loopback caller is refused.
- **SC-009**: Story 1 is demonstrated on the packaged desktop application — built, installed,
  and booted — not on a development launch of the desktop shell. Evidence from a dev-mode launch
  does not close Story 1.

## Assumptions

- **Windows is the target.** The product ships as a Windows desktop app, so the native dialog is
  Explorer's. Nothing in this feature is Windows-only by design, but only Windows is verified.
- **The core and the interface share a machine.** Both the desktop app and the dev server talk to
  a core on `127.0.0.1`, so "the machine's filesystem" is unambiguous today. The interface
  therefore does not need to explain whose filesystem is being shown. This assumption is exactly
  what FR-022 protects, and it stops holding under a hosted deployment.
- **The default opening location is the home directory** of the account the core runs as, when
  the field is empty or holds a path that does not resolve (FR-005). This needs no configuration
  and no persisted state — the picker deliberately does not remember the last folder chosen.
- **Hidden and system directories are not listed.** They are not plausible project roots, and
  listing them adds noise and permission failures. The owner can still reach one by typing its
  path, since the input stays editable (FR-002).
- **The listing shows all ordinary directories**, including build and dependency directories that
  the existing project file-tree filters out. A picker navigating a whole disk has a different
  job from a code browser, and hiding a folder the owner is looking for is worse than showing one
  they will not choose.
- **Creating a folder creates a single level.** Creating a deep chain of missing parents in one
  step is not offered; "Start from scratch" already creates missing parents at provisioning time.
- **No change to project provisioning.** This feature only fills the field. The three modes,
  their validation, and their failure messages are untouched (FR-025).
- **No multi-select and no file selection.** Exactly one directory is chosen.
- **Only the New project dialog gains the affordance.** The app has one other hand-typed
  absolute-path field — the client-variant fork form on the project detail page. It is
  deliberately out of scope, recorded at
  `docs/deferred/2026-08-08-variant-fork-folder-picker.md`. The picker should be built so that
  wiring it in later is small, but no second caller is added in this unit of work.
- **Existing authentication covers the new capability.** The local core's interface already
  requires a bearer token; this feature relies on that rather than introducing its own scheme.
