# Quickstart: verifying the project root directory folder picker

**Feature**: 001-project-folder-picker | **Date**: 2026-08-08

Principle I requires the real artifact, every area the change touches, one change at a time.
Principle II requires that each claim below is backed by output actually read in the session that
claims it. This file is the checklist for that, in the order it should be run.

**Note the asymmetry deliberately**: Stories 2 and 3 are verified in a browser, but Story 1 is
**not** verifiable there and not verifiable in a dev Electron launch either — SC-009 pins it to
the packaged app. Step 6 is the long one and it is not optional.

---

## Prerequisites

- Node 24 (native ABI for better-sqlite3 / node-pty).
- A clean working tree, and **no core server already running** — SQLite locks.

---

## 1. Automated gates

```bash
pnpm typecheck && pnpm test
```

Expected: both clean. New tests present and passing:

- `packages/core/src/projects/host-fs.test.ts` — listing, single-segment validation, truncation,
  volume enumeration
- `packages/core/src/api/routes/host-fs.test.ts` — the six contract assertions in
  [contracts/host-fs-api.md](./contracts/host-fs-api.md)
- `packages/ui/src/lib/directory-picker.test.ts` — surface selection, per-mode create
  permission, name validation, parent derivation

A green run here proves internal consistency only. It is gate 1 and 2 of eight.

---

## 2. The security gate, checked directly

The two containment layers are the reason this feature needed a spec. Verify them as behaviour,
not as source you have read.

```bash
SPARSTROW_DEPLOYMENT=hosted pnpm --filter @sparstrow/core dev
```

```bash
curl -i -H "Authorization: Bearer $(cat data/.api-token)" http://127.0.0.1:48750/api/v1/host-fs/volumes
```

Expected: **404**, and specifically the ordinary not-found body — not a 403. A 403 would mean the
route registered and then refused, which is a different and weaker property than the one FR-022a
specifies.

Then restart without the variable and repeat:

```bash
curl -i http://127.0.0.1:48750/api/v1/host-fs/volumes
```

Expected: **401** with no token. With a valid token: **200** and a volume list.

---

## 3. The in-app browser (User Story 2) — browser

Start the dev server and open the app in a browser.

Drive this sequence and read the result at each step:

1. Projects → **New project** → **Browse…** → the in-app browser opens **at the home directory**,
   not at a drive list (FR-005).
2. The current absolute path is displayed (FR-011).
3. Step into a subfolder, then another — each shows that folder's subdirectories (FR-010).
4. Step back up. At a volume root, the up affordance offers the volume list rather than failing
   (FR-012).
5. Jump to the volume list in one action from a nested folder (FR-009).
6. Confirm a selection → the browser closes and the field holds the absolute path (FR-003).
7. Reopen Browse… → it opens at that directory now, not at home (FR-005).
8. Dismiss without selecting → the field is unchanged (FR-004).
9. Files are nowhere in the listing (FR-010).

**States (Principle V)** — all four must be seen, not assumed:

- **loading** — a skeleton while a listing resolves
- **empty** — a folder with no subdirectories says so, and is still selectable
- **error** — navigate somewhere unreadable (`C:\System Volume Information`); it must report the
  failure and stay usable (FR-014)
- **populated** — the ordinary case

---

## 4. Creating a folder (User Story 3) — browser

In **Start from scratch**:

1. **New folder** is offered (FR-016).
2. Create a fresh name → it is created, the browser navigates into it, it can be selected
   (FR-020).
3. Create a name that already exists → refused, message names the conflict, nothing written
   (FR-018).
4. Submit `..` and `a\b` → both refused, nothing created (FR-017).
5. Complete the flow → the project provisions into the new folder.

Then switch to **Use existing folder** and confirm **New folder is absent** (FR-016). This is the
scenario most likely to be missed, because the affordance being *present* is what gets tested.

---

## 5. Nested-dialog behaviour — browser

Research R9 flags this as the most likely thing to misbehave, and it is invisible to every
automated gate:

- **Escape** with the picker open closes **only** the picker; the New project dialog stays open
  with its fields intact.
- Focus returns to the **Browse…** button afterwards.
- The whole flow is operable from the keyboard alone (SC-007).
- Repeat in **light and dark** themes (Principle V).
- Nothing scrolls sideways; a very long path wraps or truncates by design.

---

## 6. The packaged desktop app (User Story 1) — required, not optional

```bash
pnpm --filter @sparstrow/ui build && pnpm --filter @sparstrow/memory-mcp build && pnpm --filter @sparstrow/memory-cli build && pnpm --filter @sparstrow/desktop dist
```

Install and boot the built artifact, then:

1. New project → **Browse…** → the **Windows Explorer folder dialog** opens (FR-006).
2. It is modal to the app and cannot be lost behind the window.
3. Choose a folder → its absolute path lands in the field (FR-003).
4. Cancel → the field is unchanged (FR-004).
5. With a valid path already in the field, the dialog opens **there** (FR-005).
6. Use Explorer's own **New folder** button in scratch mode → the new path lands in the field.
7. Create a project end to end and confirm it appears bound to that directory.

**Why a dev Electron launch does not substitute** (SC-009): this feature adds an entry to the
preload bridge, and packaging changes how the preload script is resolved and bundled. CLAUDE.md
records a prior instance of exactly this — a desktop change that typechecked clean, tested clean,
and failed only at startup inside the packaged app. A dev-shell pass cannot see that class of
failure, so it is not evidence for this story.

---

## 7. Definition of Done — the remaining gates

Gates 1–2 were step 1. These have no automation and never will:

- [ ] **Checklists complete** — `checklists/requirements.md` at 16/16
- [ ] **Real-artifact verification** — steps 2–6 above, each output read
- [ ] **Design and UI bar** — four states, both themes, keyboard, focus, tokens, no sideways
      scroll
- [ ] **Knowledge Center currency** — this changes a user-facing flow, so
      `packages/ui/src/content/knowledge/` is updated in this same change, or the decision to
      skip is stated explicitly rather than defaulted
- [ ] **Architecture and security contract** — no new dependency; the two-layer gate demonstrated
      in step 2
- [ ] **Evidence** — every claim above backed by output read in-session; anything skipped is
      named as skipped, with the reason
