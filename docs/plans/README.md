# docs/plans — implementation plans

One file per feature, named `YYYY-MM-DD-<feature-name>.md`.

Written by the superpowers `writing-plans` skill from an approved spec in [`../specs/`](../specs/),
and committed **before** building starts.

A plan is bite-sized tasks of 2–5 minutes each, with exact file paths, complete code, exact commands
and their expected output. Every task runs the TDD cycle as checkbox steps:

```
- [ ] Write the failing test
- [ ] Run it and watch it fail
- [ ] Write the minimal code to pass
- [ ] Run it and watch it pass
- [ ] Commit
```

No placeholders — "TBD", "add error handling", "similar to Task 3", or a step without its code are
plan failures.

This path overrides the skill's `docs/superpowers/plans/` default — see `CLAUDE.md`, Part II.

**Keep the checkboxes true.** Tick them as they complete and note the PR link at the top when the
work ships. A plan whose boxes don't match reality is worse than no plan.
