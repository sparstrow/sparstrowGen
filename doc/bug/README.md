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

```markdown
# BUG-<date>-<slug>

**Status:** 🔴 open | 🟡 investigating | 🟢 resolved
**Reported by:** owner | agent (name what you were doing when you found it)
**Reported:** <date>

## Symptom
What actually happens, from the user's or the system's point of view.
Concrete — inputs, steps, observed output. Not a guess at the cause.

## Reproduction
Exact steps, or the exact evidence if it can't be reproduced on demand.

## Investigation
What was checked, ruled out, and what's still suspected. Update this as it
develops rather than starting a new file.

## Impact
What breaks and for whom, if left unfixed.

## Resolution
Filled in when closed: root cause, the fix, and where it landed (commit/PR).
Leave the file in place after closing — like `KnownGaps.md`, this folder is a
record, not a queue that empties out.
```

## Turning a bug into work

Once a bug is understood well enough to fix, open a task in
[`../tasks/`](../tasks/README.md) (or add it to an existing phase) and link the
task back to the bug file's id. The bug file stays as the historical record;
the task is what actually gets executed and ticked off.

## Index

| ID | Status | Summary |
|---|---|---|
| [`BUG-2026-08-16-signup-auto-confirms`](BUG-2026-08-16-signup-auto-confirms.md) | 🟡 investigating | Fresh signup auto-confirms and auto-logs-in despite "Confirm email" verified ON in the Supabase dashboard |
