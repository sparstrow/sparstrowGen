---
title: Limitations & gotchas
section: Reference
description: The honest list — what Sparstrowgen deliberately doesn't do, and the sharp edges to know about.
order: 1
updated: 2026-07-13
---

Knowing the edges is part of knowing the tool. These are current and deliberate unless
marked otherwise.

## By design (local-first, single-user)

- **One user, one machine.** The core binds to `127.0.0.1` only. No accounts, no remote
  access, no multi-user story — the cloud story belongs to the apps the factory builds,
  not to the factory.
- **Scheduler sleeps when the app does.** Cron jobs fire only while the app is running;
  missed fires are skipped, not back-filled.
- **Humans merge.** No agent can merge a PR or push a trunk branch — ever.
- **Nothing self-approves.** Delegations, quarantined imports, and memory contradictions
  wait in the attention queue until you act.

## Current sharp edges

- **Untrusted-run memory *writes*** — untrusted runs are detected and badged, and their
  notes are quarantined; but the strict write-clamp that sandboxes get is not yet
  applied to every untrusted run. Treat delegated/web-touching runs' notes with the
  quarantine review they land in.
- **Cost is an estimate.** Prices come from static provider tables; new or local models
  may read as zero.
- **Direct-API agents have a smaller tool set** than CLI agents (the curated registry) —
  heavy file-editing jobs still belong to CLI providers.
- **Model discovery can go stale** — re-run *Discover models* in Settings after a
  provider ships new models.
- **Pipelines are linear**; branching orchestration lives in Goals.
- **Windows note:** the memory MCP surface is served over HTTP (not stdio) because
  headless stdio MCP is unreliable on Windows — nothing to configure, but useful to
  know if you wire external MCP clients.

## Known Limitations & Boundaries

- **Supabase Staging Email Rate Limits:** Staging Supabase projects enforce rate limits on outgoing confirmation and magic link emails (typically 3–4 emails per hour). If you encounter `Email rate limit exceeded` errors when testing Magic Link or Email Sign Up, wait 2–5 minutes or sign in directly via GitHub/Google OAuth or Password Authentication.

## Where the list is maintained

Deliberate scope deferrals live in the repo's `docs/deferred/` — one file per item,
each with the reason it was deferred and the condition that should bring it back.
When a limitation here is lifted, this page is updated in the same PR — see
[How these docs stay current](/knowledge/how-docs-stay-current).
