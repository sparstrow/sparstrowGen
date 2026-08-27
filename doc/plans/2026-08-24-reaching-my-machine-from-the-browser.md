# Reaching my machine from the browser — 2026-08-24

| | |
|---|---|
| **Spec** | [`../specs/2026-08-24-reaching-my-machine-from-the-browser.md`](../specs/2026-08-24-reaching-my-machine-from-the-browser.md) — **Owner-reviewed 2026-08-24, accepted for US1, US2 and US4** |
| **Status** | Draft — M22 next, and blocked until M16 lands |
| **Trigger** | The owner, settling the three-component shape ([`D-24`](../Deferred.md)): someone who installs only the machine service should be able to use the app from a browser. Today a third of it is switched off for them. |
| **Depends on** | **M16** — the machine control channel. Hard, not soft: this plan builds no transport of its own. **M20** (access model) for US2's boundary. |
| **Touches** | `packages/shared/src/schemas/host-fs.ts` (new), `packages/shared/src/cloud.ts`, `packages/core/src/cloud/host-bridge.ts` (new), `packages/core/src/api/routes/host-fs.ts`, `apps/web/src/lib/machine-request.ts` (new), `apps/web/src/components/machine-unreachable.tsx` (new), `apps/web/src/app/projects/[projectId]/`, `apps/web/src/components/directory-picker-dialog.tsx`, `apps/web/src/lib/api/handlers/stubs.ts`, `apps/web/src/content/knowledge/` |
| **Tasks** | not decomposed yet — M22 is written when M16 lands (see Phases) |
| **Open questions** | none — [`OQ-6`](../OpenQuestions.md) closed 2026-08-24; FR-002's boundary is the access model's US4 |

## Summary

Serves [the machine-reaching spec](../specs/2026-08-24-reaching-my-machine-from-the-browser.md)
for US1 (a project's files), US2 (the folder picker) and US4 (which machine am
I reaching). US3 was superseded before the review gate and is M16/M17's.

**This plan builds no transport.** M16's
`machine:<workspace_id>:<runtime_id>` control channel is already a
request/reply primitive — correlated by request id, admin-scoped, policy-pinned
— and that is exactly and entirely what FR-001 asks for. This plan adds request
kinds to it, a daemon-side handler that answers them from the existing
[`host-fs`](../../packages/core/src/api/routes/) routes, and the three surfaces
that consume them.

## What the spec asks for that isn't obvious

### 1. The expensive half of this feature is already being built, by someone else's plan

FR-001 — *"ask an online machine a question and show the answer, while the
owner waits"* — reads like the centre of this plan and is not in it. M16's DD-2
mints the daemon Realtime credential, DD-3 defines the control channel, and its
`018_terminal_channels.sql` writes the send/subscribe policies. A folder listing
is a request on that channel with a different `kind`.

The consequence for sequencing is absolute: **nothing here can start before
M16's verification task passes.** Not "would be easier after" — there is no
second way for a browser to reach a machine, and building one would be the
relay service M16's DD-1 rejected.

### 2. The policy is pinned to event names and topic prefixes, so adding a request kind is a migration

`017`'s send policy grants only *specific event names* on topics beginning
`terminal:` or `machine:`. That is deliberate — it is what stops a client
forging a reply. A `host.dir.list` request is a new event name on the `machine:`
family, so it needs a policy amendment (`018`), not just a new TypeScript union
member. Easy to miss, and it fails as "the request silently never arrives"
rather than as an error.

### 3. Every one of these surfaces already exists and already fetches — through a 501

`useHostVolumes`, `useHostDir`, `useProjectFiles` and `useCreateHostDir` are all
in [`hooks.ts`](../../apps/web/src/api/hooks.ts), wired to real components, and
every one hits
[`stubs.ts`](../../apps/web/src/lib/api/handlers/stubs.ts)'s
`"runs on the local daemon and is not available from the web app."` SC-004 makes
deleting that sentence a success criterion.

So the UI work is smaller than the spec's Surfaces table suggests, and the risk
is different from a greenfield build: these components have populated and
loading states already, and what they lack is the *empty* and *error*
vocabulary the spec's four-states table specifies. That is where the work is.

### 4. US2 cannot ship before a machine can be told what it shares

The folder picker with no boundary is `OQ-6`'s option A, which the owner
rejected. The boundary is the access model's US4 (nominated locations, read-only
grant), enforced on the machine per that plan's DD-4. **M24 therefore depends on
M20**, across plans. The spec's own review records this so it is not discovered
during decomposition.

US1 does not have this dependency: a project's files are inside a registered
project, which is `OQ-6`'s option C — the tightest boundary, and the one that
needs no configuration. **That is why US1 ships first, and it is the reason the
phase split is what it is.**

### 5. Writes on these surfaces are Server Actions from the start, not converted later

`useCreateHostDir` is a write. Per
[`server-action-write-conversion`](2026-08-24-server-action-write-conversion.md)'s
DD-6 it is explicitly excluded from that plan and belongs here — built the new
way in the same change that makes it work, per `apps/web/CLAUDE.md`. Reads
that stream (none here) and reads that don't (all of these) both go through the
Server Component, not `/api/v1`.

## Work breakdown

### Foundational — blocks all stories

| Work | Why no story owns it |
|---|---|
| `host-fs` request/reply schemas in `@sparstrow/shared`, on M16's envelope | Types on an existing channel; nothing renders |
| `018_host_fs_channel.sql` — the new event names added to `017`'s grant | A policy amendment; its absence is a silent non-delivery |
| Core `cloud/host-bridge.ts` — bind control-channel requests to the existing host-fs implementation | Daemon plumbing behind an existing local route |
| `lib/machine-request.ts` — browser-side request/reply with correlation, timeout (FR-007) and typed refusals | A function three surfaces call |
| `<MachineUnreachable>` — the one shared notice, with all three emptinesses (FR-006) | A component. Every surface renders it; on its own it renders nothing |

### Per story

| Story | Work | Delivers |
|---|---|---|
| **US1** — a project's files from a browser | Project → Files as a Server Component reading via the bridge; folder navigation; file read with the binary/size refusals from Edge cases; stale-folder recovery | The owner opens a project on any computer and reads its real files |
| **US2** — Browse without typing a path | `directory-picker-dialog.tsx` against the bridge, opening at the machine's **nominated locations**; path box stays typeable when nothing is online | Adding a project stops being a from-memory typing exercise |
| **US4** — which machine am I reaching | The machine indicator on each surface, and the switch, remembered per surface | The app stops silently picking a machine and being wrong once there are two |

## Decisions

### DD-1 — Reuse M16's channel and envelope; add request kinds, add no transport

Stated in the Summary and repeated as a decision because it is the one a future
agent is most likely to undo by building "just a small endpoint". A second path
to the machine means a second credential, a second policy family, and a second
place for the online/offline answer to disagree with itself.

Rejected: a Next route that POSTs to the daemon. The daemon has no reachable
address and core's `cors: { origin: false }` posture is deliberate — M16's DD-1
rejected this for the terminal and the reasoning is unchanged for a folder
listing.

### DD-2 — The daemon answers from the existing host-fs implementation, unchanged

`cloud/host-bridge.ts` is a second caller of the same functions the local
Fastify routes call, exactly as M16's DD-6 made the cloud a second *sink* for
the terminal rather than a second terminal. The local routes stay: they work,
and anything running on the machine itself uses them.

### DD-3 — Every request carries a timeout and every timeout is a specific message

FR-007. `MACHINE_REQUEST_TIMEOUT_MS = 10_000` for a listing, and the expiry
message names the machine and says it did not answer — distinct from "the
machine is offline", which is known from `runtimes` before the request is even
sent. The spec's Edge cases call out the spinning-disk case specifically; a
surface that waits forever is the failure being designed against.

### DD-4 — A listing is paginated at the daemon, and a truncated one says so

The 10 000-file folder from the spec's Edge cases. `HOST_DIR_PAGE_SIZE = 500`,
with the reply carrying a `truncated` flag the UI renders as a real notice
rather than silently showing the first 500 as if they were all of them.

### DD-5 — File reads refuse by size and by content type, before transferring anything

The reply for a file over `HOST_FILE_MAX_BYTES = 1 MB`, or one that sniffs as
binary, is a **typed refusal carrying the reason** — not a truncated body and
not an error. The spec asks for "refuse gracefully rather than attempt it", and
a refusal that arrives as a generic failure is indistinguishable from the
machine being broken.

### DD-6 — The three emptinesses are one component, and it is the deliverable that makes SC-004 checkable

FR-006 names them: never paired / paired but not reachable / answered and
refused. Each has a different next action, and the spec's Flow section names the
dead end to avoid — an error naming a state without a time attached, or telling
the owner to go somewhere without linking there. One component, three states,
consumed by every surface, inheriting `setup-and-machines` decision 1's
"unreachable" + last-seen wording rather than inventing a second vocabulary.

### DD-7 — US4's machine choice is remembered per surface, in the browser

The spec's US4 scenario 2 asks for the choice to be remembered. It is a UI
preference, not workspace state — `localStorage`, keyed by surface. Rejected: a
cloud column, which would make "which machine was I looking at" a thing that
syncs across devices, which is not what was asked and is a schema change for a
dropdown.

## Phases

### M22 — the bridge (foundational)

Request/reply schemas, the `018` policy amendment, `host-bridge.ts`, the
browser-side request function, and `<MachineUnreachable>`. At the end of it the
switched-off surfaces are exactly as switched off as they are today.

**Depends on M16 completing.** Not decomposed yet, deliberately: M16's channel
contracts task (`T-M16-01`) defines the envelope this extends, and writing these
tasks against its plan outline rather than its shipped shape is the mistake this
repo's M13→M14 note already names.

### M23 — a project's files (serves US1)

Project → Files, live. The first thing in this app's history that asks a machine
a question and shows the owner the answer.

Depends on M22. **No dependency on the access model** — see "What isn't obvious"
§4.

### M24 — Browse, and which machine (serves US2 + US4)

The folder picker over nominated locations, and the machine indicator.

Depends on M22, M23, **and the access model's M20**. This is the cross-plan edge
that decides the master queue's ordering, and it exists because US2's boundary
is `OQ-6`'s answer.

## Scope boundaries

- **US3 (terminals) is not here.** Superseded before the review gate;
  M16/M17 own it.
- **The other switched-off surfaces are not here** — provider settings, local
  skill import, memory rescan, raw memory notes, the code graph, project git and
  pull requests, project briefing. Same *kind* of problem, each with its own
  interface questions. The spec's Assumptions file them as
  [`I-11`](../Ideas.md), and this plan does not quietly absorb them because the
  bridge makes them easy.
- **Asking a machine to *do* more work is a different spec** — running a
  pipeline, starting a goal, drafting an agent. Spec Assumptions.
- **Offline is out of scope** ([`D-24`](../Deferred.md)).
- **Writing outside a project is not granted**, per the access model's DD-4
  read-only nomination.

## Verification

| Spec criterion | How it gets checked |
|---|---|
| **SC-001** — a listing in under 1s from another network | M23 verification, timed against the branch's Vercel preview with the machine on a different connection |
| **SC-002** — 200 ms per keystroke | **Not this plan's** — M17's, for the superseded US3 |
| **SC-003** — every listed surface works from a browser that is not the machine | M23 and M24 verification walks, from a browser with no local app installed |
| **SC-004** — no surface says a feature is unavailable in the web app | Grep `stubs.ts` for the removed patterns, **and** walk every sidebar destination — the spec asks for the walk, and the grep alone would pass while a component held the sentence itself |
| **SC-005** — machine stopped: name, last-seen, a way forward, no infinite spinner | Stop the daemon, walk all three surfaces, screenshot each |
| **SC-006** — machine-service-only user completes add-project → terminal in a browser | **Cannot be fully proved by this plan.** Installing the machine service without the desktop app is [`D-10`](../Deferred.md), still parked, and the terminal half is M17's. Recorded as a `KnownGaps.md` entry when M24 lands rather than graded on the two-thirds this plan can reach |

## Result

*Filled in as the phases land.*
