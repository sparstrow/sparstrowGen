import { describe, expect, it, vi } from "vitest";
import { actionContext } from "@web/lib/action-result";
import { cancelGoalAction, retryNodeAction } from "./actions";

/**
 * `OQ-8` and the surrounding phase decisions explain why these two exist and
 * `useCancelNode` doesn't: see this file's siblings for the reasoning.
 * `retryNodeAction` delegates to `runTaskAction` (`../actions.ts`), which was
 * already proven live in `T-WA-04`'s own manual verification pass (the RPC
 * call, the park-status fallback, the re-read) — these tests only need to
 * confirm the node -> task resolution wires into it correctly, not re-prove
 * `start_run`'s own behavior.
 */

vi.mock("@web/lib/action-result", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@web/lib/action-result")>();
  return { ...actual, actionContext: vi.fn() };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

type Result = { data: unknown; error: unknown };

function fakeSupabase(queues: Record<string, Result[]>, rpcResult: Result = { data: null, error: null }) {
  const calls: Record<string, number> = {};

  function builder(table: string) {
    const queue = queues[table] ?? [];
    const idx = calls[table] ?? 0;
    calls[table] = idx + 1;
    const result: Result = queue[idx] ?? { data: null, error: null };
    const self: Record<string, unknown> = {
      select: () => self,
      update: () => self,
      insert: () => self,
      delete: () => self,
      eq: () => self,
      is: () => self,
      order: () => self,
      single: () => Promise.resolve(result),
      then: (resolve: (v: Result) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(result).then(resolve, reject),
    };
    return self;
  }

  return { from: builder, rpc: () => Promise.resolve(rpcResult) };
}

function mockCtx(queues: Record<string, Result[]>, rpcResult?: Result) {
  const supabase = fakeSupabase(queues, rpcResult);
  vi.mocked(actionContext).mockResolvedValue({ supabase: supabase as never, workspaceId: "ws_1" });
}

describe("cancelGoalAction", () => {
  it("flips the goal to cancelled via the same generic update pause/resume/replan already use", async () => {
    mockCtx({ goals: [{ data: { id: "gol_1", status: "cancelled" }, error: null }] });
    const result = await cancelGoalAction("gol_1");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.status).toBe("cancelled");
  });
});

describe("retryNodeAction", () => {
  it("resolves the node to its linked task and respawns it", async () => {
    mockCtx(
      {
        plan_nodes: [{ data: { task_id: "tsk_9" }, error: null }],
        tasks: [
          { data: { id: "tsk_9", assigned_agent_id: "agt_1", title: "t", description: "" }, error: null }, // runTaskAction's read
          { data: { id: "tsk_9", status: "in_progress" }, error: null }, // runTaskAction's re-read after start_run
        ],
      },
      { data: { id: "run_1" }, error: null },
    );
    const result = await retryNodeAction("gol_1", "pln_1");
    expect(result.ok).toBe(true);
  });

  it("fails cleanly when the node has no linked task", async () => {
    mockCtx({ plan_nodes: [{ data: { task_id: null }, error: null }] });
    const result = await retryNodeAction("gol_1", "pln_2");
    expect(result.ok).toBe(false);
  });
});
