import { describe, expect, it, vi } from "vitest";
import { actionContext } from "@web/lib/action-result";
import { createPipelineAction, deletePipelineAction, updatePipelineAction } from "./actions";

vi.mock("@web/lib/action-result", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@web/lib/action-result")>();
  return { ...actual, actionContext: vi.fn() };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

type Result = { data: unknown; error: unknown };

function fakeSupabase(queues: Record<string, Result[]>) {
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
      single: () => Promise.resolve(result),
      then: (resolve: (v: Result) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(result).then(resolve, reject),
    };
    return self;
  }

  return builder;
}

function mockCtx(queues: Record<string, Result[]>) {
  const supabase = { from: fakeSupabase(queues) };
  vi.mocked(actionContext).mockResolvedValue({ supabase: supabase as never, workspaceId: "ws_1" });
}

describe("createPipelineAction", () => {
  it("inserts and returns the new pipeline", async () => {
    mockCtx({ pipelines: [{ data: { id: "ppl_1", name: "research -> draft" }, error: null }] });
    const result = await createPipelineAction({
      name: "research -> draft",
      description: "",
      steps: [{ agentId: "agt_1", promptTemplate: "{{trigger_prompt}}", onFailure: "abort", position: 0 }],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.id).toBe("ppl_1");
  });

  /**
   * `pipelines` (`packages/shared/src/db/schema.ts`) has no `steps` column —
   * steps live in a separate `pipeline_steps` table this handler never wrote
   * to, in the REST route this action replaces or here. Passing `steps`
   * straight into the `pipelines` insert has always been rejected by
   * PostgREST as an unknown column. Converting byte-for-byte preserves that
   * failure rather than fixing it (plan Scope boundaries) — this test
   * documents the existing shape of that failure so a future fix has a
   * regression test to flip green. See `doc/bug/` for the filed report.
   */
  it("surfaces the pre-existing unknown-column failure for the steps field", async () => {
    mockCtx({
      pipelines: [
        {
          data: null,
          error: { code: "PGRST204", message: "Could not find the 'steps' column of 'pipelines'" },
        },
      ],
    });
    const result = await createPipelineAction({
      name: "research -> draft",
      description: "",
      steps: [{ agentId: "agt_1", promptTemplate: "{{trigger_prompt}}", onFailure: "abort", position: 0 }],
    });
    expect(result.ok).toBe(false);
  });
});

describe("updatePipelineAction", () => {
  it("toggles enabled without requiring steps", async () => {
    mockCtx({ pipelines: [{ data: { id: "ppl_1", enabled: false }, error: null }] });
    const result = await updatePipelineAction("ppl_1", { enabled: false });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.enabled).toBe(false);
  });
});

describe("deletePipelineAction", () => {
  it("reports Not Found when nothing matched", async () => {
    mockCtx({ pipelines: [{ data: [], error: null }] });
    const result = await deletePipelineAction("ppl_missing");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("Not Found");
  });

  it("succeeds when a row was actually deleted", async () => {
    mockCtx({ pipelines: [{ data: [{ id: "ppl_1" }], error: null }] });
    const result = await deletePipelineAction("ppl_1");
    expect(result.ok).toBe(true);
  });
});
