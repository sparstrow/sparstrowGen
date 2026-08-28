# BUG-2026-08-24-terminals-article-describes-a-transport-that-no-longer-exists

**Status:** 🟢 resolved — [`T-M17-05`](../tasks/M17/T-M17-05-knowledge-center.md)
**Reported by:** agent — reading the Knowledge Center while planning
[the terminal spec](../specs/2026-08-24-a-terminal-on-my-machine.md)
**Reported:** 2026-08-24

## Symptom

[`apps/web/src/content/knowledge/terminals.md`](../../apps/web/src/content/knowledge/terminals.md)
(`updated: 2026-07-13`) tells users three things that are not true of the running
app. Per `AGENTS.md` §3.2 the Knowledge Center is user-facing product surface, so
a wrong article is a user-visible defect.

| The article says | What is actually true |
|---|---|
| "full xterm terminals running on your machine, **streamed into the UI over the local WebSocket**" | The local WebSocket is unreachable from the hosted app. `terminals.tsx` dials `window.location.host`, which is Vercel, which serves no WebSocket from a route handler. The page has been dead in the browser since the Vite host was retired (`D-24` / `T-VR-01`) |
| "closing a tab ends that session; **there's no detach/reattach like tmux**" | False, and false *before* the Vite retirement too. [`manager.ts:7`](../../packages/core/src/terminal/manager.ts:7) has had a 10-minute `DETACH_TTL_MS` grace with a 256 KB replay ring the whole time — detach/reattach is exactly what it does |
| "each is independent and **keeps its scrollback while the app is open**" | The scrollback is the machine's ring buffer, not the app's. It is unaffected by whether the app is open |

The article also has no `## Known Limitations & Boundaries` section, which
`AGENTS.md` §3.2 requires of every Knowledge Center article. It has a "Notes &
limitations" heading instead.

## Reproduction

1. Open `/knowledge/terminals` in the hosted app.
2. Read the second paragraph and the "Notes & limitations" list.
3. Open `/terminals` in the same browser and press **Shell**.

**Expected**, per the article: a working xterm session, ending when the tab
closes.
**Actual:** an error. The feature described does not work in a browser at all,
and the two behavioural claims describe the opposite of what the machine does.

Reproducible every time; it is static content.

## Investigation

Not a runtime defect — the article was written on 2026-07-13, when the Vite UI
was served by the daemon itself and `window.location.host` **was** the machine.
Two later changes falsified it and neither included a Knowledge Center pass:

- The detach grace and replay ring in `manager.ts` (predates the article's own
  date in its current form — the "no detach/reattach" line appears to have been
  wrong when written).
- `D-24` / `T-VR-01`, which retired the Vite host on 2026-08-24 and made the
  local WebSocket unreachable from the only UI that remains.

This is the failure mode `AGENTS.md` §3.2 describes: *"A feature can make a page
false without going near it."* Filed separately from the plan that fixes it so
the record exists independently of whether that plan ships.

## Impact

A user following this page tries a feature that cannot work, and is told nothing
about why. The second claim is the more damaging of the three going forward: the
terminal plan makes sessions survive until explicitly closed, so a page telling
people their sessions end with the tab will cause them to leave shells running on
their own machine believing they are gone.

No security impact — nothing here grants or describes access. Filed in `bug/`
rather than `security/` for that reason.

## Resolution

Queued as [`T-M17-05`](../tasks/M17/T-M17-05-knowledge-center.md), which rewrites
the article against what M16/M17 actually ship, adds the required
`## Known Limitations & Boundaries` section, bumps `updated:`, and re-reads the
four global-claim pages plus the three articles that link here.

**Not fixed ahead of that task deliberately.** Correcting it now would mean
describing a dead feature accurately, then rewriting it again a phase later — and
the honest interim sentence ("terminals do not work in the browser") is one the
same plan deletes. If M16/M17 are dropped or deferred, this bug reopens as
standalone work and the interim sentence is what it gets.

**Resolved 2026-08-27, `T-M17-05`.** `terminals.md` rewritten against what
M16/M17 actually ship — reachable from any browser you're signed in on,
owner/admin only, sessions survive until closed with a ten-session ceiling,
the per-machine off switch, output suppression under flood. All three false
sentences from the table above are gone; verified with
`grep -rn "local WebSocket\|no detach/reattach" apps/web/src/content/knowledge/`
returning no match in `terminals.md` (a *different*, unrelated stale claim
turned up in `dashboard.md` — filed separately as
[`BUG-2026-08-27-dashboard-article-describes-a-transport-that-no-longer-exists`](BUG-2026-08-27-dashboard-article-describes-a-transport-that-no-longer-exists.md)
rather than fixed here, out of this task's scope). Article gained the
required `## Known Limitations & Boundaries` section and its `updated:`
date moved to 2026-08-27.
