# Contract: Host filesystem browsing API

**Feature**: 001-project-folder-picker | **Base**: `/api/v1` | **Module**:
`packages/core/src/api/routes/host-fs.ts`

Shapes are defined in `packages/shared/src/schemas/host-fs.ts`; see
[data-model.md](../data-model.md) for field-level rules.

---

## Registration and access — read this before the endpoints

These three routes are the only place in the product that enumerates the host filesystem outside
a project boundary. Three conditions gate them, and they are independent:

1. **Registration gate (FR-022a).** Registered inside `buildServer` **only** when
   `config.deployment === "local"`. When the core is hosted the routes are never added, so a
   request gets the ordinary not-found response — indistinguishable from any other unknown path.
   It must not be a registered route that returns 403, because that confirms the capability
   exists.
2. **Authentication (FR-021).** Registered inside the existing `requireAuth` scope, so an absent
   or wrong bearer token is `401` exactly as on every other human-surface route.
3. **Loopback refusal (FR-022b).** Each handler refuses a caller whose socket address is not
   loopback, with `403`.

Layer 3 alone is not sufficient and must never be shipped as the only control: a hosted
deployment behind a reverse proxy presents loopback source addresses for internet traffic, so it
would admit every caller while appearing to work.

---

## `GET /host-fs/volumes`

Drives or mount points available to the core (FR-009).

**Request**: no parameters.

**200**

```json
{
  "volumes": [
    { "path": "C:\\", "label": "C:" },
    { "path": "D:\\", "label": "D:" }
  ]
}
```

- Never an error for an unreadable drive — it is omitted from the list.
- May be a single entry. On POSIX it always is.

---

## `GET /host-fs/dirs`

One directory level (FR-010 – FR-013).

**Query**

| Name | Required | Notes |
|---|---|---|
| `path` | no | Absolute path to list. Omitted or empty → the home directory of the account the core runs as (FR-005). |

**200**

```json
{
  "path": "C:\\Users\\gsrih\\Projects",
  "parent": "C:\\Users\\gsrih",
  "entries": [
    { "name": "my-app", "path": "C:\\Users\\gsrih\\Projects\\my-app" }
  ],
  "truncated": false
}
```

- `parent` is `null` at a volume root — the signal for the client to offer the volume list rather
  than an up-navigation.
- `entries` contains directories only, alphabetical, capped at 500.
- `truncated` is `true` when the cap was reached. It must be surfaced in the interface.

**Errors**

| Status | When |
|---|---|
| `400` | `path` is present but not absolute; or the target exists and is not a directory |
| `403` | Caller is not loopback (`error: "loopback callers only"`), **or** the OS denied access to the directory (`error` naming the directory). See the note below — these must be distinguishable. |
| `404` | The path does not exist |

**Two different `403`s.** A trust-boundary refusal and an ordinary locked folder share a status
code but are not the same event: the first means the caller may not use this capability at all,
the second means this one directory is not readable and navigation should continue. Their error
bodies MUST differ, so the interface never shows security wording for a click on
`C:\System Volume Information`.

---

## `POST /host-fs/dirs`

Create exactly one directory (FR-016 – FR-020).

**Body**

```json
{ "parent": "C:\\Users\\gsrih\\Projects", "name": "my-app" }
```

**201** — the `DirectoryListing` of the created directory, identical in shape to
`GET /host-fs/dirs`, so the client can navigate into it without a second call.

**Errors**

| Status | When |
|---|---|
| `400` | `parent` not absolute or not a directory; `name` empty, over 255 chars, `.`/`..`, containing a separator, absolute, or not resolving to a direct child of `parent` |
| `403` | Caller is not loopback; or the OS refused the write (`EACCES`/`EPERM`/read-only) |
| `404` | `parent` does not exist |
| `409` | A file or directory of that name already exists in `parent` — message names the conflict |

**Guarantees**

- Creates directories only. It cannot write, move, rename, overwrite, or delete anything
  (FR-023).
- Creates a **single** level — `recursive` is not used, so a missing parent chain is an error
  rather than a silent multi-level create.

---

## What the contract tests must assert

These are the assertions that make the security properties real rather than described. They
belong in `packages/core/src/api/routes/host-fs.test.ts`.

1. With `deployment: "hosted"`, `GET /host-fs/volumes` is **not found** — proving the route was
   never registered, not merely refused.
2. With `deployment: "local"` and no bearer token, every endpoint is `401`.
3. With a valid token and a non-loopback source address, every endpoint is `403`.
4. `POST /host-fs/dirs` with `name: "../escape"` is `400` **and** creates nothing on disk — the
   second half of that assertion is the one that matters.
5. `POST /host-fs/dirs` with an existing name is `409` and leaves the existing directory
   untouched.
6. A listing of a directory with more than 500 subdirectories returns exactly 500 entries with
   `truncated: true`.
