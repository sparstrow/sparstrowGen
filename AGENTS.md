# AGENTS.md — operating rules for AI coding agents

> **Harness-agnostic entry point.** Most coding agents (Codex CLI, Cursor, Windsurf, Antigravity
> `agy`, cloud/background agents) auto-discover this file at the repo root. Whichever tool you are,
> you follow the **same contract** as Claude Code — there is no separate, weaker rulebook for
> "other" harnesses.

## The build contract is `CLAUDE.md` — read it now and follow it exactly

`CLAUDE.md` is the single source of truth: the loop (capture → plan → build → verify → promote →
ship), the **Definition of Done** gate, the git flow (`staging` as the agents' trunk, `main` as the
owner's release gate, squash-merge always, branch hygiene), the parallelism rules, the engineering
conduct bar, and skill routing. **Read `CLAUDE.md` before doing anything and follow every rule in
it.** Do not rely on this file for the details — it is a pointer, not a divergent contract.

## Acting as Listener or Curator

If the owner brings you something to **record, not build** (a bug/feedback, an idea/concept, a
design, a change, a memory note) you are the **Listener**: adopt `docs/workflows/agents/listener.md`
verbatim, capture faithfully to `docs/intake/`, no analysis or fixes. If asked to **review/classify/
route a capture**, you are the **Curator**: adopt `docs/workflows/agents/curator.md` — an
office-hours-style dialogue, confirm what the item is, lock and route it. Examine/capture only; no
code-writing in either role.

## Non-negotiables (the safety net — full contract in `CLAUDE.md`)

- **Nothing merges without passing the Definition of Done** in `CLAUDE.md` (typecheck + tests +
  a real-artifact usability test — actually run the thing, a canned/echo result is a FAIL).
- **Commit author** is repo-set to `Sparstrow Agent <agent@sparstrow.com>`. Do NOT override it or
  add a `Co-Authored-By:` trailer — CI `author-check` fails otherwise.
- **Never touch `main` directly** — it is branch-protected (PR + approval + checks, squash-only, no
  force-push). Agents branch off fresh `origin/staging`, build, gate, merge to `staging`; the owner
  promotes `staging` → `main`. **Never commit directly on a local `staging`/`main` checkout, for any
  kind of session** — the only commands run there are the squash-merge and its push. With multiple
  agent accounts working concurrently, derive branch names from something unique (the intake id, or
  a specific slug) and check `git ls-remote --heads origin <name>` before pushing a new one — see
  `CLAUDE.md`'s Git flow section for the full rule.
- **Stay in scope** — build only the plan's tasks; no "while I'm here" additions.
- **Never weaken trust boundaries** — no `bypassPermissions`, no wildcard tool grants.
- **Toolchain:** `pnpm` on Node 24 (better-sqlite3 / node-pty ABI). Don't run the core server during
  a build (SQLite locks). Start from a clean working tree.
- **Branch hygiene:** delete your local branch once its upstream shows `[gone]`; never delete a
  branch checked out in another worktree.
