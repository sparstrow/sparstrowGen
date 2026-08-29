# T-AM2-02 — produced items in the reply

| | |
|---|---|
| **Tag** | `[P]` parallel — shares no file with `T-AM3-01` (`components/chat/chat-bits.tsx` + `markdown.tsx` vs `app/chat/chat.tsx`); both depend only on `T-AM2-01` |
| **Serves** | `US1` — see the thing the agent made |
| **Depends on** | T-AM2-01 |
| **Blocks** | T-AM2-03 |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

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

- [ ] Assistant branch renders the strip, gated on `attachments?.length`
- [ ] Empty `content` renders no `<Markdown>` block
- [ ] One `ProducedItemViewer` per turn, driven by an open-item id
- [ ] `img` override in `markdown.tsx` with the non-http fallback
- [ ] "Copy as Markdown" and "Copy text" still copy the reply's raw source and
      stripped text respectively, unchanged by any of the above
- [ ] Tests: an assistant message with no attachments renders **no** extra DOM
      node (assert on the container's child count, not on a class name); one
      with two attachments renders two items; empty content + one attachment
      renders the item and no paragraph
- [ ] Verify a `failed` turn with an attachment shows both the file and the
      existing failure indication
- [ ] Both themes, Paper and Mono
- [ ] `apps/web` typecheck and tests green

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

- [ ] `pnpm --filter web test` green, including the no-extra-DOM assertion
- [ ] Live against a real daemon: ask for an image, see it in the reply, click
      it, see the enlarged view
- [ ] Reload the page; the image is still there
- [ ] A text-only conversation is visually identical to `development` —
      screenshot both and compare
- [ ] Browser console clean on load
- [ ] Full scenario grading is `T-AM2-03`

## On completion

- [ ] `pnpm typecheck` and `pnpm test` green
- [ ] Update this file's **Status** row
- [ ] Open the PR into `band/27-seeing-what-my-agent-made`, then
      `gh pr merge <n> --auto --squash`

> **Do not edit [`../MasterTaskQueue.md`](../MasterTaskQueue.md) from a task
> branch.**

## Result

<!-- Filled in when the task lands. -->
