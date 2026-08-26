import { describe, expect, it, vi } from "vitest";
import { actionContext } from "@web/lib/action-result";
import {
  createAgentAction,
  deleteAgentAction,
  setAgentSkillsAction,
  updateAgentAction,
} from "./actions";

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

describe("createAgentAction", () => {
  it("inserts with a derived slug", async () => {
    mockCtx({ agents: [{ data: { id: "agt_1", name: "Researcher", slug: "researcher" }, error: null }] });
    const result = await createAgentAction({ name: "Researcher" } as never);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.slug).toBe("researcher");
  });

  it("retries once with a collision suffix on a unique violation", async () => {
    mockCtx({
      agents: [
        { data: null, error: { code: "23505", message: "duplicate key" } },
        { data: { id: "agt_2", name: "Researcher", slug: "researcher-ab12" }, error: null },
      ],
    });
    const result = await createAgentAction({ name: "Researcher" } as never);
    expect(result.ok).toBe(true);
  });
});

describe("updateAgentAction", () => {
  it("toggles enabled", async () => {
    mockCtx({ agents: [{ data: { id: "agt_1", enabled: false }, error: null }] });
    const result = await updateAgentAction("agt_1", { enabled: false });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.enabled).toBe(false);
  });
});

describe("deleteAgentAction", () => {
  it("reports Not Found when nothing matched", async () => {
    mockCtx({ agents: [{ data: [], error: null }] });
    const result = await deleteAgentAction("agt_missing");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("Not Found");
  });
});

describe("setAgentSkillsAction", () => {
  it("replaces the assignment set: deletes then inserts the new ids", async () => {
    mockCtx({
      agent_skills: [
        { data: null, error: null }, // delete
        { data: null, error: null }, // insert
      ],
    });
    const result = await setAgentSkillsAction("agt_1", ["skl_1", "skl_2"]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.success).toBe(true);
  });

  it("skips the insert when clearing all skills", async () => {
    mockCtx({ agent_skills: [{ data: null, error: null }] });
    const result = await setAgentSkillsAction("agt_1", []);
    expect(result.ok).toBe(true);
  });
});
