# docs/plans — FROZEN

> **Frozen on 2026-08-05. Do not add files here.**
>
> New plans live in **`specs/<NNN>-<slug>/plan.md`** and **`tasks.md`** at the repo root, written by
> `/speckit.plan` and `/speckit.tasks`. See `CLAUDE.md`, Part II — The loop.

This directory holds the implementation plans of the pre-spec-kit loop, one file per feature, named
`YYYY-MM-DD-<feature-name>.md`. They were written by the superpowers `writing-plans` skill from an
approved spec in [`../specs/`](../specs/) and committed before building started.

**They remain accurate as a record of what was built and in what order.** Their checkbox structure
encodes the TDD cycle — write the failing test, watch it fail, write minimal code, watch it pass,
commit — which is **no longer how this repo works.** Verification now happens against the running
artifact rather than through a test-first cycle; see constitution I.

A plan whose boxes don't match reality is worse than no plan, so if you finish work that one of
these plans covers, tick its boxes and note the PR link at the top before leaving it here.
