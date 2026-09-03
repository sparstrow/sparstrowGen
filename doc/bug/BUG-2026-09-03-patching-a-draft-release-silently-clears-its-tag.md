# BUG-2026-09-03 — PATCHing a draft GitHub Release without `tag_name` silently retags it `untagged-…`

**Status:** ✅ Fixed in `.github/workflows/release.yml`. The affected release
(v0.3.0) was recovered by hand without rebuilding.
**Found:** 2026-09-03, on the very first run of the new release workflow — the
first stable release this repository has ever published.
**Severity:** High. It fails at the last step of a 6-minute build, and the error
message it produces is actively misleading.

## What happened

The release workflow ran on the `development` → `main` merge. Everything worked:

- the version gate decided `0.3.0` had no release yet ✅
- typecheck, tests, and the NSIS build ✅
- `ensure-draft-release` created draft `v0.3.0` (id 382165884) ✅
- electron-builder uploaded all three assets — the 186 MB installer, its
  blockmap, and `latest.yml` ✅
- release notes were generated and written ✅

and then the final step failed with:

```
No draft release found for v0.3.0 — the build did not create one.
```

The draft **did** exist, fully built, at that exact moment. Its `tag_name` had
become `untagged-0fbbfd8d8023ecfe73f0`.

## Root cause

A draft release has no git tag — GitHub creates the tag only when the draft is
published — so it carries the intended tag as an ordinary field. **PATCH a draft
without `tag_name` and GitHub does not leave that field alone; it resets it to
`untagged-<hash>`.**

The "Write release notes" step PATCHed only `body`. That was enough to make the
release unfindable by tag, which is exactly how the next step looked for it.

Everything else survived: assets, body, `target_commitish`. Only the one field
needed to find it again was gone.

## Why the error message made it worse

"the build did not create one" is a confident, wrong diagnosis. The natural next
move is to go looking at the build — which had succeeded — rather than at the
release object, which was sitting there whole. A step that reports a *cause* it
has not established sends the reader away from the evidence.

## Fixed

In `.github/workflows/release.yml`:

1. **Every PATCH to a draft re-sends `tag_name`.** Both of them.
2. **The release is carried forward by ID**, exported to `$GITHUB_ENV` by the
   notes step and used by the publish step. An ID cannot be reset out from under
   a later step; a tag lookup can.
3. **A new final step proves the update feed is live** — it fetches
   `releases/latest/download/latest.yml` *anonymously* (`curl -u ""`) and fails
   if the advertised version is not the one just released.

That third one is the important one. Every check before it passes just as
happily for a release that no installed app can see, and "a release that exists
and ships nothing" is not hypothetical here — it is what happened to every
stable release this repo cut before 0.3.0, all of which stopped at an
unpublished draft.

## Recovery, for reference

No rebuild was needed. The draft held every asset; only the tag was missing:

```bash
gh api -X PATCH "repos/<owner>/<repo>/releases/<id>" \
  -f tag_name="v0.3.0" -f target_commitish="<sha>" \
  -F draft=false -F make_latest=true
```

`latest.yml` was read off the draft first and confirmed to advertise `0.3.0`
before publishing — a feed whose version disagrees with the installer is read by
every client as "already up to date", which would have looked like a successful
release that shipped nothing.

---

## Follow-up, same day — the verification step added above then hung the next release

**`curl -u ""` makes curl prompt for a password.** On a runner with no terminal
that waits forever.

The "Prove the update feed is live" step passed `-u ""` to force an anonymous
fetch. That was unnecessary — curl sends no credentials of its own; the runner's
`GITHUB_TOKEN` lives in `gh`'s environment, not curl's — and it was actively
broken.

On v0.3.1's release every prior step succeeded, **the release published
correctly and its feed was live**, and the step whose entire job is to confirm
that hung the run. A verification step that can hang is worse than no
verification step, because it fails a run that succeeded and it teaches the next
reader to distrust a red build.

Fixed with `--max-time 30`, `--retry` for GitHub's own post-publish propagation
delay, and a `timeout-minutes: 45` on the job so no future step can hold a
runner for GitHub's six-hour default.

**The lesson worth keeping:** this file already documents one failure where the
last step reported a disaster about a healthy release. That is now twice. Both
times the release was fine and the *checking* was broken — which is an argument
for keeping the number of things that run after a successful publish small, and
for every one of them being bounded in time.
