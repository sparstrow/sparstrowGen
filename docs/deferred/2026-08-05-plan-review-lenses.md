# Plan review lenses — CEO, engineering, and developer-experience critique

- **source:** review-outcome
- **project:** factory
- **size:** M
- **date:** 2026-08-05
- **links:** retired in the superpowers → spec-kit migration; see `CLAUDE.md` § Skills

**What:** four skills that reviewed a design *before* it became a plan, each through a distinct
lens — `/plan-ceo-review` (strategy, scope, ambition: is this the 10-star product, should the scope
expand or contract), `/plan-eng-review` (architecture, data flow, edge cases, test coverage),
`/plan-devex-review` (developer experience for API/CLI/SDK surfaces), and `/autoplan`, which ran all
of them in sequence with auto-decisions and surfaced only the taste calls at a final gate.

They were kept through the superpowers era specifically because superpowers had no equivalent —
they answered "is this the right thing to build", which no other step did.

**Why deferred:** the owner chose, on 2026-08-05, to replace them with spec-kit's own review
surfaces rather than carry two vocabularies. `/speckit.clarify` resolves ambiguity in a spec, and
`/speckit.analyze` checks that spec, plan, and tasks agree with each other.

**This is a real capability loss, and it should be recorded plainly rather than presented as an
even trade.** `/speckit.analyze` verifies *internal consistency* — that the three artifacts do not
contradict one another. It structurally cannot tell you the spec describes the wrong feature, that
the scope is too timid or too broad, or that a developer-facing surface will be unpleasant to use.
That judgment is what the four lenses provided and what nothing currently provides.

The interim mitigation is the owner's spec review gate, which sits at exactly the right point in the
loop — after `/speckit.specify`, before planning proceeds. It relies on the owner's own reading
rather than a structured critique, which is weaker but not nothing.

**Revisit when:** a review agent covering the workflow exists — the owner's stated intent on
2026-08-05 was to build one after the first feature ships end to end under the spec-kit loop, so
that it is designed against observed behaviour rather than an imagined process. If that agent ships
and does not cover scope/ambition and developer-experience judgment, revive these lenses as a fresh
spec rather than resuming this entry in place.
