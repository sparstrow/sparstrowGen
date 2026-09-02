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

**Copy [`../templates/security.md`](../templates/security.md)** — it carries
the full skeleton (Status / Severity / Reported by / Reported, then What's
exposed, Who can trigger it, Evidence, Impact, Resolution) with guidance on
what belongs in each section. That template is the canonical format; this file
no longer restates it, so there is only one copy to keep current.

The template repeats the no-live-secrets rule above at the point where it
actually bites — the **Evidence** section — because that is where the
temptation to paste a working request is strongest.

## Turning a security report into work

Once understood well enough to fix, open a task in
[`../tasks/`](../tasks/README.md) and link it back to this file's id — same as
`bug/`. High/critical severity should generally jump the queue ahead of
whatever else is in flight; say so explicitly when opening the task.

## Index

| ID | Status | Severity | Summary |
|---|---|---|---|
| [`SEC-2026-08-18-storage-policy-dotdot-segment`](SEC-2026-08-18-storage-policy-dotdot-segment.md) | 🟢 resolved | low | `public-images` write policies matched a literal `..` segment, letting a caller mint keys carrying another user's id. Not exploitable (opaque keys, empty bucket); closed by pinning path depth |
| [`SEC-2026-08-16-auth-users-auto-confirm-trigger`](SEC-2026-08-16-auth-users-auto-confirm-trigger.md) | 🟢 resolved | was medium | `auth.users` trigger auto-confirmed every signup, silently defeating "Confirm email" while both the dashboard and GoTrue reported it enforced |
| [`SEC-2026-08-28-antigravity-headless-tools-unrestricted`](SEC-2026-08-28-antigravity-headless-tools-unrestricted.md) | 🔴 open | high | `antigravity` headless spawns never wire `allowedTools`, and `cwd` does not bound the CLI's own file-read tool — a "free chat, no tools" or "project chat, read-only" session on this provider has full host filesystem access today |
| [`SEC-2026-08-29-record-provider-models-anon-executable-on-fresh-project`](SEC-2026-08-29-record-provider-models-anon-executable-on-fresh-project.md) | 🟢 resolved | low | `record_provider_models`'s `revoke ... from public` (`024_provider_model_dispatch.sql`) assumed `PUBLIC` revocation covers `anon`/`authenticated`, which held on staging but not on the newer production project — anon could forge any workspace's model cache. Fixed with an explicit `anon, authenticated` revoke on prod; `rls_auto_enable()` had the identical gap |
| [`SEC-2026-09-02-daemon-credential-widened-to-person-scope`](SEC-2026-09-02-daemon-credential-widened-to-person-scope.md) | 🟡 accepted by owner decision | medium | Not a discovered flaw — a deliberate trust-boundary change recorded so it stays visible. The daemon credential moves from `{one workspace, one runtime}` to the person's own identity, so a leaked token acts as the owner across every workspace they belong to, including executing code on any machine in them. Accepted 2026-09-02 with the credentials page, per-token last-used, and immediate revocation as required compensating controls |
