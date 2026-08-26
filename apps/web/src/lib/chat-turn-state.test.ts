import { describe, expect, it } from "vitest";
import type { ChatTurnBroadcast, ChatTurnState } from "@sparstrow/shared";
import {
  applyChatTurnBroadcast,
  applyChatTurnState,
  isBroadcastForHeldTurn,
  isTurnBusy,
} from "./chat-turn-state.js";

const msg = (id: string, role: "user" | "assistant", content: string) => ({
  id,
  sessionId: "chs_1",
  role,
  content,
  meta: null,
  createdAt: "2026-08-23T00:00:00Z",
});

function turn(overrides: Partial<ChatTurnState> = {}): ChatTurnState {
  return {
    id: "ct_1",
    sessionId: "chs_1",
    status: "in_progress",
    waitingReason: null,
    replyText: "",
    replySeq: 0,
    provider: "claude-code",
    model: "sonnet",
    attempt: 1,
    retryOfTurnId: null,
    error: null,
    userMessage: msg("msg_1", "user", "hi"),
    assistantMessage: null,
    ...overrides,
  };
}

describe("applyChatTurnState", () => {
  it("takes the incoming turn when nothing is held yet", () => {
    const incoming = turn();
    expect(applyChatTurnState(null, incoming)).toBe(incoming);
  });

  it("takes the incoming turn outright when it's a DIFFERENT turn id (retry, or session switch)", () => {
    const current = turn({ id: "ct_1", replySeq: 10, status: "succeeded" });
    const incoming = turn({ id: "ct_2", replySeq: 0, status: "waiting" });
    expect(applyChatTurnState(current, incoming)).toBe(incoming);
  });

  it("for the SAME turn id, takes the incoming state only if it's at least as far along", () => {
    const current = turn({ replySeq: 5, replyText: "five" });
    const behind = turn({ replySeq: 3, replyText: "three" });
    // A stale GET refetch racing a newer streamed delta must not regress
    // what's already rendered.
    expect(applyChatTurnState(current, behind)).toBe(current);

    const ahead = turn({ replySeq: 7, replyText: "seven" });
    expect(applyChatTurnState(current, ahead)).toBe(ahead);
  });

  it("accepts an equal replySeq (e.g. a terminal POST response confirming the last delta)", () => {
    const current = turn({ replySeq: 5, status: "in_progress" });
    const terminal = turn({ replySeq: 5, status: "succeeded" });
    expect(applyChatTurnState(current, terminal)).toBe(terminal);
  });
});

describe("isBroadcastForHeldTurn / applyChatTurnBroadcast", () => {
  const broadcast = (over: Partial<ChatTurnBroadcast> = {}): ChatTurnBroadcast => ({
    turnId: "ct_1",
    events: [{ seq: 1, replyText: "Hello" }],
    status: "running",
    ...over,
  });

  it("is false, and a no-op, when nothing is held", () => {
    expect(isBroadcastForHeldTurn(null, broadcast())).toBe(false);
    expect(applyChatTurnBroadcast(null, broadcast())).toBeNull();
  });

  it("is false, and a no-op, for a DIFFERENT turn id — no userMessage to build one from", () => {
    // The session topic outlives any single turn (chatTurnTopic's own doc
    // comment), so this is a real case: a retry fired from another tab.
    const current = turn();
    const other = broadcast({ turnId: "ct_other" });
    expect(isBroadcastForHeldTurn(current, other)).toBe(false);
    expect(applyChatTurnBroadcast(current, other)).toBe(current);
  });

  it("applies the highest-seq event out of an out-of-order batch", () => {
    const current = turn({ replySeq: 0, replyText: "" });
    const delta = broadcast({
      events: [
        { seq: 2, replyText: "Hello there" },
        { seq: 1, replyText: "Hello" },
      ],
    });
    const next = applyChatTurnBroadcast(current, delta);
    expect(next?.replyText).toBe("Hello there");
    expect(next?.replySeq).toBe(2);
  });

  it("is a no-op for an already-seen (replayed) batch", () => {
    const current = turn({ replySeq: 5, replyText: "already this far" });
    const stale = broadcast({ events: [{ seq: 3, replyText: "behind" }] });
    expect(applyChatTurnBroadcast(current, stale)).toBe(current);
  });

  it("maps broadcast status 'running' to ChatTurnState's 'in_progress'", () => {
    const current = turn({ status: "waiting", replySeq: 0 });
    const next = applyChatTurnBroadcast(current, broadcast({ status: "running" }));
    expect(next?.status).toBe("in_progress");
  });

  it("passes 'succeeded'/'failed' through, and carries an error when present", () => {
    const current = turn({ replySeq: 1, replyText: "partial" });
    const next = applyChatTurnBroadcast(
      current,
      broadcast({ status: "failed", error: "the CLI exited with code 1", events: [{ seq: 2, replyText: "partial" }] }),
    );
    expect(next?.status).toBe("failed");
    expect(next?.error).toBe("the CLI exited with code 1");
  });
});

describe("isTurnBusy", () => {
  it("is false when there is no turn", () => {
    expect(isTurnBusy(null)).toBe(false);
  });

  it("is true for waiting and in_progress", () => {
    expect(isTurnBusy(turn({ status: "waiting" }))).toBe(true);
    expect(isTurnBusy(turn({ status: "in_progress" }))).toBe(true);
  });

  it("is false once terminal", () => {
    expect(isTurnBusy(turn({ status: "succeeded" }))).toBe(false);
    expect(isTurnBusy(turn({ status: "failed" }))).toBe(false);
  });
});
