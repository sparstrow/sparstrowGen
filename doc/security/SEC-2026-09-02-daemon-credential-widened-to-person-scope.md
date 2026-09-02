# SEC-2026-09-02-daemon-credential-widened-to-person-scope

**Status:** 🟡 accepted by owner decision — not yet built, compensating controls specified
**Severity:** medium (design-time; would be high without the compensating controls below)
**Reported by:** agent — filed while writing [`2026-09-02-computers-that-are-just-there`](../specs/2026-09-02-computers-that-are-just-there.md), because the spec deliberately widens an existing trust boundary
**Reported:** 2026-09-02

> **This is not a discovered vulnerability.** It is a trust-boundary change the
> owner chose with the trade laid out in front of them, recorded here so the
> choice stays visible to whoever reads this code later instead of surviving
> only in a chat log. Filed under this folder's "trust-boundary violations…
> when in doubt, file it here" rule.

## What's exposed / what's possible

**Today.** A machine holds a credential scoped to exactly one workspace and one
runtime — `daemon_tokens` carries `{workspace_id, runtime_id}` and
`authenticateDaemon()` derives both from the token, never from the request body
([`apps/web/src/lib/daemon/auth.ts:96`](../../apps/web/src/lib/daemon/auth.ts)).
Someone who obtains that credential can impersonate **that one machine in that
one workspace**: send heartbeats, claim commands queued for it, post run events
and chat results. They cannot read the project list, cannot enumerate other
machines, cannot open a terminal on a different machine, and cannot reach a
second workspace — the credential has no `auth.uid()`, so every RLS policy in
the app denies it outright.

**After this change.** A machine holds a person-scoped access token. Someone who
obtains it can do **anything the owner can do through the API**: enumerate every
workspace they belong to, read projects, chats and transcripts across all of
them, queue work onto *any* machine in those workspaces, and — where
`terminal.access` is enabled for a machine — obtain a shell on it. The token
does not expire on its own.

The capability gained is not "more of the same": it changes the credential from
*one machine's identity* into *the person's identity*.

## Who can trigger it

Anyone who obtains the token file from a machine the owner controls. Concretely:

- local access to an unlocked or stolen laptop
- any process on that machine running as the owner's user account — **including
  agents this product itself spawns**, which is the sharpest edge, since the
  whole point of the daemon is to run agent CLIs on that machine
- a backup, sync folder, or disk image that captures the secrets directory

Not reachable anonymously from the internet, and not reachable by another
workspace member.

## Evidence

Design-time, not an observed exploit. What was read to establish the current
boundary and the proposed one:

- [`apps/web/src/lib/daemon/auth.ts`](../../apps/web/src/lib/daemon/auth.ts) —
  the whole file, including its standing prohibition on reading a workspace id
  from a request body, and the header comment explaining why a daemon is
  deliberately *not* given a real auth user: *"Giving each runtime a real auth
  user would make it look like a member, which grants the whole workspace; a
  daemon token is deliberately scoped to one runtime."* That is exactly the
  property being traded away.
- [`packages/shared/src/db/schema.ts:290`](../../packages/shared/src/db/schema.ts)
  — `daemon_tokens`, whose own comment states the rationale: *"a workspace-wide
  token would mean a single compromised laptop exposes every machine."*
- The reference implementation this follows,
  [`references/multica`](../../references/multica) —
  `apps/desktop/src/main/daemon-manager.ts:625` mints a non-expiring personal
  access token from the signed-in renderer's JWT and writes it to the daemon's
  profile config. Multica accepts the same exposure, with a tokens page as its
  control.

## Impact

**Worst case:** a leaked token acts as the owner indefinitely across every
workspace they belong to, including the ability to execute code on any machine
in those workspaces. Recoverable — revocation is immediate on the next request —
but only once noticed, and there is currently nothing that would surface it.

**Exploitable today?** No. Nothing here is built; the current model is the
narrow one. This becomes live the moment the plan's foundational phase ships.

**Bounded by a scope decision:** while the owner is the only member of all their
workspaces (their stated position — personal and work spaces, no external
workspaces), "every workspace they belong to" means "their own data". The
exposure grows materially the first time they join a workspace they do not
control, which is precisely the trigger recorded on
[`D-30`](../Deferred.md).

## Resolution

**Accepted by the owner**, 2026-09-02, after being shown the alternative and the
four scenarios where the two models diverge (theft, joining a second workspace,
offboarding, and the pairing-discovery list). The owner's decision: *"leave our
workspace-scoped token and go with user's PAT."*

Accepted **on condition of** these compensating controls, which are requirements
in the spec rather than follow-up work:

| Control | Where |
|---|---|
| A credentials page listing every token, its machine, and its last use, with Revoke on each row | spec US4 / `FR-012`, `FR-013` |
| Revocation effective on the token's next request, with the machine reporting the reason rather than retrying silently | `FR-013`, `SC-006` |
| `last_used_at` maintained per token, so an unused-but-live credential is visible | `FR-012` |
| Explicit confirmation when revoking the credential of the machine in use | `FR-015` |
| Token secret stored in the OS-level secrets directory, never in the project directory reachable by agent file tools | existing `config.secretsDir` posture, carried forward unchanged |
| Per-machine opt-in before a machine joins a workspace the owner does not own | [`D-30`](../Deferred.md), **must land before the first external membership** |

**Residual risk knowingly retained:** tokens do not expire (owner's choice,
option A of three, scored 8/10 against a 90-day-expiry alternative that was
rejected because silent quarterly expiry of an always-on machine reads as an
outage). The credentials page is the mitigation; without it this entry would be
high severity, not medium.

**Re-open this entry if** the token is ever made readable by anything other than
the daemon process, if the credentials page slips out of the same release as the
auth change, or when `D-30` unparks.
