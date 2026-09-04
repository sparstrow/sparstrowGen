---
name: release
description: >-
  Cut a Sparstrowgen desktop release. There is one channel and no manual
  release gesture: bumping `apps/desktop/package.json`'s version inside the
  `development` → `main` PR is what ships it, and merging that PR builds,
  publishes and tags automatically (.github/workflows/release.yml). Use when
  asked to "cut a release", "ship the desktop app", "release v0.x.0", or
  "publish a new version" — and to diagnose a release that did not appear.
metadata:
  sparstrowgen-owner: coordinator
---

# Releasing the desktop app

**The release gesture is a line in a diff.** Bump the `version` field in
`apps/desktop/package.json`; merging that to `main` publishes it.

There is no tag to push and no draft to publish by hand. Both used to exist and
both were skipped in practice — every stable release before 2026-09-03 stopped
at an unpublished GitHub draft, which is why no stable version ever reached an
installed app.

## Cutting a release

1. **Write the changelog entry** — `apps/web/src/content/changelog/<version>.md`:

   ```markdown
   ---
   version: <version>
   date: <YYYY-MM-DD>
   channel: stable
   title: <one line, what this release is about>
   ---

   **New**
   - ...

   **Improved**
   - ...

   **Fixed**
   - ...
   ```

   Skip empty sections. Write it from the position of the person installing the
   update, not from the commit log — the GitHub Release body is generated from
   merged PRs separately and is the internal aid, not this.

   If the release ships something visibly unfinished, say so under a **Known
   limitations in this release** heading. Someone who hits it and was warned is
   in a different situation from someone who hits it and was not.

2. **Bump `apps/desktop/package.json`'s `version`.** Semver against what is
   already released: a new feature is a minor, a fix-only release is a patch.

3. **Put both in the `development` → `main` PR.** Merging it releases.

That is the whole procedure. The workflow then, on its own:

- notices the version has no release yet (a merge that does not bump the version
  builds nothing — that is the point),
- runs `pnpm typecheck` and `pnpm test`,
- builds the NSIS installer and uploads it plus `latest.yml`,
- generates the release notes from merged PRs,
- publishes the release and creates the `v<version>` tag on the built commit.

Within 30 minutes every installed app shows **Update available**; the person
using it chooses whether to download and whether to install.

## The agent merges it, as of 2026-09-03

The owner removed the approval gate that used to sit here (`AGENTS.md` §2 rules
6, 8 and 9). An agent opens the `development` → `main` PR **and merges it**, and
no "approved, ship it" is required.

**So the judgement moved rather than disappeared.** Bumping the version in that
diff is the entire decision to ship a build onto the owner's machine. Before
merging one:

- satisfy `AGENTS.md` §3.10 — the app has to have been *run*, not just tested
- be able to state what you actually ran, in the task's Result section
- if you cannot, **leave the version alone**. A promotion PR with no version
  bump lands the work on `main` and publishes nothing, which is the right move
  whenever you are not confident the build is one the owner should be running.

The old gate's real function was to stop an unverified build reaching a person.
That still needs stopping; there is just no longer anyone else to do it.

## When a release does not appear

Work down this list — each step distinguishes two things that look identical
from the outside.

0. **Is there a release with a tag like `untagged-0fbbfd8d…` and all the right
   assets on it?** Then the build worked and the tag was lost. **PATCHing a
   draft release without re-sending `tag_name` makes GitHub reset it to
   `untagged-<hash>`** — assets, body and target commit all survive, but it can
   no longer be found by tag, and the workflow's own error says "the build did
   not create one", which is wrong and sends you to the wrong place. Recover
   without rebuilding:
   ```bash
   gh api -X PATCH "repos/sparstrow/sparstrowGen/releases/<id>" -f tag_name="v<version>" -f target_commitish="<sha>" -F draft=false -F make_latest=true
   ```
   Read `latest.yml` off the draft first and check its version matches. Full
   writeup: [`BUG-2026-09-03`](../../../doc/bug/BUG-2026-09-03-patching-a-draft-release-silently-clears-its-tag.md).

1. **Did the workflow decide to release?** Its first job prints either
   `vX.Y.Z is already released` or `vX.Y.Z has not been released — building it`.
   The first means the version was not bumped, or a leftover release (**including
   a draft**) already claims that tag. Delete the stale draft or bump again.
2. **Is the release published, or still a draft?** electron-updater cannot see a
   draft at all. A draft that survived the run means the publish step failed
   after the upload.
3. **Does the release carry `latest.yml`?** That file, not the `.exe`, is the
   update feed. An installer with no `latest.yml` is a release nobody's app can
   discover.
4. **Does `latest.yml`'s version match the tag?** They come from different
   places — the tag from the workflow, the version from
   `apps/desktop/package.json` baked into the build. The app compares against
   the file, so a mismatch ships a release that every client reads as "already
   up to date".
5. **Is the app looking at the right feed?** `updater.ts` sets
   `autoUpdater.channel` from the baked `channel.json`. A build made with
   `channel=staging` reads `staging.yml` and will never see a stable release.

## Testing a build without shipping it

If you have touched the build chain (`prepare-resources.mjs`,
`build-channel-config.mjs`, `ensure-draft-release.mjs`, `channel.ts`,
`release.yml`), build a real installer that touches GitHub not at all:

```bash
cd apps/desktop && pnpm build && node scripts/prepare-resources.mjs stable && node scripts/build-channel-config.mjs stable && npx electron-builder --win nsis --publish never --config electron-builder.stable.generated.json
```

`--publish never` is the important part. Install it silently with
`<installer>.exe /S` — **from PowerShell, not Git Bash**, whose MSYS layer
mangles `/S` into a path.

**To test the update mechanism itself you need two builds**, since "an update is
available" is a comparison and not a state. Install version A, publish version
B, then watch A find it. There is no way to shortcut this with one build.

## The `dev` channel — build THIS, never stable

The retired `staging` channel was replaced on 2026-09-03 by a `dev` channel,
for one reason: an agent building `pnpm dist` produced an installer with the
**stable** appId and productName, which Windows treated as an upgrade and
installed over the owner's real app. It happened. The owner went looking for
their app and it was gone, replaced by a test build wearing its name.

So:

- **`pnpm --filter @sparstrow/desktop dist`** now builds the `dev` channel.
  Distinct appId (`com.sparstrow.sparstrowgen.dev`), productName
  (`Sparstrowgen Dev`), `extraMetadata.name` (which is what actually separates
  userData), and ports (48850/8180 rather than 48750/8080). It never publishes.
- **`dist:stable` is the only way to build the real app**, and in practice only
  `.github/workflows/release.yml` should run it. If you are typing it by hand,
  stop and check why.

A dev build deliberately does **not** wire up the updater. The only feed it
could reach is stable's, so it would offer the owner's release as an "update"
to itself.

## Known-fixed issues, for context if something looks similar

**The build chain used to break itself.** Before 2026-08-30,
`prepare-resources.mjs`'s deploy step poisoned the workspace's pnpm state,
making the *next* command demand an interactive confirmation. Fixed with a
`pnpm install` immediately after it. If you see
`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` or a mysterious
`Cannot find package 'esbuild'` partway through, that fix regressed — find the
commit that added the `pnpm install` line before reaching for `CI=true`.

**Two channels used to share a userData directory.** Distinct
`appId`/`productName` does *not* separate it — Electron keys userData off
`app.name`, from the packaged `package.json`'s `name`. Fixed with a per-channel
`name` in `build-channel-config.mjs`'s `extraMetadata`. Writeup:
[`doc/bug/BUG-2026-08-30-desktop-stable-staging-share-userdata-dir.md`](../../../doc/bug/BUG-2026-08-30-desktop-stable-staging-share-userdata-dir.md).

**The app quit instantly when run unpackaged.** A missing `productName` made
`app.getName()` resolve to the npm scope `@sparstrow/desktop`, producing a
userData path Windows could not create, so the single-instance lock could never
be acquired. Writeup:
[`doc/bug/BUG-2026-09-03-desktop-app-quits-instantly-when-run-unpackaged.md`](../../../doc/bug/BUG-2026-09-03-desktop-app-quits-instantly-when-run-unpackaged.md).
