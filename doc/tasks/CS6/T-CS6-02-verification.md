# T-CS6-02 — Verification, and CS1–CS5 walked together

| | |
|---|---|
| **Tag** | `[S]` sequential — needs all of CS6, and every prior phase in this plan |
| **Depends on** | T-CS6-01 (and, transitively, CS1–CS5) |
| **Blocks** | — |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

## Objective

Prove US4 for real, AND — because this is the last phase in the plan and
`chat.tsx` is a shared file across all four stories — re-walk CS1's and
CS2's acceptance scenarios (rename/delete, auto-naming) and spot-check CS4's
picker in the same session, to catch any seam the individual phases' own
verification missed.

**Needs an online, paired runtime with a working CLI provider** to prove
US4's real bar (a reply that reflects the file's actual content). If
unreachable, name that explicitly.

## A — The acceptance scenarios

- [ ] **US4 scenario 1** — drag a file onto the composer; it attaches, is
      removable
- [ ] **US4 scenario 2** — send with an attachment; it's on the sent
      message and survives a reload
- [ ] **US4 scenario 3** — attach a rejected type/size; told why before send
- [ ] **US4's independent test** — the agent's reply demonstrably used the
      attached file's actual content (e.g. attach a text file with a
      distinctive fact, ask about it, confirm the reply names that fact —
      not just "I see you attached a file")
- [ ] Browser console has no errors across all three scenarios

## A2 — The four states

- [ ] **Populated**, **Empty**, **Loading**, **Error** on the composer
      attachment area, per the phase README's table
- [ ] Both light and dark themes
- [ ] Keyboard navigation: the upload button is reachable and operable
      without a mouse (drag-and-drop has no keyboard equivalent by nature —
      confirm the click-to-upload control covers that gap)

## B — What must NOT have changed (cross-story regression pass)

- [ ] **CS1** — rename and delete still work exactly as verified in
      [`../CS1/T-CS1-03-verification.md`](../CS1/T-CS1-03-verification.md)
- [ ] **CS2** — a new session still auto-titles from its first message
- [ ] **CS4** — the `antigravity` picker still reflects the cache, `claude-code`
      still static
- [ ] Sending a plain text message with no attachment is byte-for-byte the
      same experience as before this entire plan

## C — What can be verified today

- [ ] Everything in A/A2/B given an online paired runtime

## D — What needs something that doesn't exist yet

**Needs an online, paired runtime with a working CLI provider** for US4's
independent test specifically. If unreachable, record which assertion is
unproved.

## E — Regression surface

- [ ] `pnpm -r typecheck` and `pnpm -r test` green
- [ ] `apps/web` builds
- [ ] Full monorepo test suite green, not just the packages this plan
      touched directly

## On completion

- [ ] Tick CS6's rows (and confirm CS1–CS5's rows already read `done`) in
      [`../MasterTaskQueue.md`](../MasterTaskQueue.md); mark the whole band
      complete
- [ ] Update every phase `README.md` status line this plan touched
- [ ] Update the plan's own **Status** row to `✅ Completed <date>` if every
      phase reads done, or name what's outstanding if not
- [ ] Knowledge Center pass per `AGENTS.md` §3.2 — check whether any Chat
      article exists yet; if not, this may be the point one becomes
      warranted (a genuinely new capability — attachments — landed)
- [ ] Every unreached assertion above written into
      [`../../KnownGaps.md`](../../KnownGaps.md)

## Result

<!-- Filled in when the task lands. -->
