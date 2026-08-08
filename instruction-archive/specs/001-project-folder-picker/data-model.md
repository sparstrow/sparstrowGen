# Data Model: Project Root Directory Folder Picker

**Feature**: 001-project-folder-picker | **Date**: 2026-08-08

No database entity, no schema migration. Everything here is a request/response shape that the
core and the UI must agree on, so all of it lives in
`packages/shared/src/schemas/host-fs.ts` as zod schemas with inferred types — per Principle IV,
which requires shared agreement to live in `shared` rather than be duplicated on both sides.

---

## Volume

A drive or mount point — the top level of navigation (FR-009).

| Field | Type | Notes |
|---|---|---|
| `path` | `string` | Absolute root path. Windows: `C:\`. POSIX: `/`. |
| `label` | `string` | What to display. Windows: the drive letter, `C:`. POSIX: `/`. |

**Rules**

- Enumerated by probe (research R2); a volume that cannot be accessed is omitted, never returned
  in an error state.
- The list may legitimately be a single entry, and on POSIX always is.

---

## DirectoryListing

One level of navigation — the response to "show me this directory" (FR-010, FR-011, FR-013).

| Field | Type | Notes |
|---|---|---|
| `path` | `string` | The absolute path that was listed, normalised. Drives the path display. |
| `parent` | `string \| null` | Absolute parent path, or `null` at a volume root — which is what tells the UI to offer the volume list instead of an up-navigation (FR-012). |
| `entries` | `DirectoryEntry[]` | Immediate subdirectories, alphabetical. |
| `truncated` | `boolean` | True when the cap was hit. Must be surfaced, never swallowed (FR-013). |

**Rules**

- Directories only. Files are never included — they are not selectable (FR-010).
- Sorted alphabetically by name, case-insensitively.
- Capped at **500** entries (research R10).
- Hidden and system directories are excluded (spec Assumptions); ordinary directories such as
  `node_modules` and `dist` are **included**, unlike the project file tree.
- An entry that cannot be stat-ed is skipped rather than failing the whole listing.

---

## DirectoryEntry

A single navigable child.

| Field | Type | Notes |
|---|---|---|
| `name` | `string` | Display name, one path segment. |
| `path` | `string` | Absolute path — the client navigates with this rather than re-joining, so path assembly happens once, on the side that owns the separator. |

**Rules**

- `name` is rendered as text. It is filesystem-authored content and is never interpreted as
  markup (FR-024).

---

## CreateDirectoryRequest

The create-folder action (FR-016 – FR-020).

| Field | Type | Notes |
|---|---|---|
| `parent` | `string` | Absolute path of the directory currently shown. |
| `name` | `string` | Single segment, 1–255 chars. |

**Validation, in order** (research R5)

1. `parent` must be an absolute path that exists and is a directory → else `400`.
2. `name` must be non-empty after trimming, and at most 255 characters → else `400`.
3. `name` must not be `.` or `..`, must contain no `/` or `\`, and must not be absolute → else
   `400`.
4. `path.dirname(path.resolve(parent, name))` must equal `path.resolve(parent)` → else `400`.
   This is an independent confirmation of rule 3, not a restatement of it.
5. The target must not already exist → else `409` naming the conflict (FR-018).
6. `fs.mkdirSync` **without** `recursive`, so a missing parent chain fails rather than being
   created silently.
7. Any remaining OS rejection — invalid name, read-only location, permission denied — is
   surfaced with its message (FR-019). Windows reserved device names land here deliberately.

**Response**: the `DirectoryListing` for the newly created directory, so the client navigates
into it without a second round trip (FR-020).

---

## Client-side state (not transmitted)

Held by the picker component; listed here because the acceptance scenarios refer to it.

| Name | Type | Notes |
|---|---|---|
| `currentPath` | `string \| null` | `null` means the volume list is being shown. |
| `pendingName` | `string` | The in-progress new folder name. |
| `mode` | `"scratch" \| "bind" \| "clone"` | Passed in from the New project dialog; decides whether the create action exists at all (FR-016). |

**Not stored**: the last folder chosen. The picker deliberately keeps no persisted state — it
opens at the field's current directory, or at the home directory (FR-005).
