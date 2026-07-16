---
id: 0005
category: feature-change
status: locked
project: factory
surface: Desktop shell (service-manager) + Core config + UI dev proxy
date: 2026-07-13
screenshots: []
links: { plan: "docs/intake/0004-always-on-packaged-desktop-self-update-2026-07-13.md" }
resolution:
---

## What I brought (verbatim)

I mentioned that in that plan, it shouldn't affect when developing the Sparstrowgen factory
inside Sparstrowgen itself as another project. I have another concern right now: if the app is
being published and it's an Electron app locally, is it going to run on a local host? When I try
to preview the app or when I ask an agent to review the app while building or developing it, it's
also going to use the same local host. The port number that they are going to use is going to
make a conflict, I guess. I'm just thinking from this perspective. Let me know if my concern is
correct or wrong.

## What the Listener understood

This is a follow-up to intake 0004 (always-on packaged desktop + self-update). The concern:
0004's always-on Electron app and any dev/test instance of core (another chat's dev server, or a
preview spun up while building the factory inside itself) both default to the same port
(`127.0.0.1:48750`), with no separation planned — confirmed correct, and confirmed live in-session
(two chat dev servers collided on 48750, resolved by killing one process).

Confirmed facts (via code, referenced against the running repo at time of capture):
- Core's port comes from `SPARSTROW_PORT`, defaulting to `DEFAULT_PORT = 48750`
  (`packages/core/src/config.ts:90`).
- The desktop shell's supervisor hardcodes the same default target:
  `CORE_URL = process.env.SPARSTROW_CORE_URL ?? "http://127.0.0.1:48750"`
  (`packages/desktop/src/service-manager.ts:5`).
- `service-manager.ts` already has "adopt, don't respawn" logic when it detects a healthy core
  already on the port (`service-manager.ts:111-116`) — written anticipating *some* collision, but
  it only makes a new process silently defer to whatever's already running. That can mask a dev
  instance accidentally talking to production (or vice versa) instead of failing loudly.
- 0004's plan (`docs/intake/0004-always-on-packaged-desktop-self-update-2026-07-13.md`) solves
  code/data separation (three locations: installed app dir, persistent per-user data dir, dev repo
  as a project) but never addresses **port** separation between the always-on production instance
  and a dev/test instance used to iterate on the factory itself.
- This becomes a standing, recurring problem once 0004 ships Phase 1: the packaged app becomes a
  permanent resident on 48750 (not an ephemeral chat session you can just kill) whenever anyone
  wants to preview/test core changes while building Sparstrowgen inside itself.

Proposed fix direction (discussed and confirmed, not yet built):
1. Packaged/always-on app keeps port 48750 — don't change it; it's baked into desktop shell
   defaults, tray, memory-cli/mcp, and docs.
2. Dev/test instances of core use a different port via the existing (currently unused-for-this-
   purpose) `SPARSTROW_PORT` env override — e.g. `SPARSTROW_PORT=48751` for dev sessions. No core
   code change needed; `config.ts` already reads this env var.
3. The UI's Vite dev proxy target is currently hardcoded to `http://127.0.0.1:48750` in
   `packages/ui/vite.config.ts:49` for both `/api` and `/ws` proxy entries. This needs to become
   env-driven (e.g. a `CORE_PROXY_TARGET` env var, or reuse `SPARSTROW_PORT`) so the dev UI proxy
   follows wherever the dev core instance actually landed, instead of always pointing at 48750.

Tied to 0004 — park alongside it; route through the Curator when 0004 is picked up for build.

## Curator session

**Clarification raised and resolved (2026-07-13):** the user's underlying worry was whether the
proposed fix (dev instances using `SPARSTROW_PORT`, un-hardcoding the Vite proxy target) would
affect the packaged Electron app itself. Confirmed: **no impact.** The packaged app's spawn path
(`service-manager.ts:91`, and its post-0004-Phase-1 successor) never sets `SPARSTROW_PORT` — it
always falls through to `DEFAULT_PORT = 48750` (`config.ts:90`). The override only needs to exist
in dev/preview launch config (e.g. `.claude/launch.json`'s env for the `core` config, or a
dev-only script), not anywhere the packaged build reads. The one implementation pitfall to avoid:
don't put the override in a *shared* place both dev and the packaged build would pick up (a root
`.env`, or a change to core's own default) — scope it to the dev launch path only. Concern
resolved; no further action needed on this point.

**Mode confirmed:** `feature-change` (unchanged) — this describes what should change about an
existing, already-captured plan (0004), not a new standalone fact or a general architecture note.

**Verdict:** `locked` → `routed`. No separate pipeline needed — this isn't an independent
deliverable, it's an amendment folded into 0004's own build (Phase 0/Phase 1 acceptance criteria).
Same routine-build workflow every other P-phase in `.design-src/APP.md` already uses; it just
doesn't get its own board row. Rides with 0004: revisit when 0004 is picked up and gets its own
Curator pass. No independent/now build track opened.

## Resolution: wontfix (2026-07-13)

User reversed the fix direction after weighing the tradeoff: giving dev instances a separate port
(`SPARSTROW_PORT=48751`+) means **two full core processes running at once** — two SQLite
connections, two embedder model loads, two of everything in memory — just to avoid a port
collision that's relatively rare. Not worth the memory cost. Decision: **keep everything on one
port (48750)**; accept the existing behavior (whoever's already listening keeps it; a conflicting
second instance either adopts the running one, in the desktop shell's case, or fails loudly and
has to be resolved manually, in the ad hoc dev/preview case — as happened earlier this session).
No code change. If this recurs often enough to matter, the better lever is probably *reusing* the
already-running core (as `service-manager.ts`'s existing adopt-logic already does for the packaged
app) rather than running a second instance on a second port — but that's a new idea, not this
item's scope; capture separately if it becomes worth pursuing.

## Reopened (2026-07-14)

**The wontfix rested on a false premise.** The user had understood — from an earlier remark this
was heard, second-hand — that the packaged Electron app "doesn't require a local host," i.e. that
it doesn't bind a port at all. On that premise, running a dev core on a second port looked like
pure waste: two processes for a conflict the packaged app would never actually cause.

**That premise is wrong, and it was proven wrong directly**, not by inference: the 0004 installer
was built and the packaged core was booted exactly as the Electron shell runs it — bundled Node,
bundled dist, junctioned deps — and it came up serving `http://127.0.0.1:48750` and answering
`/system/health`. The Electron window itself is nothing but `mainWindow.loadURL(UI_URL)` pointed
at that same local server (`main.ts:9`, `service-manager.ts:5`). There is no mode where this app
runs without a bound TCP port — that's the shape of the architecture (local Fastify + local
SQLite), not a config choice. "Can't ship to Supabase/Vercel" (0004's opening question) was never
a claim that no port is used locally; those are two different statements that got compressed into
one.

**With the correct premise, the original concern stands and the tradeoff flips:**
- The packaged app is about to run 24/7 on this machine, starting now — not an occasional
  ephemeral chat session that might collide once in a while.
- Every time a coding session (like this one) needs to spin up an isolated preview/dev core to
  verify a code change — which is routine, not rare — it will now collide with a *permanent*
  resident on 48750, not a temporary one.
- The memory cost of a second core process (one more SQLite connection, one more small embedder
  model) is real but modest — not the kind of cost that should block being able to test code
  changes without taking down the live, always-on factory (agents mid-run and all) every time.

**Decision: reinstate the original fix.** Two separate cores — one permanent (packaged app,
port 48750, real persistent data), one disposable (dev/preview, a different port, throwaway
data) — same direction as the original proposal:
1. Packaged/always-on app keeps port 48750 unchanged.
2. Dev/test instances set `SPARSTROW_PORT` (e.g. `48751`) — `config.ts` already reads this env var,
   no core code change needed.
3. `packages/ui/vite.config.ts:49`'s hardcoded `http://127.0.0.1:48750` proxy target becomes
   env-driven so the dev UI proxy follows wherever the dev core landed.

Status reopened `locked`; routing unchanged from the original verdict — folds into 0004's own
build track (Phase 0/1), no separate pipeline. Ready to implement.
