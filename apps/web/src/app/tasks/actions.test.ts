import { describe, expect, it, vi } from "vitest";
import { actionContext } from "@web/lib/action-result";
import { answerTaskAction, approveTaskAction, denyTaskAction } from "./actions";

/**
 * `answerTaskAction`/`approveTaskAction`/`denyTaskAction` could not be
 * exercised live through the dashboard's attention queue when `T-WA-04`
 * converted them: `BUG-2026-08-25-attention-queue-rows-always-render-as-ready-for-review`
 * means `QuestionCard`/`ApprovalCard` never actually mount in the running
 * app, regardless of this task's changes. These tests call the actions
 * directly instead, isolating the DB logic exactly as
 * `apps/web/src/app/projects/actions.test.ts` isolates `provisionProjectAction`
 * from real auth.
 */

vi.mock("@web/lib/action-result", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@web/lib/action-result")>();
  return { ...actual, actionContext: vi.fn() };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

type Row = Record<string, unknown>;
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
      is: () => self,
      order: () => self,
      single: () => Promise.resolve(result),
      then: (resolve: (v: Result) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(result).then(resolve, reject),
    };
    return self;
  }

  return { supabase: { from: builder } as never, calls };
}

function mockCtx(queues: Record<string, Result[]>) {
  const { supabase, calls } = fakeSupabase(queues);
  vi.mocked(actionContext).mockResolvedValue({ supabase, workspaceId: "ws_1" });
  return calls;
}

describe("answerTaskAction", () => {
  it("writes each answer, wakes a blocked task, and reports applied: false honestly", async () => {
    mockCtx({
      task_questions: [
        { data: null, error: null }, // the update() for the one answer
        {
          data: [{ id: "tq_1", task_id: "tsk_1", answer: "yes", answered_at: "now" }],
          error: null,
        }, // the final select() of all questions for the task
      ],
      tasks: [
        { data: { id: "tsk_1", status: "blocked" }, error: null }, // read
        { data: { id: "tsk_1", status: "blocked_answered" }, error: null }, // wake update
      ],
    });

    const result = await answerTaskAction("tsk_1", [{ questionId: "tq_1", answer: "yes" }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.applied).toBe(false);
    expect(result.data.task?.status).toBe("blocked_answered");
    expect(result.data.questions).toHaveLength(1);
  });

  it("leaves a non-blocked task's status alone", async () => {
    mockCtx({
      task_questions: [
        { data: null, error: null },
        { data: [], error: null },
      ],
      tasks: [{ data: { id: "tsk_2", status: "in_progress" }, error: null }],
    });

    const result = await answerTaskAction("tsk_2", [{ questionId: "tq_2", answer: "no" }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Only one `tasks` read queued -- a second call (the wake update) would
    // throw "unexpected null result" style failures if this task wrongly
    // tried to wake a task that was never blocked.
    expect(result.data.task?.status).toBe("in_progress");
  });
});

describe("approveTaskAction", () => {
  it("moves a parked cross-team spawn to todo", async () => {
    mockCtx({ tasks: [{ data: { id: "tsk_3", status: "todo" }, error: null }] });
    const result = await approveTaskAction("tsk_3");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.status).toBe("todo");
  });
});

describe("denyTaskAction", () => {
  it("fails a parked cross-team spawn", async () => {
    mockCtx({ tasks: [{ data: { id: "tsk_4", status: "failed" }, error: null }] });
    const result = await denyTaskAction("tsk_4", "not needed");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.status).toBe("failed");
  });
});
