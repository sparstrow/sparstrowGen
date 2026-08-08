# Folder picker for the client-variant fork field

- **source:** scope decision during `/speckit.clarify`
- **project:** sparstrowgen
- **size:** S
- **date:** 2026-08-08
- **links:** `specs/001-project-folder-picker/spec.md`; the field is
  `packages/ui/src/routes/pages/project-detail.tsx` (the `vRoot` input in the Client variants
  panel, ~line 808)

**What:** the Browse… affordance built in feature 001 for the New project dialog's root directory
field, applied to the second place in the app that asks for a hand-typed absolute path — the
"Fork a client variant" form. That field carries the identical `C:\Projects\…` placeholder and
the identical problem: the owner must type an absolute Windows path with no way to point at it.

Its target is a clone destination — `createClientVariant` clones the base repo into it — so it
behaves like the New project dialog's clone mode and would want the same new-folder action that
feature 001's User Story 3 builds.

**Why deferred:** the owner chose, on 2026-08-08, to hold feature 001 to the surface the reported
problem actually named. Two reasons, and the second is the load-bearing one:

1. Constitution VII — build only what the plan lists. The request was the New project dialog.
2. The new-folder action in feature 001 is gated on the *creation mode* (`scratch` and `clone`
   get it; `bind` does not). The variant fork has no creation mode. Wiring it in now means
   inventing a fourth caller shape for a control whose first three callers have not yet shipped
   or been verified against the real artifact — designing an abstraction against an imagined
   second consumer rather than an observed one.

**What this costs:** the owner keeps hand-typing one absolute path, in a less-travelled flow than
the one that prompted the work. The picker control from 001 is expected to be reusable, so the
follow-up should be small — but "expected to be reusable" is exactly the kind of claim that only
becomes true once a second caller proves it, which is why this entry exists rather than a comment
promising it will be easy.

**Revisit when:** feature 001 has shipped and been verified, and either the owner hits the variant
fork field in real use, or a third hand-typed-path field appears. At that point the right move is
a small spec that wires the existing control into the remaining callers — and if the control turns
out not to be reusable after all, that is the finding, and it should be recorded rather than
worked around.
