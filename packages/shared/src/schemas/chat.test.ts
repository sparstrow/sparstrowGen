import { describe, expect, it } from "vitest";
import { CHAT_MESSAGE_MAX_BYTES, chatTurnRequestSchema, chatTurnStateSchema } from "./chat";

describe("chatTurnRequestSchema", () => {
  it("accepts ordinary content", () => {
    expect(chatTurnRequestSchema.safeParse({ content: "what does this repo do?" }).success).toBe(true);
  });

  // T-CS6-01 -- empty content is schema-valid (an attachment-only send must
  // be allowed); "text or an attachment, not neither" is enforced by
  // `postChatTurnAction` itself, not this schema, which nothing actually
  // `.parse()`s at runtime today (see that action's own comment).
  it("accepts empty content -- 'text or an attachment' is the action's job, not this schema's", () => {
    expect(chatTurnRequestSchema.safeParse({ content: "" }).success).toBe(true);
  });

  it("rejects content over the byte ceiling", () => {
    // A message becomes an argv-bound prompt on someone's machine (M12 plan,
    // DD-8) -- unbounded input is a spawn failure on a laptop, not a 400 here,
    // unless this clamp catches it first.
    const oversized = "a".repeat(CHAT_MESSAGE_MAX_BYTES + 1);
    expect(chatTurnRequestSchema.safeParse({ content: oversized }).success).toBe(false);
  });

  it("accepts content exactly at the byte ceiling", () => {
    const exact = "a".repeat(CHAT_MESSAGE_MAX_BYTES);
    expect(chatTurnRequestSchema.safeParse({ content: exact }).success).toBe(true);
  });

  it("measures bytes, not characters -- multi-byte content is clamped tighter", () => {
    // Each "é" is 2 bytes in UTF-8. A naive .length check would let through
    // roughly double the intended byte ceiling for non-ASCII content.
    const nearCeilingChars = CHAT_MESSAGE_MAX_BYTES; // would be within budget if measured as chars
    const multiByte = "é".repeat(nearCeilingChars);
    expect(chatTurnRequestSchema.safeParse({ content: multiByte }).success).toBe(false);
  });
});

describe("chatTurnStateSchema", () => {
  const userMessage = {
    id: "msg_1",
    sessionId: "chs_1",
    role: "user" as const,
    content: "hi",
    meta: null,
    createdAt: "2026-08-23T00:00:00.000Z",
  };

  it("accepts a waiting turn with no assistant message yet", () => {
    const result = chatTurnStateSchema.safeParse({
      id: "ct_1",
      sessionId: "chs_1",
      status: "waiting",
      waitingReason: "no_runtime_paired",
      replyText: "",
      replySeq: 0,
      provider: null,
      model: null,
      attempt: 1,
      retryOfTurnId: null,
      error: null,
      userMessage,
      assistantMessage: null,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a succeeded turn with an assistant message present", () => {
    const result = chatTurnStateSchema.safeParse({
      id: "ct_1",
      sessionId: "chs_1",
      status: "succeeded",
      waitingReason: null,
      replyText: "the whole reply",
      replySeq: 3,
      provider: "claude-code",
      model: "sonnet",
      attempt: 1,
      retryOfTurnId: null,
      error: null,
      userMessage,
      assistantMessage: { ...userMessage, id: "msg_2", role: "assistant", content: "the whole reply" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown status", () => {
    const result = chatTurnStateSchema.safeParse({
      id: "ct_1",
      sessionId: "chs_1",
      status: "queued", // not a real status -- see the four states in the spec
      waitingReason: null,
      replyText: "",
      replySeq: 0,
      provider: null,
      model: null,
      attempt: 1,
      retryOfTurnId: null,
      error: null,
      userMessage,
      assistantMessage: null,
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown waitingReason token", () => {
    const result = chatTurnStateSchema.safeParse({
      id: "ct_1",
      sessionId: "chs_1",
      status: "waiting",
      waitingReason: "machine_is_tired", // not one of the three real tokens
      replyText: "",
      replySeq: 0,
      provider: null,
      model: null,
      attempt: 1,
      retryOfTurnId: null,
      error: null,
      userMessage,
      assistantMessage: null,
    });
    expect(result.success).toBe(false);
  });
});
