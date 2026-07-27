# PRODUCT.md — Sparstrowgen

> Bootstrapped from repo evidence (CLAUDE.md, docs/intake/0001+0002 in the user's own words,
> .design-src/APP.md) by an autonomous design session. Refine with `$impeccable teach` anytime.

## Product purpose

Sparstrowgen is a local-first **agent factory**: a Fastify core that spawns and
supervises CLI coding agents (Claude Code, Antigravity) over projects on the owner's machine,
with persistent memory, task/goal orchestration, pipelines, and a React control-room UI.
The UI is the cockpit the owner lives in while agents do the work.

## Users

**Today: exactly one** — the owner-operator. A senior developer running the factory on a Windows
desktop, usually alongside an IDE, during long day-and-evening sessions. Fluent in Claude Code
desktop, Linear-class tools, and terminals. Zero tolerance for toy-looking UI; instantly notices
off-spacing and mismatched controls. **He remains the design bar** — every surface is built to
satisfy him first.

**After Phase 6** (`docs/planned/phase6-hosted-foundation.md`): workspace members on their own
local daemons, then non-developer sales and marketing staff on cloud runtimes. Staff are not
developers — they will never install Electron or authenticate an agent CLI, so any surface they
touch has to hold up without a terminal beside it.

## Register

`product` — design serves the task. The tool should disappear into the work.

## Tone & feel

Calm, precise, quietly confident. A professional instrument, not a SaaS marketing surface.
Density is welcome where information lives (runs, tasks); breathing room where conversation
lives (chat). Familiarity is a feature: the chat surface should feel like Claude Code desktop —
a serene reading column, a composer that is obviously the center of gravity, history that
stays out of the way.

## References

- **Claude Code desktop** — the explicit bar for the chat surface (user's own words, intake 0002).
- Linear — control density, keyboard-first calm.
- Raycast — restrained neutral palette with one working accent.

## Anti-references

- Email-inbox UIs for conversation (the exact thing intake 0002 replaces).
- Generic admin-template dashboards; hero-metric cards; identical card grids.
- Chat toys: heavy colored bubbles for both sides, avatars everywhere, gradient flourishes.

## Strategic principles

1. Conversation reads like a document, not a ping-pong of balloons: assistant text sits flat
   on the surface in a comfortable measure; only the user's words get a quiet bubble.
2. The composer is the primary control — context (free/project/agent) and model live with it,
   not in modals.
3. Sessions are memory, not chrome: the history rail is quiet until needed.
4. Every model failure names its real reason and asks before failing over. Honesty is a
   design feature here.
