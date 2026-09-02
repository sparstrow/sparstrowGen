import { describe, expect, it, vi } from "vitest";
import { actionContext } from "@web/lib/action-result";
import {
  cloneProjectAction,
  relinkProjectAction,
  removeRuntimeAction,
  renameRuntimeAction,
  revokeRuntimeTokenAction,
  setRuntimeSettingAction,
  unbindProjectAction,
} from "./actions";

vi.mock("@web/lib/action-result", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@web/lib/action-result")>();
  return { ...actual, actionContext: vi.fn() };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

type Result = { data: unknown; error: unknown };

/** Same shape as the other WA-phase action tests' `fakeSupabase(queues)`,
 *  extended with `.upsert()`/`.is()` for the runtime-project and token
 *  routes this file exercises. */
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
  it("fails when nothing was revoked (no active connection, or RLS hid it)", async () => {
    // Revocation is now two hops: resolve the runtime to its machine, then
    // revoke that machine's credentials. An empty second hop means there was
    // nothing live to revoke.
    mockCtx({
      runtimes: [{ data: { machine_id: "mach_1" }, error: null }],
      access_tokens: [{ data: [], error: null }],
    });
    const result = await revokeRuntimeTokenAction("rt_1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/No active connection/);
  });

  it("revokes an active token", async () => {
    mockCtx({
      runtimes: [{ data: { machine_id: "mach_1" }, error: null }],
      access_tokens: [{ data: [{ id: "tok_1" }], error: null }],
    });
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
