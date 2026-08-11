import { describe, expect, it } from "vitest";
import {
  applicableFrom,
  boardEffectFor,
  isReportableRunStatus,
  isTerminalRunStatus,
  runUpdateFor,
  taskStatusForRunEnd,
} from "./reconcile";

const NOW = "2026-08-10T12:00:00.000Z";

describe("run status vocabulary", () => {
  it("accepts every status a run can actually reach", () => {
    for (const s of ["running", "succeeded", "failed", "cancelled", "timeout"]) {
      expect(isReportableRunStatus(s)).toBe(true);
    }
  });

  it("rejects `blocked`, which is a TASK status and does not exist for runs", () => {
    // The distinction the plan draws: a run that could not proceed is `failed`;
    // the recoverable state lives on the task. A daemon sending `blocked` here
    // must be refused rather than silently writing a status nothing renders.
    expect(isReportableRunStatus("blocked")).toBe(false);
    expect(isReportableRunStatus("project_not_available")).toBe(false);
  });

  it("rejects `queued` — a machine may not un-start a run it was given", () => {
    expect(isReportableRunStatus("queued")).toBe(false);
  });

  it("rejects non-strings", () => {
    expect(isReportableRunStatus(undefined)).toBe(false);
    expect(isReportableRunStatus(null)).toBe(false);
    expect(isReportableRunStatus(7)).toBe(false);
  });

  it("knows which statuses are terminal", () => {
    expect(isTerminalRunStatus("succeeded")).toBe(true);
    expect(isTerminalRunStatus("timeout")).toBe(true);
    expect(isTerminalRunStatus("running")).toBe(false);
  });
});

describe("monotonicity", () => {
  it("only lets `running` apply to a run that is still queued", () => {
    expect(applicableFrom("running")).toEqual(["queued"]);
  });

  it("lets a terminal status apply to a queued or running run", () => {
    expect(applicableFrom("succeeded")).toEqual(["queued", "running"]);
  });

  it("never lets anything apply to a run that already finished", () => {
    // The property that matters: no report may overwrite a terminal state. A
    // `running` retried after a dropped response can arrive after the run
    // finished, and applying it would resurrect a completed run.
    for (const status of ["running", "succeeded", "failed", "cancelled", "timeout"] as const) {
      for (const terminal of ["succeeded", "failed", "cancelled", "timeout"]) {
        expect(applicableFrom(status)).not.toContain(terminal);
      }
    }
  });
});

describe("runUpdateFor", () => {
  it("stamps started_at on running, and nothing terminal", () => {
    const update = runUpdateFor({ status: "running" }, NOW);
    expect(update).toEqual({ status: "running", updated_at: NOW, started_at: NOW });
  });

  it("prefers the daemon's own timestamps when it sent them", () => {
    const started = "2026-08-10T11:59:00.000Z";
    expect(runUpdateFor({ status: "running", startedAt: started }, NOW).started_at).toBe(started);
  });

  it("carries the metrics a finished run produced", () => {
    const update = runUpdateFor(
      {
        status: "succeeded",
        resultText: "done",
        costUsd: 0.42,
        numTurns: 7,
        durationMs: 1234,
        untrusted: true,
      },
      NOW,
    );
    expect(update).toMatchObject({
      status: "succeeded",
      finished_at: NOW,
      result_text: "done",
      cost_usd: 0.42,
      num_turns: 7,
      duration_ms: 1234,
      untrusted: true,
    });
  });

  it("omits fields the report did not carry, rather than nulling them", () => {
    // Writing undefined as null would erase a cost an earlier report recorded.
    const update = runUpdateFor({ status: "failed", error: "boom" }, NOW);
    expect(update).not.toHaveProperty("cost_usd");
    expect(update).not.toHaveProperty("result_text");
    expect(update.error).toBe("boom");
  });

  it("writes an explicit null when the daemon sent one", () => {
    expect(runUpdateFor({ status: "succeeded", error: null }, NOW).error).toBeNull();
  });
});

describe("taskStatusForRunEnd", () => {
  it("sends a succeeded run's task to review, never straight to done", () => {
    // A board that marks its own work complete stops being read.
    expect(taskStatusForRunEnd("succeeded")).toBe("review");
  });

  it("sends a cancelled run's task back to todo — cancelling judged the attempt", () => {
    expect(taskStatusForRunEnd("cancelled")).toBe("todo");
  });

  it("fails the task on failure and timeout", () => {
    expect(taskStatusForRunEnd("failed")).toBe("failed");
    expect(taskStatusForRunEnd("timeout")).toBe("failed");
  });
});

describe("boardEffectFor", () => {
  it("parks a missing project instead of failing its task", () => {
    // The plan is explicit: the work is fine, only its placement is wrong.
    const effect = boardEffectFor("project_not_available");
    expect(effect.taskStatus).toBe("project_not_available");
    expect(effect.taskStatus).not.toBe("failed");
  });

  it("marks the binding missing so dispatch stops choosing that machine", () => {
    // Without this the identical failure repeats on every retry, because
    // start_run keeps selecting the runtime whose binding still claims `bound`.
    expect(boardEffectFor("project_not_available").markBindingMissing).toBe(true);
  });

  it("blocks the task when the machine has no such agent", () => {
    expect(boardEffectFor("agent_not_available").taskStatus).toBe("blocked");
    expect(boardEffectFor("agent_disabled").taskStatus).toBe("blocked");
  });

  it("does not touch a binding for an agent problem", () => {
    expect(boardEffectFor("agent_not_available").markBindingMissing).toBe(false);
  });

  it("fails the run row for anything that was a real attempt to run", () => {
    for (const reason of [
      "project_not_available",
      "agent_not_available",
      "agent_disabled",
      "spawn_failed",
      "unknown_kind",
    ] as const) {
      expect(boardEffectFor(reason).failRun).toBe(true);
    }
  });

  it("leaves runs and tasks alone for commands that never had either", () => {
    // A clone executes no agent; a rejected setting touches nothing. Failing a
    // run that does not exist would be inventing state.
    for (const reason of ["clone_failed", "setting_not_allowed"] as const) {
      const effect = boardEffectFor(reason);
      expect(effect.failRun).toBe(false);
      expect(effect.taskStatus).toBeNull();
    }
  });
});
