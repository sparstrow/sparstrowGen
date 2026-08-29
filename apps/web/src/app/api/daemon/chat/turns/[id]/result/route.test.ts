import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * T-AM1-03. This route had NO prior test coverage at all -- `parseChatResult`
 * (chat-transcript.test.ts) proves the input validation, `chat-turn.test.ts`
 * proves the daemon's own caller, and nothing until now proved this route's
 * one real job: mapping the posted body onto the RPC's `p_*` parameters
 * correctly. That mapping is camelCase -> snake_case, easy to get backwards
 * silently (a mismatched key is just ignored by the RPC's own `default`),
 * which is exactly the kind of thing worth a regression test.
 */

const authenticateDaemon = vi.fn();
const rpc = vi.fn();
const maybeSingle = vi.fn();
const broadcastChatTurnEvents = vi.fn();

vi.mock("@web/lib/daemon/auth", () => ({
  authenticateDaemon: (...args: unknown[]) => authenticateDaemon(...args),
  daemonDb: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({ maybeSingle }),
          }),
        }),
      }),
    }),
    rpc: (...args: unknown[]) => rpc(...args),
  }),
}));

vi.mock("@web/lib/daemon/broadcast", () => ({
  broadcastChatTurnEvents: (...args: unknown[]) => broadcastChatTurnEvents(...args),
}));

beforeEach(() => {
  authenticateDaemon.mockResolvedValue({
    ok: true,
    scope: { workspaceId: "ws_1", runtimeId: "rt_1", tokenId: "tok_1" },
  });
  maybeSingle.mockResolvedValue({
    data: { id: "ct_1", session_id: "chs_1", workspace_id: "ws_1" },
    error: null,
  });
  rpc.mockResolvedValue({ data: { ok: true }, error: null });
  broadcastChatTurnEvents.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

function req(body: unknown) {
  return new Request("https://example.test/api/daemon/chat/turns/ct_1/result", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

async function callWith(body: unknown) {
  const { POST } = await import("./route");
  return POST(req(body), { params: Promise.resolve({ id: "ct_1" }) });
}

describe("POST /api/daemon/chat/turns/:id/result", () => {
  it("passes an empty p_produced array when the body carries none", async () => {
    const res = await callWith({ seq: 1, replyText: "hi", status: "succeeded" });
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("ingest_chat_turn_reply", expect.objectContaining({ p_produced: [] }));
  });

  it("maps produced[] to p_produced in snake_case, matching the p_attachments convention", async () => {
    const res = await callWith({
      seq: 1,
      replyText: "",
      status: "succeeded",
      produced: [{ storagePath: "ws_1/chs_1/op_1-chart.png", filename: "chart.png", mimeType: "image/png", sizeBytes: 123 }],
    });
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith(
      "ingest_chat_turn_reply",
      expect.objectContaining({
        p_produced: [
          { storage_path: "ws_1/chs_1/op_1-chart.png", filename: "chart.png", mime_type: "image/png", size_bytes: 123 },
        ],
      }),
    );
  });

  it("returns 401 without ever calling the RPC when the daemon token is invalid", async () => {
    authenticateDaemon.mockResolvedValue({ ok: false, failure: "unauthenticated" });
    const res = await callWith({ seq: 1, replyText: "hi", status: "succeeded" });
    expect(res.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns 404 without calling the RPC when the turn is not owned by this machine", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const res = await callWith({ seq: 1, replyText: "hi", status: "succeeded" });
    expect(res.status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns 400 and never reaches the RPC for a malformed produced entry", async () => {
    const res = await callWith({ seq: 1, replyText: "x", status: "succeeded", produced: [{ filename: "onlyName" }] });
    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
});
