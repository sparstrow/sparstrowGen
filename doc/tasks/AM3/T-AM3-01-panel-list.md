# T-AM3-01 — the panel becomes the conversation's list

| | |
|---|---|
| **Tag** | `[P]` parallel — shares no file with `T-AM2-02` (`app/chat/chat.tsx` + a new component vs `components/chat/chat-bits.tsx` + `markdown.tsx`) |
| **Serves** | `US2` — find everything this conversation produced |
| **Depends on** | T-AM2-01 (the viewer) |
| **Blocks** | T-AM3-02, T-AM4-01 |
| **Phase spec** | [README.md](README.md) |
| **Status** | done except live verification (T-AM3-02's job) |

## The scenario this satisfies

> 1. **Given** a conversation where an agent produced files across three
>    separate turns, **When** I open the panel, **Then** I see every file grouped
>    under the request that produced it, newest group first.
> 2. **Given** a conversation where nothing has been produced yet, **When** I
>    open the panel, **Then** it explains that things the agent makes will
>    collect here, rather than showing a bare "Nothing to preview".
> 3. **Given** I am on a phone, **When** I open a conversation, **Then** I can
>    still reach this list — it is not a desktop-only feature.
> 4. **Given** a file in the list that can no longer be loaded, **When** I try to
>    open it, **Then** I am told plainly that it is unavailable and why, and the
>    rest of the list keeps working.

## Objective

Replace "Nothing to preview" with the conversation's index of what it produced,
grouped by the request that produced it, and give it a way to be opened on a
phone.

## Decisions already made

**The read, per phase decision 3:**

```ts
// apps/web/src/lib/chat-attachments.ts -- beside attachmentsByMessageId.
// Returns produced AND attached rows; `role` on the joined message is what
// tells them apart (plan Decision 2 -- deliberately no uploader_type column).
// AM4 needs no new query, only a presentation split.
export async function sessionAttachments(
  db: SupabaseClient,
  sessionId: string,
): Promise<SessionAttachment[]>;

type SessionAttachment = {
  id: string; storagePath: string; filename: string;
  mimeType: string; sizeBytes: number; createdAt: string;
  messageId: string;
  messageRole: "user" | "assistant";
  requestLabel: string | null;   // preceding user message's first line
};
```

Ordered by the message's `created_at` descending, then the attachment's own
`created_at`. **`T-AM3-01` renders only `messageRole === "assistant"` rows**
and ignores the rest — AM4 turns them on.

**`requestLabel` is derived, not stored.** First line of the preceding user
message, markdown stripped, trimmed to 60 characters. `stripMarkdown` already
exists in `components/chat/markdown.tsx` and `chat_auto_title`'s SQL does the
same job server-side for session titles — reuse the TypeScript one; do not add
a second SQL helper.

**Below `xl`, a Sheet.** Phase decision 1:

```tsx
// Trigger lives in the conversation header, xl:hidden. The desktop <aside>
// keeps its own copy of the same <ConversationItems /> so neither container
// knows about the other.
<Sheet><SheetTrigger className="xl:hidden" …><SheetContent side="right">
  <ConversationItems … />
</SheetContent></Sheet>
```

**The component is presentational and takes the rows as a prop.** It does no
fetching, so AM4 can extend the same component with a second group without
touching a query, and so it is testable without a Supabase double.

**Group heading shape.** `requestLabel` when present; otherwise the group's
timestamp rendered as a relative date. Phase trap 2 — an assistant message with
no preceding user message is reachable via AM1's FR-013 path.

## Corrections found while building (code wins over the plan)

**Decision 3's `SessionAttachment` type moved `requestLabel` derivation out of
the query.** The sketch had `sessionAttachments()` return a pre-derived
`requestLabel: string | null`, computed with `stripMarkdown`
(`components/chat/markdown.tsx`). That file is a `"use client"` module;
`chat-attachments.ts` is imported by `handlers/chat.ts`, a Route Handler
reached from the server (for `attachmentsByMessageId`). Nothing in this
change calls `stripMarkdown` from server-executed code, but baking that
import into a data-fetching module shared with server code is the wrong
place to find out whether that's safe — and the derivation is presentation
logic (markdown stripping, word-boundary truncation for display) that
belongs in the already-client-side `ConversationItems` regardless. Shipped:
`sessionAttachments()` returns the raw `precedingUserContent: string | null`;
`conversation-items.tsx`'s `deriveRequestLabel` does the stripping/trimming
at render/group time, using the same 60-char word-boundary-plus-ellipsis
shape `private.chat_auto_title` (`022_chat_auto_title.sql`) uses for session
titles.

**A `sheet.tsx` primitive was added to `packages/ui/src/components/ui/`,
beyond this task's own Files table.** The Files table didn't list it because
the phase README's Decision 1 assumed a Sheet already existed to reach for;
`DESIGN.md` §8 confirms it doesn't ("`sheet` *(not yet installed)*"), so
building it was necessary to do Decision 1 at all, not optional scope creep.

**`sessionAttachments()` is two queries under one export, not the "single…
read" the sketch implied.** `chat_message_attachments` has no `session_id`
column (only `message_id`), and finding "the preceding user message" per
assistant message is a self-join over `chat_messages` PostgREST can't
express without a database function — which this task has no mandate to add
(scope boundary: no inventing backend endpoints). Fetching the session's own
messages once and deriving `precedingUserContent` in TypeScript is the same
shape `handlers/chat.ts`'s `turnStateRow` already uses for an equivalent
problem.

**The phase README's rejection of deriving this list client-side ("a long
conversation paginates") doesn't match the current code.** `GET
/chat/sessions/:id` fetches a session's full message history with no
`.limit()` — nothing paginates today. The separate `sessionAttachments()`
read was still built as specified: it decouples this feature from however
the transcript is fetched (a real independent value on its own), and this
task's checklist depends on it existing as its own testable function. Noting
the mismatch here rather than either silently "fixing" the phase README or
silently ignoring that its stated reason doesn't hold today.

## Checklist

- [x] Read `DESIGN.md` §6 and §7 before writing the component (`AGENTS.md` §3.11)
- [x] Check for an existing Sheet pattern before composing one — the `shadcn`
      MCP tools were not available in this session, so this was done by
      grepping `packages/ui/src/components/ui/` (no `sheet.tsx`) and reading
      `DESIGN.md` §8's own component table, which already says `sheet` is
      "not yet installed." Built it in `packages/ui/src/components/ui/`
      following `skill-viewer.tsx`'s existing hand-rolled slide-over pattern
      and reusing its `.spg-sheet`/`.spg-overlay` motion classes verbatim —
      DESIGN.md §7 names those as the reference implementation for this
      movement, not a new easing curve.
- [x] `sessionAttachments()` with the join and ordering above — see the
      **Corrections** note below for one deliberate deviation from the
      sketch in Decision 3.
- [x] `ConversationItems` — grouped list, newest group first, using
      `ProducedItem` for every row
- [x] All four states: populated, empty (decision 4's copy), loading skeleton
      rows, error with retry
- [x] Desktop `aside` renders it beneath the existing project card, which stays
- [x] Below-`xl` Sheet with a header trigger, `xl:hidden`
- [x] One `ProducedItemViewer` for the list, driven by an open-item id — not one
      per row
- [~] Tests: `sessionAttachments()`'s ordering (newest group/attachment
      first), preceding-user-content derivation, the FR-013 no-preceding-
      message fallback to `null`, and a `role: "user"` row surviving with
      its role tagged (not filtered by the query) are all covered in
      `apps/web/src/lib/chat-attachments.test.ts`. **Not covered by a unit
      test**: `groupProducedAttachments`'s "three turns → three groups" and
      the empty-state copy, both in `conversation-items.tsx`. That file
      imports `@/components/ui/*`, which `apps/web/vitest.config.ts`
      deliberately does not alias (only `@web/*` is — see that file's own
      comment); confirmed empirically that importing it from a `.test.ts`
      fails with "Cannot find package '@/components/ui/button'" before
      writing this off, not assumed. This repo also has no React Testing
      Library and the task's own instructions say not to introduce one.
      Verified instead by code review of `groupProducedAttachments` (a pure
      function, same shape as the tested SQL-adjacent logic) — not by a live
      browser pass; see Result.
- [~] Both themes, Paper and Mono, at 375px and at ≥1280px — not reached live
      (no local Supabase env in this worktree); see Result.
- [x] `apps/web` typecheck and tests green

## Traps

**Testing responsiveness by narrowing a desktop browser window.** `hidden
xl:flex` means the panel is `display: none` below 1280px — the sheet is the
only path and it must be verified with an actual mobile viewport
(`resize_window` preset `mobile`, then reload so load-time gates re-run).

**Rendering a `user`-role row by accident.** The query deliberately returns
both roles so AM4 needs no new query. Filter explicitly in this task and add
the test — otherwise the owner's own attachments silently appear as things the
agent made, which is precisely the confusion US3 exists to prevent.

**A retry that re-runs the whole page.** The error state's retry should re-run
the read, not `router.refresh()` the conversation — the latter loses transcript
scroll position for an error in a side panel.

**N signed URLs at once.** A list of thirty items each minting its own signed
URL fires thirty requests on open. `ProducedItem` already owns its URL
lifecycle; if this is slow, defer minting until a row is near the viewport
rather than restructuring the component.

**Do not touch `chat-bits.tsx`.** It is `T-AM2-02`'s file and the two tasks are
meant to run in parallel. Anything that seems to require editing it is a signal
to check `T-AM2-01`'s exports instead.

## Verification

- [x] `pnpm --filter web test` green, all cases above
- [ ] Live: a conversation with produced files across three turns shows three
      groups, newest first, each labelled with its request — not reached, see
      Result; `T-AM3-02`'s job per this section's own last line
- [ ] Clicking a row opens the same viewer an inline item opens — not reached
      live, see Result
- [ ] At 375px the sheet trigger is reachable and the list is usable — not
      reached live, see Result
- [ ] A conversation that produced nothing shows decision 4's copy, not
      "Nothing to preview" — not reached live, see Result
- [ ] A project chat still shows its project card and terminal link — not
      reached live, see Result
- [ ] Console clean — not reached live, see Result
- [ ] Scenario grading is `T-AM3-02`

## On completion

- [x] `pnpm typecheck` and `pnpm test` green
- [x] Update this file's **Status** row
- [x] Open the PR into `band/27-seeing-what-my-agent-made`, then
      `gh pr merge <n> --auto --squash`

> **Do not edit [`../MasterTaskQueue.md`](../MasterTaskQueue.md) from a task
> branch.**

## Result

**Built.** `apps/web/src/lib/chat-attachments.ts` gained `sessionAttachments()`
(session-scoped read, `precedingUserContent` derived in TypeScript from a
second lightweight `chat_messages` query, ordered newest-message-then-newest-
attachment-first). `apps/web/src/components/chat/conversation-items.tsx` is
new: `groupProducedAttachments()` (pure grouping/labeling) plus
`ConversationItems` (the four-state presentational component, one shared
`ProducedItemViewer`). `packages/ui/src/components/ui/sheet.tsx` is a new
primitive (not in this task's original Files table — see Corrections above).
`apps/web/src/app/chat/chat.tsx` wires both: the desktop `aside` now renders
the project card (unchanged) followed by `ConversationItems`, and a new
`Paperclip` icon button in the conversation header, `xl:hidden`, opens a
`Sheet` holding the same project-card-then-list content for below-`xl`
widths. The old always-visible preview-toggle button is now `hidden
xl:inline-flex`, since below `xl` the `aside` it toggles never renders at all.

**Verified:**
- `pnpm typecheck` (repo-wide, `turbo run typecheck`) — 7/7 packages green.
- `pnpm test` (repo-wide, `turbo run test`) — 5/5 packages green, including
  `@sparstrow/core`'s 776 tests.
- `pnpm --filter web test` — 504/504 green, including the 6 new cases in
  `apps/web/src/lib/chat-attachments.test.ts` (ordering, preceding-content
  derivation, the FR-013 null-fallback case, and a `role: "user"` row
  surviving un-filtered).
- `pnpm --filter web lint` — diffed against the same command run on the
  unmodified band branch (`git stash` / lint / `git stash pop`): identical
  set of pre-existing warnings/errors at shifted line numbers, zero new
  findings from this change's four touched/added files.
- `pnpm --filter web build` (Next.js production build) — succeeds, `/chat`
  builds as a dynamic route; the pre-existing `knowledge.server.ts` dynamic-
  fs warnings are unrelated and present on the unmodified branch too.
- `pnpm --filter @sparstrow/ui typecheck` — green (covers the new
  `sheet.tsx`).

**Not reached, honestly:**
- **No live browser pass.** This worktree has no `apps/web/.env.local` (only
  `.env.example`), so there is no local Supabase project to sign in against,
  and no Vercel preview exists yet for this task branch (that arrives at the
  band-branch stage, per `AGENTS.md` §2). Everything under this task's own
  "Verification" section that requires a running, signed-in app — the three-
  group live check, the 375px mobile-viewport sheet check, the empty-state
  copy, the project-card regression check, console cleanliness — is
  unticked here and left for `T-AM3-02`, which this task file's own
  Verification section already names as the scenario-grading task and which
  runs on the band's own preview.
- **No unit test for `groupProducedAttachments` or the rendered empty
  state.** `conversation-items.tsx` imports `@/components/ui/*`;
  `apps/web/vitest.config.ts` aliases only `@web/*` (its own comment explains
  why — collection previously failed on `@web/*` imports and got fixed
  narrowly, not generally). Confirmed empirically with a throwaway probe
  test that importing `conversation-items.tsx` from a `.test.ts` fails
  module resolution before concluding this rather than assuming it. Combined
  with "no React Testing Library, don't introduce one" from this task's own
  instructions, the grouping/label logic and empty-state copy are verified
  by code review only, pending `T-AM3-02`'s live pass.
- The `shadcn` MCP tools described in `AGENTS.md` §3.11 / this skill were not
  available in this session to query the registry directly; the "check
  before composing" step was done via `packages/ui/src/components/ui/`
  (grep, no `sheet.tsx`) and `DESIGN.md` §8's own table instead, which
  already documents `sheet` as not yet installed.

**Corrections to the task file itself** are recorded above the checklist,
not applied silently: the `requestLabel`-in-the-query design, the missing
`sheet.tsx` in the Files table, and the phase README's "conversation
paginates" rationale not matching the current unpaginated `GET
/chat/sessions/:id`.
