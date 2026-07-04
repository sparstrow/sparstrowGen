import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, openDb } from "../db/connection.js";
import { agents, tasks } from "../db/schema.js";
import { getTask } from "./service.js";
import { blockTaskWithQuestions, listOpenQuestions } from "./questions.js";

const ts = "2026-01-01T00:00:00Z";

describe("task_block / task_questions", () => {
  let db: ReturnType<typeof openDb>["db"];

  beforeEach(() => {
    closeDb();
    db = openDb(":memory:").db;
    db.insert(agents)
      .values({ id: "agt_1", name: "Coder", slug: "coder", provider: "claude-code", model: "x", createdAt: ts, updatedAt: ts })
      .run();
    db.insert(tasks)
      .values({ id: "tsk_1", title: "Build the thing", status: "in_progress", assignedAgentId: "agt_1", createdAt: ts, updatedAt: ts })
      .run();
  });
  afterEach(() => closeDb());

  it("records questions, captures progress, and moves the task to blocked", () => {
    const { task, questions } = blockTaskWithQuestions({
      taskId: "tsk_1",
      agentId: "agt_1",
      runId: "run_1",
      progressNote: "Scaffolded the module; stuck on the DB choice.",
      questions: [
        { question: "REST or GraphQL?", whyBlocked: "spec doesn't say", options: ["REST", "GraphQL"], recommendation: "REST", defaultIfNoAnswer: null },
      ],
    });
    expect(task?.status).toBe("blocked");
    expect(task?.result).toContain("Scaffolded");
    expect(questions).toHaveLength(1);
    expect(questions[0]!.options).toEqual(["REST", "GraphQL"]);
    expect(listOpenQuestions("tsk_1")).toHaveLength(1);
  });

  it("rejects blocking a task the agent neither created nor was assigned (403)", () => {
    db.insert(agents)
      .values({ id: "agt_2", name: "Other", slug: "other", provider: "claude-code", model: "x", createdAt: ts, updatedAt: ts })
      .run();
    expect(() =>
      blockTaskWithQuestions({
        taskId: "tsk_1",
        agentId: "agt_2",
        questions: [{ question: "hi?", whyBlocked: "", options: null, recommendation: null, defaultIfNoAnswer: null }],
      }),
    ).toThrow(/only block a task you created or were assigned/);
  });

  it("requires at least one question", () => {
    expect(() =>
      blockTaskWithQuestions({ taskId: "tsk_1", agentId: "agt_1", questions: [] }),
    ).toThrow(/at least one question/);
    expect(getTask("tsk_1")?.status).toBe("in_progress");
  });
});
