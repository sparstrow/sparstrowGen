# Reconcile TODOS.md into docs/deferred/

- **source:** agent-defer
- **project:** factory
- **size:** S
- **date:** 2026-08-05
- **links:** committed alongside `Research/`, `description.md`, and `docs/intake/assets/`

**What:** `TODOS.md` at the repo root is a second deferral ledger. Its own header reads *"Deferred
work captured by review skills"*, and each entry carries What / Why / Pros / Cons / Context /
Effort / Priority / Depends on — the same job `docs/deferred/` does, in a different shape. Its
items came out of `/autoplan`'s CEO phase and similar review passes that no longer exist.

Reconciling means converting each item into its own `docs/deferred/YYYY-MM-DD-<slug>.md` with the
README's format — crucially adding a **Revisit when** trigger, which the `TODOS.md` entries lack —
and then deleting `TODOS.md`.

**Why deferred:** it was committed to get it into git, since it had been sitting untracked in the
working tree and was one `git clean` away from being lost. Converting the entries is real work and
would have expanded a change whose purpose was preservation, not reorganisation.

The cost of leaving it is specific: **constitution VII says every deferral goes to
`docs/deferred/`, and there are now two places a deferral can live.** Anyone writing one has to
guess, and anyone reading the freezer will miss whatever is in `TODOS.md`. Some items may also
already be duplicated — `docs/deferred/2026-07-08-project-delete-trash-restore.md` covers the same
Project Delete work that several `TODOS.md` entries depend on.

**Revisit when:** anyone next adds an item to either ledger, or the first time a `TODOS.md` item is
actually picked up for build. Either event proves the split is costing real attention rather than
being a tidiness concern.
