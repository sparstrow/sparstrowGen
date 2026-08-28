# FB-2026-08-28-chat-generated-media-not-shown-in-chat

**Status:** 🔴 new
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

<!-- Not triaged yet. -->

## Resolution

<!-- Not resolved yet. -->
