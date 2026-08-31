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
terminal) with a loopback flow: `sparstrow pair` starts a local HTTP listener
on the machine, opens the owner's browser to a `/pair` page on the already
authenticated session, and that page mints the runtime + daemon token and
delivers it straight to the listener. No code is ever displayed or typed.
Modeled on multica's `multica login` (`references/multica/server/cmd/multica/cmd_auth.go:238`),
adapted to this repo's Next.js/Supabase stack.

## What the spec asks for that isn't obvious

**The web app cannot reach the daemon's loopback listener — only the owner's
browser can.** `apps/web` runs on Vercel; `127.0.0.1:<port>` on the owner's
machine is reachable from JavaScript running *in that owner's browser tab*,
never from our server. So the token can't simply be returned in a page
response and forgotten — a small client-side script has to take the minted
token and `fetch()` it to the loopback URL itself. This is a deliberate,
narrow exception to `apps/web/CLAUDE.md`'s Server-Component-first rule,
alongside the one it already names for streaming.

**Minting-on-page-load is a mutating GET if done naively.** A Server
Component's render runs on the initial request; doing the actual database
write inline in that render (rather than as a real Server Action) would
bypass Next.js's built-in Server Action origin/CSRF checks and turn `/pair`
into a link that mutates state just by being opened, from any origin. The fix
is to keep the mint as an actual Server Action, invoked by the client
component right after mount — not inlined into the page's RSC render — so
Next's same-origin enforcement still applies to the call that matters.

**The daemon-and-browser-are-the-same-machine assumption is the whole trick,
and also the whole accepted risk.** `state` (CSRF) protects the *daemon's*
side — it only accepts a callback whose `state` matches what it generated.
The `/pair` page itself has no equivalent protection against being opened via
a crafted link (an attacker could construct `/pair?callback=http://127.0.0.1:9999/...`
and get a signed-in victim to open it), because the spec explicitly wants
zero clicks. The mitigation is that the callback host is validated
server-side as loopback-only before anything is minted, so the worst case is
a new token minted and POSTed to something already listening on the victim's
*own* loopback — the same trust boundary `gh auth login`, `vercel login`, and
multica's own `login` all accept. See Decisions.

## Work breakdown

### Foundational — blocks the story

| Work | Why no story owns it |
|---|---|
| Drop `pairing_codes` table + `redeem_pairing_code` RPC (migration) | Schema change; invisible to the owner except as the thing that stops existing |
| New `pair_runtime_from_session` RPC — same atomic runtime+token creation as `redeem_pairing_code`, but authenticated (workspace from the caller's session, not an anonymous code row), and replaces an existing pairing for that machine identity instead of erroring | Database logic; the owner only ever sees its result |
| `POST /api/daemon/pair/deliver` (or a Server Action reachable from the client island) — the loopback delivery target's *counterpart*: what actually calls the RPC and returns `{token, runtimeId, workspaceId}` to the client for it to forward | Server plumbing |
| CLI: local loopback HTTP listener + browser-open + timeout, replacing `pairWithCode`'s code-exchange call in `packages/core/src/cloud/pairing.ts` | Not owner-visible beyond the command's own output, which is per-story below |

### Per story

| Story | Work | Delivers |
|---|---|---|
| US1 | `/pair` Server Component page: validates the caller is signed in, reads `callback`/`state`/machine-identity query params, validates `callback` is loopback-only | The page the browser opens |
| US1 | Client island on `/pair`: on mount, calls the mint Server Action, then `fetch()`s the result to `callback`, shows success/error | The "nothing to click" completion |
| US1 | CLI: `sparstrow pair` (no argument) — replaces the `<code>`-argument form; starts listener, opens browser, waits, prints result; `--code` removed entirely per the spec's decision | The command the owner actually runs |
| US1 | Machines page: `PairingCodePanel` → replaced with a "waiting for your browser…" state; `PairingOutcomePanel` logic reused for success/timeout | What the owner sees on the Machines page while a pairing attempt is live |

## Decisions

**RPC moves from anonymous-code-bearer to authenticated-session.** Today's
`redeem_pairing_code` is `SECURITY DEFINER`, callable only by the service
role, because a daemon holding a pairing code has no `auth.uid()` — the code
itself is the credential (`008_redeem_pairing_code.sql:21-29`). The new RPC is
invoked by the owner's own authenticated browser session, so it can resolve
`auth.uid()` directly, check workspace membership the normal way, and skip
the "credential in a table" pattern entirely — closer to how the rest of the
schema is protected (`AGENTS.md` §4: "RLS is the security boundary"). It stays
a single `SECURITY DEFINER` function rather than a plain authenticated insert,
for the same atomicity reason the original comment gives: runtime + token
creation must happen together or not at all, and PostgREST calls cannot span
a transaction.

**Re-pairing an already-paired machine replaces, not errors** (spec FR-008).
The old flow could not express this — a fresh code always created a fresh
runtime row. The new RPC takes a client-generated machine id consistent
across a re-pair (already exists as `runtimeId` in `describeMachine()`'s
identity) and upserts rather than inserts, revoking the previous token for
that runtime in the same transaction.

**The client-side loopback delivery is a scoped exception to
"Server Components only" — not a precedent for other pages.** No other
surface in this app needs to reach an address only the visitor's own machine
can see. Recorded here so it isn't read as license to add more client-side
`fetch` calls elsewhere; the streaming exception `apps/web/CLAUDE.md` already
names is the only sibling.

**Loopback-only `callback` validation, enforced server-side before minting.**
The Server Action that mints the token rejects any `callback` whose host
doesn't parse as `127.0.0.1`, `::1`, or `localhost`. This is the one real
guardrail against the zero-click design being pointed at an arbitrary
attacker-controlled endpoint — accepting the residual risk described above
(a crafted link can still mint a token that gets POSTed to the *victim's own*
loopback) as the same trade every loopback-OAuth CLI (`gh`, `vercel`,
multica's own `login`) already makes.

**`pairing_codes` is dropped outright, not deprecated in place.** Per the
spec's Assumptions: no dormant code path left half-wired. Its migration's
down-file removes the table and the RPC; nothing references either after this
lands.

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
