# BUG-2026-08-16-pairing-path-wrong-in-cli

**Status:** 🟢 resolved
**Reported by:** agent — found while writing
[`specs/2026-08-16-pair-machine-to-deployed-app.md`](../specs/2026-08-16-pair-machine-to-deployed-app.md),
reading the pairing CLI against the settings page it points at
**Reported:** 2026-08-16

## Symptom

`sparstrow pair` tells the user to get a pairing code from a settings tab that
does not exist.

The CLI says **Settings → Workspace → Runtimes**, in two places:

- [`pair.ts:36`](../../packages/core/src/cli/pair.ts:36) — the usage line
- [`pair.ts:48`](../../packages/core/src/cli/pair.ts:48) — the GETTING A CODE
  section
- [`pair.ts:68`](../../packages/core/src/cli/pair.ts:68) — the not-paired
  message, and [`:119`](../../packages/core/src/cli/pair.ts:119) — the unpair
  note

The actual location is **Settings → Workspace → General**, and the card is
titled **Machines**, not Runtimes
([`settings.tsx:777-783`](../../packages/ui/src/routes/pages/settings.tsx:777)).
Settings → Workspace has exactly two tabs: **General** and **Integrations**.

So a user follows the instruction, looks for a "Runtimes" tab, and does not
find one. The word "Runtimes" appears nowhere in that settings surface.

## Reproduction

1. Run `sparstrow pair --help` (or `sparstrow pair` with no arguments).
2. Read: *"In the web app, open Settings → Workspace → Runtimes and choose
   'Pair a machine'."*
3. Open the web app → Settings → Workspace.
4. **Expected:** a Runtimes tab. **Actual:** two tabs, General and
   Integrations. The pairing control is the **Machines** card inside General.

Confirmed by reading both files, not by running the CLI — the CLI has never
been run against a deployed app (see the spec's "experience today").

## Investigation

Not a regression; the strings have been wrong since they were written. The
likely cause is that the domain object is called `runtime` everywhere in the
code and the schema, and the CLI help was written from the code's vocabulary
rather than from the rendered UI. The UI deliberately says "Machines" —
[`runtimes-card.tsx:362`](../../packages/ui/src/components/runtimes-card.tsx:362)
titles the card `Machines` and its description explains machines in user
terms, which is the right call for a user-facing surface.

So the defect is one-directional: **the UI's wording is correct and the CLI's
is stale.** The fix belongs in the CLI, not the page.

Two decisions the fix should not get wrong:

- **Do not rename the UI to "Runtimes" to match.** That trades a correct
  user-facing word for an internal one.
- **The path has two levels of tabs** (Workspace → General), so "Settings →
  Workspace" alone is not precise enough to be useful.

## Impact

Hits the **first command a user ever runs on a new machine**, which is the
one place the product can least afford to be confusing — `pair.ts`'s own
header comment says exactly that: *"'Something went wrong' here means someone
stares at a terminal with no idea whether to retype the code, generate a new
one, or check the network."* The same standard applies to sending them to a
tab that isn't there.

Low severity, because the correct card is one tab away and visually
prominent — someone will find it within a minute. It is a credibility cost
rather than a blocker: the first instruction the product gives is wrong.

Also low *frequency* today, since nobody outside the owner has paired a
machine. That changes the moment anyone else does.

## Resolution

**Fixed 2026-08-18 by [`T-M8-04`](../tasks/M8/T-M8-04-cli-path-strings.md),
commit on branch `claude/next-backend-feature-175d27`.** All four strings in
[`packages/core/src/cli/pair.ts`](../../packages/core/src/cli/pair.ts) — lines
36, 48, 68 and 119 — replaced. No occurrence of `Runtimes` or `Settings →`
remains anywhere in `packages/core/src/cli/`, checked by grep rather than by
eye; there was no fifth occurrence.

**The destination is not the one this file proposed.** The comment here said to
point at *"Settings → Workspace → General → Machines"*. That was correct on
2026-08-16 and would have been stale again within the same milestone: M8 moves
machines out of Settings entirely and onto a top-level page (US1). The strings
now say:

| Line | Now reads |
|---|---|
| 36 | `Redeem a pairing code from the Machines page` |
| 48 | `In the web app, open Machines in the sidebar and choose "Pair a machine".` |
| 68 | `Run \`sparstrow pair <code>\` with a code from the Machines page in the web app.` |
| 119 | `Revoke it on the Machines page if the machine is no longer trusted.` |

None names a sidebar group, a tab path, or a URL — deliberately. A four-level
path is exactly what went stale here, and "Machines in the sidebar" survives a
nav reshuffle.

**Verified by running the CLI, not by reading it** — which is what the original
report could not do. `sparstrow pair --help` and `sparstrow pair --status` were
both executed against a fresh `esbuild` bundle and their real output read: the
`GETTING A CODE` section names Machines, the template literal still interpolates
`secretsDir` and `cloudUrl` correctly, and the block's indentation is unchanged.

**One caveat, stated rather than glossed.** The strings now name a page that
[`T-M8-03`](../tasks/M8/T-M8-03-route-and-nav.md) has not registered yet — the
Machines destination does not exist at the time of this fix. For the few days
until M8 lands, the CLI names a place that is *about* to exist rather than one
that does. That is the deliberate trade the task's `Depends on: —` records: the
alternative was pointing at the Settings card, then editing all four strings a
second time. `T-M8-05` walks the CLI text against the rendered page.

The **Symptom** and **Investigation** sections above are left exactly as
written; they are the historical record of what was observed on 2026-08-16.

---

## Closing note — 2026-08-20

The one caveat this file left open is cleared.
[`T-M8-03`](../tasks/M8/T-M8-03-route-and-nav.md) registered `/machines` on
2026-08-20, so the destination the CLI names now exists: it is in the sidebar's
**Workspace** group, directly after Runs, in both hosts, reachable from Ctrl-K,
and correctly labelled in the breadcrumb and tab strip.

Re-checked at that point, not assumed: `sparstrow pair --help` was **run** and
its `GETTING A CODE` section read against the rendered page in a browser. The
instruction and the app now agree, which is the first time that has been true
since the strings were written.

Nothing above this note was edited. The window in which the CLI named a page
that did not yet exist ran 2026-08-18 → 2026-08-20 and is part of the record.
