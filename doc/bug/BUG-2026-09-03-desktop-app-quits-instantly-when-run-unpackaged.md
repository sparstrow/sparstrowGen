# BUG-2026-09-03 — the desktop app quit instantly, every time, when run unpackaged

**Status:** ✅ Fixed 2026-09-03, restructure Phase 3.
**Found by:** an agent, trying to open the window for the first time.
**Severity:** high — it made the developer path to the desktop app not work at
all, silently.

## What happened

`electron .` in `apps/desktop` exited immediately with **code 0**, no window, no
output, no error. Every time. `electron-vite dev` had the same underlying fault.

## Why

`main.ts` opens with the ordinary single-instance guard:

```ts
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else { /* the entire app */ }
```

`requestSingleInstanceLock()` returned **`false` with no other instance
running**, so every launch took the quit branch.

The cause is the app's name. Electron derives `app.name` from `package.json`'s
`productName` if present and otherwise from `name` — and `name` here is the npm
scope `@sparstrow/desktop`. Measured, on Windows:

```
name     = @sparstrow/desktop
userData = C:\Users\gsrih\AppData\Roaming\@sparstrow/desktop     ← mixed separators
lock     = false
```

`userData` is what the single-instance lock is keyed on. A path containing a
forward slash *inside* a Windows path — and an `@` — is not a directory Electron
can key a lock against, so the lock could never be acquired by anybody.

With `"productName": "Sparstrowgen"` added:

```
name     = Sparstrowgen
userData = C:\Users\gsrih\AppData\Roaming\Sparstrowgen
lock     = true
```

## Why nobody had seen it

**Packaged builds were never affected.** `electron-builder` writes its own
`productName` into the packaged `app.asar`'s manifest, so an installed
Sparstrowgen has always had a clean name and a working lock. The fault existed
only when running from source — which is to say, only on the path a developer
uses to look at the app.

That is the uncomfortable part, and it is worth stating plainly given
[the restructure plan](../plans/2026-09-02-multica-architecture-restructure.md)'s
framing: this repo's stated problem is *"an application the owner has never once
opened and used"*, and one of the reasons the desktop app could not be opened
from source was a two-word field missing from a manifest. It cost a silent
`exit 0`, which reads exactly like "nothing happened" rather than like a fault.

## The fix

One line in `apps/desktop/package.json`:

```json
"productName": "Sparstrowgen",
```

Top-level, not just under `build`. `electron-builder` already honours the
top-level field, so this does not fork the packaged and unpackaged names — it
makes them the same, which is what stops this class of bug recurring.

## How it was found, and the lesson

Not by reading code. By running `electron .`, getting `exit=0`, and refusing to
accept it. The sequence that isolated it was:

1. a throwaway Electron app in the scratchpad — proved Electron worked here
2. a wrapper that `require`d the real built `out/main/index.js` — it **stayed
   alive**, which narrowed the fault to something about the app's own identity
   rather than its code
3. a probe printing `app.getName()`, `getPath("userData")` and
   `requestSingleInstanceLock()` — which named the cause outright

Step 2 is the one worth keeping: the same compiled main behaved differently
under two package manifests, and that difference *was* the bug.

## Guard against regression

There is no test, and that is a deliberate call rather than an omission: this is
a property of a manifest read by Electron at process start, and a unit test
asserting `packageJson.productName === "Sparstrowgen"` would restate the fix
without exercising it. What actually catches it is launching the app, which
Phase 3's Result section now records as a required step — the packaged-build
gate in `AGENTS.md` §2.3 exists for exactly this.
