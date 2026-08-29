---
name: release
description: >-
  Cut a Sparstrowgen desktop release. Staging ships itself — every push to
  `staging` auto-builds and auto-publishes "Sparstrowgen Staging" with no
  manual step (.github/workflows/release-staging.yml). Stable is the
  deliberate-gesture path: bump packages/desktop/package.json's version, write
  the changelog entry, tag, push the tag, and publish the resulting GitHub
  Release draft by hand. Use when asked to "cut a release", "ship the desktop
  app", "release stable", "release v0.x.0", or "publish a new version".
metadata:
  sparstrowgen-owner: coordinator
---

# Releasing the desktop app

Two channels, two very different amounts of ceremony. Full architecture:
[`doc/plans/2026-08-29-two-channel-desktop-release.md`](../../../doc/plans/2026-08-29-two-channel-desktop-release.md).

## Staging — nothing to do here

Every push to `staging` (i.e. every `development` → `staging` PR merge)
already builds and publishes a new **Sparstrowgen Staging** installer
automatically, non-draft, via
[`.github/workflows/release-staging.yml`](../../../.github/workflows/release-staging.yml).
There is no release gesture to perform — if you're being asked to "release to
staging," the PR merge already did it. Confirm at
`https://github.com/sparstrow/sparstrowGen/releases` — the newest
`vX.Y.Z-staging.N` tag should match the merge commit's run.

## Stable — the deliberate path

**Stable only ships from `main`.**
[`release.yml`](../../../.github/workflows/release.yml)'s `guard` job hard-fails
the build if the tagged commit isn't an ancestor of `main` — don't tag a
`staging` or feature-branch commit expecting it to work.

1. **Confirm you're releasing a commit that's actually on `main`** (the
   `development` → `staging` → `main` promotion chain has already run per
   `AGENTS.md` §2 rule 8 — this skill does not perform that promotion, only
   the release gesture once it's done).

2. **Bump the version.** `packages/desktop/package.json`'s `version` field —
   THE TAG NAME IS NOT THE VERSION (see `release.yml`'s header comment).
   electron-updater compares against the version baked into `latest.yml`,
   which comes from this file. Tagging `v0.3.0` while this still says `0.2.0`
   publishes a feed nobody's client will see as an update.

3. **Write the changelog entry.** New file at
   `apps/web/src/content/changelog/<version>.md`:
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
   Skip empty sections. This is user-facing copy — see it from the person
   installing the update, not from the commit log (`release.yml`'s own
   `generate-notes` step already produces a raw PR-derived draft for the
   GitHub Release body; that stays a secondary/internal aid, not this file).

4. **Commit, tag, push** — [`scripts/cut-stable-release.sh`](scripts/cut-stable-release.sh)
   does steps 2 and 4 together once you've written the changelog entry:
   ```bash
   .claude/skills/release/scripts/cut-stable-release.sh <version>
   ```
   Or by hand:
   ```bash
   git checkout main && git pull origin main
   # edit packages/desktop/package.json's version, write the changelog entry
   git add packages/desktop/package.json apps/web/src/content/changelog/<version>.md
   git commit -m "release: v<version>"
   git push origin main
   git tag v<version>
   git push origin v<version>
   ```

5. **Wait for the build**, then **publish the draft release by hand** at
   `https://github.com/sparstrow/sparstrowGen/releases` — this click is the
   release gate; electron-updater's clients see nothing until it's published.
   `release.yml` has already filled the release notes from merged PRs — review
   before publishing, don't just click through.

## If you're asked to "add a channel" or change release mechanics

That's not this skill — it's the underlying infrastructure
(`packages/desktop/scripts/build-channel-config.mjs`, the two workflow files,
`packages/desktop/src/channel.ts`). Read the plan doc linked above first.
