# Ideas

Unscoped. No commitment, no decision behind them, possibly never built. If an
idea graduates, it becomes a plan in `doc/plans/` — or gets a decision and moves
to `Deferred.md`.

Distinct from `Deferred.md`: those were agreed and parked. These were merely
noticed.

---

## I-1 — Same-LAN direct daemon connection

Decision 2 routes every command through the cloud, which is correct for
correctness and NAT traversal. But when the browser and the daemon are on the
same network — the common desktop case — a direct local connection would cut a
round trip for transcript streaming and chat turns.

Only ever as an *optimization layered on* the cloud path, never as the primary
transport: exposing the daemon's host-process API is precisely what core's
`cors: { origin: false }` was added to prevent.

*Surfaced while scoring Decision 2 Option C.*

---

## I-2 — Full-text search across run transcripts

Once transcripts are in Postgres, "which run touched this file / hit this error"
becomes answerable. Cheap while transcripts stay in the database; needs a
separate index if D-3 ever moves them to Drive, which is an argument for building
it before archiving rather than after.

---

## I-3 — Cross-run cost and behaviour analytics

`runs` already carries `cost_usd`, `num_turns`, `duration_ms`, and
`effective_tools`. Aggregating across runs would answer: which agent is
expensive, which tools actually get used, where time goes, whether a prompt
change helped.

The `GraphUsageLine` component in `run-detail.tsx` already does a miniature
version of this for graph tools — counting `tool_use` blocks out of the
transcript — so the pattern exists.

---

## I-4 — Ephemeral per-task git workspaces (Multica model)

Multica never binds user-chosen paths: it clones into
`~/multica_workspaces/{workspace_id}/{task_id_short}/` per task and
garbage-collects when the issue closes. Portability becomes free — a project is
just a git URL — and `runtime_projects` bindings largely stop mattering.

Rejected for now because it gives up working in-place on an existing checkout
with uncommitted changes, which is how this repo is actually used. Worth
revisiting as an *option per project* rather than a global mode — sandbox and
`is_sandbox` projects are the natural candidates.

---

## I-5 — Self-hosted Postgres

Removes the free-tier ceiling, gives backups on your own terms, and makes
transcript retention a non-issue. Rejected during Decision 1 because it trades
"management is easier" — the actual reason cloud-canonical won — for an
operational burden.

Only interesting if self-hosting becomes necessary for another reason.

---

## I-6 — Surface memory-retrieval failures in the UI

`buildMemoryBlock` catches retrieval errors and silently falls back to recency:

```js
} catch (err) {
  logger.warn({ err }, "memory retrieval failed — falling back to recency");
}
```

The run still succeeds — it just quietly had worse context. Today this barely
matters because retrieval is a local file read that can't time out. It would
matter a lot if memory ever moved to a network call (see D-5), and it's cheap to
surface now: the run detail page already renders a "Memory injected:" row, so a
degraded-retrieval badge has an obvious home.

---

## I-7 — Stale-reference sweep

`packages/core/src/db/schema.ts` cites
`docs/archive/fable-handoff/P3-SEAM-TABLE.md`, which does not exist — there was
no `doc/` or `docs/` directory in the repo at all before this one. Worth a pass
over code comments for other pointers to files that have moved or were never
committed.

---

## I-8 — Feed "about you" and workspace "context" into a run

M9 adds `users.bio` and `workspaces.context`, and
[the setup spec](specs/2026-08-16-setup-and-machines.md) describes both as the
text an agent reads before working on the owner's behalf — role, stack,
preferences, what the workspace is for. M10 stores and displays them. **Nothing
reads them.**

Actually wiring them into a run is its own piece of work with its own
decisions: where in the prompt they sit relative to the memory block and the
project directives, what happens when they are empty (omit the section entirely,
or say "not provided"?), whether they count toward the same budget
`buildMemoryBlock` works against, and whether a delegated sub-agent inherits
them.

Worth doing — the fields have no other purpose — but not worth guessing at
inside a phase about setup UI. Raised while decomposing M9/M10.

---

## I-9 — Server-side image processing for avatars and logos

`T-M9-04` accepts an uploaded image as-is: no resize, no re-encode, no EXIF
strip. A 2 MB bucket limit bounds the damage, and a 2 MB PNG rendered into a
32px badge is wasteful rather than harmful.

If this ever matters — many members, mobile bandwidth, or someone uploading a
photo whose EXIF carries GPS coordinates — the fix is a transform on upload.
Supabase has an image transformation service on paid plans; a serverless
re-encode is the alternative. Deliberately not built for one owner and two
images.

---

## I-10 — Application settings & customization surface

Every milestone so far built page after page — chat, projects, agents,
machines, workspace/profile identity (M9), the setup guide (M10) — without a
matching pass over the *application's own* settings and customization
surface. What exists under Settings today is thin: mostly M9's
workspace/profile forms and M4's per-runtime WIP-snapshot toggle.

Raised as a representative list, not a scoped one — the owner's own words
were "I just gave a random list, but we need to properly design the settings
page": profile, preferences, keyboard shortcuts, issue tracking, chat
notifications, update behavior, repository-level (project) settings, members
and invites, task/status property customization, and MCP server
configuration.

Several of these — members/invites, task status properties — don't exist as
concepts anywhere in the app yet and need real product decisions, not just a
settings row for something already built. That's why this graduates to a
`doc/specs/` entry and owner review before a plan, rather than being written
straight from this list.

*Raised 2026-08-22, by the owner, after M11 closed out the Machines/Setup
work. See also I-8 above (workspace `context`/user `bio` unused) and
[D-17](Deferred.md) (the theme picker) — both are settings-shaped work this
idea would likely absorb rather than duplicate, once it's scoped.*

---

## I-11 — The rest of the machine-reaching surfaces

[`specs/2026-08-24-reaching-my-machine-from-the-browser.md`](specs/2026-08-24-reaching-my-machine-from-the-browser.md)
specifies three surfaces — project files, folder browsing, terminals. Seven
more are switched off in the browser for exactly the same reason and were left
out of that spec deliberately, to keep it demoable rather than exhaustive:
provider settings, importing a skill that lives on the machine, re-scanning
memory, reading a memory note in its original form, the code graph, a
project's git state and pull requests, and the project briefing.

Each should become much cheaper once the app can ask a machine a question at
all, but each carries its own interface questions — what a provider list means
when two machines disagree, what a git state looks like for a project you are
not sitting in front of — so none is a mechanical follow-on. Worth picking up
individually, by whichever the owner misses first, rather than as one batch.

*Surfaced while scoping that spec's Assumptions.*
