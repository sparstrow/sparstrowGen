# Feedback

Raw feedback about the running app — from the owner, or relayed from a user —
captured before it's been triaged into anything actionable. This is the
**inbox**, not a lifecycle stage: nothing gets built directly out of this
folder. Every item here eventually routes to one of the real destinations
`doc/README.md` already defines.

| File | Holds |
|---|---|
| **`feedback/`** | **raw reaction, not yet triaged — "this feels off", "I wish it did X"** |
| `bug/` | confirmed or suspected wrong behavior |
| `security/` | a bug whose impact is a trust-boundary issue |
| `Ideas.md` | unscoped, no commitment, may never be built |
| `specs/` | a real feature/change, scoped, ready to plan |
| `OpenQuestions.md` | needs a decision from the owner before work can proceed |

The distinction that matters: a bug report already knows it's a bug, a
feature request already knows it's a feature. Feedback often doesn't know
yet what it is — "the machines page feels slow" could be a bug (a real
regression), an idea (a feature that would make it feel faster), or a
misunderstanding that needs no action at all. This folder exists so capturing
it isn't blocked on figuring that out first.

## The rule that matters

**Capture feedback in the same turn it's given, verbatim, before triaging
it.** Don't paraphrase while capturing — paraphrasing is where "this crashed
when I clicked pair" quietly turns into "pairing has issues" and the
reproducible detail is gone. Triage can happen later; capture cannot.

A feedback item mentioned only in a chat message does not exist to the next
session, exactly like `doc/bug/README.md`'s rule for bugs.

## Format

One file per feedback item: `FB-<date>-<slug>.md`, e.g.
`FB-2026-08-27-machines-page-pairing-flow-confusing.md`.

**Copy [`../templates/feedback.md`](../templates/feedback.md)** — it carries
the full skeleton (Status / Reported by / Reported / Area, then Raw feedback,
Context, Triage, Resolution). That template is the canonical format; this
file doesn't restate it.

If several distinct pieces of feedback arrive in one message, split them into
separate files — one Triage decision per file keeps the routing clean. If
they're really one complaint with several facets, keep it as one file and
route it to multiple destinations in its Triage section.

## Workflow

1. **Capture.** Owner (or relayed user) gives feedback → copy the template,
   fill in Raw feedback + Context, Status `🔴 new`. Add the index row. Stop
   here if triage isn't obvious yet — capturing is the only mandatory step in
   the same turn.
2. **Triage.** Read the item, decide which real destination(s) it converts
   into, per the table above and `doc/README.md`'s own "Which file does this
   go in?" table for anything downstream of a bug/idea/spec split. Create
   that file, link it back in this file's Triage section, flip Status to
   `🟡 triaged`.
3. **Route → build.** The destination file now owns its own lifecycle (a bug
   gets fixed and closed per `doc/bug/README.md`; a spec goes through owner
   review, then `doc/plans/`, then `doc/tasks/`, exactly as
   `doc/README.md`'s lifecycle diagram describes). This file does not track
   that work — it just points at it.
4. **Close.** Once every destination this item produced has actually landed,
   fill in Resolution and flip Status to `🟢 routed`. Leave the file in
   place — like `bug/` and `security/`, this folder is a historical record,
   not a queue that empties out.

A feedback item that turns out to need no action (already covered, working
as intended, out of scope) still gets triaged and closed — say so in Triage,
skip Resolution, flip straight to `🟢 routed`. Silently ignoring an item is
not an option; the index should always show what happened to everything that
came in.

## Index

| ID | Status | Area | Summary |
|---|---|---|---|
| [`FB-2026-08-27-signup-missing-confirm-password`](FB-2026-08-27-signup-missing-confirm-password.md) | 🔴 new | Auth — sign-up form | Sign-up form has only one Password field, no confirmation |
