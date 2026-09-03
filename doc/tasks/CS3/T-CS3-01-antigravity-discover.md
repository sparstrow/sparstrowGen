# T-CS3-01 — `agy models` discovery in the provider

| | |
|---|---|
| **Tag** | `[P]` — touches only `antigravity.ts`/`types.ts`, no shared file with T-CS3-02 |
| **Serves** | foundational — unblocks CS4 |
| **Depends on** | — |
| **Blocks** | T-CS3-03 |
| **Phase spec** | [README.md](README.md) |
| **Status** | done (2026-08-28) |

## Objective

Add `discoverModels()` to `AntigravityCliProvider`, spawning `agy models` the
same way `healthCheck()` already spawns `agy --version`, and add the
optional method to the `CliProvider` interface it implements.

## The shape of what was found

A real `agy` v1.1.22 install **was** reachable in this environment — but the
task's own plan (spawn `agy models` via `execFile`, mirroring
`healthCheck()`'s `--version` call) does not work at all, for a reason
nothing in the plan anticipated:

**`agy models` requires a real TTY.** It renders an animated spinner
("⠋ Fetching available models...") via ConPTY cursor-control sequences
before printing the list. Run through a plain pipe — `execFile`, no `shell`,
no pty, exactly what `healthCheck()`'s own `--version` call already does
successfully — it **hangs indefinitely**. Node's own `timeout` option is the
only thing that ever ends it, and even then the child is killed
(`signal: 'SIGTERM'`), not a clean exit. This is specific to the `models`
subcommand's interactive listing UI: `--version`, and the real
`--print`/`--output-format stream-json` headless spawn this class already
does for actual agent runs, have never had this problem.

The fix: `node-pty`, already a dependency in this monorepo for the Terminals
feature (`packages/core/src/terminal/manager.ts`). Spawning through it gives
the child a real pseudo-terminal, and the identical command then exits 0
with the real list — verified directly, not assumed. Two consequences:

1. Output arrives as raw terminal bytes, not clean lines: ANSI cursor/clear
   sequences, the spinner's braille glyphs, `\r\n` endings, and the two
   columns (`<slug>` and `<Display Label>`) separated by variable-width
   space padding rather than a tab. `parseAgyModelsOutput` (exported,
   `antigravity.ts`) turns that back into the label list — verified against
   a byte-for-byte captured real transcript, not a hand-guessed fixture.
2. On Windows, `node-pty` needs the extension-qualified binary name
   (`agy.exe`) — the bare `agy` that `execFile`/the OS shell resolve fine
   elsewhere gives ConPTY a literal "File not found". Handled with a
   `win32`-only `.exe` suffix in `discoverModels()`, not a change to
   `config.antigravityPath` (which every other call site still uses
   unqualified, successfully).

Also settled empirically, not by inference: `discoverModels()` returns the
**label** column ("Gemini 3.7 Flash (High)"), not the slug
("gemini-3.7-flash-high"). The label is the exact form `KNOWN_MODELS.antigravity`
already carries and `--model` is verified to accept
(`buildHeadlessSpawn`'s own comment, confirmed at agy v1.1.0). The slug is
confirmed only for the interactive `/model` command's newer "by name, slug
or label" matching (1.1.22 changelog) — never proven for the `--model` flag
this class actually spawns with. Returning the slug would risk CS4's picker
persisting a session on a model string headless spawns can't use.

## Checklist

- [x] `CliProvider.discoverModels?(): Promise<CliModelDiscovery>` added to
      `types.ts`
- [x] `AntigravityCliProvider.discoverModels()` implemented via `node-pty`,
      not `execFile` — see above
- [x] `parseAgyModelsOutput` extracted as its own exported function,
      independently unit-tested against a real captured transcript
- [x] `claude-code.ts` untouched — it does not implement this method
- [x] Unit tests: real transcript → correct label list; nonzero exit →
      falls back to `listModels()` with `live: false` and a detail message;
      spawn throwing (binary not found) → same fallback
- [x] `packages/core` typecheck and tests green (755 tests)

## Traps

- **`agy models`'s TTY requirement is not documented anywhere in `agy
  --help`** — a future `agy` upgrade could change this subcommand's
  behavior again without any changelog signal this repo would catch short
  of re-running this task's own live check. If discovery starts silently
  degrading to `live: false` in production, re-verify this exact assumption
  first.
- **`config.antigravityPath` is deliberately NOT changed to include `.exe`**
  — every other call site (`healthCheck`, `buildHeadlessSpawn`) resolves the
  bare name fine via `execFile`'s own PATH handling. Only `node-pty`'s
  ConPTY layer needs the qualified name, so the `.exe` suffix is applied
  locally inside `discoverModels()`, not to the shared config value.
- **The captured transcript fixture includes real, unrelated noise** (OSC
  title-set sequences from other processes sharing the console at capture
  time) — this is deliberate, not cleaned up, because it's exactly the kind
  of chrome a real pty transcript actually contains and the parser has to
  survive.

## Verification

- [x] Unit tests pass (see Checklist)
- [x] Live, unmocked, end-to-end: called the actual (not test-mocked)
      `discoverModels()` against the real installed `agy` v1.1.22 — returned
      `live: true` with all 14 real current models
- [x] Compared against `KNOWN_MODELS.antigravity`: confirmed real drift —
      **Gemini 3.7 Flash and 3.6 Flash (all three effort tiers each) are
      missing from the static list**, which is the exact gap the owner's
      original feedback screenshot showed. This is the bug CS3/CS4 exist to
      fix, reproduced firsthand, not assumed.

## On completion

- [x] `pnpm --filter @sparstrow/core typecheck` and `test` green
- [x] Update this file's **Status** row
- [ ] Open the PR into `band/26-chat-session-and-conversation-ux`, then
      `gh pr merge <n> --auto --squash`
- [ ] Update the phase README's task table

> **Do not edit [`../MasterTaskQueue.md`](../MasterTaskQueue.md) from a task
> branch.**

## Result

**2026-08-28 — done, materially different from plan.** The plan's
`execFile`-based approach does not work — `agy models` requires a real TTY
and hangs indefinitely on a plain pipe. Replaced with `node-pty` (already a
dependency here for Terminals), which resolves it cleanly. Full finding
above under "The shape of what was found" — this is exactly the kind of
thing decomposition-time reading is supposed to catch before it becomes a
production surprise, and here it would have: shipping the original plan's
code verbatim would have meant `discoverModels()` degrading to the static
list (via its own 20s timeout) on every single call in real use, silently
defeating the entire feature while every unit test built against a mocked
`execFile` stayed green.

Verified live, unmocked, twice: once via a standalone script calling the
real method against the real `agy` binary (14 models, `live: true`), and
once through the full test suite with `node-pty` itself mocked (34/34
antigravity tests, 755/755 `packages/core` overall). The real vs. static
comparison confirms genuine drift — 3.7/3.6 Flash entirely missing from
`KNOWN_MODELS.antigravity` — which is direct, firsthand confirmation of the
exact bug the owner's feedback reported.
