---
id: 0001
category: new-concept
status: done
project: factory
surface: Agents / Agent Creator
date: 2026-07-12
screenshots: [assets/0001-agent-creator-modal.png, assets/0001-agent-creator-session-loss.png, assets/0001-agent-creator-error.png]
links: { "0002": "docs/intake/done/0002-chat-interface-concept-2026-07-12.md", pr: "https://github.com/sparstrow/sparstrowGen/pull/47" }
resolution: shipped
---

## What I brought (verbatim)
I have feedback on the agent creator system prompt to improve.

In the system prompt, it has a rule:
- Keep "reply" to 1-2 sentences. "followups": up to 3 short suggested user replies.`;

I dont want to limit the reply to one 1 to 2 sentence. It can ask question and explain me as necessary as possbile. 

I want the followups to as much as possible the agent creator understood and analayse what agent I want to be created and expected outcome. 

I want a rule where before creating an agent it should fully understood my expectation on how the agent should work and perform, and its workflow is understood as I wanted. It should provide me a short summary in the message on agents details like workflow. Once I confirmed then it can draft/create the agent.

yes it should ask me as much as questions one by one to get the full understanding and expectation of how the agent should perform.

Right now the agent creator has information about how we want our it to be created according to our sprastrowgen envrironment. But I think moer than that agent creator prompt itself can expanded. I want to analyse this https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md repo and we need to get as much as we can from this for agent creator prompt. So it creates a extradinary agent at the end.

this is about the user interface, as we are gonna remove the rule "Keep "reply" to 1-2 sentences. "followups": up to 3 short suggested user replies.". The agent window would have been fine for short sentence, but now we are gonna  chat with it. I think the centered open box will be too small for me to converse with the agent creator. I would like this dialogoue box to be a separate full page instead. [Screenshot: assets/0001-agent-creator-modal.png]

If I am working creating an agent here, suddenly I by mistake I closed the window or the browser existed accidentally. Then the work is gone, I again have to create from the scratch. It should session and store the conversation. I should able to view back again and complete it. We need a persistent session storage of my conversation. [Screenshot: assets/0001-agent-creator-session-loss.png]

I got this error when creating the agent but what is the actual reason for unavailibilty. It should mention that when it happens it usage limit or what is it. 

If one llm model is used here for example sonnet and it failed to complete, then I want a secondary llm to come in finish the task, but should ask me first if it can the scondary model or try again on the primary model [Screenshot: assets/0001-agent-creator-error.png]

I also want to mention that the feedback 1 which we wrote before also needs similar sessions which we discussed now. Can you add this as a note to both feedback doc to add refernce to one another.

## What the Listener understood
You want to update the agent creator system prompt to remove the 1-2 sentence reply limit so it can explain things and ask questions (one by one) to get a full understanding. You want the suggested followups to reflect its deep understanding of the agent being built, and you want to enforce a rule where the agent creator must summarize its understanding of the workflow and wait for explicit confirmation *before* drafting the agent. You also want to analyze https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md as inspiration to make the agent creator prompt extraordinary.

Because the Agent Creator will now be having longer, conversational back-and-forths, the current centered dialog box is too small. You'd like the Agent Creator to be moved out of that modal and into its own dedicated full page so there's plenty of room to chat.

Additionally, you want the Agent Creator's conversation to have persistent session storage. If you accidentally close the window or browser, your progress shouldn't be lost—you should be able to return to the conversation and pick up right where you left off.

Finally, when the AI drafting becomes unavailable and errors out, you want the error message to specify the exact reason (e.g., usage limits). If the primary model fails, you want the system to prompt you and ask whether it should retry the primary model or failover to a secondary model to finish the task.

*Note: The persistent session storage requirement here shares the exact same architecture as the session-based chat interface captured in Intake #0002.*

## Blind-spot notes (accepted)
- **Q: With the Agent Creator moving to a full-page view, did you consider how the user navigates back to their original context (like the Agents list or Dashboard) once the agent is successfully drafted?**
  A: The Agent Creator will be a full page, but it will still have the right-side panel with agent details and a "Create agent" button. Once created, a "View agent" button will appear to navigate to it.
- **Q: For the persistent session storage, should the session persist only until the agent is successfully created, or does it become a permanent historical log that you can revisit weeks later?**
  A: The conversation session becomes a historical log.
- **Q: In the event of a model failover, what should happen if the secondary model *also* hits a usage limit or fails? Should it just wait indefinitely for your input, or fail out with a specific message?**
  A: The system should retry both models a set number of times. If both fail repeatedly, it should fail out and stop the work until you provide input.

## Curator session
**Filed as:** `feedback`
**Reclassified as:** `new-concept` (Merged with 0002)
**Summary:** The user confirmed prompt complexity requirements (behavioral controls, guardrails) and agreed that 0001's UI requirements physically depend on the foundational session-chat architecture in 0002. Both are merged into a single new-concept build.
**Dialogue & Decisions:**
- **Q:** What specific output defines an "extraordinary agent"? **A:** Complexity of the prompt, including behavioral control, guardrails, and validation.
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
