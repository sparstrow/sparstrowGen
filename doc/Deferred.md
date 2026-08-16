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
