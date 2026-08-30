# FB-2026-08-27-agents-page-missing-builtin-agents-model-editing

**Status:** 🔴 new
**Reported by:** owner
**Reported:** 2026-08-27
**Area:** Agents page — built-in agents (e.g. Agent Creator) and their model/provider config

## Raw feedback

> one feedback on the models used on the app's built agents like agent
> creator and others. I think the models there used are hardcoded like
> sonnet 4.8 or something. But the models and their versions are keep on
> evovling. Can the built agents can also be shown on the agents page, give
> us the capability to edit its models and ai provider. Those built in
> agents are not deletable.

## Context

Owner is looking at the app's built-in/system agents (Agent Creator and
others) and observes their model selection appears hardcoded to a specific
version (e.g. "Sonnet 4.8"). Two related asks:

1. Surface built-in agents on the Agents page alongside user-created agents,
   so they're visible/manageable in the same place.
2. Give the owner the ability to edit a built-in agent's model and AI
   provider from that page — since models and versions keep evolving and a
   fixed choice goes stale, the same underlying concern as
   [`FB-2026-08-27-chat-model-list-hardcoded-not-dynamic`](FB-2026-08-27-chat-model-list-hardcoded-not-dynamic.md)
   but scoped to built-in agent configuration rather than the chat model
   picker.

Built-in agents should remain non-deletable even once they're editable and
visible on the page — only their model/provider config would be editable,
not their existence.

## Triage

<!-- Not triaged yet. -->

## Resolution

<!-- Not resolved yet. -->
