# Deferred

Agreed in principle, explicitly parked. Distinct from `Ideas.md`: these have a
decision behind them and a reason they're not being built *yet*.

Each entry records what triggers picking it back up, so nothing sits here purely
because it was forgotten.

---

## D-1 — HITL gate redesign

**Parked:** 2026-08-09, by the owner — "One thing I want to modify is the human
gate feature. We can do it later."

The cloud schema keeps `tasks.hitl_approved` and the `paused_hitl` run status so
the spine stays available, but **no UI is built against the current shape**
pending a redesign.

This matters more than it looks: HITL gates are one of the three mitigations for
the security consequence of cloud-canonical dispatch (anyone who can write a task
row targeting your runtime can cause code to run on that machine). The other two
— workspace-scoped RLS and the `effectiveTools` clamp at spawn — are live.

**Unpark when:** the owner has a design, or before any external collaborator is
added to a workspace.

---

## D-2 — Chat archiving

**Parked:** 2026-08-09 — "Let's go with option B first, later we can build a
mechanism on archiving chats once I use and see the app storage level."

All chat lives in Postgres with no archiving. Rough projection: 1,000 sessions ×
100 messages × 2 KB ≈ 200 MB, a real fraction of the 500 MB free tier.

**Unpark when:** observed `chat_messages` size crosses ~150 MB, or the free tier
starts to pinch. The mechanism is the same JSONL-to-Drive pattern as D-3, so it
is not new machinery.

---

## D-3 — Run transcript archiving to Drive

**Parked:** 2026-08-09, on measurement rather than preference.

Measured on the real local DB: 27 runs / 613 events / 1.33 MB = **~50 KB per
run**, heaviest single run 615 KB. That puts ~10,200 typical runs in the 500 MB
free tier and ~167,000 in 8 GB Pro. The storage cliff I originally warned about
was wrong by roughly 20×.

`runs.archive_url` is **not** in the schema yet — add it with the archiver.

> ⚠️ **Trap to remember when this is unparked.** The dream cycle scans completed
> runs to extract memory signals (`runsScanned` → `signalsWritten`). If
> transcripts are archived and purged locally *before* extraction runs, the
> factory silently stops learning from its own work, with no error. Archiving
> must be gated on signal extraction having completed for that run.

**Unpark when:** `run_events` exceeds ~300 MB, or a Pro-tier bill appears.

---

## D-4 — Memory vault mirror to Drive

**Parked:** 2026-08-09 — decided in principle during Decision 1, not yet built.

The vault (`vaultPath`, default `<parent>/memory`) is the content source of truth
for all memory and one of only two irreplaceable things in the local tier. It is
plain Obsidian-compatible markdown, so Drive is an ideal offsite target and the
owner has 5 TB available.

Note this is genuinely *backup*, not sync — cross-machine memory sharing goes
through Postgres per Decision 1, not through Drive.

**Unpark when:** M6 (memory sync) lands, or sooner — this is low-effort and
protects the highest-value local artifact.

---

## D-5 — Semantic memory search from mobile

**Parked:** 2026-08-09, as a consequence of Decision 1 (memory Option 3).

Cloud `memory_notes` deliberately has **no vector column**. Every daemon embeds
locally with the same bundled 384-dim FastEmbed model, so embeddings never cross
the wire and retrieval stays a sub-15 ms local read in the hot path of every run.

Bringing semantic search to the browser means re-adding a `vector(384)` column
and having daemons push embeddings. Postgres full-text is likely sufficient for
browsing notes on a phone.

**Unpark when:** keyword search on mobile proves inadequate in practice.

---

## D-6 — Offline board access (ollama-only workflow)

**Parked:** 2026-08-09, as Decision 3 Option C.

Decision 3 chose "buffer and resync": in-flight runs survive network blips, but
new work can't be started while offline because the board lives in the cloud. A
local board mirror would fix that, at the cost of the bidirectional task sync the
whole architecture was shaped to avoid — and tasks, unlike memory notes, are not
append-mostly and do conflict.

**Unpark when:** ollama-only offline use becomes a real workflow rather than a
hypothetical. Not before.

---

## D-7 — Multi-workspace switching in the UI

**Parked:** 2026-08-09, during M2 scoping.

M2 resolves the active workspace server-side: one membership means it's implicit;
several means an explicit `?workspaceId=` is required. There is no workspace
picker in the UI, and users are expected to have exactly one for now.

**Unpark when:** any user genuinely belongs to more than one workspace.

---

## D-8 — GitHub and Google sign-in

**Parked:** 2026-08-10, by the owner — "defer google and github auth."
**Reconfirmed:** 2026-08-16, by the owner — not using GitHub or Google OAuth
right now. (`runbooks/README.md`'s row had drifted to "pending"; corrected to
"parked" the same day.)

The app-side code is **complete and verified**; nothing here is unbuilt. What is
missing is configuration that only a human can supply: an OAuth app registered
under the owner's own GitHub and Google accounts, and the resulting client
secrets pasted into the Supabase dashboard. Both providers currently report
`enabled: false`.

The login page reads `/auth/v1/settings` on load, so the buttons render disabled
with "Social sign-in isn't set up yet — use email below" and **light up on their
own** once the providers are enabled. No code change is needed to unpark this.

Tracked as a parked row in [`runbooks/README.md`](runbooks/README.md). Full
steps, including the callback URL people get wrong (it is Supabase's, not the
app's): [`runbooks/oauth-providers.md`](runbooks/oauth-providers.md).

**Unpark when:** the owner wants social sign-in, or a collaborator who would
rather not manage another password is added to a workspace.

---

## D-9 — Agent and project definition sync

**Parked:** 2026-08-10, while decomposing M4.

The board is in Postgres and the runner reads local SQLite. Both sides have
agents and projects, with **independent ids and no sync between them** — nothing
in M1–M3 needed to cross, and M4 crosses by *linking*, not syncing: a cloud agent
resolves to a local one **by slug**, recorded in a `cloud_links` table, and a
miss becomes a legible `agent_not_available` block rather than an invented agent.

What that leaves open, stated plainly: **the web UI can name an agent no machine
has**, and an agent edited in the browser does not change what runs. The user
creates the agent in both places, or dispatch blocks.

Pulling the definition on claim looks like three lines and is not. It opens who
wins when both sides edit, what happens to `mcpServers` paths and `cwd` values
that exist on exactly one machine, what a locally-disabled but cloud-enabled
agent means, and whether a machine may create board objects (M4 says no — the
binding report skips unknown slugs for the same reason). That is a feature with
its own conflict model, not a helper inside a dispatcher.

**Unpark when:** creating an agent twice becomes routine friction rather than a
one-time setup step — or before anyone who is not the owner uses the web UI to
queue work, since they have no way to create the local half.

---

## D-10 — Headless (non-Electron) core distribution

**Parked:** 2026-08-12, by the owner — "I would go with option A [standalone
background service, private registry] ... but it can be deferred."

Pairing a machine (`sparstrow pair <code>`) works today, but only from a dev
checkout: clone this repo, `pnpm install`, `pnpm --filter @sparstrow/core
start`, then pair. `sparstrow` is not published anywhere — `@sparstrow/core`
is `"private": true` and confirmed 404 against the public npm registry.
Electron (`packages/desktop`) is **not** the pairing mechanism; it only
supervises and packages the same `core` service (see
[`service-manager.ts`](../packages/desktop/src/service-manager.ts)) — pairing
itself lives entirely inside `core`, independent of any GUI.

Decision: build a standalone background-service distribution of `core` — a
bundled-Node binary registered as a Windows Service / launchd / systemd job,
no terminal or GUI required, survives reboots — published to a **private**
registry (GitHub Packages under the org, not public npm) so nothing is
publicly exposed before launch. An interim npm-only step (global install,
manually kept running) was considered and rejected as not worth building
separately from the real target.

Known cost when this is unparked: native modules (`better-sqlite3`,
`node-pty`, `onnxruntime`/`fastembed`) are compiled per OS/arch/Node-ABI — the
same trap Electron's own packaging already had to route around (see
[`service-manager.ts:90-92`](../packages/desktop/src/service-manager.ts)) —
and service registration is separate work per platform, with no
`electron-updater`-equivalent auto-update path for a non-Electron binary.

**Unpark when:** a second or third real machine needs pairing that isn't the
owner's own dev checkout, or before handing the app to anyone who isn't
comfortable cloning a monorepo.

> **Sequenced 2026-08-16.** At the review of
> [`specs/2026-08-16-setup-and-machines.md`](specs/2026-08-16-setup-and-machines.md)
> the owner chose to fix distribution as **its own round, immediately after**
> that spec ships — not folded into it, and not left indefinite. That spec's
> setup guide and Machines empty state therefore say plainly that connecting a
> machine currently needs a dev checkout, rather than implying a `sparstrow`
> command that is published nowhere. **This entry gets its own spec when the
> setup-and-machines work lands**, which is the concrete trigger this
> deferral previously lacked.

> **Promoted 2026-08-24.** This entry is now the prerequisite for
> [`D-24`](#d-24--collapse-to-three-components-one-nextjs-ui-electron-as-a-shell-headless-core)
> — it *is* the third of the owner's three components (headless daemon +
> browser, for users who don't want Electron). Shipping it is what unparks
> D-24.

---

## D-12 — Realtime doorbell for command dispatch

**Parked:** 2026-08-11, while decomposing M5.

The plan's decision 2 gives each runtime a Realtime channel as a **doorbell** for
dispatch — at-most-once, never trusted for delivery, with the 3s poll as the
always-on fallback. M4 built the poll only and deferred the doorbell to M5, on
the stated grounds that M5 would have to authenticate the daemon to Realtime
anyway in order to broadcast transcript deltas.

**M5 declined to.** Its decision 1 sends transcript broadcasts from the ingest
route, which already holds the service role and has already resolved the
workspace from the daemon's bearer token. So the premise that made the doorbell
nearly free — "we are building daemon Realtime auth regardless" — is no longer
true, and the doorbell would have to justify that auth model on its own.

What it would cost alone: a custom JWT carrying a `runtime_id` claim, signed with
the Supabase JWT secret, minted by a new endpoint, refreshed on a timer in core,
and `realtime.messages` policies that understand a principal with no
`auth.uid()`. A second authentication model for the daemon, for latency.

What is actually lost by not having it: the delay between pressing **Run** and
the run starting is bounded by the 3s poll instead of being near-instant. A run
takes minutes. The poll costs one indexed `UPDATE … RETURNING` per runtime per
3s, returning an empty array almost every time.

**Unpark when:** the daemon needs to *receive* anything push-shaped rather than
merely react faster — live HITL approvals, interactive chat turns, or a cancel
that must land inside 100 ms. At that point the JWT is load-bearing rather than
an optimisation, and the doorbell comes along with it for nearly nothing.

**Update 2026-08-23:** chat turns — named above as a candidate trigger — were
scoped in
[`doc/specs/2026-08-23-chat-message-sending.md`](specs/2026-08-23-chat-message-sending.md)
and deliberately did *not* unpark this. The owner chose to reuse the poll +
broadcast-back pattern M4/M5 already proved, on the grounds that a chat reply
is not meaningfully worse for arriving within a few seconds instead of
instantly — the same latency tradeoff the app already accepts for starting a
run. The doorbell stays parked; the remaining named triggers (live HITL
approvals, a sub-100ms cancel) are unaffected.

---

## D-13 — Memory sync: delete propagation and contradiction sync

**Parked:** 2026-08-12, while decomposing M6.

Two things M6's own plan text does not ask for, named explicitly rather than
silently absorbed:

**Delete does not propagate.** `deleteNote()` hard-deletes the vault file and
the local `memory_notes` row with no tombstone, and the cloud schema has no
`deletedAt`/`isDeleted` column. A note deleted on machine A stays alive
forever on every machine that already pulled it, and a machine that pulls
*after* the delete never learns it happened — the cloud row simply still
exists. Building this needs a schema change M6 does not make: a tombstone
column, a decision about how long a tombstone survives before real deletion
(forever is a slow leak; too short risks a late-joining machine never seeing
the delete at all), and a pull-side rule for applying a delete without racing
an un-pushed local edit — the same class of race M6's own conflict handling
already has to solve for edits, one layer deeper.

**Contradictions do not sync**, even though `memoryContradictions` has a full
cloud mirror already sitting in the schema from M1, structurally identical to
`memory_notes`'s treatment. They are dream-cycle diagnostic output about one
machine's local corpus — a contradiction flagged from notes that exist on
that machine, evaluated against that machine's own embeddings. Syncing them
raises a real question M6 was not scoped to answer: does a contradiction mean
anything once the notes it references have been pulled onto a different
machine with a different local index state? Parked rather than answered,
because nothing today needs cross-machine contradiction review.

- **If wrong:** delete — a user who deletes a note expecting it gone
  everywhere finds it still live and still returned by `memory_search` on
  every other paired machine, which reads as data the product failed to
  respect a deletion of. Contradictions — nothing breaks; the feature simply
  does not exist yet, and nothing currently expects it to.
- **Clears when:** delete — someone designs the tombstone lifecycle and the
  pull-side ordering rule. Contradictions — cross-machine contradiction
  review becomes a real, requested feature rather than a table with an
  existing shape it would be convenient to reuse.

---

## D-14 — Custom SMTP for transactional email

**Parked:** 2026-08-16, immediately after email delivery was proven working
(closing `G-11`).

Supabase's **built-in** mailer is now confirmed delivering: an emailed sign-up
confirmation and a magic link both arrived in a real inbox and both signed the
owner in. That is enough for today, and the owner explicitly scoped it that way
— the app is not public, and the only two accounts in use are members of the
project's Supabase org.

That last clause is the whole reason this entry exists. The built-in mailer
delivers **only** to addresses that are members of the project's Supabase org,
and is rate-limited to a handful of messages an hour. Neither limit is visible
when it bites: a non-member's mail is **silently dropped**, and the classic
symptom is "it works for me and not for anyone I invite". A plus-address
(`you+test@gmail.com`) is a different string from the member address, so it may
not match the allowlist even though it reaches the same inbox.

Setting it up is not a code change — it is a provider account, a sender address
on a domain under our control, and SPF/DKIM records. Procedure, including which
providers work and the rate-limit settings to raise afterwards:
[`runbooks/email-delivery.md`](runbooks/email-delivery.md).

- **If wrong:** the first person outside the Supabase org who tries to sign up,
  reset a password, or use a magic link gets nothing at all — no error on our
  side, no error on theirs — and the account they created cannot be confirmed.
  Since sign-up now genuinely depends on delivery (the auto-confirm trigger that
  used to mask this was dropped, see `G-11`'s closure note), that is a hard
  block rather than a degraded experience.
- **Clears when:** either of these becomes true, whichever comes first —
  **(a)** anyone who is not a member of the project's Supabase org needs to
  receive mail from the app (an invited user, a customer, a teammate), or
  **(b)** the web app is deployed to a public URL. Both are certain to happen
  before the app ships products to users, which is the owner's stated horizon
  for this work.

---

## D-15 — Production Supabase project for `main`

**Parked:** 2026-08-16, by the owner, while walking through the Vercel/DNS
deployment — "later I will create a new Supabase project, and that will be
connected to the main branch," once `main`'s code is no longer a dummy
placeholder.

Vercel and Hostinger DNS already route `main` → `sparstrow.com`, and that
wiring is real. What's missing is everything downstream of it: `main` has no
environment variables and is not connected to any Supabase project, so the
live URL currently serves placeholder content. `staging` and `development`
already share one fully configured Supabase project (env vars, backend, Auth
redirect URLs) — `main` deliberately does **not** reuse it. Full picture:
[`runbooks/deploy-web-app.md`](runbooks/deploy-web-app.md).

**Unpark when:** `staging`'s build is solid enough to promote into `main`.
At that point, create a dedicated production Supabase project, connect it to
`main`, and configure its own Authentication → URL Configuration from
scratch (it does not inherit `staging`'s settings) — then follow
`deploy-web-app.md`'s "When `main` goes live" section to point a machine's
`SPARSTROW_CLOUD_URL`/`SPARSTROW_APP_URL` at `sparstrow.com`.

---

## D-16 — Sleep awareness: detecting sleep, and waking from it

**Parked:** 2026-08-16, by the owner, while giving the Machines user stories —
"if a machine is sleeping, we might need to add or trigger the machine to wake
up… Defer this task now for later." **Extended the same day** at spec review to
cover *detection* as well, when the owner chose to ship the Machines menu with
two states and revisit sleeping later.

Two parts, parked together because detection's main use is deciding whether
waking is worth offering — but they have different unpark conditions, so they
are stated separately.

### Part A — detecting that a machine is asleep

[`specs/2026-08-16-setup-and-machines.md`](specs/2026-08-16-setup-and-machines.md)
ships **two** states, active and unreachable, because a sleeping machine and a
dead one are the same silence from the cloud's side. Liveness is derived purely
from heartbeat age ([`cloud.ts:35-52`](../packages/shared/src/cloud.ts:35)).

Distinguishing them needs the machine to **announce suspension before it goes
quiet**. Electron 36 ships `powerMonitor` with `suspend`/`resume` events and it
is currently unused anywhere in `packages/desktop` (verified 2026-08-16), so
the desktop app is nearly free; headless core needs a per-OS mechanism
(systemd sleep hooks, Windows power broadcasts, launchd).

**What stays ambiguous no matter what:** a machine that loses power, crashes,
or drops off the network never gets to announce anything, and is
indistinguishable from one that was switched off. So even with Part A built,
the honest set is *active / sleeping / unreachable* — never "turned off".

*(One wrinkle in our favour: Windows Modern Standby machines keep networking
alive while asleep, so some may keep heartbeating and never need this.)*

- **Unpark when:** the two-state model proves genuinely confusing in daily use —
  the owner repeatedly cannot tell whether a machine is coming back — **or**
  Part B is wanted, which needs this first.

### Part B — waking a sleeping machine from the web app

The intent: a machine showing as asleep gets a control in the web app that
wakes it, so work can be sent without walking over to the computer. A machine
genuinely powered off stays out of reach, and that is accepted.

**The constraint that makes this bigger than a button**, recorded now so
nobody unparks it expecting an afternoon's work: a cloud web app cannot wake a
machine on its own. Wake-on-LAN works by broadcasting a magic packet **on the
machine's own local network**, and `staging.sparstrow.com` is not on it. The
packet cannot route across the internet to a machine behind NAT. So waking
needs one of:

- **a second always-on paired machine on the same LAN**, which receives the
  request from the cloud and broadcasts the packet locally — the only option
  that needs no router configuration, and it means waking requires two
  machines on that network;
- **router configuration** — a directed-broadcast forward or a static ARP
  entry, per network, often disabled by default and a real security tradeoff;
- **vendor out-of-band management** (Intel AMT/vPro and equivalents), which is
  enterprise hardware only and not present on typical machines.

Also unverified: whether the target machine's NIC has WoL enabled at all — it
is a BIOS/firmware setting that is off by default on many consumer machines,
and no amount of software fixes that.

- **If wrong:** nothing breaks — the feature simply does not exist, and a
  sleeping machine is woken the way it is woken today, by touching it. The
  risk is the opposite one: shipping a **Wake** button that silently does
  nothing on most networks would be worse than having no button, because it
  teaches the owner the app is unreliable.
- **Unpark when:** the owner has a second always-on machine on the same
  network as the one they want woken (making the relay option real), **or**
  reaching a sleeping machine becomes routine friction rather than an
  occasional annoyance. Whichever comes first — and confirm WoL is actually
  enabled on the target machine's NIC before building anything.

---

## D-17 — Settings → Display: the theme picker UI

**Parked:** 2026-08-18, by the owner, while locking `DESIGN.md` — the theming
*contract* was decided and written (§2), the *picker* was explicitly left as its
own piece of work.

The owner asked for user-selectable brand colour and surface character
("paper, slate, soft, mono"), exposed in Settings. §2 defines what any theme
must satisfy — curated presets only, one accent role, status colour never
themeable, every preset clearing 4.5:1 in both modes. What it deliberately does
not define is the UI, or where the choice is stored.

Open sub-questions the spec has to answer: whether the choice is per-device or
synced to the account; whether it applies instantly or on save; what a viewer
sees before their preference loads (a flash of the default is a real problem on
a dark-first app); and whether density joins brand and surface as a third axis
(§13 lists that as undecided).

**The dependency cleared on 2026-08-19.** `G-19` closed: `globals.css` is
parametric, and the four surfaces and five brand presets ship as root classes.
Adding `surface-slate` or `theme-teal` to `<html>` re-themes the whole app
today, so a picker would now be wiring a control to something real rather than
to nothing.

- **Still parked, and this is the point:** what is missing is not mechanism, it
  is the product decision. Per-device or synced to the account? Instant or on
  save? What a viewer sees before their preference loads — a flash of the
  default is a real problem on a dark-first app. And whether density joins brand
  and surface as a third axis (§13 lists that as undecided).
- **Unpark when:** the owner wants it. It needs a `product-requirements` pass
  before build, and that pass is now the only thing between here and shipping
  it. Recorded as `DD-006` in `design-system/DECISIONS.md`.

> **Sequenced 2026-08-19.** The owner chose to hold all further colour/theme
> design work — this picker included — until **machine pairing is working
> end-to-end**, rather than running it in parallel. Machine pairing itself
> (`sparstrow pair`) has shipped since M3 (2026-08-10); what is still open is
> walking the full setup-and-machines spec against staging (`M11`, band 13),
> which is blocked on an owner action — pointing a machine's
> `SPARSTROW_CLOUD_URL` / `SPARSTROW_APP_URL` at `staging.sparstrow.com` — not
> on any undone engineering. See
> [`runbooks/deploy-web-app.md`](runbooks/deploy-web-app.md).
> **Unpark trigger is now:** M11 (band 13) reported done, in addition to the
> owner wanting the picker.

---

## D-18 — Entity profiles and the in-app tab strip

**Parked:** 2026-08-18, by the owner, on locking `DESIGN.md` §9 — the owner
asked for the navigation *instruction* to exist so agents design to it, not for
the feature to be built in the same turn.

`DESIGN.md` §9 fully specifies it: an outer tab strip (which entity's profile is
open), a side sub-nav (which section of that entity), a smart-default +
modifier-key destination model for tangential actions, and mandatory ARIA/
keyboard requirements from the first commit. Proved interactively in
`design-brief/entity-profile-board.html`, including that per-tab state survives
switching away and back.

None of it is built. Today no detail view exists for a machine or an agent at
all, and `project-detail.tsx`'s tabs are a *different*, sidebar-panel pattern.

§9.4 fixes the order and the reason: **Machines** first (a real gap, nothing to
regress), **Agents** second (same shape of gap, still greenfield), **Projects**
last and deliberately — it is the only one of the three that is a migration of
working code rather than new work.

- **Unpark when:** the design-system rebuild lands (this needs the doctrine's
  tokens to exist) and Machines gets a `product-requirements` pass — it is still
  outside `specs/2026-08-16-setup-and-machines.md`, whose "profile" means the
  *user's* profile, not a machine's. Recorded as `DD-003`/`DD-008`.

---

## D-19 — Rename `@sparstrow/daemon` back to `@sparstrow/core`

**Parked:** 2026-08-22, by the owner — "I like the word core than daemon, at
the end of complete development when we have to discard the old core folder,
let's rename the daemon to core in all places and remove any references."

**Why "daemon" exists at all.** Before 2026-08-09, `@sparstrow/core` was the
whole single-machine runtime — a Fastify server + Vite SPA, no cloud/local
split — and there was no need for a second name. The word "daemon" was
introduced the same day as the Next.js migration (`67bd615`) and the Postgres
control-plane split (`b1891cb`), in
[`doc/plans/2026-08-09-daemon-cloud-control-plane.md`](plans/2026-08-09-daemon-cloud-control-plane.md),
which explicitly frames the new per-machine role as **"the Multica model"** —
a competitor studied for its architecture, not its skin (see `DESIGN.md` §14).
"Daemon" was borrowed terminology for that role, not an organic repo name.

**Current state.** Per `AGENTS.md` §4, the `@sparstrow/daemon` split from
`@sparstrow/core` is a **planned goal, not yet built** — there is no
`packages/daemon/` directory today (confirmed on disk 2026-08-22). Everything
that would live there — pairing, heartbeat, run execution, command polling —
currently lives in and runs as `@sparstrow/core`. So "daemon" today is a role
name used in docs/plans/AGENTS.md, not a package.

**The decision.** When that split is eventually done for real — i.e. when the
current `packages/core/` folder is discarded/replaced by whatever the daemon
work produces — do **not** create `packages/daemon/`. Instead, name the new
per-machine execution package `@sparstrow/core` (reusing the name once the old
folder is gone) and sweep every "daemon" reference back to "core": package
name, import paths, `AGENTS.md`'s directory layout and §4 environment section,
plan/task docs that use the word going forward, code comments, route names
(e.g. `/api/daemon/*`), and schema identifiers where renaming is still cheap
(`daemon_tokens`, etc. — evaluate case by case, since some of these are already
live in Postgres and a rename there is a migration, not a find-replace).
Historical docs (`doc/plans/2026-08-09-daemon-cloud-control-plane.md`, this
entry, closed `doc/tasks/` records) keep the word "daemon" as the accurate
historical record of what happened — this is a go-forward rename, not a
rewrite of history.

- **If wrong (i.e. left undone):** no functional harm — "daemon" is a naming
  preference, not a correctness issue. The cost of leaving it is purely
  cognitive: the codebase carries two names for the same concept
  indefinitely, and the terminology mismatch this very conversation started
  from recurs for every future agent or contributor.
- **Unpark when:** the `@sparstrow/daemon` package split actually begins —
  i.e. exactly the moment `AGENTS.md` §4 currently says "don't create
  `packages/daemon/` speculatively" stops applying. Do the rename as part of
  that same body of work, not as a separate later pass.

---

## D-20 — Memory injection on the chat path

**Parked:** 2026-08-23, during planning for
[chat message-sending](plans/2026-08-23-chat-message-sending.md) — the owner
confirmed the lighter scope (DD-6 in that plan) over full memory injection for
the first build.

The spec's US1.2 says a Project or Agent chat reply should reflect "that
project's directives and memory the same way a task run already does." What
ships in M13 is the lighter half: the project's system prompt, its read-only
repository tools, and its directives, carried to whichever machine picks up
the turn. What does not ship is a memory block — `RunManager` injects one via
`buildMemoryBlock` behind an actual `runs` row; the chat path runs through
`completeOnce`, documented as *"NO run row, NO memory injection,"* and pulling
memory retrieval into a chat turn is a second feature, not a corollary of
message dispatch.

**Unpark when:** the owner wants a chat reply to draw on the project's memory
notes the way a run does — at that point this needs its own scoping (does
every turn re-run retrieval, or only the first in a session; does injected
memory count toward `buildMemoryBlock`'s existing budget; does a Free or
Agent-only session get anything at all).

## D-22 — Settings-managed `claude-code` OAuth token, hot-reloaded per spawn

**Parked:** 2026-08-23, by the owner — "I like the idea, but... save the
idea... We can build that later," while getting a `claude setup-token`
credential set up (that step, tracked as `D-21`, is done — the owner ran
it, and this agent confirmed live that headless `claude-code` chat turns
work; `G-31`/`KnownGaps.md` has the evidence). Raised while explaining why
the in-app Terminal can't be used as a shortcut for `claude setup-token`
(it spawns a genuinely separate OS process; nothing typed there reaches the
daemon).

The owner switches between two Claude accounts and wants Sparstrowgen's
headless `claude-code` chat turns to use whichever account they currently
consider active — without leaving the app, and without restarting the
daemon each time. Today's only working mechanism
(`CLAUDE_CODE_OAUTH_TOKEN`) is an OS env var, bound to whichever account was
active when `claude setup-token` created it and decoupled from any later
interactive account switch, read once at daemon startup — so switching
means re-running `setup-token`, re-exporting it in whatever launches the
daemon, and restarting — real friction, and not what was asked for.

**The fix already has ~90% of its plumbing built**, reusing an existing
pattern rather than inventing one:

- `packages/core/src/secrets/secret-store.ts` already stores direct-API
  provider keys (`SECRET_ANTHROPIC_API_KEY`, `SECRET_GEMINI_API_KEY`)
  AES-256-GCM-encrypted on disk, read fresh via `getSecret()` on every
  call — no caching, no restart needed to pick up a change.
- `packages/core/src/api/routes/providers.ts` already exposes
  `GET/PUT/DELETE /providers/:id/key` for exactly this kind of credential,
  with a masked-hint-only read path.
- `packages/ui/src/routes/pages/settings.tsx`'s `ProviderKeyInput` already
  renders a Save/Replace key field per provider card in Settings.

All three currently gate on `provider.kind === "direct_api"` —
`requireDirectProvider` in `providers.ts` explicitly excludes CLI providers
("ollama + CLI providers need no stored key"), which was a correct
assumption until this need existed. The work is: add
`SECRET_CLAUDE_CODE_OAUTH_TOKEN`, let `claude-code` opt into the existing
key-storage route without becoming a `direct_api` provider (a CLI provider
with an optional stored credential, not a new provider kind), wire
`buildHeadlessSpawn`'s `extraEnv` (`packages/core/src/providers/claude-code.ts`)
to read it via `getSecret()` at spawn time, and show the input in Settings.
Pasting a new `claude setup-token` output there would take effect on the
very next chat message — no restart, no terminal, no leaving the app.

**Unpark when:** the owner asks for it, or the two-account switching
friction from the manual env-var-plus-restart mechanics above becomes
actively painful enough to prioritize. Not urgent — that manual path works
today, just with more friction than this would have.

---

## D-23 — Rewrite browser-tool guidance for Claude Code agents specifically

**Parked:** 2026-08-24, by the owner — "defer task on this instruction on
guidance on which browser to use later," while asking whether the Playwright
MCP should be replaced by Claude's own native browser tools (the in-app
Claude Browser preview pane, `mcp__Claude_Browser__*`, and Claude in Chrome,
`mcp__claude-in-chrome__*`) across `AGENTS.md`, `doc/runbooks/agent-browser-session.md`,
and the `frontend-verify` skill, since Playwright is generic MCP tooling
built for any coding agent, not Claude Code specifically.

**Why this isn't a same-day rewrite.** Checked live before parking, not
assumed: the Claude Browser pane still has the exact bug
`agent-browser-session.md` already documents as the reason Playwright was
adopted — it reports `document.visibilityState === "hidden"` on a fresh,
foregrounded navigation, which starves any page whose data fetching gates on
visibility (React Query, used throughout this app). See
[`bug/BUG-2026-08-24-claude-browser-pane-reports-hidden-visibility`](bug/BUG-2026-08-24-claude-browser-pane-reports-hidden-visibility.md).
Claude in Chrome would sidestep that (it drives a real browser window, not
an emulated pane) but isn't usable here either: `list_connected_browsers`
returned empty and the extension reported unreachable in this session. The
owner confirmed this is expected — they manually swap Chrome between two
accounts, so the extension isn't kept signed in standing, and reconnecting
it just for this isn't worth doing right now.

So both named alternatives have a real reason they can't simply replace
Playwright today: one has an open bug, the other isn't connected. Rewriting
the guidance now would either bake in a regression or point at a tool that
doesn't work in this environment.

- **If wrong (i.e. left unparked with stale guidance):** no functional
  harm — `AGENTS.md`/the runbook/`frontend-verify` still correctly point at
  Playwright, which works. The cost of leaving this parked is purely that
  Claude Code agents keep using the generic tool instead of a potentially
  better-integrated native one, once native tooling is actually ready.
- **Unpark when:** `BUG-2026-08-24-claude-browser-pane-reports-hidden-visibility`
  is fixed (or a workaround is found), **and** the owner wants Claude in
  Chrome set up and kept connected (or a per-session reconnect step is
  judged worth the friction). At that point, rewrite `AGENTS.md`'s MCP
  server description, `doc/runbooks/agent-browser-session.md`'s "Getting a
  browser that actually renders" section, and the `frontend-verify` skill to
  prefer the native tool(s), with Playwright kept as the documented fallback
  for environments where they aren't available.

---

## D-24 — Collapse to three components: one Next.js UI, Electron as a shell, headless core

**Parked:** 2026-08-24, by the owner — "My expectation is to have one webapp
next.js and same app in electron app for desktop. If the people don't want to
use electron app, then daemon service installed on the machine and people can
use it from web. This is my three apps component idea."

**The target shape.** Three components, each with one job:

| Component | What it is | What it uniquely provides |
|---|---|---|
| `apps/web` (Next.js) | The one and only UI | Everything visible |
| `packages/desktop` (Electron) | A window pointed at that UI, plus a daemon supervisor | Bundles and supervises the daemon, tray, auto-update, survives reboot — the user never registers a service by hand |
| `packages/core` headless service | Daemon-only install, no GUI | For users who skip Electron and drive the app from a browser |

The decisive rename is **Electron is a shell, not a second UI**. Today it is
ambiguous: it ships a window *and* a UI.

**Current state — the old Vite app was never removed.** `apps/web` was created
fresh as Next.js App Router in `67bd615` (2026-08-09) and is where all
subsequent work landed. But the pre-migration Vite SPA is still built
(`packages/ui`'s `vite build`), still served as static files with SPA fallback
by the daemon's own Fastify server
([`server.ts:138`](../packages/core/src/api/server.ts:138)), and is still what
a packaged Electron build loads **by default**:
[`urls.ts:43`](../packages/desktop/src/urls.ts:43) loads `SPARSTROW_APP_URL`
only when it is set, and nothing sets it. So the desktop app's out-of-the-box
experience is currently the old app.

**Why the Vite SPA is not an offline mode.** `packages/ui` contains no Supabase
code at all (verified by search 2026-08-24) — it is the pre-cloud, pre-auth,
single-machine UI, talking to local core over `wsHub`. It has no concept of an
account, a workspace, or cloud dispatch. Since dispatch, chat, projects and
runs are cloud-canonical (`AGENTS.md` §4), it cannot do the work anyway.
Keeping it as a fallback preserves a *different, older product*, not a degraded
version of the current one.

**Nothing is left to port.** All 25 pages in `packages/ui/src/routes/pages/`
have a counterpart in `apps/web/src/app/` (diffed 2026-08-24; route parity
shipped in M7, `ec66a1a`).

**What gets deleted when this is done.** `packages/ui` itself **stays** — it is
the component library `apps/web` imports from. What ends is its second life as
an app:

- `packages/ui/src/routes/pages/*` and the Vite app entry (`vite dev` /
  `vite build`)
- `packages/ui/src/components/layout/app-shell.tsx` — the Vite/desktop shell
- the `fastifyStatic` / SPA-fallback block in
  [`packages/core/src/api/server.ts:138`](../packages/core/src/api/server.ts:138)
- `resolveLocalUiUrl` and the `SPARSTROW_DEV`/`SPARSTROW_UI_URL` fallback in
  [`packages/desktop/src/urls.ts`](../packages/desktop/src/urls.ts)

**This supersedes [`G-23`](KnownGaps.md)'s remaining half.** G-23 asks for the
two `AppShell` components to be merged — including building an `Outlet`
equivalent for Next's `children`-based shell. If one of the two shells is being
deleted, that merge is work that should not be done. Do not start it. When this
entry is executed, close G-23 by deletion rather than by merge.

**What is genuinely lost.** The desktop app stops working without internet.
This is a real product decision and should be taken deliberately, not absorbed
silently — though in substance it is already true, since every canonical
surface is cloud-side and the local SPA cannot authenticate.

**Sequencing.** [`D-10`](#d-10--headless-non-electron-core-distribution)
(headless core distribution) is the prerequisite and *is* component 3 — until
it exists, "I don't want Electron" has no answer. It is already sequenced to
get its own spec once `specs/2026-08-16-setup-and-machines.md` lands. Then:
repoint Electron's default to the hosted app; verify a packaged build loading
it; delete the Vite app last.

- **If wrong (i.e. left parked):** the repo carries two UIs indefinitely, one
  of which predates authentication. The concrete risk is not drift between
  them — it is that anyone installing the packaged desktop app today gets the
  pre-cloud UI as their first impression, with no account and no workspace.
  Cost also compounds: every shared component change is weighed against a host
  that is slated for deletion.
- **Unpark when:** `D-10` ships a headless core distribution — at that point
  all three components exist and only the repoint-and-delete remains. Bring it
  forward if a packaged Electron build is put in anyone else's hands before
  then, since that is the moment the old-UI default becomes user-visible.
