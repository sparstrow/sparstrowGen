# doc/specs/

**What the owner wants, in the owner's terms.** The first document written for
any work that changes what a user of Sparstrowgen sees, does, or can reach.

```
idea ──► spec ──► owner review ──► plan ──► tasks ──► code
         ▲
         └── you are here: user stories, acceptance scenarios,
             what the interface should feel like. No technology.
```

One file per feature: `<YYYY-MM-DD>-<slug>.md`, same naming as `doc/plans/`.
Copy [`../templates/spec.md`](../templates/spec.md).

## Why this exists

This app is mostly backend — schema, daemons, sync, transport — and backend-
heavy projects fail in a specific way: every layer gets built, each one passes
its tests, and the thing the owner actually wanted to *use* never quite
arrives. M1–M7 shipped eight tasks per phase and not one of them was named
after something the owner could open.

A spec is the counterweight. It is written before the plan, in plain language,
and it is graded on whether the owner can walk through it — not on whether the
components exist.

## The rules that matter

**No technology in a spec.** No table names, no endpoints, no component names,
no framework. If a sentence couldn't be read aloud to someone who has never
seen the codebase, it belongs in the plan. The plan is where "how" lives, and
it links back here rather than restating why.

**Every user story is independently demoable.** Build only that one story and
the owner still has something they can open and use. A story that delivers
nothing alone is a technical step wearing a story's clothes — it belongs in
the plan's foundational work instead.

**Uncertainty is allowed here**, exactly as in a plan. Mark it inline with
`[NEEDS CLARIFICATION: <what is unknown>]`. If the unknown genuinely blocks
building, promote it to an `OQ-n` entry in
[`../OpenQuestions.md`](../OpenQuestions.md) with the `AGENTS.md` §8 options
framework. The inline marker means "we should pin this down"; the register
means "someone must decide before this can be built".

**The owner reviews the spec before planning starts.** It is the cheapest
point to catch a wrong direction — a wrong spec propagates silently into the
plan, the tasks, and everything downstream. Record the outcome in the spec's
own Owner review section.

## What does NOT need a spec

Work that only changes how the repo is built, checked, documented, or
governed. A CI fix, a doc restructure, a dependency bump, a refactor with no
visible change. Those plans set their **Spec** row to `n/a (internal)` with a
one-line reason.

When it is genuinely unclear whether something is owner-visible, ask.

## How a spec becomes work

The plan splits the spec into **foundational** and **per-story** work, using
one test:

> **Can the owner see the result of this work?**
> Yes → it belongs to a user story. No → it is foundational.

Foundational work (schema, RLS, transport, sync) gets ordinary technical tasks
and blocks the story work behind it. Story work gets tasks grouped so each
group ends in something demoable. Both keep the existing `[S]`/`[P]`/`[C]`
concurrency tags — see [`../tasks/README.md`](../tasks/README.md).

Every task then carries a **Serves** row naming its story or the story phase
it unblocks. A task that can name neither is a task nobody asked for.

## Index

| Spec | Status | Plan | Summary |
|---|---|---|---|
| [`2026-08-16-setup-and-machines`](2026-08-16-setup-and-machines.md) | ✅ reviewed 2026-08-16 — planned, M8–M11 | [`plan`](../plans/2026-08-16-setup-and-machines.md) | From a fresh account to a working machine: an interactive setup guide, a dedicated Machines menu with CRUD, and active/unreachable status, pairing against `staging.sparstrow.com`. Its US3–US5 scenarios *are* the verification pass `G-12`/`G-16` have been waiting for |
| [`2026-08-24-reaching-my-machine-from-the-browser`](2026-08-24-reaching-my-machine-from-the-browser.md) | **Draft — awaiting owner review** | not planned yet | Picks up where the one above leaves off: the machine is paired, so what can the browser actually do with it? Project files and folder browsing, both of which currently tell the owner the feature is unavailable in the web app. Blocked on [`OQ-6`](../OpenQuestions.md) for how much of a machine a signed-in person may look at. **Its US3 (terminals) is superseded** by the spec below, which builds the live channel all three stories need |
| [`2026-08-24-what-an-agent-is-allowed-to-do`](2026-08-24-what-an-agent-is-allowed-to-do.md) | **Draft — awaiting owner review** | not planned yet | The access model, scoped agents-first at the owner's direction. The machinery that combines permission rules across four levels already works correctly and is invisible and mostly unsettable: the project level has no control at all, agents default to unrestricted, and nothing shows the resolved answer. Answers `OQ-6` as one cell of the model rather than a standalone rule. People as subjects are designed for and deliberately built last |
| [`2026-08-24-a-terminal-on-my-machine`](2026-08-24-a-terminal-on-my-machine.md) | **Draft** — four framing decisions taken by the owner 2026-08-24, planning authorized in the same turn; not read back | [`plan`](../plans/2026-08-24-a-terminal-on-my-machine.md) — ✅ M16, M17 both shipped (M17 done except the interactive-session live pass, [`KnownGaps.md`](../KnownGaps.md) G-48) | Terminals, the one dead destination in the sidebar. The machine's PTY, replay ring and xterm client all already exist; what is missing is a wire between a browser on Vercel and a shell behind NAT. Supersedes US3 of the spec above, and builds the daemon Realtime credential M5 named and declined — which unblocks that spec's other stories in turn |
| [`2026-08-27-chat-session-and-conversation-ux`](2026-08-27-chat-session-and-conversation-ux.md) | ✅ reviewed 2026-08-27 | not planned yet | From the 2026-08-27 feedback batch: sessions rename themselves from the first message and can be renamed or permanently deleted by hand (resolving an open question `I-13` left about delete vs. archive), the model picker reflects what a provider actually offers instead of a fixed list, and the composer gains file/media attachments |
| [`2026-08-28-seeing-what-my-agent-made`](2026-08-28-seeing-what-my-agent-made.md) | **Draft — awaiting owner review** | not planned yet | An agent says "I've generated a picture for you" and the screen stays empty — today a reply can claim work the app silently discards, and nothing distinguishes that from an agent that did nothing. Files an agent produces become visible in the reply that mentions them and gathered in a per-conversation list, still viewable from a phone with the machine asleep. Two framing choices taken by the owner 2026-08-28 (both surfaces, not one; cloud-kept, not machine-online). Shaped by [`I-16`](../Ideas.md) and [the Multica comparison](../research/2026-08-28-multica-chat-comparison.md) — which showed media is neither inline text nor a folder listing, but a record related to the reply |

## The whole-app spec

The app already exists (M1–M7 shipped) and has never had a spec. Rather than
backfilling one per phase — weeks of writing user stories retroactively for
decisions already made — **one whole-app spec** captures how the owner wants
to use what is already there.

It is scoped to the surfaces the owner actually uses, not all 20+ routes, and
it is what a UX pass on the existing app gets graded against. Its user stories
are the owner's to supply; it cannot be written by inference from the code,
because the code shows what was built and not what was wanted.

**Status: not written.** It needs a working session with the owner.
