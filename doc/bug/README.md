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
| [`BUG-2026-08-22-chat-kc-article-overstates-capability`](BUG-2026-08-22-chat-kc-article-overstates-capability.md) | 🟢 resolved | The Chat & Inbox Knowledge Center article claimed chat is "streaming" and "each reply is a run" with cost/provenance tracking — neither is true; sending a message is still a legible M5 stub and chat turns never touch the `runs` table at all. Rewrote the article to describe current behavior only |
| [`BUG-2026-08-22-antigravity-transcript-not-rendered`](BUG-2026-08-22-antigravity-transcript-not-rendered.md) | 🟢 resolved | `/runs/<id>`'s Transcript card showed nothing at all for an `antigravity`-provider run — events genuinely stream and persist durably (cloud/local counts match), but `RunTranscript`'s `EventRow` had no case for the provider's `"raw"` event type and silently dropped it. `claude-code` runs were unaffected |
| [`BUG-2026-08-22-desktop-servicemanager-health-check-times-out`](BUG-2026-08-22-desktop-servicemanager-health-check-times-out.md) | 🟢 resolved | `probeHealth()` sent no auth token, so every probe against the now-authenticated `/system/health` got a 401 forever, indistinguishable from the core being down. Fixed by threading the per-install token (already read by `core-client.ts`) through every `probeHealth()`/shutdown call in `service-manager.ts` |
| [`BUG-2026-08-22-team-create-500-missing-slug`](BUG-2026-08-22-team-create-500-missing-slug.md) | 🟢 resolved | Creating a team, project, or agent 500'd unconditionally — all three tables have a `NOT NULL` `slug` column that neither the client nor the POST handlers ever populated. Fixed in this pass: all three handlers now derive a slug from `name` with a collision retry, matching the existing `workspaces.slug` pattern |
| [`BUG-2026-08-22-teams-page-crashes-with-real-data`](BUG-2026-08-22-teams-page-crashes-with-real-data.md) | 🟢 resolved | `/teams` and `/teams/[teamId]` crashed outright (`Cannot read properties of undefined (reading 'length')`) the instant a real team exists — `GET /teams` and `GET /teams/:id` never joined `team_members`/`team_projects`, so `team.members` was `undefined` against a frontend built on a schema that promises it always exists. Invisible until this session because every prior pass only ever saw the empty state |
| [`BUG-2026-08-22-core-tests-flake-under-turbo-parallelism`](BUG-2026-08-22-core-tests-flake-under-turbo-parallelism.md) | 🟢 resolved | `pnpm test --force` at the repo root intermittently timed out up to 25 `@sparstrow/core` tests across ten unrelated files (graph client/lifecycle/tools, viz-manager, run-manager finalize, git-status, host-fs) — five-way turbo contention starving real child-process/filesystem work of CPU under vitest's tight 5s default. Fixed by bumping `testTimeout`/`hookTimeout` to 20s package-wide, matching a fix one file had already proven for itself |
| [`BUG-2026-08-23-chat-stub-stale-m5-promise`](BUG-2026-08-23-chat-stub-stale-m5-promise.md) | 🟢 resolved | The chat-send/retry and team-manager-chat stubs said "Arriving in M5" — but M5 shipped 2026-08-11/12 and its own phase spec explicitly excludes chat streaming, so the promise was already false. Changed to "not scheduled yet" and pointed at the new spec scoping the real feature |
| [`BUG-2026-08-23-agent-creator-duplicate-user-bubble`](BUG-2026-08-23-agent-creator-duplicate-user-bubble.md) | 🟢 resolved | A fresh Agent Creator interview briefly showed the owner's first message twice (an optimistic bubble plus an early `messages` refetch that already contained the persisted row) — intake 0008's exact race, on the one page that never got `chat-pending.ts`'s fix. Found live while verifying M13, fixed separately: `pendingContent` now drops once `messages` already ends with that same user turn, the content-heuristic sibling of `chat.tsx`'s id-based guard |
| [`BUG-2026-08-23-headless-spawn-skill-leak`](BUG-2026-08-23-headless-spawn-skill-leak.md) | 🟢 resolved (antigravity, live-confirmed) | A headless CLI spawn inherited the operator's full personal `~/.claude` config unisolated; a machine with a preamble-tier personal skill installed could never grant it the tool permission it wanted (no TTY), so antigravity denied every turn immediately with "permission check failed". Fixed with `--disable-slash-commands` on every headless spawn (both providers) and confirmed live — a retried antigravity turn completed. claude-code's own remaining failure on the same machine turned out to be a separate, account-side 401 auth issue, not this bug |
| [`BUG-2026-08-24-claude-browser-pane-reports-hidden-visibility`](BUG-2026-08-24-claude-browser-pane-reports-hidden-visibility.md) | 🟢 resolved (worked around) | The in-app Claude Browser preview pane (`mcp__Claude_Browser__*`) reports `document.visibilityState === "hidden"` on a fresh, foregrounded navigation, starving any page whose data fetching gates on visibility (React Query throughout this app). Not fixed upstream (harness code), but `doc/runbooks/agent-browser-session.md` now prescribes the `agent-browser` CLI instead of the pane/Playwright for the verification walkthrough — verified live to report visibility correctly |
| [`BUG-2026-08-24-hosted-app-never-loads-its-typeface`](BUG-2026-08-24-hosted-app-never-loads-its-typeface.md) | 🟢 resolved | `apps/web` rendered in the browser's fallback sans-serif on every screen — `DESIGN.md`/`globals.css` name Inter Variable, but `layout.tsx` loaded unused Geist/Geist Mono instead and never imported `@fontsource-variable/inter`. Pre-existing since the Next migration, exposed (not caused) by `T-VR-01`. Fixed: `layout.tsx` now imports Inter directly, Geist loaders removed; verified via `getComputedStyle` in a browser |
| [`BUG-2026-08-24-sidebar-nav-has-no-aria-current`](BUG-2026-08-24-sidebar-nav-has-no-aria-current.md) | 🟢 resolved | No sidebar link carried `aria-current="page"` on any route — `app-shell.tsx` computed `isActive` into `className` only. Found during `T-VR-04`'s interim verification pass; fixed by adding the attribute to the sidebar `Link` |
| [`BUG-2026-08-24-knowledge-breadcrumb-title-silently-blank`](BUG-2026-08-24-knowledge-breadcrumb-title-silently-blank.md) | 🟢 resolved | `lib/knowledge.ts` built its article registry with Vite's `import.meta.glob`, which Turbopack silently no-ops rather than errors on — so Knowledge Center breadcrumbs/tab labels showed the raw slug instead of the article title on every route, invisible since `T-VR-01` deleted the Vite host. Fixed in `T-VR-07` by deleting the broken file and threading a `{slug,title}[]` index from the root layout down to the client consumers |
| [`BUG-2026-08-24-project-provision-always-400s`](BUG-2026-08-24-project-provision-always-400s.md) | 🟢 resolved | Every "New project" creation path 400s unconditionally — `POST /api/v1/projects/provision` spread three client-only fields (`mode`, `gitInit`, `gitUrl`) straight into the `projects` insert and never generated a `slug`, the exact gap `BUG-2026-08-22-team-create-500-missing-slug` fixed on the sibling `/projects` handler but not this one. Found live during `T-VR-06`'s verification pass, unrelated to the Vite retirement. Fixed by mirroring that handler's fix; verified live end-to-end through the actual dialog on a second disposable account, plus 5 new unit tests |
| [`BUG-2026-08-24-terminals-article-describes-a-transport-that-no-longer-exists`](BUG-2026-08-24-terminals-article-describes-a-transport-that-no-longer-exists.md) | 🔴 open | The Terminals Knowledge Center article describes a transport that no longer exists ("streamed over the local WebSocket" — unreachable from the hosted app since `T-VR-01`) and states the opposite of the machine's real session behaviour ("no detach/reattach" — `manager.ts` has had a 10-minute detach grace with replay all along). Found while planning the terminal spec; fix queued as `T-M17-05` |
| [`BUG-2026-08-24-expired-session-turns-a-server-action-into-a-runtime-error`](BUG-2026-08-24-expired-session-turns-a-server-action-into-a-runtime-error.md) | 🟢 resolved | A Server Action submitted after the session expired showed a Next.js "Runtime Error: An unexpected response was received from the server" overlay instead of a message — the middleware redirected the action's POST to `/login`, so the action never ran and React's dispatch got HTML where it expected an action response. The middleware's existing "API routes authenticate themselves" carve-out predates Server Actions; extended it to them (`Next-Action` header), so `actionContext()` refuses with a legible "Not signed in." Found by `T-WA-01`'s walk; would have affected all 21 files band 22 converts |
