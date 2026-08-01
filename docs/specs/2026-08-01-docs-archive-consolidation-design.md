# Docs archive consolidation

Date: 2026-08-01 · Status: **approved** · Supersedes: decision **D-B** in
`docs/planned/factory-workflow-v2.md` §Open decisions

## Purpose

Put every frozen document in one place, under a name that says "do not read", so the file layout
enforces the read-path instead of `CLAUDE.md` having to describe it in prose.

## The problem

History is scattered across five locations with three conventions:

| Location | What it is | How it's marked |
| --- | --- | --- |
| `docs/reference/` | audits, shipped plans, superseded sketches | status blockquote per file |
| `docs/intake/` | the retired Listener/Curator capture pool | `> [!WARNING] RETIRED` |
| `docs/planned/` | 3 live specs **mixed with** 2 dead ones | per-file banners |
| `.design-src/` | the page-by-page design era, at the repo **root** | `📦 FROZEN` |
| `fable-handoff/` | the P1–P10 engine plan, at the repo **root** | `📦 FROZEN` |

Two consequences:

1. **The repo root advertises history as if it were current.** `.design-src/` and `fable-handoff/`
   sit beside `CLAUDE.md` and `packages/`, so `CLAUDE.md:50` has to carry an explicit "Do NOT read
   these" list. Every cold-start agent pays tokens to learn what the layout could have told it.
2. **`docs/reference/` is already the archive but isn't named like one.** Its README opens by
   saying "nothing here is a live plan" — a name failing to carry its own meaning.

`docs/intake/` is additionally *finished*, not merely retired:
`docs/specs/2026-07-27-intake-backlog-triage-and-sequencing.md` triaged all seven open captures and
declares itself its successor as the live backlog. Nothing in it is waiting on anything.

## Constraints

- **`CLAUDE.md` and `AGENTS.md` carry a pointer, not a description.** Both are amended in this same
  change, but the archive gets **one short section at the end of each file** and no mention anywhere
  in an active workflow section. The contracts state three things — it is off the read-path, no
  method in it may be followed, and it is for investigation only — and nothing more. Detail about
  what the archive contains belongs in `docs/archive/README.md`, not in the build contract.
- **No live scope may be frozen.** Three files in `docs/planned/` look archivable and are not.
- **No pointer may be left dangling** — including comments inside source files.
- Docs-only: no production logic changes, so the TDD iron law's docs exception applies. The 6
  source-file edits are comment text only.

## Approaches considered

**A. Create `docs/archive/` alongside `docs/reference/`.** Rejected: leaves two archives with no
rule for which one a document belongs in — the same disease, one folder worse.

**B. Extend `docs/reference/` in place.** Zero churn on 15 existing paths, but keeps a name that
invites an agent to open a file to check whether it's current. That check is the cost we're
removing.

**C. Rename `docs/reference/` → `docs/archive/` and consolidate everything into it.** Chosen. One
destination, and the name does the work the per-file banners are currently doing alone. Costs 15
path changes and 2 inbound link updates, all inside docs nothing on the read-path points at.

## Design

### The governing rule: names are preserved

Only the parent directory changes.

```
.design-src/     → docs/archive/design-src/
fable-handoff/   → docs/archive/fable-handoff/
docs/intake/     → docs/archive/intake/
docs/reference/  → docs/archive/
```

This is the mitigation for the one real risk the change creates. Moving a file breaks every pointer
to it; preserving the basename means every stale pointer still resolves by grep.
`ENGINEERING_PLAN.md` is findable whether or not the reader knows it moved.

### Result

```
docs/
  archive/          ← everything frozen, off the read-path as a whole
    audits/  shipped-plans/  superseded/  intake/  design-src/  fable-handoff/
  deferred/         the freezer, with a revival trigger per entry
  planned/          pre-superpowers architecture specs that are still live
  specs/  plans/    current work
```

The repo root keeps only live directories.

### What stays live — the trap in this change

Three files in `docs/planned/` read as archivable and are not:

- **`phase6-hosted-foundation.md`** — the active architecture for 6a–6f.
- **`multi-tenancy-access-architecture.md`** — named on `CLAUDE.md`'s read-path as Phase 6's vision
  parent. Considered, never built from, but not history.
- **`verification-agent-gym-app.md`** — the subtle one. It is an approved `/office-hours` plan from
  the retired era, which makes it *look* superseded. The triage spec disagrees: intake 0006's
  design is approved, reviewed twice, and "ready to plan". Archiving it would freeze live scope.

Moving out: `factory-workflow-v2.md` (superseded 2026-07-26) and `curator-office-hours-parity.md`
(void — every file it edits was deleted).

### `docs/project-delete-plan.md` goes to the freezer, not the archive

A tracked orphan at the `docs/` root, marked "DRAFT — NOT yet reviewed or approved". Verified never
built: no `deleted_at` column in `schema.ts`, no `deleted-projects` path, no trash/restore code
anywhere in `packages/`.

That makes it **deferred scope, not history** — the archive is for what was done or abandoned, and
this was neither. It moves to `docs/deferred/` with the contract's freezer header, body kept whole,
following the `legacy-freezer.md` precedent of keeping a large document intact rather than
summarising it.

## Success criteria

1. `docs/archive/` is the only archive; the repo root shows no history directories.
2. `pnpm typecheck && pnpm test` green — proving the 6 comment edits touched nothing real.
3. A repo-wide grep for `docs/reference`, `.design-src`, `fable-handoff/`, `docs/intake` returns
   only intentional `docs/archive/…` paths.
4. `git log --follow` still traverses a moved file's history.
5. The gitignored `design-src/**/decoded/` artifacts stay ignored, not resurfacing as untracked.

## Testing

No production code changes, so no new tests. Per the Definition of Done, the docs-only exception
covers item 2 by having built nothing; items 3–7 are satisfied by the success criteria above plus
`pnpm --filter @sparstrow/ui build`, which proves nothing in the build path resolved a moved path.

The Knowledge Center needs no update: `packages/ui/src/content/knowledge/` contains zero references
to any moved path, and this change adds no user-facing surface or workflow. Decided explicitly.

## Out of scope

- `Research/`, `TODOS.md`, `description.md` stay untracked, by the owner's decision. Consequence
  recorded: `docs/deferred/legacy-freezer.md:89` links to `TODOS.md`, which is not in the repo, so
  that link dangles for anyone who clones — before and after this change.
- `docs/speckit-constitution` is not touched. It is live in another session, and squash-merging a
  branch someone is still committing to leaves it permanently diverged from `staging`.
