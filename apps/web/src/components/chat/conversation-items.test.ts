import { describe, expect, it } from "vitest";
import { filterSentAttachments, groupProducedAttachments } from "./conversation-items";
import type { SessionAttachment } from "@web/lib/chat-attachments";

/**
 * T-AM4-01 (US3). `groupProducedAttachments`/`filterSentAttachments` are
 * plain functions taking `SessionAttachment[]` — no React rendering needed,
 * consistent with this repo having zero `@testing-library/react` anywhere
 * (confirmed by every earlier task in this band). The four-case table from
 * this task's own doc is asserted here at the data layer; `T-AM4-02`'s live
 * pass is what proves the rendered result.
 */

function row(over: Partial<SessionAttachment> = {}): SessionAttachment {
  return {
    id: "cma_1",
    storagePath: "ws_1/chs_1/op_1-chart.png",
    filename: "chart.png",
    mimeType: "image/png",
    sizeBytes: 1024,
    createdAt: "2026-08-29T00:00:00Z",
    messageId: "msg_1",
    messageRole: "assistant",
    precedingUserContent: "make me a chart",
    ...over,
  };
}

describe("groupProducedAttachments", () => {
  it("excludes role: user rows -- the split this whole task exists to draw", () => {
    const rows = [row({ messageRole: "user", messageId: "msg_user_1", id: "cma_sent" })];
    expect(groupProducedAttachments(rows)).toHaveLength(0);
  });

  it("still groups role: assistant rows normally", () => {
    const rows = [row()];
    const groups = groupProducedAttachments(rows);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.attachments).toHaveLength(1);
  });

  it("groups a mix of both roles, keeping only the assistant ones", () => {
    const rows = [
      row({ id: "cma_a", messageId: "msg_a", messageRole: "assistant" }),
      row({ id: "cma_u", messageId: "msg_u", messageRole: "user" }),
    ];
    const groups = groupProducedAttachments(rows);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.attachments[0]!.id).toBe("cma_a");
  });
});

describe("filterSentAttachments", () => {
  it("returns only role: user rows", () => {
    const rows = [
      row({ id: "cma_a", messageRole: "assistant" }),
      row({ id: "cma_u", messageRole: "user" }),
    ];
    const sent = filterSentAttachments(rows);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.id).toBe("cma_u");
  });

  it("returns an empty array when there are no user rows", () => {
    expect(filterSentAttachments([row({ messageRole: "assistant" })])).toHaveLength(0);
  });

  it("preserves order (newest-first, per sessionAttachments()'s own contract)", () => {
    const rows = [
      row({ id: "cma_newer", messageRole: "user", createdAt: "2026-08-29T02:00:00Z" }),
      row({ id: "cma_older", messageRole: "user", createdAt: "2026-08-29T01:00:00Z" }),
    ];
    const sent = filterSentAttachments(rows);
    expect(sent.map((a) => a.id)).toEqual(["cma_newer", "cma_older"]);
  });

  it("maps to the ChatMessageAttachment shape, dropping session-only fields", () => {
    const sent = filterSentAttachments([row({ messageRole: "user" })]);
    expect(sent[0]).toEqual({
      id: "cma_1",
      storagePath: "ws_1/chs_1/op_1-chart.png",
      filename: "chart.png",
      mimeType: "image/png",
      sizeBytes: 1024,
    });
  });
});

describe("the four-case table (T-AM4-01's own doc)", () => {
  const produced = row({ id: "cma_p", messageRole: "assistant" });
  const sent = row({ id: "cma_s", messageRole: "user" });

  it("both non-empty: both functions return their own rows", () => {
    const rows = [produced, sent];
    expect(groupProducedAttachments(rows)).toHaveLength(1);
    expect(filterSentAttachments(rows)).toHaveLength(1);
  });

  it("produced empty, sent non-empty: groups is [], sent has one", () => {
    const rows = [sent];
    expect(groupProducedAttachments(rows)).toHaveLength(0);
    expect(filterSentAttachments(rows)).toHaveLength(1);
  });

  it("produced non-empty, sent empty: groups has one, sent is []", () => {
    const rows = [produced];
    expect(groupProducedAttachments(rows)).toHaveLength(1);
    expect(filterSentAttachments(rows)).toHaveLength(0);
  });

  it("both empty: both functions return empty arrays -- the caller falls through to AM3's whole-panel empty state", () => {
    expect(groupProducedAttachments([])).toHaveLength(0);
    expect(filterSentAttachments([])).toHaveLength(0);
  });
});
