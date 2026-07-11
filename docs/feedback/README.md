# Feedback log

Dogfooding feedback on Sparstrowgen and the projects it builds. Governed by
[`../workflows/refinement-and-feedback.md`](../workflows/refinement-and-feedback.md).

**The folder is the state** — one markdown file per issue, moved as it progresses. No index
to keep in sync; to see the open queue, look in `inbox/`.

```
inbox/     captured — raw + confirmed understanding, awaiting analysis
planned/   analyzed — findings appended + a link out to where the fix is tracked
done/      resolved (link to PR/commit) or closed (wontfix/dup/deferred)
assets/    screenshots, named to the item id (e.g. FB-0001-draft-gone.png)
```

**Rules that make this trustworthy:**
- The `## What happened (verbatim)` block is **sacred** — analysis appends below it, never
  rewrites it. Your words stay the record; `git log` shows the whole journey.
- Capture ≠ analyze ≠ fix. Items land here with **no diagnosis** — that's deliberate.
- Nothing is deleted. `done/` is the audit trail and a retro input.

Item ids are `FB-NNNN`. Factory-self feedback uses `project: factory`; feedback on a built
project uses that project's slug (and, once volume grows, its own `docs/feedback/<slug>/` tree).
