# SEC-2026-08-28-antigravity-headless-tools-unrestricted

**Status:** 🔴 open
**Severity:** high
**Reported by:** agent — while implementing T-CS5-03 (Band 26, CS5 chat attachments), verifying whether `Agent.cwd`/`Agent.allowedTools` actually scope a headless `antigravity` (`agy`) spawn to a restricted directory and tool set, the way `chatAgent()`'s own comment claims ("Free chat gets no tools").

## What's exposed / what's possible

Every chat turn dispatched to the `antigravity` provider — `free`, `project`, or `agent` kind, cloud-dispatched or local — runs with **no actual tool restriction and no actual directory sandbox**, regardless of what `Agent.allowedTools`/`Agent.cwd`/`Agent.permissionMode` are set to. The model can read, and very likely write, any file the OS user running the daemon can access, and can very likely run arbitrary commands, from within what the rest of this codebase believes is a scoped "free chat, no tools" or "project chat, read-only" session.

Two independent, compounding causes, both confirmed live:

1. **`packages/core/src/providers/antigravity.ts`'s `buildHeadlessSpawn`/`buildInteractiveSpawn` never read `agent.allowedTools` or `agent.disallowedTools` at all.** Only `workspaceDirArgs()` (`cwd`/`--add-dir`) and `permissionArgs()` (`--dangerously-skip-permissions` / `--mode accept-edits` / `--mode plan`) are wired in. The `agy` CLI itself has no `--allowedTools`-equivalent flag (confirmed against `agy --help`'s full output) — there is no mechanism in this provider, or in the CLI it wraps, that can restrict which of `agy`'s ~35 tools (`view_file`, `run_command`, `write_to_file`, `replace_file_content`, browser control, etc.) a turn may use. Setting `allowedTools: ["Read"]` on the `Agent` object passed to this provider is silently a no-op.

2. **`cwd` does not bound `agy`'s file access either.** `view_file` (its Read-equivalent tool) happily reads an absolute path outside the spawn's `cwd`, with no denial, no prompt, no error — confirmed by a live spawn (see Evidence). Directory scoping via `cwd`/`--add-dir` is therefore not a working containment boundary for this provider, contradicting the assumption `chatAgent()`'s project-session branch and T-CS5-03's plan both make (`cwd: project.rootDir` "restricting" access).

A third, related finding: **`--mode plan` silently has no effect when `--disable-slash-commands` is also passed** (the CLI prints a stderr warning: `"warning: --mode plan has no effect while slash command expansion is disabled."`). Every headless spawn this provider builds always passes `--disable-slash-commands` (both `buildHeadlessSpawn` methods), so `permissionMode: "plan"` — a real, otherwise-plausible mitigation — can never actually take effect on a headless antigravity turn today, silently.

## Who can trigger it

Not an external-attacker-triggerable bug — this is a **capability gap between what the product believes it grants and what it actually grants**. Any owner using a `free` or `project` chat session on the `antigravity` provider is, today, unknowingly giving the model full host filesystem read (and likely write/execute) access, not the "no tools" or "read-only" access the UI and code comments describe. The exposure is to the owner's own machine/data via their own chat session, not cross-tenant — but it is a real gap between the security model the product presents and the one it enforces.

## Evidence

Live spawn, no mocking, run from this session while implementing T-CS5-03:

```
cwd = <scratch>/cwd-test/inside   (contains only attachment.txt)
outside file = <scratch>/cwd-test/outside/secret.txt  (contains "SECRET_OUTSIDE_CWD_CONTENT_12345")

spawn: agy.exe --model "Gemini 3.1 Pro (High)" --output-format stream-json
       --disable-slash-commands --mode plan --print "<ask it to read the outside file
       by absolute path, and list its own cwd>"
```

Result (`stream-json` output, abbreviated):
- `init` event's `permission_mode` is `"request-review"`, not `"plan"` — confirms the mode-vs-disable-slash-commands conflict independently of the stderr warning.
- The model called `view_file` with `AbsolutePath` pointing at the OUTSIDE file, and it **succeeded** (`"output":"2 lines, 33 bytes"`).
- Its final response quoted the outside file's exact contents verbatim: `SECRET_OUTSIDE_CWD_CONTENT_12345`.
- stderr: `warning: --mode plan has no effect while slash command expansion is disabled.`

No fixture, no mock — a real `agy` v1.1.22 process, a real absolute path outside its `cwd`, a real successful read.

Confirmed by reading the code that `allowedTools`/`disallowedTools` are never referenced anywhere in `packages/core/src/providers/antigravity.ts`, and that `agy --help`'s full flag list has no per-tool allow/deny flag.

`claude-code`'s equivalent mechanism (`--allowedTools`, a real CLI flag that this repo's provider does wire through) could **not** be live-verified in the same pass — this environment's `claude` CLI OAuth token is expired (`"OAuth access token has expired. Re-authenticate to continue."`, matching the pre-existing, unrelated gap already recorded in `doc/KnownGaps.md`). Whether `claude-code`'s `--allowedTools Read` genuinely refuses an absolute path outside `cwd` is therefore still **unconfirmed**, not proven safe — see `doc/KnownGaps.md`'s new entry for this task.

**Update 2026-08-28, T-CS5-04 — a concrete, not just hypothetical, cross-context leak.** A real `project`-kind chat turn, dispatched through the full cloud pipeline (not a standalone probe script), was asked to "list the files in this project." Its reply listed the daemon's **memory vault** contents instead — real note filenames under `agents/`, `projects/` (`VAULT_DIRS`, `packages/shared/src/constants.ts`) — not the real project directory the turn's `cwd` was actually set to (confirmed separately: the attachment itself landed in and was read from the correct `rootDir`, so the download/placement code is not at fault). Root cause: `workspaceDirArgs()` unconditionally appends `config.vaultPath` to every `agy` spawn's `--add-dir` list, on every chat turn, regardless of session kind — combined with `cwd` not actually confining the model's own exploration (this report's finding 2), the model wandered into and reported on the vault instead of, or alongside, the project. This is a live demonstration that the leak is not merely "the model *could* read elsewhere if asked" but "the model's own unprompted exploration surfaces the daemon's memory vault," a more concrete failure mode than the original report captured.

## Impact

**Exploitable today**, on every existing `free`/`project`/`agent` chat session that ever gets dispatched to `antigravity` — this predates CS5/T-CS5-03 entirely; the attachment feature does not introduce it, it inherits it. A `project` session's own docstring ("READ-ONLY access... Never modify files") is not enforced for this provider: nothing stops the model from writing or deleting files in that repo, or anywhere else the daemon's OS user can reach, or running arbitrary commands via `run_command`.

For CS5/T-CS5-03 specifically: the plan's "free/agent turns get a scoped `Read` grant for this turn only" promise **cannot be delivered for `antigravity`** with the current provider implementation. Placing an attachment on disk and pointing the prompt at it still works (the file is there, and the model can read it) — but so can the model read, and likely alter, anything else on the machine, attachment or not. This is a pre-existing condition T-CS5-03's own work surfaces rather than causes; it does not block shipping the attachment *download* mechanism, but it means the "scoped" half of that phase's Definition of Done is honest to promise only for `claude-code`, and only pending live verification of that provider's own boundary (still unconfirmed — see above).

## Resolution

<!-- Open. Needs its own scoped task once someone decides the intended fix — an
antigravity-side tool restriction if agy ever exposes one, or a
process-level sandbox (container, restricted OS user, filesystem
namespace) if it doesn't. Not attempted as part of T-CS5-03, which is
delivery plumbing, not a sandboxing redesign. -->
