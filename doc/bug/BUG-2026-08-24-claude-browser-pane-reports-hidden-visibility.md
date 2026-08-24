# BUG-2026-08-24-claude-browser-pane-reports-hidden-visibility

**Status:** 🔴 open
**Reported by:** agent — found while evaluating whether the in-app Claude
Browser preview pane (`mcp__Claude_Browser__*`) could replace the Playwright
MCP as this agent's default browser-verification tool, per the owner's
question about which tool is native/best for a Claude Code agent specifically.
**Reported:** 2026-08-24

## Symptom

A page loaded into the Claude Browser preview pane reports
`document.visibilityState === "hidden"` and `document.hidden === true`, even
though it is the actively-driven, foregrounded tab. Any page whose data
fetching gates on page visibility (a common React Query / Page Visibility API
pattern, used throughout this app) never issues its first fetch inside this
pane — the page sits on its loading skeleton forever and reads as a bug in
the page's own code, when the page is actually working correctly.

## Reproduction

1. `preview_start({name: "web"})` to open the local dev server in the Claude
   Browser pane.
2. `navigate` to any route (`http://localhost:3000/login` was used here).
3. Run `document.visibilityState` / `document.hidden` via the pane's
   `javascript_tool`.

Observed: `{"visibilityState":"hidden","hidden":true,"readyState":"complete","bodyTextLen":317}`
— confirmed on a fresh navigation, not a backgrounded tab.

The login page itself rendered its static content correctly (317 chars of
real text, not a skeleton) because it doesn't gate on visibility — this
reproduction confirms the root cause, not yet a stalled authenticated data
page specifically (no signed-in session was available in this pane during
this check). The mechanism is exactly what `doc/runbooks/agent-browser-session.md`'s
"Getting a browser that actually renders" section already documents as the
reason the Playwright MCP was adopted instead, back on 2026-08-20 — this
report gives that already-known issue its own dedicated bug file, since it
previously only existed as prose in the runbook and scattered `KnownGaps.md`
references (`G-12`, `G-13`, `G-16`).

## Investigation

Not yet investigated at the tool-implementation level — this pane is part of
the harness, not this repo's own code, so there is nothing here to fix
directly. What's confirmed: the visibility-hidden state is present on a
fresh, foregrounded navigation, and the app's own data-fetching pattern
(React Query gated on visibility) is exactly the shape that this state
starves.

## Impact

Any agent verification pass that uses the Claude Browser pane against an
authenticated, data-bearing page (Machines, Chat, Projects, Runs, etc.)
risks a false "stuck on loading skeleton" reading of code that is actually
correct. This is the reason `doc/runbooks/agent-browser-session.md`
prescribes the Playwright MCP for the end-to-end verification loop instead
of this pane. No workaround inside the pane is known; `tabs_select` does not
change the reported visibility state (per the runbook's existing note).

Does not block day-to-day use of the pane for non-data-gated tasks (starting/
stopping dev servers, checking build/console errors, static content).

## Resolution

<!-- Open. Fix deferred — see doc/Deferred.md for the parked follow-up on
updating browser-tool guidance, which depends on this being fixed or worked
around first. -->
