# `packages/desktop` cannot import `@sparstrow/shared` — and `UpdateStatus` is duplicated because of it

- **source:** discovered while fixing the silent update-feed failure, 2026-07-27
- **project:** factory
- **size:** M
- **date:** 2026-07-27
- **links:** `packages/desktop/src/updater.ts`, `packages/ui/src/components/update-banner.tsx`,
  `packages/shared/src/schemas/system-update.ts`

**What:** `CLAUDE.md` states the dependency direction as `ui, core, desktop, memory-* → shared`, and
that logic both sides must agree on — explicitly including **event shapes** — lives in `shared` and
is *never duplicated on both sides*. `packages/desktop` does not honour this, and structurally
cannot today.

The visible symptom is `UpdateStatus`, the shape pushed over the `sparstrow:update-status` IPC
channel. It is declared **twice and independently**: `packages/desktop/src/updater.ts` produces it,
`packages/ui/src/components/update-banner.tsx:15` consumes it, and neither references the other.
`updater.ts` additionally redeclares `BlockingRun`, which already exists in
`packages/shared/src/schemas/system-update.ts` as `UpdateBlockingRun`.

**Why deferred:** it is not a one-line dependency addition. Two independent blockers:

1. **`@sparstrow/shared` ships raw TypeScript.** Its only entry is
   `"exports": { ".": "./src/index.ts" }` — no `main`, no build step, and `"type": "module"`. This
   works for `core` and `ui` because both are bundled (`core` via `build.mjs`, `ui` via Vite), and a
   bundler compiles the TypeScript. Nothing else can consume it.
2. **`packages/desktop` is compiled, not bundled.** `"build": "tsc"` with
   `module: "CommonJS"` and `moduleResolution: "node"`, and Electron's main process runs the emitted
   JS on plain Node. Node10 resolution ignores the `exports` field entirely, so `@sparstrow/shared`
   would not resolve even for typechecking; and if it did, the emitted `require()` would target a
   `.ts` ESM file that Node cannot load. The packaged app would fail at startup.

So unifying the contract requires one of: giving `shared` a real build step emitting JS (affects
every consumer), bundling desktop's main process instead of `tsc`-compiling it, or adding path
mapping that papers over the resolution without fixing the runtime. All three are larger than the
change that surfaced this, and it surfaced during a release fix — the worst moment to alter
packaging.

The fix that shipped instead keeps `shouldSurfaceCheckError` local to `packages/desktop`, tested by
a vitest harness added to that package (it previously had none). That is correct and self-contained,
but it means the *rule* is enforced in one package while the *shape* it operates on stays duplicated.

**Revisit when:** either of the enabling changes is wanted for its own reasons — most likely Phase 6,
which pushes far more shared contract between the daemon and the control plane and will make
desktop's isolation from `shared` progressively more expensive. Doing it then is cheap; doing it now
buys nothing and risks the packaging path.

**Do not fix by:** adding `@sparstrow/shared` to `packages/desktop`'s dependencies without also
solving the build. It will typecheck under some resolution settings and still fail at runtime in the
packaged app only — the worst failure mode available, since `pnpm typecheck` and `pnpm test` both
stay green.
