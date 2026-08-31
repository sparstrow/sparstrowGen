import { describe, expect, it, vi } from "vitest";
import { actionContext } from "@web/lib/action-result";
import { approvePairingAttemptAction } from "./actions";

vi.mock("@web/lib/action-result", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@web/lib/action-result")>();
  return { ...actual, actionContext: vi.fn() };
});

type Result = { data: unknown; error: unknown };

/** Same shape as machines/actions.test.ts's fakeSupabase. */
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
      eq: () => self,
      maybeSingle: () => Promise.resolve(result),
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

describe("approvePairingAttemptAction", () => {
  it("fails when not signed in", async () => {
    mockCtx({}, { user: false });
    const result = await approvePairingAttemptAction("att_1");
    expect(result.ok).toBe(false);
  });

  it("approves and returns the attempt's callback", async () => {
    mockCtx({
      pairing_attempts: [{ data: { callback: "http://127.0.0.1:54219/callback" }, error: null }],
    });
    const result = await approvePairingAttemptAction("att_1");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.callback).toBe("http://127.0.0.1:54219/callback");
  });

  it("reports 'no longer valid' for a missing/expired/consumed attempt", async () => {
    // RLS denies the UPDATE silently -- zero rows, not an error -- for a
    // row that's gone, already approved, consumed, or expired. All four
    // read identically here, matching the real database behavior this test
    // mocks.
    mockCtx({ pairing_attempts: [{ data: null, error: null }] });
    const result = await approvePairingAttemptAction("att_1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/no longer valid/i);
  });
});
