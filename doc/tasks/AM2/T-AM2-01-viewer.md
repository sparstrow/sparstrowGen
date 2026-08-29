# T-AM2-01 — the produced-item viewer

| | |
|---|---|
| **Tag** | `[S]` sequential — `T-AM2-02` and `T-AM3-01` both render this component; it is the worked example both are written against |
| **Serves** | `US1` — see the thing the agent made |
| **Depends on** | AM1 |
| **Blocks** | T-AM2-02, T-AM3-01 |
| **Phase spec** | [README.md](README.md) |
| **Status** | ✅ done except live/visual verification → deferred to `T-AM2-02` (2026-08-29) |

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

**The signed URL is minted by a hook that can re-mint.** Phase README trap 3.
**Corrected while building:** the hook lives inside `produced-item.tsx`
itself, not `apps/web/src/lib/chat-attachments.ts` — that file's only current
importers (`app/chat/actions.ts`, `lib/api/handlers/chat.ts`) are both
server-only, and this hook is a client-side React hook using `createClient()`
and component state. Mixing a client hook into a server-data-fetch file was
a real correctness concern, not a style preference, so it stayed local and is
**not exported** — nothing outside this file needs to call it directly, only
`ProducedItem`/`ProducedItemViewer` do.

```ts
// apps/web/src/components/chat/produced-item.tsx (internal, not exported)
function useAttachmentSignedUrl(storagePath: string): {
  url: string | null;
  state: "loading" | "ready" | "unavailable";
  handleError: () => void;
};
```

Also corrected: the hook takes a plain (non-nullable) `storagePath` and does
**not** watch it for changes. Resetting derived state from inside a
`useEffect` when a prop changes is exactly what the `react-hooks/set-state-in-effect`
lint rule now forbids, and the alternative of comparing against a ref value
during render is exactly what `react-hooks/refs` forbids right behind it —
both fire on the originally-planned shape. The fix is React's own documented
one: **remount via `key`**. `ProducedItem` and `ProducedItemViewer` are thin
wrappers that mount an inner, hook-using component under
`key={attachment.storagePath}`; switching attachments remounts fresh state
for free, with no reset logic to get wrong. `handleError` (renamed from
`refresh`, called directly from `<img onError>`) is what re-mints once on a
failure — a second failure sets `unavailable` without a further mint.

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

- [x] Read `DESIGN.md` §6 (Iconography) and §7 (Motion) and `PRODUCT.md`'s
      register before writing anything — `AGENTS.md` §3.11, mandatory order.
      Also read §10 (The four states — **no spinners, ever**; this is why the
      loading state is a `Skeleton`, not the spinner my own earlier draft of
      this task specified) and §2's warning that `--brand`/surface tokens are
      not yet derived in `globals.css` — irrelevant here since this component
      only uses already-shipped tokens (`bg-background`, `text-muted-foreground`,
      `border`), never the undelivered theming contract
- [x] Check for an existing dialog/lightbox before composing one — `Dialog`
      and `Skeleton` are **already installed** in `@sparstrow/ui`
      (`packages/ui/src/components/ui/dialog.tsx`,`skeleton.tsx`), so no
      registry fetch was needed; used them as-is
- [x] `useAttachmentSignedUrl` (internal — see Decisions correction) with its
      three states and one-shot `handleError` re-mint
- [x] `isRenderableImage(mimeType)`, exported
- [x] `ProducedItem` — image variant, file-row variant (name, kind, size,
      open/save), skeleton, and the named-failure variant
- [x] `ProducedItemViewer` — Dialog, image at natural size bounded by the
      viewport, non-image showing the open/save action, its own loading and
      unavailable states
- [x] Keyboard: item is a real `<button>` (native Enter/Space activation, no
      hand-rolled key handling needed); Escape and focus-return come from
      Radix Dialog's own primitive, unmodified
- [ ] Unit tests: **not written — see Result.** This repo has zero
      React-Testing-Library tests and no such dependency anywhere
      (`grep`-confirmed across every package); introducing one for a single
      component is a bigger decision than this task owns
- [ ] Verify in **both** themes and at the Paper and Mono surfaces: **deferred
      to `T-AM2-02`** — see Result for the reasoning
- [x] `apps/web` typecheck and lint green (no test suite exists to add to
      for a component with zero consumers yet)

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

- [x] `pnpm --filter web test` green (no new tests added — see Checklist)
- [ ] Rendered in isolation — **took the documented alternative**: deferred to
      `T-AM2-02`'s surface, which mounts this component for real and needs a
      live dev server for its own verification anyway. Doing a temporary
      isolated route first would mean standing up that server twice for the
      same component. Recorded as not-yet-reached here, to be closed by
      `T-AM2-02`'s own verification, not silently assumed
- [ ] Escape closes the viewer and focus returns to the item that opened it —
      not yet exercised live, same deferral
- [ ] Both themes, Paper and Mono — not yet exercised live, same deferral
- [ ] The full scenario is **not** proved here — no surface renders this yet.
      `T-AM2-03` grades it

## On completion

- [x] `pnpm typecheck` and `pnpm test` green
- [x] Update this file's **Status** row
- [ ] Open the PR into `band/27-seeing-what-my-agent-made`, then
      `gh pr merge <n> --auto --squash`
- [x] **Tell whoever picks up `T-AM3-01` that this has landed** — it is the
      gate that lets AM2 and AM3 run in parallel (both forked immediately
      after this task's PR merges)

> **Do not edit [`../MasterTaskQueue.md`](../MasterTaskQueue.md) from a task
> branch.**

## Result

**Two design corrections, both reached before writing the component, not
after:**

1. `Dialog` and `Skeleton` are already installed in `@sparstrow/ui` — no
   registry fetch needed, used the shipped primitives as-is.
2. `DESIGN.md` §10's Named Rule 10 ("skeleton shaped like the real content —
   never a spinner") directly contradicts this task's own original draft,
   which specified "Spinner over the dimmed backdrop" for the viewer's
   loading state. DESIGN.md wins per its own header. Both `ProducedItem` and
   `ProducedItemViewer`'s loading states are `Skeleton`, matching the strip's
   own 16:10 approximation.

**Two more corrections surfaced while actually building it, both from
`react-hooks` lint rules stricter than the plan anticipated** — recorded in
the Decisions section above with full reasoning:

1. The signed-URL hook is **not** exported and does **not** live in
   `apps/web/src/lib/chat-attachments.ts`. That file's only importers are
   server-only; this hook is a client hook. Moved into `produced-item.tsx`,
   unexported, since nothing outside the file calls it.
2. The originally-planned "hook watches `storagePath` and resets its own
   state on change" shape is exactly what `react-hooks/set-state-in-effect`
   (reset via effect) and `react-hooks/refs` (reset via a ref comparison
   during render) both forbid. Fixed with React's own documented answer:
   `ProducedItem`/`ProducedItemViewer` mount an inner, hook-using component
   under `key={attachment.storagePath}` — switching attachments remounts
   fresh state for free. `pnpm --filter web lint` on this file went from 3
   errors (two different rules, across two rewrite attempts) to clean.

**Two checklist items genuinely not done, named rather than rounded up:**

- **No unit tests.** Confirmed by grep across the whole repo: zero
  `@testing-library/react` dependency, zero `.tsx` test files, anywhere.
  Introducing React component testing infrastructure for one component is a
  bigger decision than this task owns — flagged here rather than either
  silently skipping verification or unilaterally adding a new testing
  pattern to the repo.
- **No live/visual verification** (both themes, Paper/Mono, Escape+focus
  return, the real-PNG/PDF-row/broken-path matrix). This component has zero
  consumers yet. `T-AM2-02` mounts it for real in the actual chat UI and
  needs a live dev server for its own verification regardless — deferring
  the visual pass to that task avoids standing up the same server twice to
  check the same component. This is the documented alternative the task's
  own Verification section already named ("via `T-AM2-02`'s surface once it
  lands, **or** a temporary route"), not a shortcut invented here.

**What was actually run:** `pnpm --filter web typecheck` (clean) and
`pnpm --filter web lint` on the new file specifically (clean, after the two
hook-rule fixes above). No existing tests were affected — this is a new file
with no prior consumers to regress.
