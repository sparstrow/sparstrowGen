import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, openDb } from "../db/connection.js";
import { agents, runs, tasks } from "../db/schema.js";
import { getTask } from "./service.js";
import { blockTaskWithQuestions, answerTaskQuestions, listOpenQuestions, wakeTask } from "./questions.js";

const ts = "2026-01-01T00:00:00Z";

describe("wake state machine (EC1 + S4-a)", () => {
  let db: ReturnType<typeof openDb>["db"];

  beforeEach(() => {
    closeDb();
    db = openDb(":memory:").db;
    db.insert(agents)
      .values({ id: "agt_1", name: "Coder", slug: "coder", provider: "claude-code", model: "x", createdAt: ts, updatedAt: ts })
      .run();
    db.insert(tasks)
      .values({ id: "tsk_1", title: "Build", description: "make it", status: "in_progress", assignedAgentId: "agt_1", createdAt: ts, updatedAt: ts })
      .run();
  });
  afterEach(() => closeDb());

  function block() {
    return blockTaskWithQuestions({
      taskId: "tsk_1",
      agentId: "agt_1",
      runId: "run_old",
      progressNote: "did half",
      questions: [{ question: "REST or GraphQL?", whyBlocked: "unspecified", options: ["REST", "GraphQL"], recommendation: "REST", defaultIfNoAnswer: null }],
    });
  }

  it("answering a blocked task wakes it and spawns a fresh run with the wake note", () => {
    const { questions } = block();
    const res = answerTaskQuestions("tsk_1", { answers: [{ questionId: questions[0]!.id, answer: "REST" }] });
    expect(res.applied).toBe(true);
    const task = getTask("tsk_1")!;
    expect(task.status).toBe("in_progress");
    // A fresh run was queued and linked, carrying the self-contained wake note.
    expect(task.runId).toBeTruthy();
    const run = db.select().from(runs).where(eq(runs.id, task.runId!)).get()!;
    expect(run.prompt).toContain("Resuming blocked work");
    expect(run.prompt).toContain("A: REST");
    expect(run.prompt).toContain("did half");
    // The question is answered and applied.
    expect(listOpenQuestions("tsk_1")).toHaveLength(0);
  });

  it("wakeTask is the sole double-wake gate: a second wake is a no-op", () => {
    const { questions } = block();
    answerTaskQuestions("tsk_1", { answers: [{ questionId: questions[0]!.id, answer: "REST" }] });
    // Task is now in_progress; a stray second wake must not spawn another run.
    const runsBefore = db.select().from(runs).all().length;
    expect(wakeTask("tsk_1")).toBe(false);
    expect(db.select().from(runs).all().length).toBe(runsBefore);
  });

  it("S4-a: answering while the prior run is still running saves the answer but defers the wake (409)", () => {
    const { questions } = block();
    // Simulate the block run still being in-flight and linked to the task.
    db.insert(runs)
      .values({ id: "run_live", agentId: "agt_1", trigger: "task", triggerRef: "tsk_1", mode: "headless", prompt: "p", status: "running", createdAt: ts })
      .run();
    db.update(tasks).set({ runId: "run_live" }).where(eq(tasks.id, "tsk_1")).run();

    const res = answerTaskQuestions("tsk_1", { answers: [{ questionId: questions[0]!.id, answer: "REST" }] });
    expect(res.applied).toBe(false);
    expect(res.reason).toMatch(/in flight/);
    // Answer is saved despite the deferral (row-level, no lost update).
    expect(listOpenQuestions("tsk_1")).toHaveLength(0);
    // Task stays blocked — not woken.
    expect(getTask("tsk_1")!.status).toBe("blocked");
  });
});
