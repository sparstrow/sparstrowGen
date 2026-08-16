# Security Reports

Vulnerabilities, trust-boundary violations, and anything that lets someone do
something they shouldn't — auth bypass, privilege escalation, injection,
credential/secret exposure, data leaking across users or workspaces, RLS
policy gaps. Reported by the owner or caught by an agent while working.

Ordinary wrong behavior with no security angle belongs in
[`../bug/`](../bug/README.md) instead. When in doubt, file it here — this
folder's format asks for the questions that actually matter for a security
issue, and a false positive costs a few minutes, not a breach.

## The rule that matters

**Document a security concern in the same turn it surfaces — owner-reported or
agent-found — rather than relying on chat history to be re-read.** This
applies whether the owner names a concern directly, **or** an agent notices
something exploitable while implementing, reviewing, or verifying unrelated
work (leaked keys, missing RLS policy, an endpoint trusting client input it
shouldn't, etc.).

**Never put a live secret, real token, or exploit payload that could be
replayed against production directly in these files** — they're committed to
git. Describe the class of exposure and where it lives (file/line, env var
name) instead of the value itself. If a real secret was actually exposed,
that's an owner action (rotate it) — record the *fact* here and point to
[`../runbooks/`](../runbooks/README.md) if rotating it needs a human.

## Format

One file per issue: `SEC-<date>-<slug>.md`, e.g. `SEC-2026-08-16-anon-key-scope.md`.

```markdown
# SEC-<date>-<slug>

**Status:** 🔴 open | 🟡 investigating | 🟢 resolved
**Severity:** critical | high | medium | low
**Reported by:** owner | agent (name what you were doing when you found it)
**Reported:** <date>

## What's exposed / what's possible
The concrete thing an attacker (or an over-privileged legitimate user) could
do. Not "this feels insecure" — the actual action and its effect.

## Who can trigger it
Anonymous internet, any authenticated user, only a specific role, only with
local/physical access, etc. This is most of what severity depends on.

## Evidence
What was checked and how it was confirmed — file/line, a request that proves
it, an RLS policy read that shows the gap. No live secrets or working exploit
payloads (see above).

## Impact
Worst case if left unfixed, blast radius, and whether it's already exploitable
today or only under some other condition.

## Resolution
Filled in when closed: the fix, where it landed (commit/PR), and how it was
verified closed — not just "should be fixed now." Leave the file in place
after closing; this folder is a record, not a queue that empties out.
```

## Turning a security report into work

Once understood well enough to fix, open a task in
[`../tasks/`](../tasks/README.md) and link it back to this file's id — same as
`bug/`. High/critical severity should generally jump the queue ahead of
whatever else is in flight; say so explicitly when opening the task.

## Index

| ID | Status | Severity | Summary |
|---|---|---|---|
| — | — | — | none filed yet |
