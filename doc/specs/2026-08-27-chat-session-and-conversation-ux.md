# Spec: Chat Session & Conversation UX

| | |
|---|---|
| **Status** | Draft |
| **Created** | 2026-08-27 |
| **Trigger** | Four items captured in `doc/feedback/` on 2026-08-27 (owner): [`chat-no-auto-rename-from-first-prompt`](../feedback/FB-2026-08-27-chat-no-auto-rename-from-first-prompt.md), [`chat-no-manual-rename-delete`](../feedback/FB-2026-08-27-chat-no-manual-rename-delete.md), [`chat-model-list-hardcoded-not-dynamic`](../feedback/FB-2026-08-27-chat-model-list-hardcoded-not-dynamic.md), [`chat-missing-file-upload`](../feedback/FB-2026-08-27-chat-missing-file-upload.md), grouped into one spec at the owner's direction (three auth-area feedback items from the same batch were deliberately deferred to a later pass). The rename/delete pair overlaps a question [`I-13`](../Ideas.md) already left open — whether "delete" means a real delete or the archive the backend already half-supports — resolved with the owner in the same conversation that produced this spec: a real, permanent delete, behind a confirmation offering Archive / Delete / Cancel and a clear warning about what's lost. |
| **Plan** | not planned yet |
| **Open questions** | none |

## The experience today

The chat rail lists every session, but a session's title is fixed at
"New conversation" for its entire life — nothing ever updates it, so a rail
with more than a couple of sessions is impossible to tell apart by name
alone. The only per-session action anywhere in the app is an Archive icon in
the conversation header, and there is no unarchive, no rename, and no delete
control anywhere — once a session exists, the owner cannot relabel it or get
rid of it, only archive it one-way.

The model picker in the composer offers a fixed list of models per provider
(for example, specific Claude and Antigravity model names) that was accurate
when the app was built. When a provider ships a new model or retires an old
one, the picker doesn't reflect that until someone updates the app by hand.

The composer itself is text-only. There is no drag-and-drop target and no
upload control for attaching a file or piece of media to a message — the
text box is the only way in.

## What I expect instead

A session should name itself usefully from what's actually being discussed,
and the owner should have a real, deliberate way to rename or get rid of one
by hand — including an actual delete, with a clear warning about what's
lost, not a silent no-op or a hidden archive standing in for it. The model
list should reflect what a provider genuinely offers right now, not a
snapshot frozen at build time. And a message should be able to carry a file
or piece of media the same way it already carries text.

---

## User stories

### US1 — Rename and delete a chat session, deliberately (Priority: P1)

The owner has a growing list of chat sessions and wants to relabel one or
get rid of one they no longer want. They reach a per-session action — from
the rail row or the conversation header — that lets them rename it, or
choose to remove it entirely with a confirmation that spells out the
difference between archiving and deleting.

**Why this priority:** This is the flaw the owner called out most directly:
right now there is no way to rename or remove a session at all. This
restores basic ownership over something the owner created.

**Independent test:** Rename an existing session and confirm the new title
sticks after a reload. Separately, delete a different session through the
confirmation flow and confirm it is gone for good; confirm Cancel and
Archive each leave it in the expected, non-destroyed state.

**Acceptance scenarios:**

1. **Given** a chat session still titled "New conversation", **When** the
   owner renames it, **Then** the rail and the conversation header both show
   the new title immediately, and it survives a reload.
2. **Given** a chat session the owner wants gone, **When** they choose to
   remove it, **Then** a confirmation appears offering **Archive**,
   **Delete**, and **Cancel**, explaining that Delete permanently removes
   the conversation and everything in it and cannot be undone.
3. **Given** that confirmation is open, **When** the owner picks **Delete**,
   **Then** the session and its message history are gone from the app
   entirely — it does not reappear anywhere, including after a reload.
4. **Given** that confirmation is open, **When** the owner picks
   **Archive** instead, **Then** the session leaves the active list the same
   way today's Archive icon already behaves, but is not destroyed and
   remains recoverable.
5. **Given** that confirmation is open, **When** the owner picks
   **Cancel**, **Then** nothing changes and the session is untouched.
6. **Given** the owner is renaming a session, **When** they clear the title
   entirely and try to save, **Then** the session keeps a usable name (its
   previous title, or a sensible default) rather than being left blank.

---

### US2 — New sessions name themselves from what you ask (Priority: P1)

The owner starts a brand-new chat and sends their first message. Instead of
staying "New conversation" forever, the session's title updates to reflect
what was actually asked, so a moment later the owner can tell sessions apart
in the rail without opening each one.

**Why this priority:** This is the default case — most sessions are never
manually renamed (US1), so this is what makes the rail usable day to day,
not just when the owner intervenes.

**Independent test:** Start a new session, send a first message, and confirm
its rail title changes from "New conversation" to something derived from
that message, with no manual action taken.

**Acceptance scenarios:**

1. **Given** a brand-new session still titled "New conversation", **When**
   the owner sends their first message, **Then** the session's title
   updates to reflect that message shortly after it's sent.
2. **Given** a session the owner has already renamed by hand (US1), **When**
   more messages are sent in it, **Then** the manual title is never
   overwritten by automatic naming.
3. **Given** the owner's first message is very long, or has no clear topic
   (e.g. just "hi"), **When** the title is generated, **Then** it stays
   short and readable rather than dumping the raw message in as-is, or falls
   back to a sensible placeholder if nothing meaningful can be derived.

---

### US3 — The model list always matches what the provider actually offers (Priority: P2)

The owner opens the model picker for a provider — Claude, Antigravity, or
another configured provider — and sees the models that provider actually
offers right now, not a list that was accurate when the app was built.

**Why this priority:** Chat already works with the existing fixed list, so
this doesn't block anything today — it closes a correctness gap that
silently drifts wider every time a provider changes its lineup.

**Independent test:** Open the model picker for a provider that has added or
retired a model since the app's built-in list was last updated, and confirm
the picker reflects the provider's real current lineup.

**Acceptance scenarios:**

1. **Given** a provider currently offering a model not in the app's
   built-in list, **When** the owner opens that provider's picker, **Then**
   the new model appears as a selectable option.
2. **Given** a provider that has retired a model, **When** the owner opens
   that provider's picker, **Then** the retired model no longer appears.
3. **Given** a provider's live model list can't be reached right now
   (offline, provider outage), **When** the owner opens that provider's
   picker, **Then** they still see a usable list — such as the last known
   one — rather than an empty picker, and it's clear the list may not be
   current.

---

### US4 — Attach files and media to a chat message (Priority: P2)

The owner wants to give the agent a file or image as part of a message,
either by dragging it onto the composer or using an upload control, instead
of describing it in text alone.

**Why this priority:** A real, directly-requested capability gap, but chat
remains usable text-only today — unlike US1/US2, where the control is
simply missing outright.

**Independent test:** Drag a file onto the composer (or use an upload
control), confirm it shows as attached before sending, send the message,
and confirm the attachment is still there when the session is reopened.

**Acceptance scenarios:**

1. **Given** the composer is open, **When** the owner drags a file onto it,
   **Then** the file appears attached to the draft, with a way to remove it
   before sending.
2. **Given** a file is attached to the draft, **When** the owner sends the
   message, **Then** the sent message shows the attachment alongside any
   text, and it's still there when the session is reopened later.
3. **Given** the owner attaches a file type or size the app can't handle,
   **When** they try to send it, **Then** they're told clearly why it was
   rejected before the message goes out, not after a failed send.

---

## Interface & experience

### Surfaces

| Surface | New or existing | What the owner does here |
|---|---|---|
| Chat session rail (`/chat`) | Existing | Browses sessions; reaches rename/delete for one |
| Conversation header | Existing | Currently has Archive; gains the rename/delete entry point |
| Removal confirmation | New | Decides Archive vs. Delete vs. Cancel for a session |
| Model/provider picker | Existing | Chooses which model answers, now reflecting the provider's real lineup |
| Message composer | Existing | Composes a message; gains drag-and-drop / upload for attachments |

### The four states

| State | What the owner sees |
|---|---|
| **Populated** | Sessions show real, meaningful titles (auto-generated or manual); the per-session action offers Rename and Delete; the model picker lists the provider's current models; the composer shows any attached files before sending. |
| **Empty** | A brand-new session still reads "New conversation" until its first message is sent (US2). A provider with no models fetched yet shows an explicit "no models available" state, never a blank dropdown. A composer with nothing attached looks exactly as it does today. |
| **Loading** | While a title is being generated after the first message, the rail shows a brief pending state rather than jumping instantly. While a provider's model list is being fetched, the picker shows it's loading instead of appearing empty. An attachment mid-upload shows progress. |
| **Error** | If auto-naming fails, the session simply keeps "New conversation" — no error shown. If a provider's model list can't be fetched, the picker falls back to the last known list with a visible "may not be current" note (US3.3). If an attachment is rejected, the composer says why in plain words (US4.3). If a delete fails, the confirmation stays open and explains what went wrong rather than closing silently. |

### Flow

Rail or header → per-session action → **Rename** (inline title edit) or
**remove** (Archive / Delete / Cancel confirmation) → outcome reflected
immediately in both the rail and the open conversation, if it was the one
open.

Composer → drag a file onto it, or use the upload control → attachment
shown on the draft, removable → send → attachment appears in the sent
message and persists across reloads.

## Edge cases

- What happens when the owner deletes the session that's currently open?
  They should land somewhere sensible (e.g. the rail or another session),
  not a broken or blank page.
- What happens when two sessions end up with the same auto-generated title?
  Allowed — the title is a convenience label, not a unique identifier.
- What happens when a provider is entirely unreachable, not just stale —
  does the picker still show something usable, the same as the stale case?
- What happens when the owner attaches more than one file to a single
  message?
- What happens when the owner renames a session to a very long title?
- What happens when the owner deletes the only session they have? The rail
  should show its normal empty state afterward, not an error.

## Requirements

### Functional requirements

- **FR-001**: Owner MUST be able to rename any chat session to a title of
  their choosing.
- **FR-002**: Owner MUST be able to permanently delete a chat session,
  distinct from archiving it.
- **FR-003**: Removing a session MUST require a confirmation step offering
  Archive, Delete, and Cancel, and MUST state plainly that Delete is
  permanent and removes the session's message history.
- **FR-004**: A new session's title MUST update automatically to reflect
  the owner's first message, unless the owner has already renamed it by
  hand.
- **FR-005**: A manually-set session title MUST NOT be overwritten by
  automatic naming.
- **FR-006**: The model picker for a provider MUST reflect that provider's
  currently available models rather than a fixed list baked into the app.
  [NEEDS CLARIFICATION: which of today's configured providers actually
  expose a queryable model list vs. which have no such capability upstream
  and would need a curated fallback instead]
- **FR-007**: If a provider's live model list can't be retrieved, the
  picker MUST still show a usable list rather than appearing empty or
  broken.
- **FR-008**: Owner MUST be able to attach one or more files or media items
  to a chat message, by drag-and-drop or an upload control.
- **FR-009**: An attached file MUST be visible and removable from the draft
  before the message is sent.
- **FR-010**: A rejected attachment (unsupported type or too large) MUST
  tell the owner why, before the message is sent.

### Key entities

- **Chat session title**: the display name for a session — the default
  placeholder, an auto-generated name derived from the first message, or a
  title the owner set by hand.
- **Session removal decision**: the three-way choice (Archive / Delete /
  Cancel) presented when the owner asks to get rid of a session.
- **Provider model catalog**: the set of models a given provider currently
  makes available, refreshed from the provider rather than fixed at build
  time.
- **Message attachment**: a file or media item attached to a chat message,
  sent and stored alongside its text.

## Success criteria

- **SC-001**: No chat session with at least one message stays titled "New
  conversation" indefinitely — it gets an auto-generated or manual name
  within moments of its first message.
- **SC-002**: A session can be permanently removed, and doing so always
  requires an explicit, worded confirmation that distinguishes it from
  archiving.
- **SC-003**: Opening a provider's model picker never shows a model that
  provider has retired, and shows a model it added since the app was last
  updated, without an app update being required.
- **SC-004**: A message with an attached file or media item still has that
  attachment when the session is reopened later.

## Assumptions

- Scope boundary: Fork, session pinning, a "Continue on \<machine\>"
  override, and an app-wide `/shortcuts` reference page — all raised
  alongside the original chat right-click-menu idea — stay out of scope
  here and remain parked in [`I-13`](../Ideas.md) for their own pass.
- Scope boundary: this covers one-on-one owner↔agent chat sessions only,
  the same boundary [`2026-08-23-chat-message-sending`](2026-08-23-chat-message-sending.md)
  drew; team/manager chat is out of scope.
- "The memory associated with chat" in the owner's delete-confirmation
  wording (2026-08-27) refers to that session's own message history. The
  app has no separate memory-notes record tied to an individual chat
  session today — chat turns don't feed the project/agent memory system at
  all yet ([`D-20`](../Deferred.md)) — so nothing beyond the session's own
  conversation is actually at stake when it's deleted. The confirmation
  copy should still say this in the owner's terms (their conversation with
  the agent will be gone), not reference the separate memory system.
- Providers without any queryable model-list capability (if any exist among
  today's configured providers) keep a manually curated list rather than
  being forced into a dynamic fetch that doesn't exist upstream — this is
  FR-006's open item, to be resolved by checking each configured provider's
  actual capability at plan time.
- File/media attachment storage limits (accepted types, maximum size) are a
  plan-level decision; this spec only commits to the owner being able to
  attach something and being told clearly when one is rejected.
- Scope boundary: the 3 auth-area items from the same 2026-08-27 feedback
  batch (missing confirm-password field, sign-in tab order, cross-browser
  email-confirmation error) are deliberately not covered here — the owner
  chose to focus on chat first. They remain open in `doc/feedback/` for a
  later pass.

## Owner review

**Reviewed:** <not yet reviewed>
