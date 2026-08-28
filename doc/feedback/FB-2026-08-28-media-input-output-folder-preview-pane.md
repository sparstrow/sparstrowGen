# FB-2026-08-28-media-input-output-folder-preview-pane

**Status:** 🟢 routed
**Reported by:** owner
**Reported:** 2026-08-28
**Area:** Chat — right preview pane

## Raw feedback

> On the right preview pane, should we add another folder icon preview, on
> input and output folder for media.

## Context

Raised in the same message as
[`FB-2026-08-28-chat-generated-media-not-shown-in-chat`](FB-2026-08-28-chat-generated-media-not-shown-in-chat.md)
(media the model generates isn't visible in the chat transcript at all).
Read together, the owner seems to be proposing a second/alternate surface for
media alongside inline chat rendering: a folder-style browser in the existing
right-hand preview pane, split into an "input" folder (files/media the owner
attached — see T-CS6-01's attachment chips) and an "output" folder (media the
model produced). Not yet clarified whether this is instead of inline
rendering in the transcript, or in addition to it — that's an open point for
whoever triages this into a spec.

## Triage

**An idea**, merged with its sibling
[`FB-2026-08-28-chat-generated-media-not-shown-in-chat`](FB-2026-08-28-chat-generated-media-not-shown-in-chat.md)
into [`I-16`](../Ideas.md). The Context section above guessed these were "two
surfaces for the same thing, unclear whether instead of or in addition to."
Elaborating them landed somewhere more definite: **this is the better-founded
half of the pair.** CLI agents write files rather than returning image bytes
inline, so a filesystem-shaped view is the honest representation of what a
turn produced, and inline thumbnails are a presentation layer on top of it.

Two facts that constrain it, both established while elaborating rather than
assumed:

- The "input" half is substantially a *view* over data US4/CS5 is already
  building (chat attachments, persisted and redisplayed) — not new plumbing.
  The "output" half has no equivalent anywhere.
- `host-fs` cannot serve this. It is loopback-only and registered only when
  `deployment === "local"`, and the cloud app stubs `/host-fs/(.*)` out
  entirely. It needs the runtime-command channel M16/M17 landed — which makes
  this a first concrete consumer of [`I-11`](../Ideas.md)'s folder browsing.

## Resolution

Routed to [`I-16`](../Ideas.md). Not built — the pane/transcript question the
owner raised ("should we…") is left open there as a decision, not answered.
