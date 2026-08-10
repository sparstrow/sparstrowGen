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

The app-side code is **complete and verified**; nothing here is unbuilt. What is
missing is configuration that only a human can supply: an OAuth app registered
under the owner's own GitHub and Google accounts, and the resulting client
secrets pasted into the Supabase dashboard. Both providers currently report
`enabled: false`.

The login page reads `/auth/v1/settings` on load, so the buttons render disabled
with "Social sign-in isn't set up yet — use email below" and **light up on their
own** once the providers are enabled. No code change is needed to unpark this.

Full steps, including the callback URL people get wrong (it is Supabase's, not
the app's): [`runbooks/oauth-providers.md`](runbooks/oauth-providers.md).

**Unpark when:** the owner wants social sign-in, or a collaborator who would
rather not manage another password is added to a workspace.
