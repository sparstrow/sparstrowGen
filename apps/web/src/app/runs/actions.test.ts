import { describe, expect, it, vi } from "vitest";
import { actionContext } from "@web/lib/action-result";
import { cancelRunAction, createRunAction } from "./actions";

vi.mock("@web/lib/action-result", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@web/lib/action-result")>();
  return { ...actual, actionContext: vi.fn() };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

type Result = { data: unknown; error: unknown };

function mockCtx(rpcResult: Result) {
  const supabase = { rpc: () => Promise.resolve(rpcResult) };
  vi.mocked(actionContext).mockResolvedValue({ supabase: supabase as never, workspaceId: "ws_1" });
}

describe("createRunAction", () => {
  it("rejects a missing agentId before calling start_run", async () => {
    mockCtx({ data: null, error: null });
    const result = await createRunAction({ agentId: "", prompt: "hello" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe("agent_not_found");
  });

  it("rejects a blank prompt before calling start_run", async () => {
    mockCtx({ data: null, error: null });
    const result = await createRunAction({ agentId: "agt_1", prompt: "   " });
    expect(result.ok).toBe(false);
  });

  it("returns the started run on success", async () => {
    mockCtx({ data: { id: "run_1", agent_id: "agt_1", status: "queued" }, error: null });
    const result = await createRunAction({ agentId: "agt_1", prompt: "do the thing" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.id).toBe("run_1");
  });

  it("maps a start_run SQLSTATE failure to its reason token", async () => {
    mockCtx({ data: null, error: { code: "SPG12", message: "No machine is online." } });
    const result = await createRunAction({ agentId: "agt_1", prompt: "do the thing" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.field).toBe("no_runtime_available");
      expect(result.error).toBe("No machine is online.");
    }
  });
});

describe("cancelRunAction", () => {
  it("returns the (possibly unchanged) run on success", async () => {
    mockCtx({ data: { id: "run_1", status: "cancelled" }, error: null });
    const result = await cancelRunAction("run_1");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.status).toBe("cancelled");
  });

  it("maps a cancel_run SQLSTATE failure to its reason token", async () => {
    mockCtx({ data: null, error: { code: "SPG15", message: "That run does not exist." } });
    const result = await cancelRunAction("run_missing");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe("run_not_found");
  });
});
