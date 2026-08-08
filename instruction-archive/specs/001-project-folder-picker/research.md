# Research: Project Root Directory Folder Picker

**Feature**: 001-project-folder-picker | **Date**: 2026-08-08

Every decision below was reached by reading the current code in this worktree, not from memory.
Where something was not verified, it says so.

---

## R1 — What signal tells the core it is "local" for FR-022a?

**Decision**: Add `deployment: "local" | "hosted"` to `AppConfig`, read from
`SPARSTROW_DEPLOYMENT`, defaulting to `"local"`. Register the host-fs routes only when it is
`"local"`.

**Rationale**: `packages/core/src/config.ts` has no deployment-mode concept today — the closest
thing is `SPARSTROW_PACKAGED`, which distinguishes a packaged desktop run from a repo run and
says nothing about tenancy. FR-022a needs a gate that a hosted deployment must actively defeat,
and an explicit declaration is the only signal that cannot be produced accidentally by a network
topology.

**Alternatives considered:**

- **Infer from the bind host** (`config.host` being loopback). Attractive because it needs no new
  configuration and fails closed if someone binds `0.0.0.0`. **Rejected: it has the identical
  reverse-proxy hole that made the loopback request check insufficient.** A hosted core behind
  nginx on the same box binds `127.0.0.1` and is reached from the internet, so the inference
  reports "local" for a deployment that is anything but. Using it as the *primary* gate would
  reproduce the exact failure FR-022 was written to prevent.
- **Refuse to boot without an explicit declaration** (no default). Genuinely fail-closed, and
  rejected as disproportionate: it breaks every existing dev command, every test run, and the
  packaged app, in service of a deployment mode that does not exist yet.
- **Ship it unguarded and strip it in Phase 6.** Rejected by the owner during clarification.

**Residual risk, stated plainly**: defaulting to `"local"` is fail-open. A future hosted
deployment that forgets to set `SPARSTROW_DEPLOYMENT=hosted` gets the endpoint. This is why
FR-022b exists as a second layer, and why the route test asserts the 404 explicitly — so the gate
is a thing someone has to consciously break rather than quietly omit. The alternative that fully
fails closed is the boot refusal above, and it is available cheaply the day hosted work starts.

---

## R2 — How are Windows drive letters enumerated from Node?

**Decision**: Probe `A:\` through `Z:\` with `fs.promises.access`, all 26 in parallel, and keep
the ones that resolve. On non-Windows, return a single volume for `/`.

**Rationale**: Node exposes no volume-enumeration API on any platform. The probe is about twenty
lines, adds no dependency, spawns no child process, and completes in low double-digit
milliseconds for a typical machine — which matters because SC-005 budgets one second for the
whole interaction and a process spawn would eat a third of it.

**Alternatives considered:**

- **`wmic logicaldisk get name`** — the classic answer, and **wrong now**: wmic is deprecated and
  is absent from current Windows 11 images. Building on it would produce a feature that works on
  the developer's machine and fails on a fresh install.
- **PowerShell `Get-PSDrive -PSProvider FileSystem`** — correct and robust, but a PowerShell
  spawn costs a few hundred milliseconds before it prints anything. Rejected on SC-005.
- **A native/npm package such as `node-disk-info`** — rejected on Principle IV and VII: a new
  runtime dependency for twenty lines of probing.

**Caveat — not verified in this session**: the behaviour of the probe against an *empty* optical
or card-reader drive. `fs.access` uses a metadata query rather than a media read, so it should
return ENOENT promptly rather than spinning up hardware, but this has not been tested against
real removable media here. The mitigation is structural: any letter whose probe rejects is simply
omitted from the list, so the worst case is a missing entry, never a hang in the request handler.
If a slow probe ever does appear, the fix is a short per-probe timeout, not a redesign.

---

## R3 — Extend the existing project file tree, or write a separate module?

**Decision**: A new `packages/core/src/projects/host-fs.ts`. Leave
`packages/core/src/projects/files.ts` completely untouched.

**Rationale**: `listProjectDir` exists to enforce containment — its core statement is a check that
the resolved target is the project root or a descendant, rejecting anything that escapes. Host
browsing is defined by the *deliberate absence* of that containment. Adding a "skip the
containment check" branch would put a bypass inside the function whose entire purpose is the
check, and the next person to touch it inherits a file where the security property depends on a
parameter. Keeping them apart means the project file tree keeps exactly one behaviour and the new
module's lack of containment is visible in its own name and tests.

The two also disagree on what to return: the project tree lists files with sizes and hides
`node_modules`/`dist`; the picker lists directories only, hides nothing ordinary, and must report
truncation. Merging them would mean a function whose output shape depends on its caller.

**Alternatives considered**: parameterising `listProjectDir` with an optional root and a
`showFiles` flag. Rejected for the reasons above — it is fewer files and more risk.

---

## R4 — Where do the routes live?

**Decision**: A new `packages/core/src/api/routes/host-fs.ts`, registered inside the existing
`requireAuth` scope in `server.ts`, wrapped in the `config.deployment === "local"` condition.
Paths: `GET /host-fs/volumes`, `GET /host-fs/dirs?path=…`, `POST /host-fs/dirs`.

**Rationale**: Registering inside the existing authenticated scope means FR-021 is satisfied by
construction rather than by a hook this file remembers to add — the same `onRequest` hook that
protects every other human-surface route protects these. Placing them under `/host-fs` rather
than `/projects/*` reflects that they are not project-scoped: there is no project yet when the
New project dialog is open, and nesting them under `/projects/:id/...` would imply a context that
does not exist.

**Verified**: `server.ts` registers all human-surface routes in one `app.register` block with
`api.addHook("onRequest", requireAuth)`, under the `API_BASE` prefix. Adding one conditional
`await api.register(hostFsRoutes)` inside that block inherits both the auth hook and the prefix.

---

## R5 — How is the create-folder name kept to a single segment (FR-017)?

**Decision**: Validate that the submitted name is one path segment before touching the
filesystem: non-empty, not `.` or `..`, contains no `/` or `\`, is not absolute, and — as an
independent confirmation rather than a restatement — that `path.dirname(path.resolve(parent,
name))` equals `path.resolve(parent)`. Then `fs.mkdirSync` without `recursive`.

**Rationale**: The string checks are readable and reject the obvious cases; the resolve check is
the one that cannot be reasoned around, because it asks the question FR-017 actually poses — does
this land as a direct child of the directory shown? Two cheap checks that fail independently are
worth more here than one clever one, because the cost of a miss is writing outside the intended
tree.

Omitting `recursive: true` is load-bearing in its own right: it makes `mkdir` fail rather than
silently create a chain of parents, which is what makes "creates a single level" (an Assumption in
the spec) true by construction rather than by convention.

**Windows reserved device names** (`CON`, `PRN`, `AUX`, `NUL`, `COM1`–`COM9`, `LPT1`–`LPT9`) are
deliberately *not* pre-checked. The OS rejects them and the handler surfaces the error, which
keeps one list of forbidden names — the operating system's — instead of a second, stale copy in
our source.

---

## R6 — The Electron dialog

**Decision**: `dialog.showOpenDialog(mainWindow, { properties: ["openDirectory"], defaultPath })`
in a new `packages/desktop/src/dialogs.ts`, reached over a new `sparstrow:pick-directory` IPC
channel, exposed on the preload bridge as `dialogs.pickDirectory(defaultPath?)`.

**Rationale**: Passing the `BrowserWindow` makes the dialog window-modal, so it cannot be lost
behind the app. `openDirectory` on Windows produces the standard `IFileOpenDialog` in folder mode,
which already includes a **New folder** button — which is why User Story 3 is scoped to the in-app
browser only and the desktop app needs nothing extra for it.

**Verified**: `packages/desktop/src/preload.ts` already exposes exactly one narrow, invoke-only
surface (`updates`), and `packages/desktop/src/updater.ts` registers its handlers with
`ipcMain.handle`. This feature follows that established shape rather than inventing a second one.
`main.ts` creates the window with `contextIsolation: true` and `nodeIntegration: false`, so the
preload bridge is the only route and no renderer gets filesystem access.

**Note**: the macOS-only `createDirectory` property is omitted rather than passed and ignored, on
the grounds that only Windows is a verified target here.

---

## R7 — How does the UI choose a surface?

**Decision**: Use the native dialog when `window.sparstrowDesktop?.dialogs?.pickDirectory` is a
function; otherwise use the in-app browser. Extract the check into
`packages/ui/src/lib/directory-picker.ts` so it is unit-testable.

**Rationale**: This mirrors the existing detection in
`packages/ui/src/components/update-banner.tsx`, which reads `window.sparstrowDesktop?.updates`
and renders nothing when absent. Probing for the specific function rather than for
`sparstrowDesktop` alone means a shell that predates this feature degrades to the in-app browser
instead of throwing.

**Honest scope note**: in practice the shell and the UI it loads ship in the same package, so a
version skew between them is unlikely. The optional chaining costs one character and removes the
question entirely, which is why it is specified rather than argued about.

---

## R8 — Which shadcn primitives, and is there an existing block?

**Decision**: Compose from primitives already vendored in
`packages/ui/src/components/ui/`: `dialog`, `button`, `input`, `scroll-area`, `breadcrumb`,
`empty`, `skeleton`, `alert`, `separator`. **Nothing new needs vendoring.**

**Rationale**: The shadcn registry was queried this session via the Shadcn UI MCP.
`list_components` returned all 46 components and **there is no file browser, directory picker, or
tree component among them** — this is a composition, not a missing primitive. The four states
Principle V demands map directly: `skeleton` while a listing loads, `empty` for a folder with no
subdirectories, `alert` for a directory that cannot be read, and the scroll area for the
populated case.

**Reported honestly**: the `list_blocks` call **failed** with a GitHub API error, so the block
registry was *not* inspected. The claim being made is therefore about components only. The
residual risk is low — blocks are page-level compositions (dashboards, sidebars, login screens)
and a modal directory picker is not the kind of thing they cover — but "no block exists" is not
something this session verified, and it should not be read as if it had.

**T002 outcome (build phase)**: retried once during Phase 1 and it **failed identically** —
`MCP error -32603: Failed to list blocks: Unexpected response from GitHub API`. This is an
upstream/registry availability problem, not something the feature can resolve, so the block
registry stays uninspected and the component-level finding above stands as the basis for the
design. Worth a retry on any future frontend feature rather than assuming it is permanently
broken.

**Icons**: lucide only, `size-4` in controls and `size-3.5` in metadata rows, per CLAUDE.md.
`Folder`, `FolderPlus`, `HardDrive`, `ChevronUp` cover the surface.

---

## R9 — Nested dialog, or swap the New project dialog's contents?

**Decision**: A second, nested Radix `Dialog` rendered from inside the New project dialog.

**Rationale**: It keeps the New project form mounted and its state untouched while the picker is
open, and Radix supports dialog stacking with per-layer escape handling. Swapping the content of
the existing dialog in place was the considered alternative — it avoids stacking entirely — but it
makes the dialog resize dramatically mid-flow and blurs "I am choosing a folder" into "I am
filling a form", which is a worse answer to the same problem.

**This is the part of the design most likely to misbehave, and verification must target it
specifically**: pressing Escape must close only the picker and leave the New project dialog open,
and focus must return to the Browse… button afterwards. Nested-overlay focus return is exactly
the class of bug that renders fine, typechecks fine, and is only found by driving it — see
quickstart.md step 5.

---

## R10 — Entry cap and truncation

**Decision**: Cap at 500 entries, matching `MAX_ENTRIES` in
`packages/core/src/projects/files.ts`, and return an explicit `truncated` boolean.

**Rationale**: The cap matches the existing precedent so the codebase has one answer to "how many
entries is too many". The boolean is the difference from that precedent and is required by
FR-013: `listProjectDir` today truncates silently, which is acceptable for a file tree the user
can scroll but not for a picker, where a missing folder reads as "that folder does not exist"
rather than "the list stopped early".

Directories only are listed, so the cap is reached far less often than the file tree's would be.
