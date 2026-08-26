import { describe, expect, it, vi } from "vitest";
import { actionContext } from "@web/lib/action-result";
import { createCronJobAction, deleteCronJobAction, updateCronJobAction } from "./actions";

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

describe("createCronJobAction", () => {
  it("inserts and returns the new cron job", async () => {
    mockCtx({
      cron_jobs: [{ data: { id: "crn_1", name: "Morning brief", enabled: true }, error: null }],
    });
    const result = await createCronJobAction({
      name: "Morning brief",
      cronExpr: "0 9 * * *",
      targetType: "agent",
      targetId: "agt_1",
      prompt: "Summarize overnight activity",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.id).toBe("crn_1");
  });
});

describe("updateCronJobAction", () => {
  it("toggles enabled without requiring the other fields", async () => {
    mockCtx({ cron_jobs: [{ data: { id: "crn_1", enabled: false }, error: null }] });
    const result = await updateCronJobAction("crn_1", { enabled: false });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.enabled).toBe(false);
  });
});

describe("deleteCronJobAction", () => {
  it("reports Not Found when nothing matched (unknown id or another workspace's row)", async () => {
    mockCtx({ cron_jobs: [{ data: [], error: null }] });
    const result = await deleteCronJobAction("crn_missing");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("Not Found");
  });

  it("succeeds when a row was actually deleted", async () => {
    mockCtx({ cron_jobs: [{ data: [{ id: "crn_1" }], error: null }] });
    const result = await deleteCronJobAction("crn_1");
    expect(result.ok).toBe(true);
  });
});
