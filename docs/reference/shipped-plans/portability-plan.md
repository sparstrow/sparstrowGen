<!-- /autoplan restore point: /c/Users/gsrih/.gstack/projects/Sparstrowgen/Phase9-Cleanup-autoplan-restore-20260708-203229.md -->

> **Reference — shipped.** Verified against the current code: T1-T4 of this plan's task list
> are implemented (`DEFAULT_VAULT_PATH` removed, `resolveConfig` exported, the `stale-paths`
> factory-health check exists, `daily-backup.ps1` derives the vault path). Matches
> `Fix/portable vault path (#25)`, including the secondary `??`/empty-string bug this plan's
> own eng review flagged. Kept for historical design detail only.

# Remove Hardcoded Paths and Prevent Link Breakages

> Reviewed via `/autoplan` 2026-07-08 (CEO + Eng, dual-voice: this session + one independent
> subagent per phase, Codex unavailable → `[subagent-only]`). **Final gate: APPROVED.**
> Original draft by Antigravity; this revision narrows and grounds it against the actual
> code (see "Review Appendix" at the bottom for the full audit trail).

This plan closes the hardcoded `C:\Sparstrow` absolute-path surface so the repo can move to
a different drive, plus a lightweight safety net for the one related risk that's bigger than
the path fix itself: agent/project rows already in the DB that store an absolute path which
will silently stop existing the moment the drive changes.

## Reframe (why this plan is smaller — and different — than it first looked)

`packages/core/src/config.ts` already resolves `repoRoot`, `dataDir`, `agentsDir`,
`secretsDir`, `memoryMcpPath`, and `memoryCliPath` **dynamically** (`findRepoRoot()` walks up
from `import.meta.url` to find `pnpm-workspace.yaml`; the rest derive from that or from
`os.homedir()`). The **only** hardcoded absolute path left in source is
`DEFAULT_VAULT_PATH` in `packages/shared/src/constants.ts:6`, consumed by exactly one call
site (`config.ts:85`) — not by the UI/browser, despite the original draft's uncertainty about
that.

The bigger risk isn't in source at all: `agents.cwd` and `projects.root_dir` are `TEXT`
columns (`packages/core/src/db/schema.ts`) that already hold absolute paths for every
existing agent/project row, and are read back across `run-manager.ts`, `provision.ts`,
`git-ops.ts`, `variants.ts`, `terminal/manager.ts`, and three API route files. A drive move
doesn't touch these rows — they keep pointing at the old, now-nonexistent path, and the
failure shows up later as a confusing spawn/git error, not as an obvious "you moved drives"
message. This plan does **not** migrate that data (out of scope, see below) but adds a
visible warning so the failure is loud instead of silent.

## Decisions (supersedes "Open Questions")

1. **Vault fallback = `path.join(path.dirname(repoRoot), "memory")`, computed in
   `config.ts`, not as a constant in `shared`.** Verified empirically: on this machine this
   resolves to `C:\Sparstrow\memory` — byte-identical to today's `DEFAULT_VAULT_PATH`. It
   mirrors the exact pattern `dataDir`/`agentsDir` already use one line above it. Putting the
   resolution in `config.ts` (which already owns `repoRoot`) instead of `shared/constants.ts`
   (which doesn't have `repoRoot`) also kills the original draft's "is this browser code"
   ambiguity outright — the constant it worried about no longer exists.
2. **No DB migration for `agents.cwd` / `projects.root_dir` in this plan.** A full migration
   is real work (path-relativization at write time, resolution at read time, touches 6+
   call sites) and doesn't even help with *this* move — existing rows are already stale
   before any migration code would ship. Instead: a **warning-only factory-health check**
   (below) so stale rows degrade loudly, not silently. Full migration is deferred to
   TODOS.md as its own ticket.

## Proposed Changes

### Core Configuration

#### [MODIFY] `packages/shared/src/constants.ts`
- Delete `DEFAULT_VAULT_PATH` entirely (line 6). Nothing outside `config.ts` imports it.

#### [MODIFY] `packages/core/src/config.ts`
- Remove the `DEFAULT_VAULT_PATH` import (line 6).
- Replace line 85:
  ```ts
  const vaultPath = process.env.SPARSTROW_VAULT ?? DEFAULT_VAULT_PATH;
  ```
  with:
  ```ts
  const vaultPath = process.env.SPARSTROW_VAULT?.trim() || path.join(path.dirname(repoRoot), "memory");
  ```
  The switch from `??` to `||` (on an already-`.trim()`'d value) also closes a real, currently-
  live gap: `??` only substitutes on `null`/`undefined`, not on `""`, so a set-but-empty
  `SPARSTROW_VAULT` env var silently resolves to an empty path today. Same latent gap exists
  on `SPARSTROW_DATA_DIR` (line 84) and `SPARSTROW_SECRETS_DIR` (line 94) — not fixed here
  (stay in scope), noted in TODOS.md.
- Export `resolveConfig` (currently unexported, line 83) so tests can call it directly with a
  monkeypatched `process.env.SPARSTROW_VAULT` instead of only asserting on the frozen
  `config` singleton (evaluated once at import time).

#### [ADD] `packages/core/src/config.test.ts` (no existing test file for `config.ts` today)
- Test: with `SPARSTROW_VAULT` unset, `resolveConfig().vaultPath` equals
  `path.join(path.dirname(repoRoot), "memory")` — proves the fallback is unchanged in shape
  from the old hardcoded constant (regression safety per the mandatory regression rule: this
  line's behavior is changing for every install that never set `SPARSTROW_VAULT`, which is
  the common case).
- Test: with `SPARSTROW_VAULT=""` (set, empty), `resolveConfig().vaultPath` falls back
  (proves the `??`→`||` fix).
- Test: with `SPARSTROW_VAULT` set to a real value, it's used verbatim.

#### [ADD] `packages/core/src/system/factory-health.ts` — new optional check
Extends the existing `checks` array (same file already does this exact pattern for the vault
itself at lines 40-48: `fs.existsSync` + degrade-with-detail, never crash). Add:
```ts
// Stale stored paths (optional — a per-row problem, not a whole-factory outage).
const staleCwd = db.prepare("SELECT cwd FROM agents WHERE cwd IS NOT NULL").all() as { cwd: string }[];
const staleRoot = db.prepare("SELECT root_dir FROM projects WHERE root_dir IS NOT NULL").all() as { root_dir: string }[];
const missing = [...staleCwd.map(r => r.cwd), ...staleRoot.map(r => r.root_dir)]
  .filter(p => !fs.existsSync(p));
checks.push({
  id: "stale-paths",
  label: "Agent/project paths",
  status: missing.length === 0 ? "ok" : "degraded",
  detail: missing.length === 0 ? "all resolve" : `${missing.length} stored path(s) not found on disk — see affected agents/projects in Settings`,
  required: false,
});
```
Uses `getSqlite()`, already imported in this file. `required: false` — matches the file's own
convention that a stale row degrades the factory, it doesn't disarm it. This makes the
warning visible in the same Settings → Factory-health panel that already surfaces vault/PAT/
graph-engine status, no new UI surface needed.

### Scripts

#### [MODIFY] `packages/core/scripts/daily-backup.ps1`
- Remove the hardcoded `$gen`, `$vault`, `$dbDest` (lines 8-10).
- Compute `$gen` via `$PSScriptRoot\..\..\..` (script lives at
  `packages/core/scripts/`, repo root is three levels up) — not `Get-Location`/`$PWD`, since
  this script is a Task Scheduler entry point invoked with no cwd guarantee.
- `$vault = $env:SPARSTROW_VAULT` if set, else `Join-Path (Split-Path $gen -Parent) 'memory'`
  — same precedence and same fallback shape as `config.ts`.
- Compute `$dbDest` from `$vault`.

#### [MODIFY] `packages/core/scripts/backup-db.mjs`
- Update the line-6 comment's example path from `C:/Sparstrow/memory/...` to a relative/
  env-var-based example. No behavioral change — the script itself takes paths as argv, it was
  only the doc comment that hardcoded a drive.

### Documentation (optional, low-risk, do alongside the code change)
Swap literal `C:\Sparstrow` for a generic placeholder in: `AUDIT.md`,
`docs/agent-git-automation.md`, `docs/reframe-plan.md`, `docs/team-workspace-northstar.md`,
`fable-handoff/FABLE_START_HERE.md`.

### Operational note (not code — add to your own runbook)
If you already have a Windows Task Scheduler entry registered for `daily-backup.ps1`
pointing at the current `C:\Sparstrow\Sparstrowgen` path, moving the repo won't update that
registration automatically — re-point it (or re-register) after the move. Not something this
plan can fix in code; flagging so it isn't a silent post-move surprise.

## NOT in scope
- **Full DB migration of `agents.cwd` / `projects.root_dir` to relative storage** — real
  value, real effort (6+ call sites), doesn't help the move already about to happen. Deferred
  to TODOS.md as its own ticket.
- **Fixing the same `??`/empty-string gap on `SPARSTROW_DATA_DIR` and `SPARSTROW_SECRETS_DIR`**
  — same latent bug, different lines; out of the blast radius of a "vault path" plan. Noted
  in TODOS.md.
- **A Task Scheduler auto-detection/re-registration tool** — this machine has no in-repo
  script that registers the scheduled task, so there's nothing to make portable; it's a
  manual operator step either way.

## What already exists (reused, not rebuilt)
- `repoRoot`/`dataDir`/`agentsDir`/`secretsDir`/`memoryMcpPath`/`memoryCliPath` resolution in
  `config.ts` — this plan's vault-path fix reuses the exact same pattern, adds no new
  resolution strategy.
- `factory-health.ts`'s degrade-with-reason check pattern — the stale-paths check is a new
  row in an existing table, not new infrastructure.
- `vitest` test runner, already wired repo-wide (`pnpm test`); `config.test.ts` is a new file
  using existing tooling.

## Architecture (unchanged shape, one new degrade-path)
```
                         SPARSTROW_VAULT env var
                                  │
                     set (non-empty)   unset / empty
                                  │
                                  ▼
                     path.join(dirname(repoRoot), "memory")
                                  │
                                  ▼
                          config.vaultPath
                                  │
                    ┌─────────────┴─────────────┐
                    ▼                            ▼
        factory-health: "vault"          factory-health: "stale-paths"  ← NEW
        (does vaultPath itself exist?)   (do stored agent.cwd /
         existing check, unchanged)       project.root_dir rows exist?)
                    │                            │
                    └──────────► Settings → Factory-health panel
                                  (existing UI, no new surface)
```

## Failure modes
| Codepath | Failure | Test? | Error handling? | User sees |
|---|---|---|---|---|
| `resolveConfig()` fallback | `SPARSTROW_VAULT` unset, `../memory` doesn't exist (e.g. fresh clone without the sibling vault) | New: covered by `config.test.ts` shape assertion, not existence | `factory-health` "vault" check already reports `missing: <path>` (pre-existing, unchanged) | Factory-health panel shows vault degraded — was already the behavior pre-plan |
| `SPARSTROW_VAULT=""` | Set-but-empty env var | New: covered by `config.test.ts` | Fixed by `??`→`\|\|` change | Resolves to fallback instead of silently breaking |
| Stale `agents.cwd` / `projects.root_dir` post-move | Row points at a path that no longer exists | Not unit-tested (DB-state-dependent); manually verifiable by renaming a project dir and reloading Settings | **NEW**: `factory-health` "stale-paths" check, `required: false` | Settings → Factory-health shows a degraded row with a count — previously this failed silently deep in `run-manager`/`git-ops` at spawn/push time |
| `daily-backup.ps1` invoked by Task Scheduler pre-move-fix | Hardcoded `$gen` no longer exists | Manual verification only (PowerShell, no test harness in repo — proportionate for a 30-line script, matches repo convention) | `$ErrorActionPreference = 'Stop'` already throws loudly | Task Scheduler history shows a failed run — this was already true before the plan; the plan makes the *fix* portable, not the failure mode |

No unrescued critical gap: every new/changed codepath above degrades visibly (factory-health
row or thrown PowerShell error) rather than failing silently.

## Test Plan

### Automated
- `packages/core/src/config.test.ts` (new): the 3 cases above.
- `pnpm typecheck && pnpm test` — both must be green (confirms the `constants.ts` deletion
  doesn't break any other import — verified today only `config.ts` imports it).

### Manual
1. Unset `SPARSTROW_VAULT`, start the dev server, confirm it resolves to the sibling
   `../memory` directory (unchanged from today's actual location on this machine).
2. Set `SPARSTROW_VAULT=""` (empty), confirm it falls back instead of resolving to `""`.
3. Run `daily-backup.ps1` from a path other than the repo root (e.g. via Task Scheduler's
   working directory, which is not guaranteed to be the repo) — confirm `$PSScriptRoot`
   resolves correctly regardless of invocation cwd.
4. Rename a project's `root_dir` on disk (simulating a stale row) and reload
   Settings → Factory-health — confirm the new "stale-paths" check reports it as degraded,
   not silently ignored.
5. After the actual C: → D: move: reload the app, confirm factory-health is fully green
   (vault + stale-paths both `ok`) before trusting the install.

## Implementation Tasks
- [ ] **T1 (P1, human: ~15min / CC: ~5min)** — config — Delete `DEFAULT_VAULT_PATH` from
  `packages/shared/src/constants.ts`; update `config.ts` to compute the fallback inline and
  switch `??` to `.trim() || `.
  - Files: `packages/shared/src/constants.ts`, `packages/core/src/config.ts`
  - Verify: `pnpm typecheck`
- [ ] **T2 (P1, human: ~20min / CC: ~10min)** — config — Export `resolveConfig`; add
  `packages/core/src/config.test.ts` with the 3 cases (unset, empty, set).
  - Files: `packages/core/src/config.ts`, `packages/core/src/config.test.ts`
  - Verify: `pnpm test`
- [ ] **T3 (P2, human: ~30min / CC: ~10min)** — factory-health — Add the `stale-paths`
  optional check querying `agents.cwd`/`projects.root_dir`.
  - Files: `packages/core/src/system/factory-health.ts`
  - Verify: manual check #4 above; existing factory-health tests (if any) stay green
- [ ] **T4 (P1, human: ~20min / CC: ~10min)** — scripts — Rewrite `daily-backup.ps1` to
  compute `$gen`/`$vault`/`$dbDest` dynamically; fix the doc comment in `backup-db.mjs`.
  - Files: `packages/core/scripts/daily-backup.ps1`, `packages/core/scripts/backup-db.mjs`
  - Verify: manual checks #3 above
- [ ] **T5 (P3, human: ~20min / CC: ~10min)** — docs — Swap `C:\Sparstrow` for a generic
  placeholder in the 5 docs listed above.
  - Files: `AUDIT.md`, `docs/agent-git-automation.md`, `docs/reframe-plan.md`,
    `docs/team-workspace-northstar.md`, `fable-handoff/FABLE_START_HERE.md`
  - Verify: grep for `C:\\Sparstrow` returns only the intentional example placeholders

## Completion Summary
- Step 0 / Premise: reframed and **confirmed by user** — narrow 3-file fix + warning-only
  safety net for the DB-stored-path risk (not a full migration).
- CEO review: 10/10 sections evaluated (Section 11 skipped, no UI scope). Dual voice:
  `[subagent-only]` (Codex not installed on this machine) — 6/6 consensus dimensions,
  zero disagreements.
- Eng review: 4/4 sections evaluated (Architecture, Code Quality, Test, Performance). Dual
  voice: `[subagent-only]` — full consensus, zero disagreements, one additional latent bug
  found independently by the subagent (`??`/empty-string, also present on 2 other env vars).
- DX review: **triage-only, by design** — this is single-user internal tooling with no
  README/external onboarding funnel and no separate developer audience from the founder
  themselves; the full persona-interrogation/competitive-benchmark ceremony (Stripe/Vercel
  tier comparisons) doesn't fit the artifact. Relevant slices only: error-message quality
  (already good — factory-health's `missing: <path>` pattern, extended not replaced) and
  env-var naming convention (`SPARSTROW_VAULT` already matches the existing `SPARSTROW_*`
  family). Noted explicitly rather than silently skipped.
- NOT in scope: written (3 items).
- What already exists: written (3 items reused).
- Failure modes: 4 codepaths mapped, 0 unrescued critical gaps.
- Test plan: 3 automated cases (new file) + 5 manual steps.
- TODOS.md candidates: DB path migration (full), `??`/empty-string on 2 other env vars —
  presented to user at the final gate, not auto-added.
- Taste decisions requiring user input at the gate: **0** — both dual-voice phases reached
  full independent consensus, nothing borderline to arbitrate.
- User challenges: **0** — the one scope question (how far to extend past the plan's literal
  3 files) was resolved at the Phase 1 premise gate, confirmed by the user.

## Review Appendix — audit trail
| # | Phase | Decision | Classification | Principle | Rationale |
|---|-------|----------|-----------------|-----------|-----------|
| 1 | CEO 0A | Reframe: narrow 3-file fix is right-sized, but the plan's own "Open Question 2" (DB-stored paths) is the actually load-bearing risk, not an optional aside | Premise (user-gated) | — | Two independent reviews (this session + subagent) converged unprompted; **user confirmed** at the Phase 1 gate |
| 2 | CEO 0C-bis | Approach: vault fallback computed in `config.ts` (matches `dataDir`/`agentsDir` pattern), not left as a `shared` constant | Mechanical | P5 explicit/consistent | Only one call site; removes the plan's own browser-code ambiguity entirely |
| 3 | CEO 0D | Cherry-pick: warning-only `factory-health` check for stale DB paths | Mechanical (auto-approved) | P2 boil lakes — in blast radius, <1 day CC effort | Reuses 100% of an existing pattern in the same file |
| 4 | CEO 0D | Cherry-pick: fix `??`→`\|\|` empty-string gap on the same line being edited | Mechanical (auto-approved) | P2 boil lakes | Same line, near-zero incremental cost, independently found by both voices |
| 5 | CEO 0D | Deferred: full DB path migration (relative storage + resolve-at-read) | Mechanical (auto-deferred) | P3 pragmatic | Real value, real effort (6+ call sites), doesn't fix the imminent move; → TODOS.md |
| 6 | CEO 0D | Deferred: same `??`/empty-string fix on `SPARSTROW_DATA_DIR`/`SPARSTROW_SECRETS_DIR` | Mechanical (auto-deferred) | P3 pragmatic | Real bug, different blast radius than a "vault path" plan; → TODOS.md |
| 7 | Eng §1 | `$PSScriptRoot`, not `$PWD`/`Get-Location`, for `daily-backup.ps1` | Mechanical | Layer 1 (Search Before Building) | Script is a Task Scheduler entry point — no cwd guarantee |
| 8 | Eng §3 | Add `config.test.ts`; export `resolveConfig` to make it testable | Mechanical | Eng preference: "well-tested code is non-negotiable" | Zero existing coverage on `config.ts`; this line's behavior changes for every install that never set `SPARSTROW_VAULT` (regression rule) |
| 9 | DX | Applicability: triage-only DX pass, full ceremony skipped with reason | Mechanical (auto-decided) | P5 explicit over clever | No README/external dev audience exists for this single-user tool; running Stripe-tier competitive benchmarks on an internal config fix is the over-engineering this same review exists to catch |

**Final gate: APPROVED** — 0 open taste decisions, 0 user challenges beyond the resolved
premise gate. Ready for implementation per the 5 tasks above.
