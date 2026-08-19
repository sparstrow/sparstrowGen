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
| [`BUG-2026-08-16-pairing-path-wrong-in-cli`](BUG-2026-08-16-pairing-path-wrong-in-cli.md) | 🟢 resolved | `sparstrow pair` sent users to "Settings → Workspace → Runtimes", a tab that doesn't exist. All four strings now name the Machines page (T-M8-04) |
| [`BUG-2026-08-16-signup-auto-confirms`](BUG-2026-08-16-signup-auto-confirms.md) | 🟢 resolved | Fresh signup auto-confirmed and auto-logged-in despite "Confirm email" being ON — an `auth.users` trigger was overriding the setting |
| [`BUG-2026-08-18-shell-invents-name-from-email`](BUG-2026-08-18-shell-invents-name-from-email.md) | 🔴 open | The shell still derives an account name from the email local part — the same FR-019 invention M9 removed from the database, in a second store. Clearing your name puts it back |
