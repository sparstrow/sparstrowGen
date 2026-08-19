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

## OQ-4 — Is code syntax highlighting a fifth colour role, or does it get folded into the four?

**Raised:** 2026-08-19, planning `doc/plans/2026-08-19-parametric-theming.md`.
**Blocks:** one sub-item of phase D2.2 — whether `--hl-*` is rewritten
parametrically alongside everything else. The rest of D2.2 proceeds either way.

### Context

`packages/ui/src/styles/globals.css` carries a second colour system almost
nobody has looked at: six `--hl-*` tokens per mode (comment, keyword, string,
number, title, attr), twelve chromatic values in total, driving
`rehype-highlight` output in chat and transcripts.

`DESIGN.md` §2.5's **Named rule — Four Roles** says every colour on screen is
brand, status, provider identity, or actor identity, and a colour that is none
of those four is a bug. Syntax highlighting is none of the four. By the letter
of the rule these twelve values are twelve bugs, which is almost certainly not
what the rule meant — but the rule does not say so, and the parametric rebuild
is the moment someone has to decide.

The practical question underneath: **when a user picks the Slate surface,
should their code blocks shift with it?**

### The user-side scenario

You open a run transcript. The agent pasted forty lines of TypeScript. You have
the Soft surface selected because you read these for long stretches. Today the
code block's greens and purples are the same greens and purples they would be
on Mono — they were tuned once against a neutral ramp and never move.

### Options

#### Option A — A fifth role: "code", fixed and never themed

Syntax colour joins status and provider identity on the not-themeable side.
`DESIGN.md` §2.1's table grows a fifth row; the `--hl-*` values stay literal and
are excluded from the rebuild, with a comment saying why.

- **Pros:** Truthful about what the values are. Cheapest — twelve values keep
  working. Matches how every editor behaves: a theme is a theme, and syntax
  colouring is its own well-developed craft that surface hue has no opinion
  about. Keeps the Four Roles rule honest by naming the exception rather than
  quietly tolerating it.
- **Cons:** Adds a role to a doctrine whose strength is that there are only
  four. On a warm Paper surface, cool untinted code will read very slightly
  foreign.
- **Score:** 8/10
- **Blast radius if wrong:** Very small. Twelve values in one file, no consumer
  outside `hljs` classes. Reversible in an afternoon.
- **Caveats:** Requires editing §2.1 and §2.5, which are two days old and were
  just signed off. Adding a role so soon is worth a moment's thought about
  whether the rule was drawn correctly, not just whether this fits it.

#### Option B — Tint the syntax palette with the surface hue/chroma

`--hl-*` gets rebuilt like everything else: lightness per token, hue and chroma
inherited from `--sh`/`--sc` at low strength so code sits *in* the surface.

- **Pros:** Total coherence — nothing on screen is untouched by the user's
  choice. Cheap to express once the machinery exists.
- **Cons:** Syntax colours are already close together by necessity; pushing all
  six toward one hue compresses the distinctions readers depend on. Each of the
  twelve then needs its own contrast measurement against three surfaces in two
  modes — 72 more combinations, on values whose whole job is to be
  distinguishable from *each other*, which WCAG does not measure.
- **Score:** 4/10
- **Blast radius if wrong:** Moderate and slow to notice. Code becomes subtly
  harder to read; nobody files a bug about that, they just read less carefully.
- **Caveats:** The failure mode is quiet, which for a monitoring surface is the
  worst kind.

#### Option C — Map syntax onto the existing four roles

Retire `--hl-*`; drive keywords from brand, strings from success, numbers from
warning, and so on.

- **Pros:** No fifth role, no new tokens, the Four Roles rule holds literally.
- **Cons:** Directly breaks the load-bearing rule underneath it — status colour
  must mean one thing. A red string literal is not an error, a green one is not
  online. It also makes code recolour when the user picks an accent, so keywords
  turn teal, which is Option B's readability problem with a worse cause.
- **Score:** 2/10
- **Blast radius if wrong:** Large. It teaches the eye that status colours are
  decorative, which degrades every status signal in the app.
- **Caveats:** Listed because it is the option that looks most obedient to the
  doctrine and is the one that damages it most.

### Recommendation

**Option A.** The Four Roles rule exists to stop arbitrary colour appearing with
no meaning attached — and syntax highlighting is the opposite of arbitrary: it
is a well-defined semantic mapping that simply is not one of the four. Naming it
as a fifth fixed role costs one table row and makes the doctrine describe the
app accurately, which is the whole reason `G-19` and `G-21` were raised in the
first place.

The cohesion argument for B is real but small, and it is bought with the one
property syntax colour cannot lose. If warmth on Paper turns out to bother the
owner, the reversible version of B — nudging chroma without moving hues — stays
available afterwards.

---

> OQ-3 was answered by the owner on 2026-08-19 — the answer is recorded in
> `DESIGN.md` §2.1, §2.4, and §2.5, and unblocks the two parked items in
> `tasks/D1/T-D1-01-status-colour-token-sweep.md`.

---

<details>
<summary>OQ-1 — Protecting uncommitted agent work (answered and built 2026-08-10)</summary>

**Answer: option B, narrowed.** Recorded as settled decision 5 in
[`plans/2026-08-09-daemon-cloud-control-plane.md`](plans/2026-08-09-daemon-cloud-control-plane.md),
shipped in `packages/core/src/projects/wip-snapshot.ts`, toggle in Settings.

Two things changed from the recommendation below, both while building it:

- **Not a branch.** `refs/sparstrow/wip/<run-id>` sits outside `refs/heads/`, so
  it does not show in `git branch`, does not tab-complete, and does not match the
  default `push` refspec. The recommendation's "never pushed" was a rule someone
  would eventually break; this makes it structural.
- **Not `git commit`.** Plumbing against a throwaway index, so HEAD, the real
  index, and `git status` are provably untouched — the option's stated cost
  ("writes to the developer's repo without being asked") mostly evaporates once
  the write cannot be seen from any command they normally run.

The full original entry is kept below, because the options it rejected are the
reason the shipped design looks the way it does.

---

## OQ-1 — Protecting uncommitted agent work *(closed)*

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

</details>

---

*OQ-2 (how an agent completes a browser pass) was **answered on 2026-08-10**
during M3 and deleted from this file, per the rule at the top. The method is
recorded in [`runbooks/agent-browser-session.md`](runbooks/agent-browser-session.md):
mint a one-time magic-link token with the Supabase admin API and navigate to
`/auth/confirm`. No password is typed, and it is no kind of bypass — it is the
product's own sign-in path, which only became usable this way once magic-link
sign-in was restored.*

*Decisions 1–4 of the daemon/cloud plan (data placement, transport,
degradation, auth & shell) are all settled — see
`doc/plans/2026-08-09-daemon-cloud-control-plane.md`.*
