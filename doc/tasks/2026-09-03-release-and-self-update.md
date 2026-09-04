# Release the app, and let it update itself

**Branch:** `claude/multica-app-architecture-0a3e6f`
**Status:** ✅ **Complete.** v0.3.0–v0.3.3 published. The owner removed the
approval gate on 2026-09-03 (`AGENTS.md` §2.8), so nothing waits on it.
The `development` → `main` merge is an owner-only gate (AGENTS.md §2 rule 8) and
that merge is now also the release gesture, so it is deliberately not taken here.

## What the owner asked for

> release the app in the main branch […] all the development in the feature
> branches and merged to development and when everything being pushed to main,
> there should be a release and I should be able to update the app from my
> desktop from settings and notification should tell me new update is there
> […] this is what I am assuming the production grade app release and update.
> But if not please suggest accordingly, I am newbie to this

The shape was right. Three things about the repo's actual state changed the
order of operations, and one of them changes the answer.

## The correction that matters: build the update UI *before* the first release

The app checks for updates and has done since 0004 Phase 2 — every 30 minutes,
against GitHub Releases. Phase 3 replaced the renderer with the SPA and **the
update UI did not come with it**. So the shell was computing a status and
pushing it to a renderer with no listener.

Releasing first and building the UI second would have produced an installed app
that **can never show an update notification** — the owner would have had to
manually download and reinstall to get the version capable of telling them about
versions. The one thing they asked for would have been the one thing that
couldn't work. So the UI went first.

## The other correction: "every push to main is a release" burns a version per merge

Taken literally, a docs merge or a revert would publish a release and put an
"Update available" badge on the owner's machine for a change nobody can see.

**What was built instead: the release gesture is a line in a diff.** A
`development` → `main` PR that bumps `apps/desktop/package.json`'s `version` is
a release; one that doesn't is not. That keeps the owner's intent — merging to
main ships — while making "is this a release" a decision visible in code review
rather than an accident of what happened to merge.

## What was built

**Settings, the app's first** (AGENTS.md §3.14, applied retroactively to two
features that already broke it):

- *Updates* — version, an honest status line, Download and Install as two
  separate clicks, and the drain state that waits for agent runs to finish
  before restarting.
- *This computer* — the daemon auto-start / auto-stop preferences, which have
  had an IPC bridge and no control since the supervisor was written.

**The notification**, in two places: a header button while an update is waiting,
and a silent OS notification for when the window is in the tray (deduplicated
per version, so a 30-minute check does not interrupt twice an hour).

**A manual "Check for updates"**, which did not exist — the app checked on its
own schedule and a person had no way to ask.

**The pipeline**: `release-staging.yml` deleted (it triggered on `staging`,
retired 2026-09-02, so it was waiting for something that can no longer happen);
`release.yml` rewritten to trigger on `main`, skip when the version is already
released, and **publish** rather than leave a draft.

That last point is not a preference. Every stable release this repo has ever cut
stopped at an unpublished GitHub draft and reached nobody — `gh release list`
shows staging releases and *no stable one at all*. The owner's merge is already
the gate; a second gate on a page nobody visits is how "released" and "actually
shipped" come apart.

## Result — what was actually run

`pnpm typecheck` — 0 errors. `pnpm test` — 7/7 packages, **exit code 0**, checked
as an exit code rather than by grepping the output. (An earlier commit in this
branch was pushed with a red suite because `… | grep -E "Tasks:|FAIL" && git
commit` proceeds on a *match* — including a match on the word FAIL. Not
repeated.)

**A first full run reported four `@sparstrow/server` failures**, all timing out
at ~200 s: `migration-0008`, `tool-resolution`, `heartbeat`, `wip-snapshot`.
They were machine load — an Electron app, a daemon, a server and a web dev
server were all running. Re-run with those stopped: 92 files, 837 tests, exit 0;
then the full suite green. Recorded because "flaky under load" is a fact about
this suite worth knowing, not a thing to quietly re-run until green.

**Verified against a running app** over CDP:

- the window reports `v0.3.0` and renders both nav tabs
- Settings renders, with the *correct* unpackaged state: "This build cannot
  update itself" — see the finding below
- daemon preference switches render live values from the main process

Screenshot: `settings-screen.png` (sent to the owner in the session).

## Three things found by running it

**1. Settings called an IPC handler that does not exist.** `setupUpdater()` is
gated on `app.isPackaged`, correctly — a dev build has no release feed. But the
preload bridge is exposed in *every* build, so feature-detecting the bridge
reported "updates work" in exactly the builds where they do not, and the first
`getStatus()` threw. `supported` is now decided by *asking* and has three states,
`null` for "still asking". Pinned by `update-copy.test.ts`.

**2. Two installs fight over the daemon port.** Port 48750 is a single hardcoded
constant, and `probeHealth` authenticates with a per-install token, so a second
install can never adopt the first's runtime — it reads 401 as "nothing there"
and spawns into `EADDRINUSE`, five times, over ten seconds of backoff.

The port was held by **the owner's installed "Sparstrowgen Staging"**, not a
test process. That is the ordinary state of their machine, and it is the state
they are about to install 0.3.0 into.
[`BUG-2026-09-03`](../bug/BUG-2026-09-03-two-desktop-installs-fight-over-the-daemon-port.md),
[`G-65`](../KnownGaps.md).

**3. That conflict presented as "the app does not launch".** `main.ts` awaited
`services.start()` before `openWindow()`, and `start()` polls for 60 seconds.
So a runtime problem showed as no window, no icon, no error, for a minute — and
then a window with nothing explaining it. The window no longer waits for the
runtime; it renders sign-in, Settings and its own offline state without one.
Window time on a port conflict: ~60 s → under 10 s.

## What is deliberately NOT done here

**The release.** `main` is 72 commits behind this branch and does not contain
`server/` at all — releasing from `main` as it stands today would ship the
pre-restructure app, the one that was never usable. The release therefore
requires promoting the whole restructure, which is exactly the merge AGENTS.md
§2 rule 8 reserves for the owner. PR [#215](https://github.com/sparstrow/sparstrowGen/pull/215)
opens the first half of that promotion.

**Proof that updating works.** It cannot be had from one release: "an update is
available" is a comparison between an installed version and a published one, so
it needs 0.3.0 installed and 0.3.1 published. Stated as a rule in AGENTS.md §2
rule 9 so no later agent reports the update path as working off a single build.
