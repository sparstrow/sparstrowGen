# T-AM2-01 — the produced-item viewer

| | |
|---|---|
| **Tag** | `[S]` sequential — `T-AM2-02` and `T-AM3-01` both render this component; it is the worked example both are written against |
| **Serves** | `US1` — see the thing the agent made |
| **Depends on** | AM1 |
| **Blocks** | T-AM2-02, T-AM3-01 |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

## The scenario this satisfies

> 1. **Given** a conversation with an agent that can produce files, **When** I
>    ask it to generate an image and the turn succeeds, **Then** the reply shows
>    the image, and **clicking it opens a larger view**.
> 2. **Given** an agent that produced a file which is not an image, **When** the
>    reply arrives, **Then** I see the file's name, its kind, and its size, with
>    a way to open or save it — **not a broken picture**.

## Objective

One component that renders one stored attachment, in every state it can be in,
plus the enlarged view it opens. Nothing places it anywhere yet — this task
exists so the two surfaces that use it are written against something real
rather than each inventing their own.

## Decisions already made

**Two exports, one file.**

```tsx
// apps/web/src/components/chat/produced-item.tsx
export function ProducedItem({ attachment, onOpen }: {...}): JSX.Element;
export function ProducedItemViewer({ attachment, open, onOpenChange }: {...}): JSX.Element;
```

`ProducedItem` is the thumbnail-or-row. `ProducedItemViewer` is the enlarged
view, a Shadcn `Dialog`. The caller owns the open state, so AM3's list and
AM2's strip can both drive one viewer without either owning the other.

**The signed URL is minted by a hook that can re-mint.** Phase README trap 3:

```ts
// apps/web/src/lib/chat-attachments.ts
export function useSignedAttachmentUrl(storagePath: string): {
  url: string | null;
  state: "loading" | "ready" | "unavailable";
  refresh: () => void;
};
```

`refresh()` is called once from the `<img onError>` handler before the item
concludes the file is gone. A second failure is `unavailable` — retrying
forever on a genuinely deleted object would spin.

**The three states are explicit, not derived from `url == null`.** `loading`
renders a skeleton; `ready` renders the image or row; `unavailable` renders the
named failure. Deriving from a nullish URL collapses loading and error into one
appearance, which is precisely the distinction scenario 4 needs preserved.

**Kind comes from `mimeType` per phase decision 2.** A small helper
`isRenderableImage(mimeType)` — `png`, `jpeg`, `gif`, `webp` only. SVG is a
row. It is exported, because AM3 needs the same answer.

**Skeleton shape.** `sizeBytes` is known but dimensions are not, so the
skeleton is a fixed 16:10 box at the reading column's width. The spec asks for
"a placeholder shaped like the item"; without stored dimensions this is the
honest approximation, and it is stated here so `T-AM3-01` does not invent a
second one. Storing dimensions is deliberately out of scope — it would mean an
AM1 schema change to remove one layout shift.

**Failure text names the file.** `"chart.png couldn't be loaded"`, from the
spec's own Error row — not a generic "Failed to load".

## Checklist

- [ ] Read `DESIGN.md` §6 (Iconography) and §7 (Motion) and `PRODUCT.md`'s
      register before writing anything — `AGENTS.md` §3.11, mandatory order
- [ ] Check the Shadcn registry for an existing dialog/lightbox block via the
      `shadcn` MCP before composing one
- [ ] `useSignedAttachmentUrl` with its three states and one-shot `refresh`
- [ ] `isRenderableImage(mimeType)`, exported
- [ ] `ProducedItem` — image variant, file-row variant (name, kind, size,
      open/save), skeleton, and the named-failure variant
- [ ] `ProducedItemViewer` — Dialog, image at natural size bounded by the
      viewport, non-image showing the open/save action, its own loading and
      unavailable states
- [ ] Keyboard: item is a real focusable control, Enter opens, Escape closes,
      focus returns to the invoking item
- [ ] Unit tests: each of the three states renders its distinct content; a
      first `onError` triggers exactly one `refresh`; a second does not
- [ ] Verify in **both** themes and at the Paper and Mono surfaces
- [ ] `apps/web` typecheck and tests green

## Traps

**A `<Dialog>` that traps focus but not Escape, or vice versa.** Shadcn's
Dialog handles both — hand-rolling a backdrop is where this breaks, and it is
the reason to check the registry first rather than after.

**`window.open` for the save action is blocked when it is not in the direct
click handler's synchronous path.** `SentAttachmentChip` gets away with it
because it awaits `createSignedUrl` first and Chrome tolerates it there; a
popup blocker on other browsers will not. Mint the URL first, then open — and
if the URL is already in hand from the hook, open it directly.

**Do not restyle `SentAttachmentChip` in this task.** It is US3's surface and
AM4's decision whether the two treatments converge. Touching it here creates a
conflict with `T-AM4-01` over the same file for no benefit in this phase.

**Mono is the honest worst case.** A thumbnail that reads well only because the
brand accent is carrying it will look wrong there. `AGENTS.md` §3.11.

## Verification

- [ ] `pnpm --filter web test` green
- [ ] Rendered in isolation — via `T-AM2-02`'s surface once it lands, or a
      temporary route removed before the PR — showing: a real PNG, a PDF row,
      a deliberately broken `storagePath`, and the loading skeleton
- [ ] Escape closes the viewer and focus returns to the item that opened it
- [ ] Both themes, Paper and Mono
- [ ] The full scenario is **not** proved here — no surface renders this yet.
      `T-AM2-03` grades it

## On completion

- [ ] `pnpm typecheck` and `pnpm test` green
- [ ] Update this file's **Status** row
- [ ] Open the PR into `band/27-seeing-what-my-agent-made`, then
      `gh pr merge <n> --auto --squash`
- [ ] **Tell whoever picks up `T-AM3-01` that this has landed** — it is the
      gate that lets AM2 and AM3 run in parallel

> **Do not edit [`../MasterTaskQueue.md`](../MasterTaskQueue.md) from a task
> branch.**

## Result

<!-- Filled in when the task lands. -->
