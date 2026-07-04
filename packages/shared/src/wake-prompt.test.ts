import { describe, expect, it } from "vitest";
import { buildWakePrompt } from "./wake-prompt.js";

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
