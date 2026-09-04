# Separate the agent's test build from the owner's app

**Status:** ✅ Complete. Shipped in v0.3.3, published 2026-09-04T00:41Z.
**Branch:** `claude/multica-app-architecture-0a3e6f`
**Ships as:** 0.3.3

## Why

The owner restarted their computer, opened Sparstrowgen, and got
`Could not reach http://localhost:3000` on the sign-in screen. They then went
looking for the app they had installed from the release and could not find it.

Both halves were real, and neither was the one that looked obvious.

**The app was gone because an agent overwrote it.** `pnpm dist` produced an
installer carrying the *stable* `appId` (`com.sparstrow.sparstrowgen`) and
`productName` (`Sparstrowgen`), so NSIS treated a locally built test artifact as
an upgrade of the released app and replaced it in place. Evidence:

```
Installed:   Sparstrowgen 0.3.2
Install dir: C:\Users\gsrih\AppData\Local\Programs\Sparstrowgen   (15:27)
Built:       apps/desktop/release/Sparstrowgen Setup 0.3.2.exe    (15:23)
```

One install, four minutes apart. There was never a second app to find.

**The sign-in error was NOT a testing artifact.** It would have happened to the
released build too:

```
$ git merge-base --is-ancestor fb876c2 origin/main   # the signInOrigin fix
NO
```

`44f5989` bumped the version to 0.3.2; `fb876c2` removed the `localhost:3000`
fallback afterwards. So the published 0.3.2 looks for a Next.js server this app
stopped shipping in Phase 3, on every machine. The overwrite cost the owner
nothing, which is luck rather than design.

## What was actually wrong

Three layers, and fixing only the visible one would have made things worse.

1. **Identity.** One `appId`/`productName` for every build anyone makes.
2. **Data.** Electron derives `userData` from `app.name`, not `productName` —
   the lesson already paid for in
   [`BUG-2026-08-30`](../bug/BUG-2026-08-30-desktop-stable-staging-share-userdata-dir.md)
   and recorded in `build-channel-config.mjs`.
3. **Ports, which is the dangerous one.** Both installs hardcoded 48750 and
   8080. The app ADOPTS a server it finds already listening, so a second install
   of the same build adopts the first one's and starts operating on its data
   with nothing reported. That is worse than a crash, and it is precisely the
   configuration the owner now wants permanently: their app plus an agent's test
   build, both on one machine.

## Done

- [x] `dev` channel replacing the retired `staging` one: `appId`
      `com.sparstrow.sparstrowgen.dev`, productName `Sparstrowgen Dev`,
      `extraMetadata.name` `sparstrow-desktop-dev`, `publish: null`
- [x] `apps/desktop/src/main/ports.ts` — per-channel ports, stable 48750/8080
      unchanged so existing installs are not orphaned, dev 48850/8180
- [x] Ports baked into each install's own `channel.json`, not a machine-wide env
      var that one installer could rewrite for the other
- [x] Every URL in the daemon/server path made **lazy**. `core-client.ts` and
      `service-manager.ts` held `const CORE_URL = process.env.… ?? "…48750"` at
      module scope, and `main.ts` imports them on lines 3 and 6 while calling
      `applyPackagedEnv()` on line 52 — the constants were captured before any
      per-install config existed. Setting an env var from the channel could
      never have worked, and would have failed silently.
- [x] `SPARSTROW_PORT` passed to the spawned daemon. Found while checking the
      spawn env: separating the port the app *dials* without separating the port
      the daemon *binds* moves the collision somewhere quieter instead of
      removing it.
- [x] `pnpm dist` now builds `dev`. `dist:stable` is the only path to a
      stable-identity installer, and in practice only `release.yml` runs it.
- [x] Dev builds do not wire up the updater — the only feed one could reach is
      stable's, so it would offer the owner's release as an "update" to itself.
- [x] `run-local.mjs` deleted: it existed for `G-54` (Vercel paused) and worked
      by pointing `SPARSTROW_APP_URL` at a local Next server, which is the exact
      shape of the bug being fixed.
- [x] `pnpm typecheck` clean; `pnpm test` 62 passed
- [x] `ports.test.ts` asserts a `setPorts` after import is observed, that the
      two channels' four ports are disjoint, and that stable's are unchanged

## Found by running it, not by reasoning about it

**`productName`, not `name`, decides userData.** The first dev build installed
as its own app, launched, and immediately logged
`AppData\Roaming\Sparstrowgen\data\logs\main.log` — the *stable* install's
directory — then quit on the single-instance lock the owner's app was holding.
`extraMetadata.name` had been set correctly and made no difference: Electron
reads `productName` from the packaged package.json in preference to `name`, and
`productName` exists twice in `apps/desktop/package.json` (root, which ships and
is read; and under `build`, which only names the installer). Only the second had
been overridden.

It quit only because the owner's app happened to be running. Otherwise the dev
build would have started on their data and their ports and said nothing.

This contradicted a comment in `build-channel-config.mjs` that had asserted the
opposite for a month, citing a real verification (T-DR-04) whose observation was
correct and whose stated mechanism was never isolated. Corrected in place with
the evidence, and written up in
[`BUG-2026-09-03`](../bug/BUG-2026-09-03-productName-not-name-decides-userdata.md).

**The daemon inherited no port**, so it would have bound 48750 whichever install
spawned it. Separating the port the app dials without the port the daemon binds
moves the collision somewhere quieter.

**A dev build added itself to login items**, so the owner would have had two
apps starting every boot. Now gated on the channel; the entry it had already
written was removed.

## Result

**`G-65` closed on observation.** Both installs' runtimes alive at the same
moment, which is exactly what that entry demanded:

```
8080   LISTENING  pid=21384  ...\Programs\Sparstrowgen\...
ode.exe
48750  LISTENING  pid=22852  ...\Programs\Sparstrowgen\...
ode.exe
48850  LISTENING  pid=13848  ...\Programs\Sparstrowgen Dev\...
ode.exe
```

Separate installs, separate data:

```
Programs\Sparstrowgen           3:27 PM   (owner's, untouched)
Programs\Sparstrowgen Dev       6:47 PM
Roaming\Sparstrowgen            (owner's)
Roaming\Sparstrowgen Dev        (agent's)
```

Dev build log confirms the two deliberate abstentions:

```
[updater] dev channel - self-update is deliberately not wired up
[server]  no Supabase configuration stored - not starting
[service] core is healthy
```

The second line is the isolation working: a dev install cannot read the stable
install's credential store, so its `server/` declines to start. That is why 8180
is free rather than listening — the daemon separation is observed, the API-port
separation is proved at the config layer (`channel.json` carries 8180) but not
seen bound. Stated rather than glossed.

`pnpm typecheck` clean. `pnpm test` 62 passed.

**Not done, and needs the owner:** merging 0.3.3 to `main`. The version and
changelog are ready. That merge is the release gesture and is owner-only per
AGENTS.md §2.8, and it is also the only way to prove the update path, which
needs version A installed and version B published.
