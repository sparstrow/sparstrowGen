# AM2 — see the thing the agent made, in the reply

| | |
|---|---|
| **Plan** | [`../../plans/2026-08-28-seeing-what-my-agent-made.md`](../../plans/2026-08-28-seeing-what-my-agent-made.md) (AM2) |
| **Kind** | **serves US1** — ends in: ask for an image, see it |
| **Spec** | [`../../specs/2026-08-28-seeing-what-my-agent-made.md`](../../specs/2026-08-28-seeing-what-my-agent-made.md) |
| **Depends on** | AM1 |
| **Blocks** | AM3 (via `T-AM2-01`'s viewer only) |
| **Status** | not started |
| **Open questions** | none |

## The story this serves

> **US1 — See the thing the agent made, in the reply that mentions it** (P1)
>
> You ask an agent to produce something — an image, a chart, a file. When the
> reply arrives, whatever it produced is shown inside that reply: images as
> pictures you can enlarge, other files as a named row you can open or save.

**Acceptance scenarios this phase must satisfy:**

1. **Given** a conversation with an agent that can produce files, **When** I ask
   it to generate an image and the turn succeeds, **Then** the reply shows the
   image, and clicking it opens a larger view.
2. **Given** an agent that produced a file which is not an image, **When** the
   reply arrives, **Then** I see the file's name, its kind, and its size, with a
   way to open or save it — not a broken picture.
3. **Given** an agent that produced something but wrote no text at all, **When**
   the turn ends, **Then** I still get a reply containing what it made, rather
   than an empty conversation that looks like nothing happened.
4. **Given** an agent's reply claims it made something but nothing was actually
   produced, **When** I read the reply, **Then** the app shows only the text and
   does not invent a placeholder — and this case is distinguishable from a file
   that failed to load.
5. **Given** a turn that fails partway after producing a file, **When** I look at
   the conversation, **Then** I can still see what it managed to produce, along
   with the failure — partial work is not thrown away.
6. **Given** a conversation about one of my projects, **When** the agent edits,
   creates or deletes files inside that project's folder, **Then** those files
   are **not** shown as things the agent "made" and no copy of them is kept.

**Independent test:** Ask an agent for an image in a fresh chat. When the reply
lands, the image is visible in it. Reload the page; it is still there.

## The four states

Taken from the spec's Interface & experience section — **the assistant reply**.

| Surface | Populated | Empty | Loading | Error |
|---|---|---|---|---|
| Assistant turn | Reply text, with produced items beneath: images sized to the reading column, other files as named rows with kind and size | **Nothing extra at all.** No tray, no "0 files" — a reply that produced nothing is byte-identical to today (SC-005) | A placeholder shaped like the item, at its known aspect ratio where available | The item says so in place, naming itself — "chart.png couldn't be loaded" — and never renders as a broken-image glyph |
| Enlarged view | The image at its natural size within the viewport; for a non-image, the open/save action | n/a — only reachable from an item | Spinner over the dimmed backdrop | "This file is no longer available", with the surrounding view still dismissable |

**The empty state here is unusual and is the most important one in the phase.**
Everywhere else in this repo an empty state is something you design. Here it is
the *absence* of a container, and SC-005 makes that a testable requirement
rather than a preference.

## Tasks

Run order and concurrency live in [`../MasterTaskQueue.md`](../MasterTaskQueue.md).

| Task | Tag | Serves | Depends on | Status |
|---|---|---|---|---|
| [T-AM2-01 — the produced-item viewer](T-AM2-01-viewer.md) | `[S]` | US1 | AM1 | ✅ done except visual verification → `T-AM2-02` (2026-08-29) |
| [T-AM2-02 — produced items in the reply](T-AM2-02-in-the-reply.md) | `[P]` | US1 | T-AM2-01 | ✅ done except live/visual verification → `T-AM2-03` (2026-08-29) |
| [T-AM2-03 — verification](T-AM2-03-verification.md) | `[S]` | US1 | T-AM2-01, T-AM2-02 | not started |

`T-AM2-01` is `[S]` and **gates AM3 as well as `T-AM2-02`** — both render the
same viewer, and the spec's Flow requires clicking a panel entry to reach the
same enlarged view an inline item opens. It is deliberately the smallest useful
piece, landed first, so that two agents can then work `T-AM2-02` and
`T-AM3-01` genuinely in parallel. This is the "gate a phase on a worked
example" pattern `T-WA-01` established.

`T-AM2-02` is `[P]` against `T-AM3-01`: they share no file
(`components/chat/chat-bits.tsx` and `components/chat/markdown.tsx` versus
`app/chat/chat.tsx`).

## Objective

Make what AM1 stored visible in the conversation, and make the two dishonest
cases distinguishable: a reply that claims a file and produced none looks
different from a file that exists and will not load.

## The shape of what was found

**The read path already exists and is client-side.** `SentAttachmentChip`
([`chat-bits.tsx:33`](../../../apps/web/src/components/chat/chat-bits.tsx))
mints its own signed URL from the browser with the user's session:
`supabase.storage.from(CHAT_ATTACHMENT_BUCKET).createSignedUrl(path, 300)`.
The bucket's member-select policy permits it. So AM2 needs **no new route** —
it needs the same call, rendered as an image instead of a chip.

**`ChatTurnView`'s assistant branch does not read `attachments` at all.** Line
119 onward renders `<Markdown content={message.content} />` and the model
caption, nothing else — while the `user` branch at line 108 maps
`message.attachments`. The prop is already on the type; only the assistant
branch ignores it.

**`markdown.tsx` has no `img` override**, so a markdown image today renders as
react-markdown's bare default: unstyled, uncapped, and — for a local path like
`![chart](D:\out.png)` — an actual broken image in the browser. Plan Decision 7
called this out and it is confirmed.

**Signed URLs expire in 300 seconds.** A chip only mints one on click, so this
never mattered. An `<img src>` holds one for as long as the page is open, so a
conversation left open for six minutes shows broken images on any re-render.
This is a real behaviour change and `T-AM2-01` owns it.

## Definition of done

- All six acceptance scenarios above, walked in the running app
- All four states on both surfaces, including the "nothing extra at all" empty
  state proved by comparison against `development`
- An expired signed URL recovers rather than showing a broken image
- Light and dark, and at least the Paper and Mono surfaces (`AGENTS.md` §3.11)
- Keyboard reachable: an item is focusable, Enter opens the viewer, Escape
  closes it, focus returns to the item
- `pnpm typecheck` and `pnpm test` stay green

**Not in this phase:** the per-conversation list — that is AM3. Inbound
attachments already render as chips and are not restyled here; folding them
into a shared treatment is AM4's call.

---

## Decisions already made

### 1. Produced items render from the message row, never from the markdown text

The strip under an assistant turn is driven by `message.attachments`, the same
way the user branch already works. The `img` override in `markdown.tsx` exists
for a different reason — an agent that writes `![](…)` inline should not render
a broken image — and the two must not be confused.

*Rejected: rewriting the reply's markdown to inject produced images.* It makes
"Copy as Markdown" lie, it breaks if the agent mentions the file twice, and it
puts rendering logic in a text transform.

### 2. Kind is decided by `mimeType`, and everything that is not a renderable image is a row

`image/png`, `image/jpeg`, `image/gif` and `image/webp` render as pictures.
`image/svg+xml` does **not** — an SVG rendered from a private-bucket URL is a
document that can carry script, and the bucket serves it from the app's own
origin family. It gets the file-row treatment like any other document.

*Rejected: sniffing content.* The stored `mimeType` is what AM1 derived from
the extension and is the one the row already carries.

---

## Files

| Path | Change |
|---|---|
| `apps/web/src/components/chat/produced-item.tsx` | new — the item, its states, and the enlarged view |
| `apps/web/src/components/chat/chat-bits.tsx` | edit — the assistant branch renders the strip |
| `apps/web/src/components/chat/markdown.tsx` | edit — `img` override |
| `apps/web/src/lib/chat-attachments.ts` | edit — a signed-URL helper with refresh |

## Traps

**Rendering the strip unconditionally.** `message.attachments?.length` must
gate the entire container, not just its children. An empty `<div>` with padding
is exactly what SC-005 forbids and it is invisible in review — it shows up as
four extra pixels under every reply in a conversation that produced nothing.

**Treating "no attachments" as an error state.** Scenario 4 — the agent claims
a file and produced none — is the **empty** case, not the error case. It must
render as plain text with nothing added. Only an attachment row that exists and
fails to load is an error.

**The 300-second expiry.** See the shape section. An `<img>` whose `src` has
expired fires `onError` with no useful information, which reads exactly like a
deleted file. Re-mint once on error before deciding the file is gone.

**`AGENTS.md` §3.11 is mandatory before writing the component.** Read
`DESIGN.md` §6 and §7 and check the Shadcn registry for an existing block
before composing a lightbox by hand.

## Verification

Full procedure in [T-AM2-03 — verification](T-AM2-03-verification.md).
