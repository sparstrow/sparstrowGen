# BUG-2026-08-16-pairing-path-wrong-in-cli

**Status:** 🔴 open
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

<!-- Fix belongs with the US1 work in the pairing spec; update all four
strings in pair.ts to "Settings → Workspace → General → Machines". -->
