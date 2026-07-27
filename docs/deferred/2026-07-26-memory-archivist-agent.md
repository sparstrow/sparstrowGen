# Memory Archivist — an in-app agent that files what's worth remembering

- **source:** review-outcome
- **project:** factory
- **size:** M
- **date:** 2026-07-26
- **links:** spec deleted with `docs/workflows/agents/memory-archivist.md`; recover with
  `git log --diff-filter=D -- docs/workflows/agents/memory-archivist.md`

**What:** a Sparstrowgen **product** feature — an agent that takes something worth preserving (a
decision, a pitfall, a lesson, an architecture note) and files it into scoped memory: picks the
right scope, writes the note, links it to related notes, and keeps the vault from becoming a pile.
The written spec covered scope selection and the note format.

**Why deferred:** it was written as a *factory build-process* role during the Listener/Curator era,
and that whole flow was retired on 2026-07-26 when the build methodology moved to superpowers. The
process role is dead. The product idea is not — memory scoping and note quality are core to what
Sparstrowgen sells, and nothing in the app does this today. Deferred rather than deleted so the
idea survives the process it was born in.

**Revisit when:** memory notes are being written often enough that scope mistakes and duplicate
notes are a real problem in the vault — or when the Phase 6 server-side memory write path (§4.3 of
`docs/planned/phase6-hosted-foundation.md`) lands and scope resolution becomes a server concern
worth putting an agent in front of.
