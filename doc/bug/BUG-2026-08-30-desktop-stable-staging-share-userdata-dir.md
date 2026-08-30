# BUG-2026-08-30-desktop-stable-staging-share-userdata-dir

**Status:** 🟢 resolved
**Reported by:** agent — found while verifying [T-DR-04](../tasks/DR/README.md#t-dr-04--fix-the-desktop-build-chain-and-verify-a-real-installer)'s side-by-side install requirement
**Reported:** 2026-08-30

## Symptom

A real, silently-installed `Sparstrowgen Staging` build, launched with
`SPARSTROW_APP_URL` set, spawned its Chromium renderer with
`--user-data-dir="C:\Users\<user>\AppData\Roaming\@sparstrow/desktop"` — the
same default userData path a `stable` install would use. `appId` and
`productName` differ per channel (`build-channel-config.mjs`), but neither
one is what Electron's `app.getPath("userData")` is keyed off; it resolves
from `app.name`, which comes from the packaged app's own `package.json`
`name` field, `@sparstrow/desktop` for both channels since only
`productName`/`appId` were overridden per channel, never `name`.

Had both channels been installed and run side by side, stable and staging
would have shared one userData directory — one SQLite data dir, one memory
vault, one daemon token file — for two builds pointed at different Supabase
projects and (per `channel.ts`) different backends entirely.

## Reproduction

1. Build the staging channel: `pnpm --filter @sparstrow/desktop dist:prepare`
   chain (`build` → `prepare-resources.mjs staging` →
   `build-channel-config.mjs staging` → `electron-builder --config
   electron-builder.staging.generated.json`).
2. Install the resulting NSIS installer silently (`<installer>.exe /S` via
   PowerShell `Start-Process`, not Git Bash — see Investigation).
3. Launch `Sparstrowgen Staging.exe` with `SPARSTROW_APP_URL` set.
4. Inspect the running process tree (`Get-CimInstance Win32_Process`): the
   GPU/network helper processes' command lines carry
   `--user-data-dir=...\Roaming\@sparstrow/desktop`.
5. A `stable` build, un-overridden, resolves to the exact same default path —
   confirmed by inspecting `build-channel-config.mjs`'s `OVERRIDES` map, which
   only ever set `appId`/`productName`/`publish`, never `name`.

100% reproducible — this is the default Electron behavior for a package.json
`name` field that isn't overridden per channel, not an intermittent fault.

## Investigation

- Ruled out: `productName` itself controlling `app.name`. Electron's `app.name`
  resolves from the packaged `package.json`'s `name` field (which
  electron-builder's `extraMetadata` can override — that's a different config
  key from `build.productName`, which only affects the installer/executable
  name).
- Confirmed via `grep` across `packages/desktop/src/`: no `app.setName()` call
  exists anywhere, and no code depends on the literal package name string, so
  overriding `name` in `extraMetadata` was safe with no other call site to
  update.
- Also found and worked around while reproducing this (unrelated, environment
  quirk not a repo bug): Git Bash mangles a bare `/S` argument passed to a
  native `.exe` (MSYS path-conversion rewrites leading-slash args as paths),
  making the "silent" install open a real interactive wizard instead. Running
  the same installer via PowerShell's `Start-Process -ArgumentList "/S"`
  installs genuinely silently. Worth remembering for any future agent
  automating an NSIS install from this repo's Bash tool on Windows.

## Impact

Would have been moderate-to-severe if it had shipped unnoticed: exactly the
failure mode `doc/KnownGaps.md`'s G-54 flagged as the risk of an unverified
side-by-side install — two channels intended to be fully independent
(different backend, different update feed, different `appId`) instead
overwriting one shared local SQLite store and memory vault. Caught before any
real user ever had both channels installed, since this repo has not yet done
a real side-by-side install prior to this session.

## Resolution

Fixed in `packages/desktop/scripts/build-channel-config.mjs`
(same change as [T-DR-04](../tasks/DR/README.md#t-dr-04--fix-the-desktop-build-chain-and-verify-a-real-installer)):
added an `APP_NAME` map (`stable: pkg.name` unchanged — preserves the userData
path any already-installed stable build already uses; `staging:
"sparstrow-desktop-staging"` — a distinct name) and wired it into each
generated config's `extraMetadata.name` alongside the existing
`extraMetadata.version`. `extraMetadata` is merged into the packaged app's
`package.json`, so this directly changes `app.name` and therefore every
userData-derived path at runtime.

Verified closed: rebuilt the staging installer with the fix, reinstalled
silently, relaunched with `SPARSTROW_APP_URL` set, and confirmed via the
process tree that the userData dir changed to
`...\Roaming\sparstrow-desktop-staging`, no longer colliding with stable's
default `...\Roaming\@sparstrow\desktop`. Full verification detail —
including the stable-channel install run alongside it — is in T-DR-04's
Result section.
