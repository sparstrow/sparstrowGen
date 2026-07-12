# CLAUDE.md — Sparstrowgen

Sparstrowgen is a local-first, single-user agent factory: Fastify core on `127.0.0.1:48750`,
React/Vite UI, better-sqlite3 + Drizzle, pnpm + turbo monorepo (`packages/core`, `ui`, `shared`,
`memory-cli`, `memory-mcp`, `desktop`).

- Build/verify: `pnpm typecheck && pnpm test` — both must be green before pushing.
- `main` is branch-protected: PR + 1 approval + `typecheck` + `author-check`; squash-only.
- Commit author must be `@sparstrow.com`. Do NOT add `Co-Authored-By: Claude` trailers (fails `author-check`).
- Process runbook: `.design-src/FACTORY-LOOP.md`. Build board: `.design-src/APP.md`.
- External-agent contract: `AGENTS.md`.

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

**Our own factory workflows (`docs/workflows/`) — these take precedence over the gstack skills below:**
- Anything to *capture, not build* — a bug/feedback, a new idea/feature/concept, a design, a
  change, or a memory note (decision/pitfall/lesson/meeting/architecture) → invoke **/listener**
  (capture-only; see `docs/workflows/agents/listener.md`).

> The gstack routes below are being replaced workflow-by-workflow by our own agents (Listener,
> Reviewer, Pipeline Suggester, Memory Archivist, …). This section gets its full rewrite once
> the remaining workflows are locked.

Key routing rules (gstack — legacy, being phased out):
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
