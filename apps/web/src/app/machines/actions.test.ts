import { describe, expect, it, vi } from "vitest";
import { actionContext } from "@web/lib/action-result";
import {
  addAgentMachineRestrictionAction,
  cloneProjectAction,
  getRuntimeActivityAction,
  getRuntimeAgentRestrictionsAction,
  getRuntimeRemovalImpactAction,
  getRuntimeUsageAction,
  relinkProjectAction,
  removeAgentMachineRestrictionAction,
  removeRuntimeAction,
  renameRuntimeAction,
  revokeRuntimeTokenAction,
  setRuntimeCostBudgetAction,
  setRuntimeSettingAction,
  unbindProjectAction,
} from "./actions";

vi.mock("@web/lib/action-result", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@web/lib/action-result")>();
  return { ...actual, actionContext: vi.fn() };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

type Result = { data: unknown; error: unknown; count?: number };

/** Same shape as the other WA-phase action tests' `fakeSupabase(queues)`,
 *  extended with `.upsert()`/`.is()` for the runtime-project and token
 *  routes this file exercises, and `.gte()`/`.order()`/`.limit()`/`.in()`
 *  for the usage/activity/restriction queries added alongside `DD-017`'s
 *  real feature build — `count` on `Result` backs the removal-impact
 *  head-count query. */
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
      upsert: () => self,
      eq: () => self,
      is: () => self,
      gte: () => self,
      order: () => self,
      limit: () => self,
      in: () => self,
      maybeSingle: () => Promise.resolve(result),
      single: () => Promise.resolve(result),
      then: (resolve: (v: Result) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(result).then(resolve, reject),
    };
    return self;
  }

  return builder;
}

function mockCtx(queues: Record<string, Result[]>, opts: { user?: boolean } = {}) {
  const supabase = {
    from: fakeSupabase(queues),
    auth: {
      async getUser() {
        return { data: { user: opts.user === false ? null : { id: "u_1" } } };
      },
    },
  };
  vi.mocked(actionContext).mockResolvedValue({ supabase: supabase as never, workspaceId: "ws_1" });
}

describe("renameRuntimeAction", () => {
  it("rejects a blank name before writing", async () => {
    mockCtx({});
    const result = await renameRuntimeAction("rt_1", "   ");
    expect(result.ok).toBe(false);
  });

  it("renames and returns the updated row", async () => {
    mockCtx({ runtimes: [{ data: { id: "rt_1", name: "New name" }, error: null }] });
    const result = await renameRuntimeAction("rt_1", "New name");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.name).toBe("New name");
  });
});

describe("revokeRuntimeTokenAction", () => {
  it("fails when nothing was revoked (no active pairing, or RLS hid it)", async () => {
    mockCtx({ daemon_tokens: [{ data: [], error: null }] });
    const result = await revokeRuntimeTokenAction("rt_1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/No active pairing/);
  });

  it("revokes an active token", async () => {
    mockCtx({ daemon_tokens: [{ data: [{ id: "dt_1" }], error: null }] });
    const result = await revokeRuntimeTokenAction("rt_1");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.revoked).toBe(1);
  });
});

describe("removeRuntimeAction", () => {
  it("fails when the runtime does not exist (or is another workspace's)", async () => {
    mockCtx({ runtimes: [{ data: [], error: null }] });
    const result = await removeRuntimeAction("rt_missing");
    expect(result.ok).toBe(false);
  });

  it("removes an existing runtime", async () => {
    mockCtx({ runtimes: [{ data: [{ id: "rt_1" }], error: null }] });
    const result = await removeRuntimeAction("rt_1");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.deleted).toBe(1);
  });
});

describe("setRuntimeSettingAction", () => {
  it("rejects a key outside the daemon allowlist before touching the database", async () => {
    mockCtx({});
    const result = await setRuntimeSettingAction("rt_1", "not.a.real.key", "on");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe("setting_not_allowed");
  });

  it("refuses an offline machine rather than queuing a command it cannot deliver", async () => {
    mockCtx({
      runtimes: [{ data: { id: "rt_1", name: "Laptop", last_heartbeat: null }, error: null }],
    });
    const result = await setRuntimeSettingAction("rt_1", "git.wipSnapshot", "on");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe("runtime_offline");
  });

  it("queues the command for an online machine without echoing the value as applied", async () => {
    mockCtx({
      runtimes: [
        {
          data: { id: "rt_1", name: "Laptop", last_heartbeat: new Date().toISOString() },
          error: null,
        },
      ],
      runtime_commands: [{ data: null, error: null }],
    });
    const result = await setRuntimeSettingAction("rt_1", "git.wipSnapshot", "on");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual({ queued: true });
  });

  it("treats a duplicate idempotency key as already-queued, not a failure", async () => {
    mockCtx({
      runtimes: [
        {
          data: { id: "rt_1", name: "Laptop", last_heartbeat: new Date().toISOString() },
          error: null,
        },
      ],
      runtime_commands: [{ data: null, error: { code: "23505", message: "duplicate" } }],
    });
    const result = await setRuntimeSettingAction("rt_1", "git.wipSnapshot", "on");
    expect(result.ok).toBe(true);
  });
});

describe("relinkProjectAction", () => {
  it("rejects a blank path", async () => {
    mockCtx({});
    const result = await relinkProjectAction("rt_1", "prj_1", "   ");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe("invalid_request");
  });

  it("upserts the binding as bound", async () => {
    mockCtx({
      runtime_projects: [
        { data: [{ runtime_id: "rt_1", project_id: "prj_1", state: "bound" }], error: null },
      ],
    });
    const result = await relinkProjectAction("rt_1", "prj_1", "D:\\code\\my-project");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.state).toBe("bound");
  });
});

describe("unbindProjectAction", () => {
  it("fails when nothing matched", async () => {
    mockCtx({ runtime_projects: [{ data: [], error: null }] });
    const result = await unbindProjectAction("rt_1", "prj_1");
    expect(result.ok).toBe(false);
  });

  it("unbinds an existing binding", async () => {
    mockCtx({ runtime_projects: [{ data: [{ project_id: "prj_1" }], error: null }] });
    const result = await unbindProjectAction("rt_1", "prj_1");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.unbound).toBe(1);
  });
});

describe("cloneProjectAction", () => {
  it("refuses a project with no git remote", async () => {
    mockCtx({
      projects: [{ data: { id: "prj_1", slug: "p", git_remote: null }, error: null }],
    });
    const result = await cloneProjectAction("rt_1", "prj_1", "D:\\code\\my-project");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe("no_git_remote");
  });

  it("refuses an offline machine", async () => {
    mockCtx({
      projects: [
        { data: { id: "prj_1", slug: "p", git_remote: "git@example.com:p.git" }, error: null },
      ],
      runtimes: [{ data: { id: "rt_1", name: "Laptop", last_heartbeat: null }, error: null }],
    });
    const result = await cloneProjectAction("rt_1", "prj_1", "D:\\code\\my-project");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe("runtime_offline");
  });

  it("queues the clone for an online machine with a remote", async () => {
    mockCtx({
      projects: [
        { data: { id: "prj_1", slug: "p", git_remote: "git@example.com:p.git" }, error: null },
      ],
      runtimes: [
        {
          data: { id: "rt_1", name: "Laptop", last_heartbeat: new Date().toISOString() },
          error: null,
        },
      ],
      runtime_commands: [{ data: null, error: null }],
    });
    const result = await cloneProjectAction("rt_1", "prj_1", "D:\\code\\my-project");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual({ queued: true });
  });
});

describe("getRuntimeRemovalImpactAction", () => {
  it("reports zero when nothing restricts an agent to this machine", async () => {
    mockCtx({ agent_machine_restrictions: [{ data: null, error: null, count: 0 }] });
    const result = await getRuntimeRemovalImpactAction("rt_1");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.agentRestrictions).toBe(0);
  });

  it("reports the count that would cascade", async () => {
    mockCtx({ agent_machine_restrictions: [{ data: null, error: null, count: 2 }] });
    const result = await getRuntimeRemovalImpactAction("rt_1");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.agentRestrictions).toBe(2);
  });
});

describe("getRuntimeUsageAction", () => {
  it("fails when the runtime does not exist", async () => {
    mockCtx({ runtimes: [{ data: null, error: null }] });
    const result = await getRuntimeUsageAction("rt_missing");
    expect(result.ok).toBe(false);
  });

  it("sums this month's runs in JS and carries the budget through", async () => {
    mockCtx({
      runtimes: [{ data: { monthly_cost_budget_usd: 10 }, error: null }],
      runs: [
        {
          data: [
            { cost_usd: 1.5, duration_ms: 2000 },
            { cost_usd: 2.25, duration_ms: 4000 },
            { cost_usd: null, duration_ms: null },
          ],
          error: null,
        },
      ],
    });
    const result = await getRuntimeUsageAction("rt_1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.monthToDateCostUsd).toBeCloseTo(3.75);
      expect(result.data.runCountThisMonth).toBe(3);
      expect(result.data.avgDurationMs).toBe(3000);
      expect(result.data.budgetUsd).toBe(10);
      expect(result.data.truncated).toBe(false);
    }
  });
});

describe("setRuntimeCostBudgetAction", () => {
  it("rejects a negative budget", async () => {
    mockCtx({});
    const result = await setRuntimeCostBudgetAction("rt_1", -5);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe("invalid_budget");
  });

  it("clears the budget with null", async () => {
    mockCtx({ runtimes: [{ data: null, error: null }] });
    const result = await setRuntimeCostBudgetAction("rt_1", null);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.budgetUsd).toBeNull();
  });

  it("sets a positive budget", async () => {
    mockCtx({ runtimes: [{ data: null, error: null }] });
    const result = await setRuntimeCostBudgetAction("rt_1", 25);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.budgetUsd).toBe(25);
  });
});

describe("getRuntimeActivityAction", () => {
  it("returns an empty list without querying agents when there are no runs", async () => {
    mockCtx({ runs: [{ data: [], error: null }] });
    const result = await getRuntimeActivityAction("rt_1");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual([]);
  });

  it("joins agent names onto each run, and degrades a missing agent gracefully", async () => {
    mockCtx({
      runs: [
        {
          data: [
            { id: "run_1", agent_id: "ag_1", status: "completed", cost_usd: 0.5, duration_ms: 1000, started_at: null, finished_at: null, created_at: "2026-09-01T00:00:00Z" },
            { id: "run_2", agent_id: "ag_deleted", status: "failed", cost_usd: null, duration_ms: null, started_at: null, finished_at: null, created_at: "2026-09-01T00:00:00Z" },
          ],
          error: null,
        },
      ],
      agents: [{ data: [{ id: "ag_1", name: "Reviewer" }], error: null }],
    });
    const result = await getRuntimeActivityAction("rt_1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data[0].agentName).toBe("Reviewer");
      expect(result.data[1].agentName).toBe("Unknown agent");
    }
  });
});

describe("getRuntimeAgentRestrictionsAction", () => {
  it("returns an empty list when no agent is restricted", async () => {
    mockCtx({ agent_machine_restrictions: [{ data: [], error: null }] });
    const result = await getRuntimeAgentRestrictionsAction("rt_1");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual([]);
  });

  it("joins agent names onto each restriction", async () => {
    mockCtx({
      agent_machine_restrictions: [{ data: [{ id: "amr_1", agent_id: "ag_1" }], error: null }],
      agents: [{ data: [{ id: "ag_1", name: "Reviewer" }], error: null }],
    });
    const result = await getRuntimeAgentRestrictionsAction("rt_1");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual([{ id: "amr_1", agentId: "ag_1", agentName: "Reviewer" }]);
  });
});

describe("addAgentMachineRestrictionAction", () => {
  it("fails when the agent does not exist", async () => {
    mockCtx({ agents: [{ data: null, error: null }] });
    const result = await addAgentMachineRestrictionAction("ag_missing", "rt_1");
    expect(result.ok).toBe(false);
  });

  it("restricts an existing agent to the machine", async () => {
    mockCtx({
      agents: [{ data: { id: "ag_1", name: "Reviewer" }, error: null }],
      agent_machine_restrictions: [{ data: { id: "amr_1" }, error: null }],
    });
    const result = await addAgentMachineRestrictionAction("ag_1", "rt_1");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual({ id: "amr_1", agentId: "ag_1", agentName: "Reviewer" });
  });
});

describe("removeAgentMachineRestrictionAction", () => {
  it("fails when nothing matched", async () => {
    mockCtx({ agent_machine_restrictions: [{ data: [], error: null }] });
    const result = await removeAgentMachineRestrictionAction("amr_missing");
    expect(result.ok).toBe(false);
  });

  it("removes an existing restriction", async () => {
    mockCtx({ agent_machine_restrictions: [{ data: [{ id: "amr_1" }], error: null }] });
    const result = await removeAgentMachineRestrictionAction("amr_1");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.removed).toBe(1);
  });
});
