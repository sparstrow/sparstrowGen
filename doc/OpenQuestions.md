# Open Questions

Decisions waiting on the owner. Nothing here blocks work that doesn't depend on
it — but per `AGENTS.md` §8, work that *does* depend on an entry here does not
start until it is answered.

Format is mandated by `AGENTS.md` §8: context, a plain user-side scenario, then
options carrying pros/cons, a score, blast radius if chosen wrong, caveats, and
a recommendation.

When one is answered, record the answer in the plan or task that consumes it and
**delete the entry from this file**.

---

## OQ-1 — Protecting uncommitted agent work

**Raised:** 2026-08-09, during the local-tier data audit.
**Parked for M4** by the owner on 2026-08-10, when M3 was decomposed. M3 pairs
and registers machines but never starts work on them, so nothing it builds can
produce a dirty working tree. The exposure begins with the M4 command spine —
the first moment cloud dispatch can make an agent edit files unattended.
**Blocks:** nothing in M3. Decide before M4's first dispatch task is written.

### Context

The data audit found that after the cloud split, exactly two things in the local
tier are irreplaceable: the memory vault, and **uncommitted changes in project
working trees**. The vault is covered — it mirrors to Drive. Uncommitted work is
covered by nothing in the current plan.

Agents produce dirty working trees constantly. Committed and pushed work is
recoverable from the remote; a half-finished edit is not.

### Scenario

An agent spends 40 minutes refactoring a module on your desktop and stops to ask
a question. Before you answer, the machine reboots for an update, or you run
`git checkout .` in that repo while cleaning up something unrelated. What
survives?

### Options

**A — Leave it to the developer, document the risk**
- **Pros:** Zero code. No surprise commits appearing in anyone's history. Matches
  how developers already work — you own your working tree.
- **Cons:** The failure is silent and total when it happens. OS-level backup
  (File History / Time Machine) may or may not cover the repo, and neither is
  verified.
- **Score: 5/10**
- **Blast radius if wrong:** One bad day and 40 minutes of agent work, repeated
  occasionally. Not catastrophic, genuinely annoying.
- **Caveats:** Realistically the status quo. Worth choosing deliberately rather
  than by default.

**B — Daemon auto-commits to a scratch branch before yielding**
- **Pros:** Nothing is ever only in the working tree. Recovery is a normal git
  operation. Gives a per-run diff for free, which is useful for review anyway.
- **Cons:** Writes to the developer's repo without being asked. Needs a branch
  naming scheme, cleanup policy, and care not to commit secrets or huge build
  artifacts that happen to be untracked.
- **Score: 8/10**
- **Blast radius if wrong:** Branch clutter and confusion about where work
  lives. Recoverable — delete the branches — but irritating to unwind across
  many repos.
- **Caveats:** Must respect `.gitignore` and must never auto-push. Local commits
  only; pushing is a separate, explicit action.

**C — Daemon snapshots the working tree to Drive before each run**
- **Pros:** Doesn't touch git at all, so no interference with the developer's
  branch state. Captures untracked files too.
- **Cons:** Duplicates whole trees including `node_modules` unless carefully
  filtered. Restore is manual and awkward. Storage grows fast.
- **Score: 4/10**
- **Blast radius if wrong:** Wasted Drive quota and a restore path nobody trusts
  enough to use.
- **Caveats:** The filtering problem is the whole problem, and git already
  solved it.

### Recommendation

**B**, scoped tightly: local commit only, to a `sparstrow/wip/<run-id>` branch,
respecting `.gitignore`, never pushed, garbage-collected after N days. It reuses
machinery that already exists in every project and produces a per-run diff that
makes review easier regardless.

---

## OQ-2 — How should an agent complete the browser verification pass?

**Raised:** 2026-08-10, closing out M2.
**Blocks:** nothing right now. `T-M2-08`'s rendering pass was completed on
2026-08-10 — but only because a signed-in session happened to still be live in
the preview browser. That was luck, not a method.

Sign-in is email + password. An agent cannot type a password into a form field,
so once that session expires there is no way back into a signed-in page without
a human. This recurs on every future phase that needs the UI exercised, and the
M2 pass showed the cost of not having it: two defects (a hook-order crash on
the first navigation after sign-in, and an entire class of Tailwind utilities
missing from the build) were invisible to the API-level tests and only appeared
once pages actually rendered.

### Options

**A — The owner signs in, then hands the live session to the agent**
- **Pros:** Zero new surface area. Works today. The session is real, so what
  the agent sees is exactly what a user sees.
- **Cons:** Needs a human at the start of every verification pass, and sessions
  expire after an hour, so long passes need re-authing mid-flight.
- **Score: 7/10**
- **Blast radius if wrong:** None. Worst case is a wasted pass.
- **Caveats:** Fine for occasional verification; annoying if it is every run.

**B — A dev-only sign-in route that mints a session from a signed token**
- **Pros:** Fully unattended. Bounded and auditable — one route, enabled only
  when an env var is set. No password ever handled.
- **Cons:** It is an auth bypass. If it ever shipped enabled to production it
  would be a total compromise, and "dev-only" flags have shipped before.
- **Score: 5/10**
- **Blast radius if wrong:** Catastrophic — complete authentication bypass.
- **Caveats:** Would need a build-time guard, not just a runtime check.

**C — Playwright with `storageState`, seeded once per machine**
- **Pros:** The standard answer to this problem. The credential lives in the
  test runner's own store, not in the agent's context. Reusable for real E2E
  tests later, which M5 and M7 will want anyway.
- **Cons:** New dependency and a fixture to maintain. Still needs one human
  sign-in to seed the state file, though only once per machine.
- **Score: 8/10**
- **Blast radius if wrong:** Low. A stale `storageState` fails loudly.
- **Caveats:** The state file holds a real session and must be gitignored.

### Recommendation

**C**. Playwright's `storageState` is what this problem is for, and the fixture
pays for itself once M5 needs live transcript streaming verified. **A** served
as the M2 stopgap by accident and should not be relied on again — a session
that survives in a browser between agent sessions is not something to plan
around.

---

*Decisions 1–4 of the daemon/cloud plan (data placement, transport,
degradation, auth & shell) are all settled — see
`doc/plans/2026-08-09-daemon-cloud-control-plane.md`.*
