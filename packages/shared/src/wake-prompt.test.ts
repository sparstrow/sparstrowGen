import { describe, expect, it } from "vitest";
import { buildChildrenWakePrompt, buildWakePrompt } from "./wake-prompt";

describe("buildWakePrompt", () => {
  it("is fully self-contained: restates task, Q&A, and progress", () => {
    const out = buildWakePrompt({
      taskTitle: "Build the auth module",
      taskDescription: "Wire login against the existing user store.",
      answeredQuestions: [
        { question: "REST or GraphQL?", answer: "REST" },
        { question: "Session or JWT?", answer: "JWT, 24h expiry" },
      ],
      progressNote: "Scaffolded routes; blocked on the transport decision.",
    });
    expect(out).toContain("## Resuming blocked work");
    expect(out).toContain("# Build the auth module");
    expect(out).toContain("Wire login against the existing user store.");
    expect(out).toContain("Q: REST or GraphQL?");
    expect(out).toContain("A: REST");
    expect(out).toContain("A: JWT, 24h expiry");
    expect(out).toContain("Scaffolded routes");
    expect(out).toContain("call task_update");
  });

  it("handles no progress note without leaking undefined", () => {
    const out = buildWakePrompt({
      taskTitle: "T",
      taskDescription: "",
      answeredQuestions: [{ question: "Which port?", answer: "48750" }],
      progressNote: null,
    });
    expect(out).toContain("(none recorded)");
    expect(out).not.toContain("undefined");
    expect(out).not.toContain("null");
  });

  it("degrades gracefully with zero questions", () => {
    const out = buildWakePrompt({
      taskTitle: "T",
      taskDescription: "d",
      answeredQuestions: [],
    });
    expect(out).toContain("(no recorded questions)");
  });
});

describe("buildChildrenWakePrompt (P3 lead wake)", () => {
  it("is fully self-contained: restates the lead's task, every child outcome, and progress", () => {
    const out = buildChildrenWakePrompt({
      taskTitle: "Ship the search feature",
      taskDescription: "Coordinate index build and UI wiring.",
      children: [
        {
          taskId: "tsk_a",
          title: "Build the index",
          status: "done",
          assignedAgentName: "Indexer",
          result: "Index built, 1200 docs.",
        },
        {
          taskId: "tsk_b",
          title: "Wire the UI",
          status: "failed",
          assignedAgentName: "Frontend",
          result: "Blocked by missing design tokens.",
        },
      ],
      progressNote: "Spec written; delegated both halves.",
    });
    expect(out).toContain("## Resuming after delegation");
    expect(out).toContain("# Ship the search feature");
    expect(out).toContain("Coordinate index build and UI wiring.");
    expect(out).toContain("[done] Build the index (tsk_a — Indexer)");
    expect(out).toContain("Index built, 1200 docs.");
    expect(out).toContain("[failed] Wire the UI (tsk_b — Frontend)");
    expect(out).toContain("Blocked by missing design tokens.");
    expect(out).toContain("Spec written; delegated both halves.");
    expect(out).toContain("call task_update");
    expect(out).not.toContain("undefined");
  });

  it("handles missing agent names, empty results, and no progress note", () => {
    const out = buildChildrenWakePrompt({
      taskTitle: "T",
      taskDescription: "",
      children: [{ taskId: "tsk_x", title: "X", status: "done", assignedAgentName: null, result: null }],
      progressNote: null,
    });
    expect(out).toContain("[done] X (tsk_x)");
    expect(out).toContain("(none reported)");
    expect(out).toContain("(none recorded)");
    expect(out).not.toContain("undefined");
    expect(out).not.toContain("null");
  });
});
