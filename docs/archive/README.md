# Archive

> **Nothing in this directory is on the read-path.** It is frozen history, kept for provenance.
> Do not read it to decide what to build, do not treat it as current state, and do not update it.
> Reading it wastes tokens on finished work — which is exactly what the directory name is for.

Looking for what's actually live?

| You want | Look in |
| --- | --- |
| Current designs and implementation plans | [`../specs/`](../specs/), [`../plans/`](../plans/) |
| Architecture specs predating that flow | [`../planned/`](../planned/) |
| Scope parked with a revival trigger | [`../deferred/`](../deferred/) |
| How work gets built at all | `CLAUDE.md`, Part II |

## What's in here

```
audits/          point-in-time reports (design, security, architecture) — findings from
                 that date, not the current state
shipped-plans/   plans that were followed and the feature actually shipped — kept for
                 historical design detail only
superseded/      plans and sketches replaced or abandoned before completion — kept for
                 early-thinking history only
intake/          the retired Listener/Curator capture pool. Takes no new entries. All
                 seven of its open captures were triaged into
                 ../specs/2026-07-27-intake-backlog-triage-and-sequencing.md, which is
                 its successor as the live backlog
design-src/      the page-by-page design era — the APP.md build board, the FACTORY-LOOP
                 runbook, and the Claude Design exports + SPECs. Was at the repo root
fable-handoff/   the P1–P10 master engineering plan and its decision records. All ten
                 phases shipped and merged by 2026-07-09. Was at the repo root
```

## Conventions

**Names are preserved.** When a document is archived, only its parent directory changes —
`fable-handoff/ENGINEERING_PLAN.md` became `docs/archive/fable-handoff/ENGINEERING_PLAN.md`, not
something new. Any stale pointer left anywhere in the repo still resolves by basename grep. Keep
this rule when archiving anything else.

**Every file carries a status blockquote** at the top, so a reader landing on it cold knows
immediately what they're looking at and that it isn't current.

**Cross-links between archived documents are left as they were written.** They point at paths that
no longer exist, and that is deliberate — these are historical records, and rewriting them would
falsify what the author actually decided at the time. `superseded/factory-workflow-v2.md` recording
open decision **D-B** ("move the frozen docs into `docs/reference/`, or leave them banner-frozen in
place") is the clearest case: this directory is the resolution of that decision, taken on
2026-08-01, and the record of the question has to keep naming the path it was asked about.

Only this README is maintained.
