# T-AM2-02 — produced items in the reply

| | |
|---|---|
| **Tag** | `[P]` parallel — shares no file with `T-AM3-01` (`components/chat/chat-bits.tsx` + `markdown.tsx` vs `app/chat/chat.tsx`); both depend only on `T-AM2-01` |
| **Serves** | `US1` — see the thing the agent made |
| **Depends on** | T-AM2-01 |
| **Blocks** | T-AM2-03 |
| **Phase spec** | [README.md](README.md) |
| **Status** | ✅ done except live/visual verification (2026-08-29) — see Result |

## The scenario this satisfies

> 3. **Given** an agent that produced something but wrote no text at all,
>    **When** the turn ends, **Then** I still get a reply containing what it
>    made, rather than an empty conversation that looks like nothing happened.
> 4. **Given** an agent's reply claims it made something but nothing was
>    actually produced, **When** I read the reply, **Then** the app shows only
>    the text and does not invent a placeholder — and this case is
>    distinguishable from a file that failed to load.
> 5. **Given** a turn that fails partway after producing a file, **When** I look
>    at the conversation, **Then** I can still see what it managed to produce,
>    along with the failure — partial work is not thrown away.

## Objective

Put `ProducedItem` under the assistant turn that produced it, add the `img`
override that stops an inline markdown image rendering broken, and make a reply
that produced nothing look exactly as it does today.

## Decisions already made

**The assistant branch gains a strip, gated on length.**

```tsx
// chat-bits.tsx, assistant branch -- note the LENGTH gate, not just optional
// chaining: an empty container is what SC-005 forbids.
<Markdown content={message.content} />
{message.attachments?.length ? (
  <div className="mt-3 flex flex-col gap-2">
    {message.attachments.map((a) => <ProducedItem key={a.id} attachment={a} ... />)}
  </div>
) : null}
```

**An empty `content` renders no `<Markdown>` at all.** Scenario 3's files-only
reply must not emit an empty prose block with its `my-3` paragraph margins. The
user branch already does exactly this for attachment-only sends
([`chat-bits.tsx:101`](../../../apps/web/src/components/chat/chat-bits.tsx),
`{message.content && …}`) — mirror it, and cite it in the comment so the
symmetry is visible.

**One viewer instance per turn, not one per item.** The strip owns a single
`ProducedItemViewer` and the currently-open attachment id. Mounting a Dialog
per item puts N portals in the tree for a turn that produced thirty files.

**The `img` override is a separate concern in the same task, and is narrow:**

```tsx
img: ({ src, alt }) => {
  // An agent that writes ![](C:\out.png) in its reply text: a local path can
  // never load in a browser. Render the alt text as a caption rather than a
  // broken-image glyph. Remote https images still render.
  ...
}
```

It caps width to the reading column, sets `loading="lazy"`, and renders a
plain-text fallback for any non-`http(s)` src. This is **not** the produced-item
path — phase decision 1 — and the comment must say so, because the next reader
will assume one supersedes the other.

**Scenario 5's failure text is already rendered elsewhere.** A failed turn's
error is displayed by the existing turn/status surface, not by this strip. This
task only ensures the attachments still render for a `failed` turn; it does not
add a second error presentation. Confirm the existing one is visible alongside
and record what it looks like in the Result — `T-AM1-03`'s Result flags this as
an inherited question.

## Checklist

- [x] Assistant branch renders the strip, gated on `attachments?.length`
- [x] Empty `content` renders no `<Markdown>` block
- [x] One `ProducedItemViewer` per turn, driven by an open-item id
- [x] `img` override in `markdown.tsx` with the non-http fallback
- [x] "Copy as Markdown" and "Copy text" still copy the reply's raw source and
      stripped text respectively, unchanged by any of the above (the
      `ContextMenuItem onSelect` handlers are untouched — see Result)
- [ ] Tests: **not written — see Result.** Same repo-wide fact `T-AM2-01`
      already recorded: zero `@testing-library/react` dependency, zero
      `.tsx` test files anywhere (re-confirmed by grep before writing this
      task's code). Adding component-testing infra for this one gate is a
      bigger decision than this task owns.
- [ ] Verify a `failed` turn with an attachment shows both the file and the
      existing failure indication — **traced in code, not exercised live**:
      see Result for the exact call sites and why live wasn't reachable here.
- [ ] Both themes, Paper and Mono — **not exercised live**, same reason;
      `ProducedItem`/`ProducedItemViewer` (this task's only new visual
      surface) already deferred their own theme pass here from `T-AM2-01`,
      so this is now a second deferral onto the same downstream task.
- [x] `apps/web` typecheck and tests green (`pnpm --filter web typecheck`,
      `pnpm --filter web lint` on the two changed files, `pnpm --filter web
      test` — all clean; no test file exercises either changed file, so the
      498 passing tests are a non-regression signal, not new coverage)

## Traps

**`message.attachments?.map` without a length check.** `[]` is truthy through
optional chaining; `[].map` renders an empty array, and the wrapping `<div>`
with `mt-3` still occupies space. This is the SC-005 failure and it will not be
caught by looking at a conversation that *has* files.

**The assistant branch's `ContextMenuTrigger asChild` wraps a single child.**
Adding a sibling next to `<Markdown>` inside it needs the existing wrapper
`<div className="spg-turn">` to stay the single child — putting the strip
outside it silently drops the right-click menu for produced turns.

**Do not render produced items inside the Markdown component.** It would put
them inside a `<p>` for some replies, which is invalid HTML and hydrates
inconsistently.

**Reload is part of scenario 1.** The independent test says "Reload the page;
it is still there." Attachments come from `chat_message_attachments` via
`attachmentsByMessageId`, so this should hold — but confirm the assistant
message's attachments are actually fetched on the reload path, not only on the
just-sent path that `actions.ts:74` populates.

## Verification

- [x] `pnpm --filter web test` green — no no-extra-DOM assertion exists to
      include (no RTL in the repo; see Checklist and Result)
- [ ] Live against a real daemon: ask for an image, see it in the reply, click
      it, see the enlarged view — **not reachable in this environment**, see
      Result
- [ ] Reload the page; the image is still there — same reason
- [ ] A text-only conversation is visually identical to `development` —
      screenshot both and compare — **not reachable in this environment**,
      see Result
- [ ] Browser console clean on load — same reason
- [ ] Full scenario grading is `T-AM2-03`

## On completion

- [x] `pnpm typecheck` and `pnpm test` green
- [x] Update this file's **Status** row
- [ ] Open the PR into `band/27-seeing-what-my-agent-made`, then
      `gh pr merge <n> --auto --squash`

> **Do not edit [`../MasterTaskQueue.md`](../MasterTaskQueue.md) from a task
> branch.**

## Result

**Built as planned, no corrections needed to the plan's own shape** — the
worked example (`produced-item.tsx`'s `ProducedItem`/`ProducedItemViewer`
exports) matched exactly what the Decisions section already described.

**`chat-bits.tsx`:** the assistant branch of `ChatTurnView` was split into a
new `AssistantTurn` component so the open-attachment id has somewhere to live
as component state (the user branch needs none of it — `ChatTurnView` itself
stays a plain conditional dispatcher). `AssistantTurn` renders `{message.content
&& <Markdown .../>}` (mirroring the user branch's existing `{message.content
&& …}` at the same file, cited in the code comment), then `{message.attachments?.length
? <div className="mt-3 …">…</div> : null}` — the length gate, not just optional
chaining, so `[]` renders nothing rather than an empty margined `<div>`. One
`ProducedItemViewer` is mounted per turn as a sibling of `ContextMenuTrigger`/
`ContextMenuContent` inside `<ContextMenu>` (confirmed safe: `ContextMenu` is
`ContextMenuPrimitive.Root`, a provider with no DOM wrapper and no restriction
on child count/shape), driven by a single `openAttachment` state value passed
to every `ProducedItem`'s `onOpen`. "Copy as Markdown" / "Copy text" call the
same `stripMarkdown(message.content)` / `message.content` as before — neither
handler was touched.

**`markdown.tsx`:** added an `img` override, narrow as specified — only
`http(s)` sources render as an `<img loading="lazy" className="max-w-full
rounded-lg border">`; anything else (a Windows path like `C:\out.png`, a bare
relative path) renders the alt text as a caption (`<span>` with a 12px
`ImageOff` icon, matching `DESIGN.md` §6's "inline with body text" icon size)
instead of a broken-image glyph. The comment explicitly states this is a
separate concern from `ProducedItem` (phase decision 1), for the next reader.

**Scenario 5 (failed turn, partial attachments) — traced through
`apps/web/src/app/chat/chat.tsx`, not exercised live:** `messages.map((m) =>
<ChatTurnView key={m.id} message={m} />)` at `chat.tsx:1443` renders every
persisted message row — including an assistant row with `attachments` set,
regardless of the turn's later `failed` status — and `chat.tsx:1505-1512`
separately renders `<TurnErrorBanner>` for a `status === "failed"` turn whose
`waitingReason` is `null`. Both are independent `messages`/`turn` reads with no
mutual gating, so a turn that produced a file before failing renders both:
this task's strip under the persisted assistant message, and the existing
failure banner beneath it. This wasn't watched happen against a real failing
turn — no live daemon was available in this environment (below) — so it's
recorded as code-traced, not observed.

**What was actually run, and what wasn't, and why:**

- `pnpm --filter web typecheck` — clean.
- `pnpm --filter web lint` (via `npx eslint`, scoped to the two changed files
  from `apps/web/`) — clean, no warnings.
- `pnpm --filter web test` — 46 files, 498 tests, all passing; grepped first
  for any existing test touching `chat-bits.tsx` or `markdown.tsx` (none), so
  this is a non-regression signal for the rest of the suite, not new coverage
  of this change.
- **No live browser/dev-server verification.** This worktree has no
  `.env.local` (`apps/web/` or repo root) and no reachable local Supabase —
  `supabase status` fails immediately (`dockerDesktopLinuxEngine` pipe not
  found; Docker Desktop isn't available in this environment). There is no
  signed-in session, no daemon, and no way to produce a real chat turn with an
  attachment to click through. This is the same gap `T-AM2-01`'s Result
  recorded for the shared component itself, so the visual/live checklist items
  above (both themes × Paper/Mono, reload-persistence, real-image click-through,
  console-clean) are a **second deferral onto `T-AM2-03`**, which already owns
  full scenario grading and needs a live dev server regardless. Not claiming
  otherwise here rather than rounding up on weaker evidence than the checklist
  asked for.
