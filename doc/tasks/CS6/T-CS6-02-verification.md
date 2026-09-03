# T-CS6-02 — Verification, and CS1–CS5 walked together

| | |
|---|---|
| **Tag** | `[S]` sequential — needs all of CS6, and every prior phase in this plan |
| **Depends on** | T-CS6-01 (and, transitively, CS1–CS5) |
| **Blocks** | — |
| **Phase spec** | [README.md](README.md) |
| **Status** | ✅ done (2026-08-28) — **two regressions found and fixed**, one unproved assertion recorded as `G-52` |

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

- [x] **US4 scenario 1** — attaches and is removable. Chip renders
      `ardennes-notes.txt` / `109 B` with a `Remove ardennes-notes.txt`
      button; clicking it clears the chip. **Attached via the click-to-upload
      control, not a real drag** — see the note under D
- [x] **US4 scenario 2** — sent message carries the attachment
      (`ardennes-notes.txt 109 B`) and it is still there after a reload.
      Confirmed in the database too: a `chat_message_attachments` row with the
      right filename/mime/size and a `storage_path` correctly scoped to
      `<workspace_id>/<session_id>/…`
- [x] **US4 scenario 3** — both halves, told before send: a 3.3 MB file →
      *"File must be 2 MB or smaller (this one is 3.3 MB)."*; a `.exe` →
      *"Only images, PDF, plain text, Markdown, CSV, or JSON files are
      accepted."*
- [~] **US4's independent test** — **NOT PROVED.** Both turns reached the
      daemon (the server log shows `POST /api/daemon/chat/attachments/sign`
      then `POST /api/daemon/chat/turns/<id>/result`), so the *delivery* half
      is proved — but every turn ended `status = failed`,
      `error = "the provider timed out"`, because no CLI provider is
      authenticated in this environment. Recorded as `G-52`
- [x] Browser console has no errors across all three scenarios — `console`
      showed only `[HMR] connected`, `errors` was empty

## A2 — The four states

- [x] **Populated** (chip with name + size + remove), **Empty** (no chip, no
      empty tray), **Error** (both rejection messages above, in place).
      **Loading** was observed only as the brief pre-send state — the local
      uploads were 109 B and completed too fast to hold; not separately forced
- [x] Both light and dark themes — screenshots taken in each via the app's own
      theme toggle. Chip, sent-message attachment, error banner and pickers all
      legible in both; nothing colour-only
- [x] Keyboard: focusing the composer textarea and pressing Tab lands on
      "Attach a file", and Enter activates it (opens the OS file dialog — the
      dialog itself is outside the browser and not assertable, but the control
      is reachable and operable). No page errors from the interaction

## B — What must NOT have changed (cross-story regression pass)

- [x] **CS1** — rename and delete both still work. Renamed a session inline
      to "Renamed by CS6 verification" (reflected in rail and header);
      deleted another via Session actions → Delete → confirm, and it
      disappeared. Checked the cascade in the database afterwards: sessions
      3→2, messages 3→2, attachments 3→2, **zero orphaned attachment rows**
- [x] **CS2** — ❌ **BROKEN, then fixed.** Every session's title was `''`.
      Root cause and fix:
      [`BUG-2026-08-28-enqueue-chat-turn-redefinition-drops-auto-title`](../../bug/BUG-2026-08-28-enqueue-chat-turn-redefinition-drops-auto-title.md)
      — `024` and `026` each re-created `enqueue_chat_turn` from an older
      migration file and silently dropped `022`'s title block. Restored by
      `027_restore_chat_auto_title.sql`, applied and re-verified live:
      a first message now titles the session, truncated at a word boundary,
      and a **manually renamed** session is not overwritten by its next
      message
- [x] **CS4** — the `antigravity` picker reflects the cache: on a brand-new
      workspace it showed "no models available yet — checking…", the daemon's
      discovery landed (`provider_model_cache`: `live=true`, 14 models), and
      the picker then listed those 14 real Gemini strings. `claude-code`
      stayed static at `opus`/`sonnet`/`haiku`. **One defect found in the
      same pass** —
      [`BUG-2026-08-28-provider-switch-pins-invalid-model`](../../bug/BUG-2026-08-28-provider-switch-pins-invalid-model.md)
      — switching to `antigravity` before the cache warmed pinned
      `model = "sonnet"`; fixed and re-verified
- [x] Sending a plain text message with no attachment is unchanged — the
      no-attachment path was exercised throughout (including the rename
      regression check), with no new UI and no console errors

## C — What can be verified today

- [x] Everything in A/A2/B **except** US4's independent test. A real runtime
      *was* obtained — a second `@sparstrow/core` instance with its own
      `SPARSTROW_SECRETS_DIR`/`DATA_DIR` on port 48760, paired to a disposable
      workspace per
      [`agent-browser-session.md`](../../runbooks/agent-browser-session.md),
      leaving the owner's own daemon untouched. It registered `active` with
      capabilities `["claude-code","antigravity"]` and served real work
      (discovery populated the model cache; it signed and downloaded the chat
      attachment). Only the CLI providers themselves were unusable

## D — What needs something that doesn't exist yet

**US4's independent test is unproved** — see `G-52`. The runtime existed and
claimed the turn; the CLI provider behind it is not authenticated in this
environment, so every turn ended `"the provider timed out"`. What that leaves
unproved is narrow and worth stating exactly: that the model's reply
*reflects the attached file's content*. Everything up to handing the file to
the CLI is proved, including the daemon fetching it via
`POST /api/daemon/chat/attachments/sign`.

**Drag-and-drop specifically** was exercised through the file input rather
than a synthetic drag. The drop handler itself is therefore not directly
covered; the click-to-upload path it shares is.

## E — Regression surface

- [x] `pnpm -r typecheck` green (7 projects) and `pnpm -r test` green
- [x] `apps/web` builds (`pnpm --filter web build`, all routes emitted)
- [x] Full monorepo suite: `packages/core` 87 files / 762 passed (4 skipped),
      `apps/web` **43 files / 471 passed** (42/465 before this task — the six
      new tests are `chat-models.test.ts`), `packages/shared` 18,
      `packages/desktop` 3, `packages/ui` pass

## On completion

- [~] Tick CS6's rows and mark the band complete in
      [`../MasterTaskQueue.md`](../MasterTaskQueue.md) — **deliberately NOT
      done on this task branch.** `AGENTS.md` §2.9 (set after this task file
      was written) moves the queue flip to the commit that lands the band on
      `development`, one writer, all rows at once. Done there instead
- [x] Phase README status lines updated
- [x] Plan **Status** row updated
- [x] Knowledge Center pass — an article already exists
      (`apps/web/src/content/knowledge/chat-and-inbox.md`; note it lives under
      `apps/web`, not the `packages/ui` path `AGENTS.md` §3.2 still names).
      It covered CS1/CS2's rename, delete and auto-titling but said **nothing
      about attachments**, the band's one genuinely new capability — added a
      "Sending a file with your message" section plus three limitation
      bullets: the 2 MB cap and type allowlist, the fact that no supported
      provider can interpret an image's *contents*, and that deleting a
      conversation does not yet purge stored files (`G-53`)
- [x] Every unreached assertion written into
      [`../../KnownGaps.md`](../../KnownGaps.md) — `G-52`, `G-53`

## Result

**2026-08-28 — done. The cross-story pass earned its place: it found two
regressions that every individual phase's own verification had passed over.**

Both were the same species — a later task in this band making an *earlier*
task's shipped feature stop working, in a way nothing automated could see:

1. **US2 was dead.** `022_chat_auto_title.sql` added auto-titling to
   `enqueue_chat_turn`; `024` and `026` each re-created that function from an
   older *migration file* instead of the live body, silently dropping it.
   `create or replace function` reports nothing, no advisor fires, and both
   later tasks verified their own feature honestly and correctly. Every
   session on this branch was titled `''` — the exact complaint this band
   exists to fix.
   → [`BUG-…-drops-auto-title`](../../bug/BUG-2026-08-28-enqueue-chat-turn-redefinition-drops-auto-title.md),
   fixed by `027`, applied to staging and re-verified live.
2. **CS4 made a dead fallback live.** Moving antigravity's model list to the
   cache meant `modelsForProvider(...)[0]` could now be empty, and the two
   call sites fell through to `"sonnet"` (a claude-code model) and `""`. A
   session switched to antigravity before its cache warmed persisted
   `provider=antigravity, model=sonnet` — a pair `agy` cannot run.
   → [`BUG-…-pins-invalid-model`](../../bug/BUG-2026-08-28-provider-switch-pins-invalid-model.md),
   fixed by extracting `defaultModelForProvider` to
   `apps/web/src/lib/chat-models.ts` with six tests pinning the cold-cache
   invariant.

**What the band's own feature does, proved end to end:** attach → chip with
name/size/remove → send → row in `chat_message_attachments` with a correctly
workspace/session-scoped `storage_path` → survives reload → daemon signs and
fetches it. Rejections (oversize, wrong type) are explained before send. The
picker went from empty to 14 live Gemini models on a fresh workspace, which
also re-confirms CS3's dispatch and the `#169` retry fix in a workspace that
had never seen either.

**What is not proved:** that a model's reply reflects an attached file's
*content* (`G-52`) — the runtime was real and claimed the turn, but no CLI
provider is authenticated here. And drag-and-drop was exercised through the
file input rather than a synthetic drag.

**Not fixed here, deliberately:** deleting a session removes its attachment
rows by cascade but leaves the stored **objects** in the bucket. Recorded as
`G-53` rather than fixed, since it needs a decision about where storage
cleanup belongs and is not a CS6 regression.
