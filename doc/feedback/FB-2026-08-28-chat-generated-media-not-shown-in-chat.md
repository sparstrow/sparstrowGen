# FB-2026-08-28-chat-generated-media-not-shown-in-chat

**Status:** 🟢 routed
**Reported by:** owner
**Reported:** 2026-08-28
**Area:** Chat — assistant message rendering

## Raw feedback

> Second thing is the models can also generate media which I should see
> accordingly in the chat.

Given alongside a phone screenshot of `Free chat` (provider `antigravity`):
after the owner sent "Can you genrate a picture of a man", the assistant
replied with the text "I've generated a picture of a man for you! Let me know
if you would like me to modify it or generate something else." — no image,
thumbnail, or any other media element appears anywhere in that message or the
turn around it.

## Context

The owner asked a model to generate an image; the model's own text claims it
did so, but the chat transcript never renders anything for the owner to
actually see. Whether the underlying provider call is really producing image
bytes/a URL that the UI is discarding, or the model is only claiming to have
generated something with nothing produced server-side, is not yet
established — this item is the observed gap (no media appears), not a
diagnosis of which side caused it.

## Triage

**An idea, not a bug** — and merged with its sibling
[`FB-2026-08-28-media-input-output-folder-preview-pane`](FB-2026-08-28-media-input-output-folder-preview-pane.md)
into a single entry, [`I-16`](../Ideas.md), because elaborating them
established they are one idea rather than two.

This was initially held as "blocked until we know whether the model really
generates image files or only claims to." That framing was wrong, and naming
why is the useful part: the chat pipeline is text-only at four independent
layers — provider parse, `extractResult`, the `chat_messages.content` text
column, and `ChatTurnView` — so a perfectly well-formed image event would
have produced this same screenshot. Nothing could have been shown either way,
which makes the diagnosis a consequence to check for later, not a gate.

Not filed as a bug: nothing here behaves incorrectly against what was built.
Media rendering was never implemented, so its absence is a missing capability.
The one thing that edges toward a defect — `parseStepUpdate` dropping an
unrecognised `step_type` silently, where `parseLine`'s own `default:` case
deliberately surfaces unknowns as `raw` — is recorded in `I-16` as the cheap
first move rather than as a bug, because no such step has actually been
observed. It is an evidence gap, not proven wrong behaviour.

## Resolution

Built. `I-16`'s elaboration graduated to
[`specs/2026-08-28-seeing-what-my-agent-made.md`](../specs/2026-08-28-seeing-what-my-agent-made.md)
(owner-reviewed 2026-08-28) and shipped as band 27 (`AM1`–`AM4`). An
assistant reply that produces a file now shows it inline under the reply
(`T-AM2-02`) — a renderable image as a thumbnail you can open larger,
anything else as a named row — rather than only a sentence claiming it. The
`parseStepUpdate` silent-drop question this entry raised as "an evidence gap,
not proven wrong behaviour" stays exactly that: still unconfirmed either way,
tracked in `doc/KnownGaps.md` `G-55` rather than answered here. `I-16` itself
is deleted from `Ideas.md` per its own instruction, now that the spec it
graduated to is both reviewed and (fully) planned.
