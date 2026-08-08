# `data-table` — sortable, filterable list tables

- **source:** owner decision during 6-pre Phase A
- **project:** factory
- **size:** L
- **date:** 2026-07-27
- **links:** `docs/specs/2026-07-27-intake-backlog-triage-and-sequencing.md` §3

**What:** a reusable data-table for the list pages — sorting, filtering, and paging over the six
surfaces currently rendering a bare `table`: `agents`, `dashboard`, `projects`, `runs`, `schedule`,
`skills`. The 6-pre audit named it as a missing primitive alongside `pagination`.

**Why deferred:** two reasons, and the first is a correction to the audit.

`data-table` **is not a shadcn component.** It does not exist in the registry — the MCP lists 46
components and `data-table` is not among them. Upstream ships it as a *documentation pattern*:
prose showing how to compose the `table` primitive with `@tanstack/react-table`. There is no
canonical source to vendor and adapt, so it could never have been part of a vendoring pass the way
`checkbox` or `popover` were. `pagination` — the half that genuinely is a vendorable primitive —
shipped in Phase A.

Second, building it means adopting `@tanstack/react-table` and designing a column/sorting/filtering
/selection API. Done in Phase A that API would be designed with no concrete page driving it, which
is how a wrong abstraction gets locked in early. Each of the six pages currently invents its own
sorting and filtering, so the shape of the shared thing should be read off them rather than guessed.

**Revisit when:** Phase B reaches the first list-heavy page. `runs` is the natural candidate — it
has the most rows, the most obvious need for filtering, and it grows without bound. Build the table
for that page first, then extract the shared abstraction once a second page has pulled on it.
Note the interaction with Phase 6: `0007`'s live dashboard and the `run_metrics` tables land in 6e,
so the query and paging model on `runs` should not be finalised in a way that assumes SQLite.
