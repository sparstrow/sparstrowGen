# BUG-2026-09-03 — `productName`, not `name`, decides a channel's userData dir

**Status:** 🟢 Fixed in the change that found it (the `dev` channel, 0.3.3).
**Found:** 2026-09-03, by installing the first `dev`-channel build and running it.
**Severity:** High. The whole point of a separate channel is that an agent's
test build cannot touch the owner's app; this defect made the separation look
complete while leaving the two sharing one data directory.

## What happened

The first `dev` build installed cleanly and appeared as its own app:

```
Sparstrowgen Dev 0.3.3-dev.1788475283739
C:\Users\gsrih\AppData\Local\Programs\Sparstrowgen Dev\
```

Launched, it exited within a second having printed one line:

```
[log] main-process log: C:\Users\gsrih\AppData\Roaming\Sparstrowgen\data\logs\main.log
```

`Roaming\Sparstrowgen` is the **stable** install's userData. The dev build was
reading and writing the owner's app's data directory, and quit on the
single-instance lock the stable app was holding.

It only quit because the stable app happened to be running. Had it not been,
the dev build would have started up on the owner's data and ports and reported
nothing unusual.

## Root cause

Electron resolves `app.name` from the packaged app's `package.json`, reading
**`productName` in preference to `name`**, and falling back to `name` only when
`productName` is absent. The packaged asar contained:

```json
{ "name": "sparstrow-desktop-dev", "productName": "Sparstrowgen" }
```

`name` had been overridden correctly and made no difference at all.

The trap is that `productName` appears **twice** in `apps/desktop/package.json`:

| where | what it controls |
|---|---|
| root `productName` | copied into the packaged app; **Electron reads this** |
| `build.productName` | the installer filename, the `.exe` name, Start Menu |

`build-channel-config.mjs` overrode `build.productName`, which renamed the
installer and the executable convincingly while every runtime path kept
pointing at the other channel.

## What made this hard to see

The file carried a comment asserting the opposite:

> `productName` is an electron-builder installer/build concept, not something
> Electron's app module reads at runtime.

It cited a real verification —
[`BUG-2026-08-30`](BUG-2026-08-30-desktop-stable-staging-share-userdata-dir.md)
/ T-DR-04, 2026-08-30 — in which adding `name` to `extraMetadata` did make two
channels stop sharing a directory. That observation was true. The **conclusion
drawn from it was not**: nothing in that test established which field was
responsible, because only one was ever changed. A correct result and a wrong
explanation are indistinguishable until the explanation is relied on, which is
what happened here.

## Fixed

`extraMetadata` now carries `productName` alongside `name`, so both move
together. Stable's values are unchanged, so no installed build is orphaned.

The comment in `build-channel-config.mjs` has been corrected in place with the
evidence above rather than deleted — the wrong version was load-bearing for a
month and the next reader needs to know it was wrong, not merely that the
current text is right.

## Lesson worth keeping

**Verifying that a symptom disappeared is not verifying why.** The August test
changed one field and observed the desired outcome, then recorded a mechanism it
had not isolated. Anything derived from that mechanism afterwards inherits the
error silently. When a fix involves several plausible causes, either change them
one at a time or record which ones were not ruled out.
