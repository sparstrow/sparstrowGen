# Pipeline Suggester — an in-app agent that proposes a pipeline when none fits

- **source:** review-outcome
- **project:** factory
- **size:** M
- **date:** 2026-07-26
- **links:** spec deleted with `docs/workflows/agents/pipeline-suggester.md`; recover with
  `git log --diff-filter=D -- docs/workflows/agents/pipeline-suggester.md`

**What:** a Sparstrowgen **product** feature — when work arrives that no existing pipeline covers,
an agent that reads the catalog of pipelines, decides *extend an existing one vs. create a new one*,
and proposes the concrete agents and steps. The written spec's useful core was the extend-vs-new
tension: the default answer should be "extend", and proposing a new pipeline requires saying what
existing one it would otherwise distort.

**Why deferred:** written as a factory build-process role under the Listener/Curator flow, retired
2026-07-26 when the methodology moved to superpowers. As product, it depends on the app having
enough pipelines that "which one fits?" is a real question — that isn't true yet.

**Revisit when:** the pipelines surface has enough real pipelines that users pick wrong or
duplicate one — the point at which a suggester earns its place instead of adding a step.
