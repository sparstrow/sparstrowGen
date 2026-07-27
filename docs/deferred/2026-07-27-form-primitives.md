# `field` / `form` primitives — the shadcn form layer

- **source:** owner decision during 6-pre Phase A
- **project:** factory
- **size:** M
- **date:** 2026-07-27
- **links:** `docs/specs/2026-07-27-intake-backlog-triage-and-sequencing.md` §3

**What:** shadcn/ui's form layer, in both of its available shapes. `field` is the standalone layout
primitive (`Field`, `FieldGroup`, `FieldLabel`, `FieldDescription`, `FieldSet`, `FieldLegend`) and
needs no form library. `form` is the full validation wiring and requires `react-hook-form` plus
`@hookform/resolvers` as new dependencies. Neither was vendored in the Phase A primitive pass.

**Why deferred:** the 6-pre audit listed `field`/form as the biggest consistency win, on the
assumption that forms here are hand-rolled. Reading the tree showed otherwise — there is **no
`<form>` element anywhere in `packages/ui/src`**; inputs are wired individually to click handlers.
There is no existing form pattern to consolidate, so vendoring `field` would be introducing the
first one rather than standardising an existing mess. That makes it a design decision about how
forms behave across the app, not a like-for-like primitive swap. Choosing `form` compounds it:
`react-hook-form` would become the answer for every future form in the codebase, an architecture
commitment that should not ride in on a vendoring pass. The owner deferred both so Phase B can
decide against a concrete surface.

**Revisit when:** Phase B reaches a page whose primary job is data entry — the Agent Creator
(`routes/pages/agent-create.tsx`) and Settings (`routes/pages/settings.tsx`) are the likely first
two. The revived spec has to settle three things: `field` alone vs `field` + `form`; whether `zod`
(already a dependency, with schemas already in `@sparstrow/shared`) is the validation source of
truth; and whether validation runs client-side, server-side or both, since error surfacing
interacts with the four-states rule.
