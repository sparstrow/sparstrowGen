# T-CS3-01 — `agy models` discovery in the provider

| | |
|---|---|
| **Tag** | `[P]` — touches only `antigravity.ts`/`types.ts`, no shared file with T-CS3-02 |
| **Serves** | foundational — unblocks CS4 |
| **Depends on** | — |
| **Blocks** | T-CS3-03 |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

## Objective

Add `discoverModels()` to `AntigravityCliProvider`, spawning `agy models` the
same way `healthCheck()` already spawns `agy --version`, and add the
optional method to the `CliProvider` interface it implements.

## Decisions already made

Phase decisions 1 and interface shape. Implementation, mirroring
`healthCheck()`'s exact pattern (`antigravity.ts:303`):

```ts
async discoverModels(): Promise<{ models: string[]; live: boolean; detail: string | null }> {
  return new Promise((resolve) => {
    execFile(
      config.antigravityPath,
      ["models"],
      { timeout: 20_000, windowsHide: true },
      (err, stdout) => {
        if (err) {
          resolve({ models: this.listModels(), live: false, detail: err.message });
          return;
        }
        const models = stdout
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter((line) => line.length > 0);
        resolve(
          models.length > 0
            ? { models, live: true, detail: null }
            : { models: this.listModels(), live: false, detail: "agy models returned no output" },
        );
      },
    );
  });
}
```

## Checklist

- [ ] `CliProvider.discoverModels?(): Promise<{ models: string[]; live:
      boolean; detail: string | null }>` added to `types.ts`
- [ ] `AntigravityCliProvider.discoverModels()` implemented per the snippet
      above, adjusted once the real `agy models` output format is confirmed
      (see Traps)
- [ ] `claude-code.ts` untouched — it does not implement this method
- [ ] Unit test: mock `execFile` returning multi-line output → parsed model
      array; mock a nonzero-exit error → falls back to `listModels()` with
      `live: false` and the error message in `detail`
- [ ] `packages/core` typecheck and tests green

## Traps

- **The parser above is a guess.** If a real `agy` binary is available in
  this environment, run `agy models` once by hand and confirm the actual
  output shape (plain lines? a header row? JSON?) before trusting the
  snippet — adjust the parser to match reality, and note what you found in
  this task's Result section either way.
- **`config.antigravityPath` is the same config value `healthCheck()` uses**
  — don't introduce a second way to locate the binary.

## Verification

- [ ] Unit tests above pass
- [ ] If a real `agy` install is reachable in this environment: `discoverModels()`
      returns `live: true` with a model list; compare it against
      `KNOWN_MODELS.antigravity` and note any drift found (this IS the bug
      the whole phase exists to fix, so drift here is expected, not a
      failure)
- [ ] If no real `agy` install is reachable: record that in this task's
      Result and in `KnownGaps.md` — the unit-tested fallback path is not the
      same as proving the live path actually works

## On completion

- [ ] `pnpm typecheck` and `pnpm test` green
- [ ] Update this file's **Status** row
- [ ] Open the PR into `band/26-chat-session-and-conversation-ux`, then
      `gh pr merge <n> --auto --squash`
- [ ] Update the phase README's task table

> **Do not edit [`../MasterTaskQueue.md`](../MasterTaskQueue.md) from a task
> branch.**

## Result

<!-- Filled in when the task lands. -->
