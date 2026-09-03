import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * T-AM1-01. The route's own contract: a foreign-workspace path is refused
 * with 403 before any storage call is made — this is the boundary the
 * route's own header calls out as more important than the read side, since
 * `daemonDb()` is service-role and bypasses RLS entirely.
 */

const authenticateRuntime = vi.fn();
vi.mock("@web/lib/daemon/auth", () => ({
  authenticateRuntime: (...args: unknown[]) => authenticateRuntime(...args),
  daemonDb: () => daemonDbMock,
}));

const createSignedUploadUrl = vi.fn();
const daemonDbMock = {
  storage: {
    from: () => ({ createSignedUploadUrl }),
  },
};

beforeEach(() => {
  authenticateRuntime.mockResolvedValue({
    ok: true,
    scope: { workspaceId: "ws_1", runtimeId: "rt_1", tokenId: "tok_1" },
  });
  createSignedUploadUrl.mockResolvedValue({
    data: { signedUrl: "https://example.test/signed", token: "upload-token", path: "ws_1/chs_1/op_1-chart.png" },
    error: null,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

function req(body: unknown) {
  return new Request("https://example.test/api/daemon/chat/attachments/sign-upload", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/daemon/chat/attachments/sign-upload", () => {
  it("returns 401 when there is no valid daemon token", async () => {
    authenticateRuntime.mockResolvedValue({ ok: false, failure: "unauthenticated" });
    const { POST } = await import("./route");
    const res = await POST(req({ storagePath: "ws_1/chs_1/op_1-chart.png" }));
    expect(res.status).toBe(401);
    expect(createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("returns 400 when storagePath is missing", async () => {
    const { POST } = await import("./route");
    const res = await POST(req({}));
    expect(res.status).toBe(400);
    expect(createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("refuses a path outside the caller's workspace with 403, and mints no URL", async () => {
    const { POST } = await import("./route");
    const res = await POST(req({ storagePath: "ws_OTHER/chs_1/op_1-chart.png" }));
    expect(res.status).toBe(403);
    expect(createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("mints an upload URL for a path inside the caller's own workspace", async () => {
    const { POST } = await import("./route");
    const res = await POST(req({ storagePath: "ws_1/chs_1/op_1-chart.png" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { signedUrl: string; token: string };
    expect(body.signedUrl).toBe("https://example.test/signed");
    expect(body.token).toBe("upload-token");
    expect(createSignedUploadUrl).toHaveBeenCalledWith("ws_1/chs_1/op_1-chart.png");
  });

  it("returns 500 when storage refuses to sign", async () => {
    createSignedUploadUrl.mockResolvedValue({ data: null, error: { message: "boom" } });
    const { POST } = await import("./route");
    const res = await POST(req({ storagePath: "ws_1/chs_1/op_1-chart.png" }));
    expect(res.status).toBe(500);
  });
});
