# Port and data-dir isolation for parallel dev servers

## Why

The packaged desktop app spawns `@sparstrow/core` directly and never sets
`SPARSTROW_PORT`/`SPARSTROW_DATA_DIR`, so it always owns port `48750` and the default
data directory. Any dev or preview stack — including one inside a worktree — MUST set
both vars to something else, or it collides with the always-on app. This is enforced
by convention, not by code, so get the values right by hand.

## The two layers

**1. A single "dev preview" stack** (no worktree, just testing something without
touching the packaged app): use the existing preset.

```bash
pnpm dev:preview:core   # SPARSTROW_PORT=48751, SPARSTROW_DATA_DIR=<repo>/data-preview
pnpm dev:preview:ui     # ui dev server, proxies to the core above
```

This runs [scripts/dev-preview.mjs](../../../../scripts/dev-preview.mjs), which
defaults `SPARSTROW_PORT` to `48751` and `SPARSTROW_DATA_DIR` to `<repo>/data-preview`
via `??=` — an explicit override still wins if you need a second preview stack
running at the same time.

**2. A worktree-scoped stack** (parallel agent work in its own worktree, needs its own
running app to verify against): add a pair of presets to
[.claude/launch.json](../../../launch.json) that pin a **unique port** and point
`SPARSTROW_DATA_DIR` at a `data-preview` folder **inside that worktree**, with `cwd`
set to the worktree path. Existing example (`wt001-core` / `wt001-ui`):

```json
{
  "name": "wt001-core",
  "runtimeExecutable": "node",
  "runtimeArgs": [
    "-e",
    "const wt='<absolute worktree path>';process.env.SPARSTROW_PORT='48752';process.env.SPARSTROW_DATA_DIR=wt+'\\\\data-preview';require('child_process').spawn('pnpm',['--filter','@sparstrow/core','start'],{cwd:wt,stdio:'inherit',shell:true,env:process.env}).on('exit',c=>process.exit(c??0))"
  ],
  "port": 48752
}
```

The matching `ui` preset uses the same `SPARSTROW_PORT` (so its Vite proxy targets
the right core) and its own dedicated Vite port with `--strictPort` so it fails loudly
on collision instead of silently picking a different port:

```json
{
  "name": "wt001-ui",
  "runtimeExecutable": "node",
  "runtimeArgs": [
    "-e",
    "const wt='<absolute worktree path>';process.env.SPARSTROW_PORT='48752';process.env.SPARSTROW_DATA_DIR=wt+'\\\\data-preview';require('child_process').spawn('pnpm',['--filter','@sparstrow/ui','dev','--','--port','5174','--strictPort'],{cwd:wt,stdio:'inherit',shell:true,env:process.env}).on('exit',c=>process.exit(c??0))"
  ],
  "port": 5174
}
```

## Allocating a new port pair

Check `.claude/launch.json` for every `port` already in use and pick the next free
values — there's no registry beyond that file. Convention so far: core ports climb
from `48751`, ui ports climb from `5174`. Two worktrees must never share a port or a
`SPARSTROW_DATA_DIR` — sharing either means one instance's SQLite lock blocks the
other, or one silently overwrites the other's per-install token.
