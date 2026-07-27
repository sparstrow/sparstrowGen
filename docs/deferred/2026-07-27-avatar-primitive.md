# `avatar` primitive

- **source:** owner decision during 6-pre Phase A
- **project:** factory
- **size:** S
- **date:** 2026-07-27
- **links:** `docs/specs/2026-07-27-intake-backlog-triage-and-sequencing.md` §3;
  `packages/ui/src/components/actor-avatar.tsx`

**What:** shadcn/ui's `avatar` primitive (`Avatar`, `AvatarImage`, `AvatarFallback`, plus the v4
additions `AvatarBadge`, `AvatarGroup`, `AvatarGroupCount`). The 6-pre audit listed it as one of the
components hand-rolled during the `0012` redesign and due to be replaced in the Phase A vendoring
pass. It was not vendored.

**Why deferred:** the premise turned out to be wrong on inspection. `ActorAvatar` is not a
hand-rolled shadcn `Avatar` — it solves a different problem. It renders **deterministic initials
with a stable tint**, hashing the actor's name into a fixed palette slot so the same agent is
recognisable across every surface. shadcn's `Avatar` exists to show an **image with a fallback**,
and there is no image to show: a search of `packages/ui/src` found zero `<img>` elements and no
`avatarUrl`/`avatar_url` field anywhere in the tree. Vendoring it would have added a dependency for
zero consumers — the same test that deferred `radio-group` in the same pass.

Migrating `ActorAvatar` onto it is a separate and larger question, because the deterministic tint
has no equivalent in the primitive and would have to be rebuilt on `AvatarFallback` via `className`.
That work also collides with a pre-existing rule violation worth fixing at the same time:
`ActorAvatar`'s palette is hardcoded Tailwind colors (`bg-sky-500/15`, `bg-violet-500/15`, …), which
`CLAUDE.md`'s semantic-tokens-only rule forbids. Changing it is therefore a design decision about
how actors are identified visually, not a primitive swap.

**Revisit when:** a real image source exists — the most likely trigger is Phase 6's hosted
multi-tenant work introducing user accounts, where a profile picture becomes meaningful and
`AvatarImage` finally has something to render. Failing that, whenever Phase B takes up the surfaces
that use `ActorAvatar` (`agents`, `teams`, `project-detail`) and decides whether the deterministic
tint survives, and in what token vocabulary.
