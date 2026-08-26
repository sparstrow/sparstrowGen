# T-M8-04 — Point the CLI at a place that exists

| | |
|---|---|
| **Tag** | `[P]` — one file in `packages/core`, touched by nothing else in this phase |
| **Serves** | `US1` — the instructions the product prints name the destination this phase creates |
| **Depends on** | — (the strings name a route T-M8-03 registers; the edit does not import it) |
| **Blocks** | — |
| **Phase spec** | [README.md](README.md) |
| **Status** | ✅ done (2026-08-18) — bug closed |

Fixes [`BUG-2026-08-16-pairing-path-wrong-in-cli`](../../bug/BUG-2026-08-16-pairing-path-wrong-in-cli.md).

## The requirement this satisfies

**FR-015**: every instruction the product prints MUST name a place that exists.

The CLI currently sends people to *Settings → Workspace → Runtimes*, a tab that
has never existed — the card is **Machines**, under General. This phase moves it
again, to a top-level page, which is why the bug fix rides here rather than
being fixed separately and immediately invalidated.

## Objective

Replace all four occurrences in
[`packages/core/src/cli/pair.ts`](../../../packages/core/src/cli/pair.ts) with
the destination M8 creates, and close the bug file.

## Decisions already made

### The four strings, and what each becomes

| Line | Today | Becomes |
|---|---|---|
| [36](../../../packages/core/src/cli/pair.ts:36) | `Redeem a pairing code from Settings → Workspace` | `Redeem a pairing code from the Machines page` |
| [48](../../../packages/core/src/cli/pair.ts:48) | `open Settings → Workspace → Runtimes and choose "Pair a machine"` | `open Machines in the sidebar and choose "Pair a machine"` |
| [68](../../../packages/core/src/cli/pair.ts:68) | `with a code from Settings → Workspace → Runtimes.` | `with a code from the Machines page in the web app.` |
| [119](../../../packages/core/src/cli/pair.ts:119) | `Revoke it in Settings → Workspace → Runtimes if…` | `Revoke it on the Machines page if…` |

Exact wording is the implementer's. The **claim** is fixed: no string may
mention Settings, and none may say "Runtimes".

### "Machines", not "Runtimes" — the UI wording wins

The bug file already settled this: the domain object is `runtime` everywhere in
the code and the schema, and the UI deliberately says **Machines** because that
is the user-facing word. The defect is one-directional — the CLI is stale, the
page is right. **Rejected:** renaming the page to match the code, which trades
a correct user-facing word for an internal one.

### The CLI does not name a sidebar group or a URL path

"Machines in the sidebar" survives a nav reshuffle; "Settings → Workspace →
General → Machines" is the kind of four-level path that goes stale the next
time anything moves — which is precisely how this bug happened. A bare `/machines`
URL is worse still, because the CLI does not know the deployment's host.

## Checklist

- [x] All four strings replaced; no occurrence of `Runtimes` or `Settings →`
      remains in `pair.ts`
- [x] `grep -rn "Workspace → Runtimes\|→ Runtimes" packages/core/src` → no
      matches (checks for a fifth occurrence this task did not know about)
- [x] `grep -rni "settings" packages/core/src/cli/` reviewed — any other CLI
      that sends a user to Settings for pairing is corrected too
- [x] `pnpm --filter @sparstrow/core test` and `pnpm typecheck` green
- [x] Bug file flipped to 🟢 resolved with a filled-in **Resolution** section
      naming the new destination and this task
- [x] [`../../bug/README.md`](../../bug/README.md) index row flipped to
      🟢 resolved

## Traps

**There are four occurrences, not three.** The bug file's Symptom section lists
lines 36, 48, 68 and 119 but formats the first two as one bullet, which reads
like three. Check all four.

**Do not update the bug file's Symptom section.** A bug report is a historical
record of what was observed; it stays as written. Only **Status** and
**Resolution** change (see [`../../bug/README.md`](../../bug/README.md)).

**`--help` output is the first thing a user sees on a new machine.** Read the
whole `HELP` block after editing, not just the changed lines — it is a template
literal interpolating `config.secretsDir` and `config.cloudUrl`, and a stray
edit to its indentation reflows the printed help.

## Verification

- [x] `node packages/core/dist/cli/pair.js --help` (or the equivalent
      `pnpm --filter @sparstrow/core` invocation) prints a GETTING A CODE
      section naming Machines and not Runtimes
- [x] `sparstrow pair --status` on an unpaired machine prints the corrected
      line
- [~] The `--unpair` note is confirmed by running it on a machine paired to a
      throwaway workspace, or read in [T-M8-05](T-M8-05-verification.md) if no
      such machine exists yet

## On completion

- [x] Tick 10.4 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
- [x] Update this file's **Status** row and the phase README's task table
- [x] Bug file and bug index updated (above)

## Result

**Landed 2026-08-18.** All four strings replaced; grep confirms no `Runtimes`
and no `Settings ->` anywhere in `packages/core/src/cli/`, and there was **no
fifth occurrence**. Full Resolution, including the exact new wording, is in
[the bug file](../../bug/BUG-2026-08-16-pairing-path-wrong-in-cli.md), now green.

### Verified by running the CLI, which is what the original report could not do

The bug was found by reading two files. This fix was checked by building the
real bundle (`pnpm --filter @sparstrow/core build:cli`) and executing it:

- `sparstrow pair --help` -- the `GETTING A CODE` section names Machines; the
  template literal still interpolates `secretsDir` and `cloudUrl` correctly; the
  block's indentation is unchanged, which the task's trap specifically warned
  about.
- `sparstrow pair --status` -- on this unpaired machine, prints the corrected
  line.

`--unpair` was **not** run: it needs a machine paired to a throwaway workspace,
and there isn't one. Left for `T-M8-05`. The string was read in place.

### The caveat that matters more than the fix

**The CLI now names a page that does not exist yet.** `T-M8-02` and `T-M8-03`
build and register `/machines`, and both are held while the design system is
rebuilt in a parallel worktree. Until they land, the CLI points at a
destination that is *about* to exist.

That is the trade this task's `Depends on: -` always implied -- the alternative
was pointing at the Settings card and then editing all four strings a second
time within the same milestone. It is worth restating because the hold makes the
window longer than "a few days".

**The Knowledge Center was deliberately left alone.**
[`first-run-setup.md:53`](../../../packages/ui/src/content/knowledge/first-run-setup.md:53)
and [`settings.md:27`](../../../packages/ui/src/content/knowledge/settings.md:27)
both say **Settings -> Machines**, which is *correct today* -- the card really
is there. Rewriting them to name a sidebar page would be documenting something
not built, which AGENTS.md 3.2 names as the dangerous direction of drift. They
get updated by `T-M8-03`, in the change that makes them true. So for now the CLI
and the Knowledge Center disagree, on purpose, and the KC is the one telling the
truth.
