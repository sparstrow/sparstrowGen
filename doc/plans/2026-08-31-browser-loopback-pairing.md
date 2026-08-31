# Browser-loopback pairing — 2026-08-31

| | |
|---|---|
| **Spec** | [`doc/specs/2026-08-31-browser-loopback-pairing.md`](../specs/2026-08-31-browser-loopback-pairing.md) |
| **Status** | Draft |
| **Trigger** | Owner, after reviewing multica's `multica login` (`references/multica`); decided live in the same conversation as the spec |
| **Depends on** | [`2026-08-16-setup-and-machines`](../plans/2026-08-16-setup-and-machines.md) (M8–M11, shipped) — this plan only replaces its pairing-code mechanism, not the Machines page it built |
| **Touches** | `packages/shared/src/db/schema.ts`, `packages/shared/drizzle/policies/`, `apps/web/src/app/api/daemon/`, `apps/web/src/app/pair/` (new), `apps/web/src/app/machines/`, `packages/core/src/cloud/`, `packages/core/src/cli/` (or wherever the `pair` subcommand lives) |
| **Tasks** | not decomposed — single task, see "Why no task folder" below |
| **Open questions** | none |

## Summary

Replaces `pairing_codes` (a 10-minute single-use code, typed by hand into a
terminal) with a loopback flow: `sparstrow pair` starts a local HTTP listener,
registers a **pairing attempt** with the control plane, and opens the owner's
browser to a confirm page keyed by that attempt's id. One click on an already
authenticated session approves it; the CLI itself then exchanges the approved
attempt for the real daemon token over its own server-to-server connection —
the browser never sees or carries the credential at all. Modeled on multica's
`multica login` (`references/multica/packages/views/auth/login-page.tsx` and
`references/multica/server/cmd/multica/cmd_auth.go:238`), adapted to this
repo's Next.js/Supabase stack and refined past multica's own version once the
sequencing was traced through (see Decisions).

## What the spec asks for that isn't obvious

**The web app cannot reach the daemon's loopback listener — only the owner's
browser can.** `apps/web` runs on Vercel; `127.0.0.1:<port>` on the owner's
machine is reachable only from JavaScript running *in that owner's browser
tab*. Multica's own answer is a plain top-level redirect
(`window.location.href = callback + "?token=..."`) rather than a `fetch()` —
no CORS involved, since it's a navigation, not a cross-origin request. This
plan follows that, with one change: what travels in that redirect is never
the real daemon token (see the next point).

**Minting the real credential before we know the browser will deliver it
creates a "ghost machine" risk.** If the Confirm action minted the real
`daemon_tokens` row and then handed the token to the browser to redirect, a
closed tab or a network blip between confirm and redirect leaves a runtime
that exists in the workspace and can never authenticate — the exact failure
mode `008_redeem_pairing_code.sql`'s own comment already names for a
different reason. Multica avoids this by never putting its *final* credential
in the browser redirect at all: the browser only ever carries a short-lived
proof of login, and the CLI process itself makes a second, server-to-server
call to mint the long-lived credential — a call that can only succeed once
the browser has already reached the CLI's listener. This plan adopts the same
two-phase shape (see Decisions: attempt → approve → exchange).

**Confirm is a real Server Action, not inline page-render logic.** A Server
Component's render runs on the initial GET; doing the "approve" write inline
in that render (rather than behind an actual Server Action invoked by the
button) would bypass Next.js's built-in Server Action origin/CSRF checks. The
button's `onClick` calls a Server Action; nothing mutates on page load.

## Work breakdown

### Foundational — blocks the story

| Work | Why no story owns it |
|---|---|
| Drop `pairing_codes` table + `redeem_pairing_code` RPC (migration) | Schema change; invisible to the owner except as the thing that stops existing |
| New `pairing_attempts` table — replaces `pairing_codes`' shape: `id` (opaque, server-generated, never displayed), `workspace_id` nullable until approved, machine identity columns, `callback` (loopback URL), `status` (`pending`\|`approved`\|`consumed`\|`expired`), `approved_by`, `expires_at` | Schema; the owner never sees a row directly |
| `start_pairing_attempt` RPC or plain insert (unauthenticated, service-role-called from the route below) — creates the attempt row from the CLI's initial POST | Database logic |
| `approve_pairing_attempt` RPC — authenticated; resolves the caller's workspace via `auth.uid()`, marks the attempt `approved` for that workspace. Does **not** mint a token | Database logic |
| `exchange_pairing_attempt` RPC — same atomicity shape as today's `redeem_pairing_code` (row lock, check status, act once): takes an `approved` attempt, creates/upserts the `runtimes` row, mints the real `daemon_tokens` row (revoking any prior token for that runtime — FR-008), marks the attempt `consumed` | Database logic; this is the only place the real token is ever minted |
| `POST /api/daemon/pair/attempts` (unauthenticated, mirrors today's `/api/daemon/pair` posture) — CLI calls this first, gets back `{attemptId}` | Server plumbing |
| `POST /api/daemon/pair/exchange` (unauthenticated; the attempt id **is** the credential here, same trust model as today's pairing code) — CLI's local listener calls this *after* the browser reaches it, gets back the real token | Server plumbing |
| CLI: local loopback HTTP listener, browser-open, timeout, and the exchange call — replacing `pairWithCode`'s single code-exchange call in `packages/core/src/cloud/pairing.ts` with this multi-step flow | Not owner-visible beyond the command's own output, which is per-story below |

### Per story

| Story | Work | Delivers |
|---|---|---|
| US1 | `/pair?attempt=<id>` Server Component: requires sign-in (existing middleware), loads the attempt row, renders machine identity + workspace name, or the error state if missing/expired/consumed | The page the browser opens |
| US1 | Confirm button (client island, minimal): calls the `approve_pairing_attempt` Server Action, then `window.location.href`-redirects to the attempt's `callback` — no token in this URL, just enough for the listener to know the browser arrived | The one click |
| US1 | CLI: `sparstrow pair` (no argument) — replaces the `<code>`-argument form entirely (`--code` removed per the spec's decision); starts listener, registers the attempt, opens browser, waits, exchanges, prints result, serves its own success HTML to the browser (mirroring multica's `callbackSuccessHTML`) | The command the owner actually runs, and what they see in the tab right after confirming |
| US1 | Machines page: `PairingCodePanel` → replaced with a "waiting for your browser…" state; `PairingOutcomePanel` logic reused for success/timeout | What the owner sees on the Machines page while a pairing attempt is live |

## Decisions

**Two-phase approve-then-exchange, not mint-then-redirect.** The token is
minted only by `exchange_pairing_attempt`, called by the CLI process itself
over its own connection, only after the browser has already reached the
CLI's local listener. This is what closes the ghost-machine risk described
above — nothing in the browser's own path can ever cause a runtime to exist
without a live process on the other end to receive its token. The browser's
redirect carries only the attempt id, never a credential — a strictly
stronger reading of spec FR-009 ("credential MUST never be displayed on the
browser page") than the old flow needed, since the token now never reaches
the browser at all, not even briefly.

**The attempt id is a bearer credential exactly like today's pairing code
was — just machine-generated and never displayed.** `exchange_pairing_attempt`
is unauthenticated for the same reason `redeem_pairing_code` was
(`008_redeem_pairing_code.sql:21-29`): the CLI process has no `auth.uid()`.
What changed is who can ever come to hold that credential — a human reading a
screen and typing it, versus a process that generated it itself and kept it
in memory. Same reasoning `approve_pairing_attempt` needs to be a *separate*,
authenticated RPC: it is the only step where a real person's session decides
which workspace this machine joins.

**Re-pairing an already-paired machine replaces, not errors** (spec FR-008).
`exchange_pairing_attempt` upserts the `runtimes` row keyed by the
CLI-generated `runtimeId` (already stable across re-pairs via
`describeMachine()`) and revokes the previous `daemon_tokens` row for that
runtime in the same transaction, rather than erroring on a duplicate.

**The confirm button's redirect is a scoped exception to
"Server Components only" — not a precedent for other pages.** No other
surface in this app needs to navigate to an address only the visitor's own
machine can see. Recorded here so it isn't read as license to add more
client-side navigation elsewhere; the streaming exception `apps/web/CLAUDE.md`
already names is the only sibling.

**Loopback-only `callback`, validated at attempt creation and again at
exchange.** `POST /api/daemon/pair/attempts` rejects any `callback` whose
host doesn't parse as `127.0.0.1`, `::1`, or `localhost` before a row is even
created — matching multica's own `validateCliCallback`
(`references/multica/packages/views/auth/login-page.tsx:80-94`), minus its
RFC 1918 private-IP allowance, which this plan doesn't need since — unlike
multica's self-hosted-on-a-LAN-VM case — this flow only ever targets the
literal machine the browser is running on.

**`pairing_codes` is dropped outright, not deprecated in place.** Per the
spec's Assumptions: no dormant code path left half-wired. Its migration's
down-file removes the table and the RPC; nothing references either after this
lands.

**A late redirect to an already-shut-down listener fails as a bare browser
connection error, not an app-level message — accepted, matching multica's own
limitation.** Once the CLI gives up and closes its listener, a browser that
still completes the confirm click afterward gets a generic
"can't reach this page," not our wording. `/pair` itself still shows the
correct expired/consumed state for the more common case (reopening a stale
tab *before* clicking); this gap is specifically the few-second window after
a click that outlives the listener. Named here rather than silently
accepted — multica's own CLI has the identical limitation (its 5-minute
timeout closes the same local listener).

**No task decomposition; this branch targets `development` directly.** This
is one cohesive unit of work by one agent in one sitting, not a multi-agent
band — `AGENTS.md` §2.2's "single-task band skips the middle tier" applies.
Formally running it through `decomposing-plans` is also currently blocked:
that skill refuses while any task/band branch is open, and several are
(`task/T-DI-05-live-verification`, `task/T-WA-08-settings-machines`,
`claude/feedback-spec-plan-tasks-2c5017` — see the port registry). The Work
breakdown above stands in for a task folder.

## Scope boundaries

- **Headless/remote pairing is out of scope**, per the spec's Assumptions —
  filed as [`D-29`](../Deferred.md).
- **CLI distribution (`sparstrow` outside a dev checkout) is out of scope** —
  unchanged, pre-existing gap, [`D-10`](../Deferred.md).
- **The Machines page's layout, setup guide, and status vocabulary are
  unchanged** — already shipped by `2026-08-16-setup-and-machines` and not
  touched here.

## Verification

| Spec criterion | How it gets checked |
|---|---|
| SC-001 (no copying/typing a code) | Manual pass: run `sparstrow pair` against a local dev stack, confirm zero code is shown or typed anywhere in the terminal or browser |
| SC-002 (paired machine indistinguishable from today's) | Compare the resulting `runtimes` row and Machines page rendering against a machine paired before this change |
| SC-003 (every unhappy path names its cause) | Force each: kill the browser before completing, reuse an already-completed attempt's tab, run with no display available, re-pair an already-paired machine — read the message each produces |

This needs a live pass against a real signed-in session and a real local
daemon process — `pnpm typecheck`/`pnpm test` alone cannot prove the loopback
round-trip actually completes. Per `AGENTS.md` §3.10, the `frontend-verify`
skill's browser-agent loop covers the `/pair` page and Machines panel; the
CLI listener side needs a manual run (documented in the Result section below
once done, since no automated harness here drives a second real machine).

## Result

<!-- Filled in once this lands. -->
