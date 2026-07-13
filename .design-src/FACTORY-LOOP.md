# FACTORY-LOOP — how a designed page becomes shipped code

> **Status: DRAFT v0 (2026-06-28) — pending lock-in.**
> This is the runbook for building Sparstrowgen's own pages. The *decisions* stay
> interactive (you + Claude Code); only mechanical *implementation* is delegated to a
> routine. Master status board: [`APP.md`](./APP.md).

---

## The loop (per page/feature)

```
   ┌─ INTERACTIVE (you + Claude in the loop) ────────────────┐   ┌─ ROUTINE ─┐
   │                                                         │   │           │
 ① Design ─▶ ② SPEC.md ─▶ ③ /office-hours ─▶ ④ /autoplan ──▶ │ ⑤ implement │ ─▶ ⑥ you merge
   in Claude   (Claude     (you lock the      (review +       │   build→PR  │
   Design      writes it)   decisions)         APPROVED)      │           │
              .design-src/<page>/                              └───────────┘
   │                                                         │
   └─ while ⑤ runs, start ① for the NEXT page ───────────────┘   (planning runs one stage ahead of building)
```

| # | Stage | Who | Output | Gate to advance |
|---|-------|-----|--------|-----------------|
| ① | **Design** | You, in Claude Design | `export.html` in `.design-src/<page>/` | export committed |
| ② | **Spec** | Claude Code | `.design-src/<page>/SPEC.md` (feature list, [EXISTS]/[NEW]/[CHANGE]/[CONFLICT], backend delta, data contracts) | SPEC written |
| ③ | **Office-hours** | You (interactive) | `## Scope (LOCKED)` + `### Locked decisions` block appended to SPEC | every [CONFLICT] resolved |
| ④ | **Autoplan** | `/autoplan` (you approve gate) | `<!-- AUTONOMOUS DECISION LOG -->` appendix with **`Final gate: APPROVED`** | the APPROVED marker is present |
| ⑤ | **Implement** | **Routine** — Claude Code on-demand, or an external agent IDE (e.g. Antigravity 2.0) reading [`AGENTS.md`](../AGENTS.md) | branch + commits + green checks + pushed branch / PR | typecheck + tests green |
| ⑥ | **Merge** | You | squash-merge to `main` | branch protection: PR + 1 approval |

**The hard gate between interactive and routine:** the routine refuses to build any SPEC
that does not contain `Final gate: APPROVED` in its autoplan appendix. No approved plan →
nothing builds. This is what keeps every product decision in your hands while the typing
goes to a machine.

---

## ⑤ The implementation routine — contract

The routine's entire job: turn ONE locked `SPEC.md` into a reviewable PR. It invents
nothing the plan doesn't specify.

### Preconditions (refuse the build unless ALL hold)
1. `SPEC.md` contains `Final gate: APPROVED`.
2. The page's row in [`APP.md`](./APP.md) is at status `autoplan ✅` (ready to build).
3. Working tree is clean and `origin/main` is reachable.

### Steps
1. `git fetch origin && git switch -c <type>/<page>-<slug> origin/main`
   — **always branch off fresh `origin/main`.** Never reuse a squash-merged branch name
   (re-pushing recreates it with diverged history).
2. Read `SPEC.md` end-to-end, including the autoplan appendix's **Implementation Tasks**
   (P1→P2→P3) and **Failure Modes / Error & Rescue** registries. Build the locked
   decisions, **not** the decoded design module (it carries pre-lock field names/providers).
3. Implement task-by-task. **One atomic commit per task**, message references the task id
   (e.g. `feat(agents): P1.2 shared agent-fieldset`).
4. **Update the Knowledge Center** (intake 0003 rider): if the change adds or alters
   anything a *user* would see or do, update the matching article(s) in
   `packages/ui/src/content/knowledge/` **in the same branch/PR** (bump the article's
   `updated:` date). Write for user understanding — what changed *for a user*, not
   line-by-line code trivia; skip internal refactors entirely. New surface → new article
   registered in its section per `.design-src/knowledge-center/SPEC.md`.
5. `pnpm typecheck && pnpm test` — both must be green before pushing. Fix or stop; never
   push red.
6. `git push github-agent HEAD` — push over the SSH remote (per-agent git identity is
   injected automatically → `author-check` CI passes).
7. **PR:** `gh pr create` is blocked on this machine (gh is authed as the wrong account).
   So the routine prints the compare URL for you to open the PR in one click:
   `https://github.com/sparstrow/sparstrowGen/compare/main...<branch>?expand=1`
   *(Graduation: once a PR-scope token is wired, the routine opens the PR itself.)*
8. Update [`APP.md`](./APP.md): set the page status to `in-review 🔁` and record the branch.
9. **STOP.** The routine never merges. You review the PR and squash-merge (⑥).

### Operational lesson (2026-06-29)
**Push every planning commit immediately — never batch.** A planning branch (office-hours
lock, autoplan appendix, AGENTS.md, etc.) is only as real as what's pushed. Once, three
commits were made locally after the initial push and never re-pushed; the PR was merged
from GitHub's view of the branch (commit 1 only), silently dropping the office-hours lock,
the `Final gate: APPROVED` marker, and `AGENTS.md` from `main`. A build still succeeded only
because the executor happened to read the local working tree before branching — that's luck,
not the system working. **Rule: after any edit to `SPEC.md`/`APP.md`/`AGENTS.md`, commit AND
push in the same step**, so `origin/main` (post-merge) is never behind what was actually decided.

### Hard boundaries (the routine must NOT)
- Merge, force-push, or touch `main` directly (branch protection blocks it anyway).
- Build a SPEC without `APPROVED`.
- Add scope beyond the SPEC's feature list (no "while I'm here" features).
- Weaken the trust boundary (no `bypassPermissions`, no wildcard tools) — the SPEC's
  security tasks are mandatory, not optional.

---

## On-demand now, scheduled later

**Now — on-demand (one trigger, you watch):**
Point a fresh Claude Code run at one locked SPEC:
> "Implement the locked plan in `.design-src/<page>/SPEC.md` following
> `.design-src/FACTORY-LOOP.md` §⑤. Build → typecheck → test → push branch → print the PR
> compare URL → update APP.md. Do not merge."

Run it, watch the first few, build trust. This is the floor; everything below graduates from it.

**Later — scheduled (`/schedule` cloud routine, fire-and-review):**
A cron cloud agent that, each run: reads `APP.md`, finds the topmost page at `autoplan ✅`,
executes §⑤ on it, opens/queues the PR, updates `APP.md`. You wake up to PRs to review.
Only enable this **after** the on-demand form has produced ≥2 clean PRs you'd have merged
as-is — that's the trust gate for taking your hands off the trigger.

---

## Pipelining rule

The point of the split: **plan ahead of build.** While the routine implements page N
(stage ⑤), you and Claude run stages ①–④ on page N+1. The master index makes the queue
visible so the routine always knows what's `autoplan ✅` and ready, and you always know
what's waiting on your office-hours/autoplan time.
