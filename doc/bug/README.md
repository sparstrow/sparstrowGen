# Bug Reports

Things that are **behaving wrong in the running app** — reported by the owner or
caught by an agent while working. This is different from every other file in
`doc/`:

| File | Holds |
|---|---|
| `KnownGaps.md` | built, but not verified — not a claim that anything is broken |
| `OpenQuestions.md` | needs a decision from the owner |
| **`bug/`** | **something is confirmed or suspected to behave wrong** |
| `security/` | a bug whose impact is specifically a security/trust boundary |

If the wrong behavior is a vulnerability, credential exposure, auth bypass,
injection, or anything else that lets someone do something they shouldn't —
file it in [`../security/`](../security/README.md) instead, using its stricter
format. Everything else — crashes, wrong output, broken flows, UI bugs — goes
here.

## The rule that matters

**Document a bug in the same turn it surfaces — owner-reported or
agent-found — rather than relying on chat history to be re-read.** A bug
mentioned only in a chat message does not exist to the next session.

This applies whether the owner says "this is broken" / "I'm seeing X" / files
any complaint about actual behavior, **or** an agent notices something wrong
while implementing or verifying unrelated work. Either source gets a file,
written before moving on to anything else.

## Format

One file per bug: `BUG-<date>-<slug>.md`, e.g. `BUG-2026-08-16-signup-auto-confirms.md`.

**Copy [`../templates/bug.md`](../templates/bug.md)** — it carries the full
skeleton (Status / Reported by / Reported, then Symptom, Reproduction,
Investigation, Impact, Resolution) with guidance on what belongs in each
section. That template is the canonical format; this file no longer restates
it, so there is only one copy to keep current.

Two things the template will remind you of, worth knowing before you start:
the **Symptom** section takes what you observed, not what you think caused it,
and the file **stays here after it's fixed** — flip Status to 🟢 rather than
deleting it.

## Turning a bug into work

Once a bug is understood well enough to fix, open a task in
[`../tasks/`](../tasks/README.md) (or add it to an existing phase) and link the
task back to the bug file's id. The bug file stays as the historical record;
the task is what actually gets executed and ticked off.

## Index

| ID | Status | Summary |
|---|---|---|
| [`BUG-2026-08-16-pairing-path-wrong-in-cli`](BUG-2026-08-16-pairing-path-wrong-in-cli.md) | 🟢 resolved | `sparstrow pair` sent users to "Settings → Workspace → Runtimes", a tab that doesn't exist. All four strings now name the Machines page (T-M8-04), and that page exists as of T-M8-03 |
| [`BUG-2026-08-16-signup-auto-confirms`](BUG-2026-08-16-signup-auto-confirms.md) | 🟢 resolved | Fresh signup auto-confirmed and auto-logged-in despite "Confirm email" being ON — an `auth.users` trigger was overriding the setting |
| [`BUG-2026-08-18-orphaned-account-rows-on-staging`](BUG-2026-08-18-orphaned-account-rows-on-staging.md) | 🟢 resolved | Staging holds 8 orphaned account trees — profile rows, workspaces and memberships for auth users that no longer exist, unreachable by any RLS policy. `auth.admin.deleteUser` does not cascade |
| [`BUG-2026-08-18-shell-invents-name-from-email`](BUG-2026-08-18-shell-invents-name-from-email.md) | 🟢 resolved | Fixed in T-M10-04: `toSnapshot()` no longer falls back to the email local part; an empty name now stays empty in the shell, matching the row |
| [`BUG-2026-08-20-setup-workspace-error-never-settles`](BUG-2026-08-20-setup-workspace-error-never-settles.md) | 🟢 resolved | `/setup`'s workspace step mounted a form gated by the very query it also observed — a refetch-on-mount feedback loop meant a failed `/workspace` request never settled into the error UI. Latched the loading gate |
| [`BUG-2026-08-20-flaky-realtime-live-events-test`](BUG-2026-08-20-flaky-realtime-live-events-test.md) | 🟢 resolved | `pnpm test` failed intermittently on one `apps/web` test — a cold dynamic `import()` inside the first test body timed out under turbo's five-way parallel run. Fixed by hoisting the import to module scope and dropping the unneeded per-test `vi.resetModules()`; 5/5 full-suite runs clean afterward |
| [`BUG-2026-08-20-remove-machine-doesnt-clear-local-pairing`](BUG-2026-08-20-remove-machine-doesnt-clear-local-pairing.md) | 🟢 resolved | Removing/revoking a machine in the browser only deletes the cloud-side row; the local token on that computer is never cleared, so `sparstrow pair <code>` refuses with "already paired" unless `--force` is added. `machines.md` said plain re-pairing works — it didn't mention `--force` |
| [`BUG-2026-08-22-chat-new-session-404s`](BUG-2026-08-22-chat-new-session-404s.md) | 🟢 resolved | `/chat`'s "Send message" on a new conversation 404s — `POST /api/v1/chat/sessions` has no route at all (real or stub), so the composer shows a bare "The model failed / Not Found". Fixed: built the real cloud handler (chat is cloud-canonical per the schema's own doc comment), mirroring `packages/core`'s daemon-side validation; the adjacent M5 message/retry stubs are untouched |
| [`BUG-2026-08-22-chat-kc-article-overstates-capability`](BUG-2026-08-22-chat-kc-article-overstates-capability.md) | 🔴 open | The Chat & Inbox Knowledge Center article claims chat is "streaming" and "each reply is a run" with cost/provenance tracking — neither is true; sending a message is still a legible M5 stub and chat turns never touch the `runs` table at all. Found while fixing the session-404 bug above |
| [`BUG-2026-08-22-antigravity-transcript-not-rendered`](BUG-2026-08-22-antigravity-transcript-not-rendered.md) | 🔴 open | `/runs/<id>`'s Transcript card shows nothing at all for an `antigravity`-provider run — events genuinely stream and persist durably (cloud/local counts match), but `RunTranscript`'s `EventRow` has no case for the provider's `"raw"` event type and silently drops it. `claude-code` runs are unaffected |
| [`BUG-2026-08-22-desktop-servicemanager-health-check-times-out`](BUG-2026-08-22-desktop-servicemanager-health-check-times-out.md) | 🟢 resolved | `probeHealth()` sent no auth token, so every probe against the now-authenticated `/system/health` got a 401 forever, indistinguishable from the core being down. Fixed by threading the per-install token (already read by `core-client.ts`) through every `probeHealth()`/shutdown call in `service-manager.ts` |
| [`BUG-2026-08-22-team-create-500-missing-slug`](BUG-2026-08-22-team-create-500-missing-slug.md) | 🟢 resolved | Creating a team, project, or agent 500'd unconditionally — all three tables have a `NOT NULL` `slug` column that neither the client nor the POST handlers ever populated. Fixed in this pass: all three handlers now derive a slug from `name` with a collision retry, matching the existing `workspaces.slug` pattern |
| [`BUG-2026-08-22-teams-page-crashes-with-real-data`](BUG-2026-08-22-teams-page-crashes-with-real-data.md) | 🔴 open | `/teams` and `/teams/[teamId]` crash outright (`Cannot read properties of undefined (reading 'length')`) the instant a real team exists — `GET /teams` and `GET /teams/:id` never join `team_members`/`team_projects`, so `team.members` is `undefined` against a frontend built on a schema that promises it always exists. Invisible until this session because every prior pass only ever saw the empty state |
| [`BUG-2026-08-22-core-tests-flake-under-turbo-parallelism`](BUG-2026-08-22-core-tests-flake-under-turbo-parallelism.md) | 🟢 resolved | `pnpm test --force` at the repo root intermittently timed out up to 25 `@sparstrow/core` tests across ten unrelated files (graph client/lifecycle/tools, viz-manager, run-manager finalize, git-status, host-fs) — five-way turbo contention starving real child-process/filesystem work of CPU under vitest's tight 5s default. Fixed by bumping `testTimeout`/`hookTimeout` to 20s package-wide, matching a fix one file had already proven for itself |
