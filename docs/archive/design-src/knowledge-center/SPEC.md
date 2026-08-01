# SPEC — Knowledge Center (`/knowledge`)

> **Origin:** intake [`docs/intake/0003-knowledge-center-tab-2026-07-13.md`](../../docs/intake/0003-knowledge-center-tab-2026-07-13.md)
> (Curator: `routed`, fast-track D2=B — entered the pipeline at SPEC, Claude Design +
> office-hours skipped by explicit user decision; the subpage IA is therefore locked HERE).

## What it is

A **Knowledge Center** tab: the in-app tutorial for the whole product. Every workflow, its
notes, and its limitations, written fresh for a *user* (not a contributor) — readable by the
operator today and good enough to onboard a future teammate cold. Content can include media,
diagrams (ASCII/code-block for v1), and artifacts.

## Scope (LOCKED — via Curator session, fast-track)

- **One build + one process addendum.** No auto-regeneration software. "Stays current" =
  a mandatory checklist step in `FACTORY-LOOP.md` §⑤: whoever ships a feature updates the
  matching Knowledge Center article **in the same PR**.
- **Update policy (user's words, D1):** write for user understanding — include what changed
  *for a user*, skip line-by-line/internal code trivia.
- **v1 done =** every workflow documented, tutorial-style, as subpages (one per concept).

## Architecture ([NEW] unless noted)

- **Content = markdown files in the repo:** `packages/ui/src/content/knowledge/NN-slug.md`,
  one file per tutorial concept, with a tiny frontmatter block
  (`title`, `section`, `description`, `order`, `updated`). Loaded at build time via Vite
  `import.meta.glob(..., { query: '?raw' })` — **no backend, no new deps, no DB**. Living in
  the repo is what makes the checklist step work: docs diff rides in the feature PR.
- **Loader** `packages/ui/src/lib/knowledge.ts`: parses frontmatter, exposes the ordered,
  section-grouped article registry + lookup by slug.
- **Renderer [EXISTS]:** reuse `components/chat/markdown.tsx` (`Markdown`) — GFM + highlight,
  already theme-correct.
- **Routes:** `/knowledge` (index: section-grouped cards + client-side text filter) and
  `/knowledge/$articleId` (article: sidebar nav of all articles, rendered markdown,
  prev/next footer). Nav entry in `app-shell.tsx` (icon `BookOpen`), between Memory and
  Terminals.
- **Media convention:** images go in `packages/ui/public/knowledge/` and are referenced
  as `/knowledge/<file>.png` from markdown. Diagrams in v1 are fenced ASCII blocks;
  Mermaid rendering is a deliberate later enhancement (new dep — out of fast-track scope).

## Information architecture (LOCKED — the office-hours substitute)

| Section | Articles |
|---|---|
| **Getting started** | What is Sparstrowgen · First-run setup · Create your first agent · Run it and read the results |
| **Surfaces** | Dashboard · Agents & Imports · Teams & the Manager Agent · Projects & workspaces · Tasks & Goals · Chat & Inbox · Runs & transcripts · Pipelines · Schedule · Memory · Terminals · Settings |
| **Concepts** | Providers & execution modes · Tool permissions · Delegation & swarms · Git automation & profiles |
| **Reference** | Limitations & gotchas · How these docs stay current |

Empty state: n/a — content ships with the build. A missing/unknown slug renders a
not-found card linking back to the index.

## Backend delta

None. Pure UI + content.

## Failure modes

- Malformed frontmatter → loader falls back to filename-derived title, article still renders.
- Unknown `$articleId` → not-found card, link back to `/knowledge`.
- Search with no hits → "no matches" hint, clear-filter affordance.

<!-- AUTONOMOUS DECISION LOG -->
Fast-track (Curator D2=B): design + office-hours stages intentionally skipped; IA locked in
this SPEC. Decisions D1 (mode: new-feature), P2 (process step, not software) confirmed by
user in Curator session 2026-07-13.
Final gate: APPROVED
