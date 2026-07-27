import { describe, expect, it } from "vitest";
import { shouldShowPendingBubble } from "./chat-pending.js";

const user = { role: "user" as const };
const assistant = { role: "assistant" as const };

describe("shouldShowPendingBubble — intake 0008 (message shown twice)", () => {
  it("hides the optimistic bubble once the server's user row has arrived", () => {
    // The mid-turn refetch returned a transcript that already ends with the
    // user message the optimistic bubble is still rendering. Showing both is
    // the duplication the user reported.
    expect(shouldShowPendingBubble([assistant, user], "How is life")).toBe(false);
  });

  it("hides it for the first message of a fresh session once persisted", () => {
    expect(shouldShowPendingBubble([user], "How is life")).toBe(false);
  });

  it("still shows it before the server has persisted anything", () => {
    expect(shouldShowPendingBubble([], "How is life")).toBe(true);
  });

  it("still shows it while the previous turn is fully answered", () => {
    expect(shouldShowPendingBubble([user, assistant], "next question")).toBe(true);
  });

  it("shows nothing when there is no pending content", () => {
    expect(shouldShowPendingBubble([], "")).toBe(false);
    expect(shouldShowPendingBubble([], null)).toBe(false);
  });
});
