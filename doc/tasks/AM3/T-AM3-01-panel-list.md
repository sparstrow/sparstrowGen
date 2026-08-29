# T-AM3-01 — the panel becomes the conversation's list

| | |
|---|---|
| **Tag** | `[P]` parallel — shares no file with `T-AM2-02` (`app/chat/chat.tsx` + a new component vs `components/chat/chat-bits.tsx` + `markdown.tsx`) |
| **Serves** | `US2` — find everything this conversation produced |
| **Depends on** | T-AM2-01 (the viewer) |
| **Blocks** | T-AM3-02, T-AM4-01 |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

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

## Checklist

- [ ] Read `DESIGN.md` §6 and §7 before writing the component (`AGENTS.md` §3.11)
- [ ] Check the `shadcn` MCP for an existing Sheet pattern before composing one
- [ ] `sessionAttachments()` with the join and ordering above
- [ ] `ConversationItems` — grouped list, newest group first, using
      `ProducedItem` for every row
- [ ] All four states: populated, empty (decision 4's copy), loading skeleton
      rows, error with retry
- [ ] Desktop `aside` renders it beneath the existing project card, which stays
- [ ] Below-`xl` Sheet with a header trigger, `xl:hidden`
- [ ] One `ProducedItemViewer` for the list, driven by an open-item id — not one
      per row
- [ ] Tests: three turns produce three groups in the right order; a group with
      no preceding user message falls back to a date; `messageRole === "user"`
      rows are excluded; the empty state renders decision 4's copy
- [ ] Both themes, Paper and Mono, at 375px and at ≥1280px
- [ ] `apps/web` typecheck and tests green

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

- [ ] `pnpm --filter web test` green, all cases above
- [ ] Live: a conversation with produced files across three turns shows three
      groups, newest first, each labelled with its request
- [ ] Clicking a row opens the same viewer an inline item opens
- [ ] At 375px the sheet trigger is reachable and the list is usable
- [ ] A conversation that produced nothing shows decision 4's copy, not
      "Nothing to preview"
- [ ] A project chat still shows its project card and terminal link
- [ ] Console clean
- [ ] Scenario grading is `T-AM3-02`

## On completion

- [ ] `pnpm typecheck` and `pnpm test` green
- [ ] Update this file's **Status** row
- [ ] Open the PR into `band/27-seeing-what-my-agent-made`, then
      `gh pr merge <n> --auto --squash`

> **Do not edit [`../MasterTaskQueue.md`](../MasterTaskQueue.md) from a task
> branch.**

## Result

<!-- Filled in when the task lands. -->
