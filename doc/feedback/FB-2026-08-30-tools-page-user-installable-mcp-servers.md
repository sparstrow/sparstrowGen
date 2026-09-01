# FB-2026-08-30-tools-page-user-installable-mcp-servers

**Status:** 🔴 new
**Reported by:** owner
**Reported:** 2026-08-30
**Area:** New surface — MCP server / tool management (adjacent to Settings → AI Providers & Keys, and to Agents)

## Raw feedback

> can I tell you something inbetween about the memory mcp, I would like to
> create a separate page called tools, where we can add mcp servers. Once we
> installed the mcp server in the app, then we can get that mcp server to be
> used by projects, given access to agents. I want to add lot of lot mcp
> servers and tools, cli like github, supabase, agent broswer whichever I am
> using for this app building right now. So I dont want any other third party
> mcp to be hardcoded, and shown in the settings like that. add this as an
> idea, or feedback.

## Context

Raised mid-session while working on the desktop app's local dev/release setup
(unrelated task — the mention of "memory mcp" was incidental, prompted by
`packages/memory-mcp` coming up during a build). Not a bug report about
`memory-mcp` itself.

The ask, as stated: a dedicated **Tools** page where the owner can add/install
MCP servers and CLIs (naming GitHub, Supabase, and agent-browser as examples —
notably, tools this *development* environment already uses via `.mcp.json` and
`AGENTS.md`'s CLI tools roster, not necessarily tools the shipped product
currently exposes to end users). Once installed there, a server/tool becomes
something projects can grant to their agents — i.e., installation and
per-project/per-agent access are two distinct steps. Explicit constraint: no
third-party MCP server should be hardcoded or appear in Settings the way
something might be today — everything should route through this Tools page
instead.

## Triage

<!-- Not triaged yet — capture only, per the owner's own framing ("add this
as an idea, or feedback") and this repo's standing instruction not to
triage/build a feedback item until explicitly told to. -->

## Resolution

<!-- Not resolved yet. -->
