import { describe, expect, it } from "vitest";
import type { ChatMessage, ChatSession, ChatTurn } from "@sparstrow/shared";
import { asTurnState, respondWithTurn } from "./chat.js";

/**
 * T-M13-02 -- the local host answers `POST /chat/sessions/:id/messages` and
 * `.../retry` in the same async contract the cloud path uses (DD-7,
 * narrowed). These test the pure mapping directly; the routes themselves are
 * one line each (`respondWithTurn(await postChatTurn(...))`) and are proved
 * end-to-end by `chat/service.test.ts` plus the running-daemon check in
 * T-M13-05.
 */

const ts = "2026-08-23T00:00:00Z";

function session(overrides: Partial<ChatSession> = {}): ChatSession {
  return {
    id: "chs_1",
    kind: "free",
    title: "",
    projectId: null,
    agentId: null,
    provider: "claude-code",
    model: "sonnet",
    status: "active",
    draft: null,
    lastMessageAt: null,
    createdAt: ts,
    updatedAt: ts,
    ...overrides,
  };
}

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "msg_1",
    sessionId: "chs_1",
    role: "user",
    content: "hi",
    meta: null,
    createdAt: ts,
    attachments: [],
    ...overrides,
  };
}

describe("asTurnState", () => {
  it("maps a succeeded turn: id from the assistant message, status succeeded, reply attached", () => {
    const turn: ChatTurn = {
      session: session(),
      userMessage: message({ id: "msg_user", content: "what does this repo do?" }),
      assistantMessage: message({ id: "msg_assistant", role: "assistant", content: "It's an agent platform." }),
      error: null,
      draftTurn: null,
    };

    const state = asTurnState(turn);

    expect(state.id).toBe("msg_assistant");
    expect(state.sessionId).toBe("chs_1");
    expect(state.status).toBe("succeeded");
    expect(state.waitingReason).toBeNull();
    expect(state.replyText).toBe("It's an agent platform.");
    expect(state.replySeq).toBe(0);
    expect(state.provider).toBe("claude-code");
    expect(state.model).toBe("sonnet");
    expect(state.error).toBeNull();
    expect(state.userMessage).toBe(turn.userMessage);
    expect(state.assistantMessage).toBe(turn.assistantMessage);
  });

  it("maps a failed turn: id falls back to the user message, status failed, error flattened to its reason", () => {
    const turn: ChatTurn = {
      session: session(),
      userMessage: message({ id: "msg_user" }),
      assistantMessage: null,
      error: { kind: "provider", reason: "the CLI exited with code 1", attempts: 1, fallback: null },
      draftTurn: null,
    };

    const state = asTurnState(turn);

    expect(state.id).toBe("msg_user");
    expect(state.status).toBe("failed");
    expect(state.replyText).toBe("");
    expect(state.assistantMessage).toBeNull();
    expect(state.error).toBe("the CLI exited with code 1");
  });

  it("carries the session's own provider/model, not a hardcoded default", () => {
    const turn: ChatTurn = {
      session: session({ kind: "agent", provider: "anthropic-api", model: "opus" }),
      userMessage: message(),
      assistantMessage: message({ id: "msg_2", role: "assistant", content: "ok" }),
      error: null,
      draftTurn: null,
    };

    const state = asTurnState(turn);
    expect(state.provider).toBe("anthropic-api");
    expect(state.model).toBe("opus");
  });
});

describe("respondWithTurn", () => {
  it("wraps a free/project/agent turn in ChatTurnState", () => {
    const turn: ChatTurn = {
      session: session({ kind: "project" }),
      userMessage: message(),
      assistantMessage: message({ id: "msg_2", role: "assistant", content: "ok" }),
      error: null,
      draftTurn: null,
    };

    const result = respondWithTurn(turn);
    expect(result).not.toBe(turn);
    expect((result as any).status).toBe("succeeded");
    expect((result as any).replyText).toBe("ok");
  });

  it("leaves an agent-creator turn's ChatTurn shape (draftTurn and all) untouched", () => {
    const turn: ChatTurn = {
      session: session({ kind: "agent-creator" }),
      userMessage: message(),
      assistantMessage: message({ id: "msg_2", role: "assistant", content: "Tell me more." }),
      error: null,
      draftTurn: {
        draft: { name: "spec-writer" },
        matches: [],
        followups: ["What tools should it have?"],
        source: "ai",
      } as any,
    };

    // Same object back, not merely equal -- proves asTurnState was never
    // reached for this session kind.
    expect(respondWithTurn(turn)).toBe(turn);
  });
});
