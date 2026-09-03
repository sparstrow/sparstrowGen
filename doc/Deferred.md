# Deferred

Agreed in principle, explicitly parked. Distinct from `Ideas.md`: these have a
decision behind them and a reason they're not being built *yet*.

Each entry records what triggers picking it back up, so nothing sits here purely
because it was forgotten.

> **2026-09-02 — the restructure rewrote parts of this file.** The
> [restructure plan](plans/2026-09-02-multica-architecture-restructure.md)
> superseded five entries (`D-1`, `D-15`, `D-19`, `D-24`, `D-25`) and **added
> eight**, one per parked subsystem. This is the one register that got *bigger*:
> parking a subsystem is a real decision with a real unpark trigger, and writing
> it down here is what keeps "parked" from silently becoming "abandoned".
>
> `D-24` deserves particular attention if you are reading this file for
> direction. It described the target architecture in the owner's own words, and
> it is the architecture the restructure exists to undo.

---

## D-1 — HITL gate ~~redesign~~ — **CUT 2026-09-02, superseded**

**Superseded:** 2026-09-02, by the owner, during the restructure. The gate is not
being redesigned later — it is being **removed now**, schema and all.

**Original parking:** 2026-08-09, by the owner — "One thing I want to modify is
the human gate feature. We can do it later." No UI was ever built against it.

**Applied to the shared Supabase project 2026-09-02**, with the owner's explicit
approval, via `apply-pending.mjs` (dry-run first, then committed). Verified
after: zero `hitl_approved` columns remain, and `task_questions` is still
present — the check that the correction below was actually honoured, not just
written down.

**What is removed:** `tasks.hitl_approved` (migration
`packages/shared/drizzle/0013_drop_hitl_approved.sql`) and the `paused_hitl`
mention in the `runs` schema comment. That is all of it. The column was declared
`NOT NULL DEFAULT true` and read by nothing — no route, no action, no daemon
path, no UI — and `paused_hitl` was never a value in `runStatusSchema`, so it
needed no migration at all. Both existed only to make an approval gate look
present in the schema when none existed in the product.

**Correction, same day: `task_questions` is NOT part of this and stays.** The
first draft of this entry and of the restructure plan both listed it for
removal. That was wrong, and it would have broken live code:
`apps/web/src/app/tasks/actions.ts` writes answers to it,
`lib/api/handlers/tasks.ts` reads it, `components/providers.tsx` subscribes to
it over realtime, and the local SQLite twin drives
`packages/core/src/taskboard/questions.ts` and `delegation.ts`.

The two were conflated because both involve a human. They are opposites:
**the gate is a human granting permission before work runs; a task question is
an agent asking for information during it.** Only the first is cut. Worth
keeping in mind on unpark — "human in the loop" names two mechanisms in this
codebase, and the useful one was never the one that was missing.

**Why removing it is safe *today* and not safe later.** HITL gates are one of
three mitigations for the security consequence of cloud-canonical dispatch —
anyone who can write a task row targeting your runtime can cause code to run on
that machine. The other two, workspace-scoped RLS and the `effectiveTools` clamp
at spawn, are live and stay live. With exactly one person in the workspace, the
gate mitigates a threat that does not exist: the only person who can write that
task row is the person who owns the machine.

That stops being true the moment a second person joins, because
[`G-35`](KnownGaps.md) records that **any workspace member has full read and
write on all workspace content** — there is no viewer role and no read-only
anything. A second member is, today, someone who can run code on your computer.

**Unpark when:** before the first external collaborator is added to any
workspace. Not "when there is a design" — the design is the easy half. This is a
hard precondition, and `G-35` is the entry that proves why.

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

## D-15 — ~~Production Supabase project for `main`~~ — **SUPERSEDED 2026-09-02**

> **Superseded** by the restructure. The owner's decision: **one Supabase project
> serves both `development` and `main`**, and feature branches use a local Docker
> Supabase (`supabase start`) instead of sharing the cloud project. `staging` is
> retired entirely, so the "promote into `main` once `staging` is solid" trigger
> below no longer describes a real workflow.
>
> Note what survives: a dedicated production project is still the *right* end
> state once there are real users and real data to protect. It is now an
> `Ideas.md`-shaped thought rather than an agreed-and-parked one, because the
> condition that made it agreed — a separate `staging` tier to promote from —
> is gone. Re-raise it deliberately when the app has users, not by reviving this
> entry.
>
> Everything below is kept as the historical record of the DNS/Vercel wiring.

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

## D-19 — ~~Rename `@sparstrow/daemon` back to `@sparstrow/core`~~ — **SUPERSEDED 2026-09-02**

> **Superseded** by the restructure, which resolves the naming question in the
> opposite direction and for a different reason.
>
> The owner's preference for the word "core" is honoured — but it now names the
> **client** package, matching multica's layout exactly: `packages/core` is
> ApiClient / WSClient / react-query / stores, with no UI and no server code.
> Today's `packages/core` (the Fastify server + agent engine) becomes `server/`,
> and the daemon becomes `server/cmd/daemon.ts` — a second entry point over
> shared `server/src/internal/` code, exactly as multica's `cmd/multica` and
> `cmd/server` share `internal/`.
>
> So "daemon" stops being a package name at all, which was the actual complaint.
> It becomes a *role* — what one of the two binaries does — which is what the
> word should have meant from the start.

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

## D-24 — ~~Collapse to three components: one Next.js UI, Electron as a shell, headless core~~ — **SUPERSEDED 2026-09-02**

> **Superseded, and this is the one to read carefully.** This entry recorded the
> target architecture in the owner's own words, and it is the architecture the
> 2026-09-02 restructure exists to undo. An agent that follows it will rebuild
> the exact trap the restructure is removing.
>
> **What it got right:** "Electron is a shell, not a second UI." That sentence is
> still true and the restructure keeps it.
>
> **What it got wrong:** *which* UI the shell displays. This entry says Electron
> points a window at the Next.js app. That single choice is what forced the
> packaged desktop build to bundle a Next.js standalone server, a second Node
> runtime, and every native module the daemon needs — three runtimes inside one
> installer, all required to ABI-match. It is why the desktop app was never once
> opened and used in five months of work.
>
> **What replaces it.** The window renders a Vite React SPA
> (`apps/desktop/src/renderer`) that imports the same `packages/core` +
> `packages/views` + `packages/ui` the web app imports, and talks to `server/`
> over HTTP/WS. Nothing but the UI ships inside Electron. The daemon is
> supervised as a separate process, as it already is.
>
> The three-component instinct was right; the mistake was making the *UI* the
> shared thing instead of the *server*. Sharing a server gives web, desktop and
> mobile the same product. Sharing a Next.js UI gives desktop a packaging problem
> and gives mobile nothing at all.
>
> Everything below is kept as the historical record — including its accurate
> account of the Vite-app removal, which did happen.

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

**Nothing is left to port, and less is duplicated than it looks.** The page
components in `packages/ui/src/routes/pages/` are **shared, not Vite-only** —
almost every route in `apps/web/src/app/` is a 7-line re-export of one
(verified 2026-08-24). Route parity shipped in M7 (`ec66a1a`) by sharing the
pages, not by copying them.

**What gets deleted when this is done.** `packages/ui` itself **stays**, and so
do its `routes/pages/*` — `apps/web` renders them. What ends is only the Vite
*host*:

- `packages/ui/index.html`, `vite.config.ts`, `src/main.tsx`, `src/router.tsx`
  and the `dev`/`build` scripts in `packages/ui/package.json`
- `packages/ui/src/components/layout/app-shell.tsx` — the Vite/desktop shell
- the `fastifyStatic` / SPA-fallback block in
  [`packages/core/src/api/server.ts`](../packages/core/src/api/server.ts)
- `resolveLocalUiUrl` and the `SPARSTROW_DEV` fallback in
  [`packages/desktop/src/urls.ts`](../packages/desktop/src/urls.ts)

**Where the pages go.** Once the Vite host is gone there is no second consumer,
so `packages/ui/src/routes/pages/*` has no reason to live in a shared package —
that location exists only because two hosts needed the same files. Move each
page into `apps/web/src/app/<route>/` beside its `page.tsx`, deleting the
7-line re-export as you go, and let `packages/ui` narrow to what the
`create-turbo` convention actually intends: a design system
(`components/ui/*`, tokens, `cn()`).

`apps/web/src/lib/react-router-mock.tsx` — the shim translating
`@tanstack/react-router` calls into Next's router — dies with the last page
that imports it. It is the clearest marker of the transition: nobody designs
that file, it exists purely so one component can satisfy two routers.

> **Scope check, 2026-08-24.** The shim is wired as a build-level alias in
> [`next.config.ts:11`](../apps/web/next.config.ts:11) and
> [`tsconfig.json:25`](../apps/web/tsconfig.json:25), not imported by name, and
> `@tanstack/react-router` is imported by **ten non-page components** in
> `packages/ui/src/components/` as well as by the pages — `attention-queue`,
> `breadcrumbs`, `command-palette`, `pinned-items`, `tab-strip`,
> `workspace-switcher`, `pr-queue`, `work-launcher`, `markdown`, `app-shell`.
> Those are app composites, not design-system primitives, so they move to
> `apps/web` under the same rule and get Next's router directly. The shim dies
> with the last **component** that imports it, which is a little later than the
> last page.

This is a **mechanical move, not a rewrite**. Converting those pages to Server
Components is a separate concern and deliberately not folded in here — see
[`D-25`](#d-25--converge-the-existing-pages-on-server-components).

**This supersedes [`G-23`](KnownGaps.md)'s remaining half.** G-23 asks for the
two `AppShell` components to be merged — including building an `Outlet`
equivalent for Next's `children`-based shell. If one of the two shells is being
deleted, that merge is work that should not be done. Do not start it. When this
entry is executed, close G-23 by deletion rather than by merge.

**What is genuinely lost.** The desktop app stops working without internet.
This is a real product decision and should be taken deliberately, not absorbed
silently — though in substance it is already true, since every canonical
surface is cloud-side and the local SPA cannot authenticate.

**Confirmed 2026-08-24.** The owner accepted Electron-as-shell and online-only
for now: "I am fine with the electron app being a shell and online only until I
have all the required features and functionality. Then we can build an electron
packaged app." So packaging is explicitly *after* feature completeness, and the
offline loss above is an accepted cost rather than an open question.

> **Unparked 2026-08-24** — the owner made this the current priority ("our
> priority right now is transitioning to the next.js app from the vite app and
> clearing that out"), ahead of the D-10 trigger below. Planned as
> [`plans/2026-08-24-retire-the-vite-app.md`](plans/2026-08-24-retire-the-vite-app.md).
>
> **That plan found a cost this entry did not know about.** Core implements 31
> handlers — terminals, folder browsing, project git, the code graph, provider
> settings, local skill import — that `apps/web` stubs with a 501. Retiring the
> Vite app therefore *removes working features*, it is not only a duplication
> cleanup. The owner accepted that loss deliberately; see the plan's decision 1
> for the reasoning and the condition that would reverse it.

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

---

## D-25 — ~~Converge the existing pages on Server Components~~ — **SUPERSEDED 2026-09-02**

> **Superseded** by the restructure. This entry proposes moving pages *deeper*
> into Next.js; the restructure moves them out, into `packages/views`, so desktop
> and mobile can render the same screens.
>
> The problem it identifies is real and worth keeping in mind: a `"use client"`
> page fetching through React Query arrives as a loading state, and creating
> something costs two round trips. But Server Components are a Next-only answer,
> and any screen that depends on them is a screen the desktop app cannot show.
>
> **The restructure's answer to the same problem** is prefetching and cache
> seeding inside `packages/core` — hydrate the query cache from a single response
> rather than render on the server. That works identically in Next.js, in the
> Electron renderer, and in Expo, which is the whole point.
>
> Everything below is kept as the historical record of the latency analysis,
> which remains accurate.

**Parked:** 2026-08-24, by the owner, on reviewing the target state — the shape
is agreed; only the timing is parked.

**What is true today.** Nearly every route in `apps/web` is a 7-line re-export
of a client component in `packages/ui`, fetching through React Query against
`/api/v1/*`. Those pages are necessarily `"use client"` — they use React Query
hooks. A client component *is* still server-rendered on first request, so the
HTML is not empty; but it is the **loading** state, because the only code that
knows how to fetch runs in the browser. The page is structurally incapable of
arriving with data in it.

**The scenario.** Priya clicks Agents. She sees skeleton rows immediately, then
her browser downloads the page's JavaScript, hydrates, and only then asks
`/api/v1/agents` — which re-checks her session with Supabase Auth, resolves her
workspace, queries Postgres, returns JSON. On office wifi that is a flicker; on
a phone on hotel wifi it is a visible pause where the app looks loaded and is
empty. Creating an agent costs two round trips, not one: the POST, then a list
refetch to make the new row appear.

**The target.**

| Where | What |
|---|---|
| `packages/ui` | Design system only — `components/ui/*`, tokens, `cn()` |
| `apps/web/src/app/<route>/page.tsx` | Server Component: auth + query, renders with data |
| `apps/web/src/app/<route>/*-client.tsx` | `"use client"` islands for interactivity |
| `apps/web/src/lib/api/handlers/` | Thins to streaming and daemon-facing surfaces |

Reads move into the Server Component and hit Postgres directly — one hop
instead of three. Ordinary writes become Server Actions with `revalidatePath`
— one round trip instead of two.

**Streaming is the exception, and not a small one.** Server Actions are
request/response and do not stream. Terminals, and live run transcripts, need a
route handler or WebSocket regardless of anything here. `/api/v1` therefore
**thins; it does not disappear.** Anyone reading this entry as "delete the
handler registry" has misread it.

**This entry governs the existing pages only.** New surfaces are built the
target way from the start — that is a standing rule in
[`apps/web/CLAUDE.md`](../apps/web/CLAUDE.md), not a deferral, and it applies
to every one of the modules still stubbed in
[`stubs.ts`](../apps/web/src/lib/api/handlers/stubs.ts).

- **If wrong (i.e. left parked):** nothing breaks and nothing is unsafe — the
  current pattern works and is well organised. The cost is a slower first paint
  on every route, a larger JS bundle, and `loading.tsx` / Suspense being
  unable to do anything useful. It is felt most on a slow connection and
  least on the owner's own machine, which is exactly why it can go unnoticed.
- **Unpark when:** per-route and opportunistic — convert a page the next time
  feature work touches it, rather than as a scheduled migration. Two
  backstops that make it deliberate instead: convert wholesale if a real
  first-paint complaint arrives from someone who is not the owner, and do the
  first conversion in the same body of work as `D-24`'s page move, so there is
  one worked example in-tree for the rest to copy.

---

## D-26 — A cloud record of who opened a shell and when

**Parked:** 2026-08-24, writing
[the terminal plan](plans/2026-08-24-a-terminal-on-my-machine.md) (DD-5) — a
deliberate scope line, not an oversight.

A terminal session is a process on a machine. DD-5 makes the machine the source
of truth for its own processes and puts no `terminal_sessions` table in the
control plane, because a mirror row disagrees with reality the instant the
machine restarts and the app then shows a list of shells that do not exist.

What that gives up is the **audit trail**: nothing in the cloud records that a
shell was opened on someone's computer, by whom, or when. Today that record is
the machine's own log. The plan's own Assumptions state this plainly rather than
leaving it implied.

- **If wrong (i.e. left parked):** with one person in the workspace, the loss is
  small — the only person who could have opened a shell is the person asking.
  With a second owner/admin it becomes real and awkward: FR-009 restricts
  terminals to owner/admin precisely because a shell is unrestricted, and
  "unrestricted, and unlogged" is a materially different posture from
  "unrestricted, and recorded". The gap is also retroactive — a trail cannot be
  reconstructed after the fact.
- **Unpark when:** a second person holds owner or admin on any workspace. That
  is the trigger, not a date. It also unparks naturally alongside
  [`I-10`](Ideas.md)'s members-and-invites work, since that is the change that
  creates the second admin.
- **Shape when it happens:** an append-only cloud event written by the daemon on
  session open and close, through the existing authenticated `/api/daemon/*`
  path — fire-and-forget, never on the critical path, so a failed write delays
  no keystroke. Explicitly not a mirror of live session state, which is what
  DD-5 rejects.

---

## D-27 — Live cancellation of an in-flight plan node/run

**Parked:** 2026-08-25 — the owner answered
[`OQ-8`](OpenQuestions.md) (now closed, answer recorded there) with **option
B**: clicking "Cancel this step" on a goal's plan graph should actually stop
the work, not just relabel it. That is a real, cross-package feature, not a
`T-WA-04`-sized Server Action conversion, so it is parked here rather than
folded into `T-WA-04` (already merged, `useCancelNode` shipped unconverted) or
band 22 (`WA` — mechanical write-transport conversion only, no new backend
behavior per plan DD-6).

Building it for real needs, at minimum:
- A genuine `cancelled` value on `TaskStatus`
  (`packages/shared/src/schemas/task.ts`) distinct from `failed`, since a
  stopped step and a broken one must not read the same everywhere the app
  displays task status (board, attention queue, reporting).
- A stop-signal contract from the control plane down to the daemon actually
  executing the run — nothing in `packages/core`/`packages/daemon` today
  receives or honors a cancel signal for an in-flight process. This is the
  real scope: designing how a daemon polls for or is pushed a cancel request,
  how it kills the child process cleanly, and how the `runs` row and the
  linked task settle afterward.
- Wiring `cancelNodeAction` (`app/tasks/goals/[goalId]/actions.ts`) to that
  contract once it exists, replacing the currently-unconverted
  `useCancelNode` hook and its 404ing `POST /goals/:id/nodes/:nodeId/cancel`
  call site.

**If wrong (i.e. left parked):** low — the button stays exactly as broken as
it is today (calls a route that has never existed), which is the same
no-worse-than-status-quo state `T-WA-04` already shipped it in. No user is
worse off than before this was raised.

**Unpark when:** this becomes prioritized work. Given the scope (a real
daemon-side dispatch contract touching `packages/core`, the control plane's
`runs` table, and the web UI), the next step when picked up is a
`doc/specs/` entry per the normal idea → spec → plan → tasks lifecycle, not a
task dropped directly into an existing band — this is a new feature, not a
conversion.

---

## D-28 — `memory.tsx`'s six writes were never assigned to a WA-phase task

**Parked:** 2026-08-26 — found by `T-WA-09`'s mandated sweep
(`grep -rnE "use(Mutation|Create|Update|...)...\(\)" --include=*.tsx`), which
turned up real, non-stub write hooks with no task in `doc/tasks/WA/` naming
`apps/web/src/app/memory/memory.tsx` at all. Every other real hit the sweep
found (`manager-chat-panel.tsx`'s `useCreatePipeline`,
`blocked-project-actions.tsx`'s four hooks) was at least a *known* remaining
consumer some earlier task's Result section had flagged and left for later;
`memory.tsx` was never mentioned by any task file in this phase, which is why
this is `Deferred.md` and not a same-turn fix — it is not one or two call
sites next to a file this session already had open, it is a whole
unconverted page.

**Six real, working routes, all unconverted:**
- `useCreateMemoryNote` → `POST /memory/notes`
- `useDeleteMemoryNote` → `DELETE /memory/notes/:id` (two call sites: the
  main list's delete action, and the "reject" action on a quarantined note)
- `useBulkDeleteNotes` → `POST /memory/notes/bulk-delete`
- `useApproveNote` → `POST /memory/notes/:id/approve`
- `useArchiveNote` → `POST /memory/notes/:id/archive`

(`useUpdateNoteRaw` → `PUT /memory/notes/:id/raw` is correctly excluded — that
path is a `stubs.ts` host-local pattern, a real DD-6 exclusion, not part of
this gap.)

**Why not fixed inline by `T-WA-09`:** this is comparable in size to any one
of `T-WA-02` through `T-WA-08` individually — six hooks, a dedicated
`app/memory/actions.ts`, its own test file, its own live verification pass —
not a one- or two-call-site correction. Converting it as a side effect of the
*verification* task would be exactly the scope inflation `AGENTS.md` §9
warns against, and would leave this task's own actual job (proving the other
eight tasks didn't break anything) half-done.

**If wrong (i.e. left parked):** low — these six writes keep going through
`/api/v1` exactly as they do today. Nothing about band 22 landing makes them
worse; they are simply not yet part of the phase's stated "every write is a
Server Action" outcome. The risk is purely that `WA1`'s Result section
(`doc/tasks/WA/README.md`) would overstate completeness if this gap isn't
named there.

**Unpark when:** band 22 closes (zero open task/band branches, per
`AGENTS.md` §2.9's queue-regeneration precondition) and a new task can be
decomposed for it — either folded into whatever comes after `WA1`/`WA2`, or
its own small band. Whoever picks this up should re-run the same sweep first
in case anything else has drifted since 2026-08-26.

---

## D-29 — Headless/remote machine pairing (no local browser)

**Parked:** 2026-08-31, by the owner, while deciding
[`2026-08-31-browser-loopback-pairing`](specs/2026-08-31-browser-loopback-pairing.md).

That spec replaces the typed pairing code with a browser-loopback flow
(`sparstrow pair` opens a browser, the already-signed-in tab completes
pairing) — modeled on [multica](../references/multica)'s `multica login`. The
old code-based flow had one capability the new one cannot reproduce on its
own: a code could be generated on *any* signed-in device (a laptop's browser)
and typed into a completely different, disconnected terminal — a bare remote
server, a CI runner, a WSL shell with no browser reachable from it. Pure
browser-loopback assumes the machine running the pair command either has a
browser or can be told a URL to open *somewhere* that then talks back to that
same machine — neither holds for a genuinely headless box with no path back.

Presented as an explicit fork (keep a `--code` escape hatch vs. drop it
outright) — the owner chose to drop it outright rather than maintain two
pairing code paths, accepting that headless/remote pairing is unsupported
until this is picked up.

**If wrong (i.e. left parked):** anyone trying to pair a server/VM/CI runner/
WSL box with no local browser has no way to pair it at all after this ships —
not degraded, entirely blocked. Today's code-based flow supports exactly this
case, so shipping the spec above is a real regression for that scenario, not
just a UX change. Whether that matters depends on whether Sparstrowgen is
ever used against machines that aren't someone's own desktop/laptop.

**Unpark when:** a real need for headless pairing shows up (self-hosting on a
server, CI-triggered agent runs, remote dev boxes) — then design a fallback
explicitly, e.g. a `sparstrow pair --code`/device-code-style path analogous to
`gh auth login`'s `--web` vs. device-flow split, rather than reintroducing the
old always-on code path wholesale.

> **Superseded 2026-09-02.** Picked up rather than left parked. Moving the
> daemon to a person-scoped credential
> ([`2026-09-02-computers-that-are-just-there`](specs/2026-09-02-computers-that-are-just-there.md))
> makes the headless case nearly free: a credential created by hand in the
> browser and pasted onto a machine with no display is the same credential the
> desktop app mints for itself. It is US6 of that spec, at P3. The
> device-code-style path this entry imagined is **not** what gets built — a
> copy-once token from the credentials page is simpler and needs no second
> code path.

---

## D-30 — A machine in someone else's workspace

**Parked:** 2026-09-02, by the owner, while deciding
[`2026-09-02-computers-that-are-just-there`](specs/2026-09-02-computers-that-are-just-there.md).

That spec makes one computer serve **every workspace its owner belongs to**,
automatically and with no per-workspace step. The owner scoped that deliberately
to workspaces that are their own: *"Right now I am not gonna be added to client
or external user workspace… I will create personal, work related workspace in
same machine."*

The moment the owner is added to a workspace they do **not** own, that automatic
behaviour changes meaning: their personal laptop would begin accepting and
executing work on behalf of a workspace someone else controls, without any
action on their part, and possibly without them noticing they were added. That
is not the same feature — it is a consent question wearing the same mechanism.

The designed-but-unbuilt answer is per-machine opt-in: a workspace the owner did
not create appears in Machines as *"Client Co. — enable on this machine?"* and
nothing runs there until they say yes. It was scored at 7/10 in the same session
and deliberately sequenced after, not dropped.

**If wrong (i.e. left parked):** the first time the owner accepts an invitation
to a workspace they don't control, their machine silently joins it and becomes
executable by whoever administers that workspace. There is no warning designed
for this today.

**Unpark when:** the owner is invited to, or creates a workspace with, anyone
else — whichever comes first. This must land **before** the first external
membership exists, not after, because the failure is silent.

---

# Parked by the 2026-09-02 restructure

The eight entries below are a different *kind* of deferral from everything above,
and the difference matters when you read them.

Everything above was parked **before** it was built. These were parked **after**.
The code exists, it is tested, and in most cases it works — it is simply not
being carried across the restructure's first pass.

**What "parked" means here, precisely:**

- The code **stays on disk**, in `server/src/internal/`, after the
  `packages/core` → `server/` move.
- The tables **stay in the schema**. Nothing is dropped. (The one exception is
  the HITL gate — see `D-1` — which is cut outright.)
- What stops: it is **not** ported to a `server/` route, **not** rebuilt in
  `packages/views`, **not** reachable from the desktop app, and **carries no
  verification burden**. No `KnownGaps.md` entry is owed for a parked subsystem
  not being proved, because nobody is claiming it works.

**Why park rather than delete.** The restructure's whole thesis is that the app
was never usable because too much was built and none of it was finished. Deleting
working code would repeat that mistake from the other direction. Parking is
reversible in an afternoon; deleting is not.

**Why park rather than carry.** Every subsystem carried across is a subsystem
that must be ported, wired, styled, and *proved in the desktop app* before Phase 4
can be called done. The slice is `machine + agent + chat`. Anything not on that
path is weight on the one gate that has never been passed.

---

## D-31 — Memory vault and semantic search

**Parked:** 2026-09-02, by the owner, in the restructure's feature cull.

The Obsidian-compatible vault, the FastEmbed embedder, the `sqlite-vec` index,
the vault file watcher, and the cloud `memory_notes` sync all exist and are unit
tested (`packages/core/src/memory/`, `packages/core/src/cloud/memory-sync.ts`).

**Why it is the most consequential park.** It carries three of the four native
modules in the desktop bundle — `fastembed`, `onnxruntime-node`, and
`sqlite-vec`. With this and `D-37` parked, `better-sqlite3` is the only native
dependency left, and Node 22's built-in `node:sqlite` may remove that too. **A
desktop app with zero native modules is a categorically easier thing to ship than
one with four**, and shipping the desktop app is the entire point of the
restructure. This park is not incidental to the plan; it is a large part of why
the plan can work.

**What parking costs:** the product's most differentiating capability is absent
from the first release. An agent will not remember anything across runs.

**Unpark when:** the slice is proved end to end (restructure Phase 4) and an
agent's inability to remember is the most-felt limitation in real use. Bring it
back behind an explicit capability check so a machine without the native modules
degrades rather than fails to start. `G-15`, which recorded that memory sync had
never synced between two real machines, was closed as superseded by this park —
whoever unparks this owes a fresh live proof, not a revival of that entry.

## D-32 — Pipelines

**Parked:** 2026-09-02, by the owner, in the restructure's feature cull.

Multi-step pipelines with a step executor and orphan sweeper exist
(`packages/core/src/orchestrator/pipeline-executor.ts`), backed by `pipelines`,
`pipeline_steps` and `pipeline_runs`, with a `/pipelines` page and server actions.

**What parking costs:** an agent can be asked to do one thing, not a sequence.

**Unpark when:** single-turn chat is proved and real use produces a repeated
multi-step task worth naming. Pipelines are a generalisation, and generalising
before there is a concrete repeated case is how the first five months went.

## D-33 — Cron and the schedule surface

**Parked:** 2026-09-02, by the owner, in the restructure's feature cull.

The Croner-based scheduler service and `cron_jobs` exist, with a `/schedule`
page.

**What parking costs:** nothing runs unattended. Every run is one the owner
started.

**Unpark when:** there is a run the owner wants to happen without them. Note this
one is cheap to unpark — the daemon already has a scheduler loop — and is a
strong candidate for the first unpark after the slice.

## D-34 — GOAP goal planner

**Parked:** 2026-09-02, by the owner, in the restructure's feature cull.

The goal-oriented action planner, goal watcher and reconciler
(`packages/core/src/goap/`), backed by `goals`, `plan_nodes` and `plan_edges`,
with `/tasks/goals/[goalId]`.

**What parking costs:** the largest single capability drop in the cull. Autonomous
multi-step planning is what "agent harness" promises over "a chat box that can run
commands".

**Unpark when:** chat-driven single runs are proved *and* the owner has found the
ceiling of asking for one thing at a time. `G-49` recorded that the `DI` band was
code-complete and had never touched a database or a running machine; that entry
was closed as superseded by this park, and its underlying warning — that this
subsystem has never run for real — stands and must be honoured on unpark.

## D-35 — Teams and the messages surface

**Parked:** 2026-09-02, by the owner, in the restructure's feature cull.

`teams`, `team_members`, `team_projects` and `messages`, with `/teams`,
`/teams/[teamId]` and `/messages`.

**What parking costs:** approximately nothing today. These are multi-person
features on a single-person product, and
[`G-35`](KnownGaps.md) records that there is no per-member access scoping behind
them anyway — any member already has full read and write on everything.

**Unpark when:** a second person joins a workspace. At that point this unparks
*together with* `D-1` (the HITL gate) and the access-model work `G-35` describes —
they are one piece of work, not three, and shipping teams without the other two
would be shipping the appearance of access control.

## D-36 — Skills ingestion, the Specter quarantine, and imports

**Parked:** 2026-09-02, by the owner, in the restructure's feature cull.

Skill ingestion with the Extractor/Specter quarantine pipeline
(`packages/core/src/agents/ingestion.ts`, `specter.ts`), `skills`, `skill_files`,
`agent_skills`, `skill_imports`, and the `/skills` and `/imports` pages.

**Note the asymmetry:** agents themselves are **carried** — the slice needs an
agent to chat with. What is parked is *importing skills into* an agent. An agent
in the first release is a name, a provider, a model and a system prompt.

**What parking costs:** agents cannot be extended with packaged capabilities.

**Unpark when:** an agent's fixed instructions are the thing limiting real use.
The quarantine design was security work worth preserving — a P9 review caught a
`PUT`-arming bypass in it — so unpark the quarantine *with* the ingestion, never
the ingestion alone.

## D-37 — Terminals and the Realtime terminal bridge

**Parked:** 2026-09-02, by the owner, in the restructure's feature cull.

The PTY manager (`packages/core/src/terminal/`), the Supabase-Realtime terminal
bridge (`packages/core/src/cloud/terminal-bridge.ts`), and the `/terminals` page.
Built across M16 and M17.

**Parked with a transport caveat that changes the unpark work.** This is not a
clean park. The restructure replaces Supabase Realtime with a server-owned
WebSocket, so the bridge does not merely wait — **the transport half of it stops
being the right design while it waits**. Unparking is therefore a port, not a
revival: the PTY manager and the session/channel semantics survive, the
Realtime-specific connection code does not.

It also carries `node-pty`, the second of the four native modules (see `D-31`).

**What parking costs:** no shell access to a paired machine from the app.

**Unpark when:** the server-owned WS is proved by the chat stream in Phase 4 —
which is exactly the thing that gives the terminal a transport to move onto.
`G-47` and `G-48`, which recorded that nothing had ever connected to Realtime and
that the shell had never authenticated, were closed as superseded by this park.

## D-38 — The Knowledge Center

**Parked:** 2026-09-02, by the owner, in the restructure's process cull.

27 user-facing articles in `apps/web/src/content/knowledge/`, plus `AGENTS.md`
§3.2's rule requiring every user-facing change to update them in the same PR and
to re-read four "global claim" articles each time.

**Why parking the *rule* is the point.** The articles are not the cost; the
per-PR obligation is. It is a real tax on every change, paid to keep documentation
accurate for a product that currently has **zero users** — while the app itself
has never been opened. That is the priority inversion the restructure exists to
correct.

**What parking costs:** the articles drift, and they are already drifting.
`G-10` (quota figures published without a source) was closed as superseded by
this park rather than fixed.

**Unpark when:** the app has users who are not the owner. At that point the
articles must be re-read against reality *before* being shown again — assume every
one of them is wrong until checked, because the restructure changes the product's
shape underneath all 27. `AGENTS.md` §3.2 is restored in the same change.
