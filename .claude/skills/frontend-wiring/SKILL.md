---
name: frontend-wiring
description: >-
  How UI actually gets wired in this repo: where things live in @sparstrow/ui
  and apps/web, the TanStack-Router mock adapter, the shared Zod contracts, the
  four interface states, Knowledge Center sync, and what to run before calling
  a change done. Use during frontend implementation work. It holds the repo
  mechanics, not the design — that is DESIGN.md and design-system/.
metadata:
  sparstrowgen-owner: frontend-builder
---

# Frontend wiring

This skill is the repo half of frontend work: paths, adapters, contracts,
states, and verification. **It decides nothing about how anything looks.**

## Before you write UI (AGENTS.md §3.11 — not optional)

1. **Read the doctrine, do not recall it.** `DESIGN.md` is the design
   instruction — read it in the same turn you build, and read
   `design-system/` alongside it (`system.json` for tokens,
   `guidelines/*.card.html` for the foundations, `components/` for what already
   exists). Neither this skill nor any other restates their rules; a duplicated
   doctrine keeps enforcing itself after the original changes.
   **If `DESIGN.md` is missing, stop and run `design-brief`** rather than
   substituting general design knowledge.
2. **Load `ai-design-slop`** and build without introducing the tells it names.
   Do not narrate the checklist — a screen that announces its own restraint is
   its own tell.
3. **Check the registry before composing a primitive.** Query the `shadcn` MCP
   tools / skill: `list_components`, `get_component`, `get_component_demo` for a
   single primitive; `list_blocks`, `get_block` for a composite surface.
4. Only then write code.

**When the doctrine has no answer**, that is a `DESIGN.md` change needing owner
sign-off — never a quiet exception on one screen. A one-off exception is
invisible to every other agent and becomes an inconsistency nobody can trace
later. `DESIGN.md` §13 exists precisely so an agent asks rather than invents.

## Where things live

- `packages/ui/src/components/ui/` — shadcn primitives (`button.tsx`,
  `card.tsx`, `dialog.tsx`, `empty.tsx`, `skeleton.tsx`, `table.tsx`, …).
  Reuse before adding.
- `packages/ui/src/components/<domain>/` — composed, domain-specific
  components (`board/`, `chat/`, `goals/`, `pipelines/`, `team/`, `canvas/`,
  `layout/`).
- `packages/ui/src/routes/pages/` — the route-level page components,
  written against TanStack Router's API even though the deployed app is
  Next.js.
- `apps/web/src/lib/react-router-mock.tsx` — intercepts the TanStack Router
  hooks/components `@sparstrow/ui` calls (`useRouter`, `useParams`, `Link`,
  …) and resolves them against Next's real `next/navigation`. A route-scope
  option like `{ from: "/runs/$runId" }` on a hook call is accepted and
  ignored here on purpose — Next resolves params from the live URL instead —
  it exists only to keep call sites type-compatible with real TanStack
  Router. Don't "clean up" an apparently-unused option on a hook call inside
  `packages/ui` without checking whether this file is why it's there.
- `packages/ui/src/content/knowledge/` — the Knowledge Center markdown
  articles, referenced below.

## The four states, every surface

Every surface ships Populated, Empty, Loading, and Error together — a
surface with only the populated state is not finished (`doc/templates/
spec.md`, `doc/tasks/README.md`'s Definition-of-done table).

- **Empty** — use `packages/ui/src/components/ui/empty.tsx`. Copy explains
  what to do next and offers the action that does it; never a bare "No
  items."
- **Loading** — use `packages/ui/src/components/ui/skeleton.tsx`, shaped
  like the real content it's standing in for, not a generic spinner.
- **Error** — what failed, in plain words, and the next action. Route-level
  Next.js `error.tsx` boundaries and `sonner.tsx` toasts are both in use in
  this codebase; pick based on whether the failure is page-level or
  action-level.

## Two things that get skipped, every time

Neither is a design decision — both are stated facts a surface either has or
does not.

- **Focus-visible, stated.** Every interactive element has a focus treatment you
  can name, and it comes from the doctrine, not the browser default. A control
  reachable only by mouse is unfinished, not styled.
- **Breakpoints named, not implied.** Say which widths matter for *this* screen
  and what changes at each. "Responsive" described only as desktop behaviour is
  a desktop screen with a claim attached.

## Wiring to contracts

Read the plan's Zod schema + `registerRoute` handler pair before wiring a
form or a data fetch (see the `designing-shared-contracts` skill for how
those pair up). Never invent a field the schema doesn't have. If a form
needs client-side validation beyond what the schema already encodes, derive
it from the schema (`.min()`, `.refine()`, etc. on the existing Zod object)
rather than hand-rolling a parallel check that can drift from it.

## Knowledge Center sync (AGENTS.md §3.2)

Any user-facing behavior change ships its Knowledge Center update in the
**same** change — `packages/ui/src/content/knowledge/*.md`. Re-read the four
global-claim articles (`what-is-sparstrowgen.md`, `first-run-setup.md`,
`limitations.md`, `providers-and-execution-modes.md`) whenever the change
could make one of their claims stale, even if the change didn't touch that
page directly. Bump the edited article's `updated:` frontmatter date. Never
document a capability that isn't actually built or enabled yet — check
`doc/Deferred.md` and `doc/KnownGaps.md` first.

## Verify

Run `{{blueprint.commands.build}}` and `{{blueprint.commands.typecheck}}`
before calling a change done. `apps/web/CLAUDE.md` carries a block
regenerated by `next dev` (between `<!-- BEGIN:nextjs-agent-rules -->` /
`END`) — don't hand-edit it; committing it as regenerated is fine.
