---
id: 0002
category: new-concept
status: done
project: factory
surface: Messages
date: 2026-07-12
screenshots: [assets/0002-messages-ui-1.png, assets/0002-messages-ui-2.png, assets/0002-messages-sidebar-filter.png]
links: { "0001": "docs/intake/done/0001-agent-creator-prompt-improvements-2026-07-12.md", pr: "https://github.com/sparstrow/sparstrowGen/pull/47" }
resolution: shipped
---

## What I brought (verbatim)

Right now the messages look like a email like look and feel, but I want it be like claude code desktop interface. I want to chat interface. I want all the conversation to be stored as sessions. I want to make conversation in various ways. One is I chat freely with an llm model like agy and claude about anything, it doesnt have to be stored to any memory like global or project or agent. [Screenshot: assets/0002-messages-ui-1.png]

2nd way is, I want to target a project and I should able to ask question and talk about the project. [Screenshot: assets/0002-messages-ui-2.png]

3rd way is I want to point the project and point any agent under the project. I should be able to talk with that agent. ask it do anything.

Yes I need to see the session on the left where I can jump into previous conversion history. I should also able to group the session or filter the session according to project, status etc as shown in the screenshot [Screenshot: assets/0002-messages-sidebar-filter.png]

I want to select it via a dropdown before starting any conversation. 

I also want claude preview window when I chat with a project, When I click the preview it should run the app on the right if there is any runnable build or code on the repo 

The preview feature can always be there not just when preject is selected. On other times, it can say there is nothing to preview

I also want to mention that the feedback 1 which we wrote before also needs similar sessions which we discussed now. Can you add this as a note to both feedback doc to add refernce to one another.

## What the Listener understood

You want to completely replace the current email-like Messages inbox with a real-time, session-based chat interface similar to the Claude Code desktop app. This new interface will feature a left sidebar for navigating, grouping, and filtering historical chat sessions. Whenever you start a new session, you will use a dropdown to select between three contexts: a stateless free chat, a project-context chat, or an agent-specific chat.

Additionally, you want a universal "preview" panel on the right side of the chat. When there is runnable code (like in a project chat), this panel will build and run the app live. In other contexts without runnable code, it will simply show an empty state ("nothing to preview").

Finally, the session-based architecture discussed here is identical to the persistence requirement captured in Intake #0001 (Agent Creator). Both surfaces should share this session model.

## Curator session
**Filed as:** `new-concept`
**Confirmed as:** `new-concept` (Merged with 0001)
**Summary:** Merged with 0001 as a single unified session architecture.
**Dialogue & Decisions:**
- **Premises Agreed:** P1 (Shared session architecture between 0001 & 0002), P2 (UI changes blocked by foundational backend).
- **D1 Merge Decision:** 
  - Option A: Merge into a single new-concept build (✅ Unified architecture, ❌ Larger initial scope)
  - Option B: Keep separate (✅ Faster prompt updates, ❌ UI is blocked anyway)
  - **Selected:** Option A (Merge).
- **Pipeline Suggestion:** 
  - Approach 1 (Fuller): Real DB backend + unified UI.
  - Approach 2 (Minimal): LocalStorage only.
  - Approach 3 (Lateral): Open-source Chat UI kit.
  - **Selected:** Approach 1 (Fuller build via Architect → Designer → Coder → QA).
**Verdict:** Locked as `new-concept`. Status set to `gap` initially, then officially routed to the Fuller new-concept pipeline (Approach 1).
