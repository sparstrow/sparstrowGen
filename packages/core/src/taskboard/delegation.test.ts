import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { closeDb, openDb } from "../db/connection.js";
import { agents, messages, runs, taskQuestions, tasks, teamMembers, teams } from "../db/schema.js";
import { getTask, updateTask } from "./service.js";
import {
  approveSubtask,
  checkCrossTeamBreaker,
  createMultiAssignTask,
  delegationDepth,
  denySubtask,
  initDelegationWatcher,
  maybeWakeWaitingParent,
  sharedTeamId,
  spawnSubtask,
} from "./delegation.js";
import { listAttentionQueue } from "./questions.js";

const ts = "2026-01-01T00:00:00Z";

function seed(db: ReturnType<typeof openDb>["db"]) {
  const agent = (id: string, name: string) => ({
    id,
    name,
    slug: name.toLowerCase(),
    provider: "claude-code",
    model: "x",
    createdAt: ts,
    updatedAt: ts,
  });
  db.insert(agents).values([agent("agt_lead", "Lead"), agent("agt_worker", "Worker"), agent("agt_out", "Outsider")]).run();
  db.insert(teams)
    .values({ id: "team_1", name: "Core", slug: "core", createdAt: ts, updatedAt: ts })
    .run();
  db.insert(teamMembers)
    .values([
      { id: "tm_1", teamId: "team_1", agentId: "agt_lead", sort: 0 },
      { id: "tm_2", teamId: "team_1", agentId: "agt_worker", sort: 1 },
    ])
    .run();
  db.insert(tasks)
    .values({ id: "tsk_lead", title: "Ship feature", description: "coordinate the work", status: "in_progress", assignedAgentId: "agt_lead", runId: "run_lead", createdAt: ts, updatedAt: ts })
    .run();
  db.insert(runs)
    .values({
      id: "run_lead",
      agentId: "agt_lead",
      trigger: "task",
      triggerRef: "tsk_lead",
      mode: "headless",
      prompt: "p",
      status: "running",
      effectiveTools: { allowed: ["Read", "Edit"], disallowed: ["Bash"] },
      createdAt: ts,
    })
    .run();
}

const spawn = (over: Partial<Parameters<typeof spawnSubtask>[0]> = {}) =>
  spawnSubtask({
    callerAgentId: "agt_lead",
    callerAgentName: "Lead",
    callerRunId: "run_lead",
    parentTaskId: "tsk_lead",
    title: "Do a part",
    description: "verbatim child brief",
    assigneeId: "agt_worker",
    assigneeName: "Worker",
    projectId: null,
    ...over,
  });

describe("P3 delegation — spawn_subtask, watcher, approvals, breaker", () => {
  let db: ReturnType<typeof openDb>["db"];

  beforeEach(() => {
    closeDb();
    db = openDb(":memory:").db;
    seed(db);
  });
  afterEach(() => closeDb());

  it("same-team spawn: child carries parentage + the S1-a bound, runs immediately; parent suspends (EH1)", () => {
    const res = spawn();
    expect(res.status).toBe("spawned");

    const child = getTask(res.childTaskId)!;
    expect(child.parentTaskId).toBe("tsk_lead");
    // S1-a: the bound is the delegating run's immutable snapshot.
    expect(child.parentEffectiveTools).toEqual({ allowed: ["Read", "Edit"], disallowed: ["Bash"] });
    expect(child.status).toBe("in_progress"); // startTaskRun ran it
    expect(child.runId).toBeTruthy();

    // EC3: the child's prompt wraps the agent-authored description as data.
    const childRun = db.select().from(runs).where(eq(runs.id, child.runId!)).get()!;
    expect(childRun.prompt).toContain("<delegated-request>");
    expect(childRun.prompt).toContain("verbatim child brief");

    // EH1: the lead suspended server-side.
    expect(getTask("tsk_lead")!.status).toBe("waiting_children");

    // A second spawn while already waiting_children is allowed (same run fans out).
    const res2 = spawn({ title: "Another part" });
    expect(res2.status).toBe("spawned");
  });

  it("cross-team spawn parks in pending_approval and surfaces an EM3 approval row", () => {
    const res = spawn({ assigneeId: "agt_out", assigneeName: "Outsider" });
    expect(res.status).toBe("pending_approval");

    const child = getTask(res.childTaskId)!;
    expect(child.status).toBe("pending_approval");
    expect(child.runId).toBeNull(); // parked, never spawned

    const queue = listAttentionQueue();
    const row = queue.find((r) => r.type === "approval");
    expect(row).toBeTruthy();
    expect(row!.approval!.verbatimDescription).toBe("verbatim child brief");
    expect(row!.approval!.targetAgentName).toBe("Outsider");
    expect(row!.approval!.delegatedByAgentName).toBe("Lead");
    expect(row!.approval!.effectiveBound).toEqual({ allowed: ["Read", "Edit"], disallowed: ["Bash"] });
  });

  it("approve runs the parked child; deny fails it and wakes the lead with the denial", () => {
    const res = spawn({ assigneeId: "agt_out", assigneeName: "Outsider" });
    // Lead's run ends (it suspended cleanly).
    db.update(runs).set({ status: "succeeded" }).where(eq(runs.id, "run_lead")).run();

    const approved = approveSubtask(res.childTaskId);
    expect(["in_progress", "todo"].includes(approved.status)).toBe(true);

    // Second child, denied this time.
    const res2 = spawn({ assigneeId: "agt_out", assigneeName: "Outsider", title: "Part 2" });
    const denied = denySubtask(res2.childTaskId, "not this repo");
    expect(denied.status).toBe("failed");
    expect(denied.result).toContain("Denied by the operator: not this repo");

    // Finish the approved child → all children terminal → lead wakes with both outcomes.
    updateTask(res.childTaskId, { status: "done", result: "part done" }, { triggerRun: false });
    expect(maybeWakeWaitingParent("tsk_lead")).toBe(true);
    const lead = getTask("tsk_lead")!;
    expect(lead.status).toBe("in_progress");
    expect(lead.wakePayload).toContain("Resuming after delegation");
    expect(lead.wakePayload).toContain("part done");
    expect(lead.wakePayload).toContain("Denied by the operator");
  });

  it("the watcher wakes only when EVERY child is terminal, and honors the S4-a in-flight guard", () => {
    const a = spawn({ title: "A" });
    const b = spawn({ title: "B" });

    updateTask(a.childTaskId, { status: "done", result: "A done" }, { triggerRun: false });
    // One child still open → no wake.
    expect(maybeWakeWaitingParent("tsk_lead")).toBe(false);

    updateTask(b.childTaskId, { status: "failed", result: "B broke" }, { triggerRun: false });
    // All terminal, but the lead's own run is still running → S4-a defers.
    expect(maybeWakeWaitingParent("tsk_lead")).toBe(false);
    expect(getTask("tsk_lead")!.status).toBe("waiting_children");

    // Lead's run exits → the deferred wake applies, injecting both results.
    db.update(runs).set({ status: "succeeded" }).where(eq(runs.id, "run_lead")).run();
    expect(maybeWakeWaitingParent("tsk_lead")).toBe(true);
    const lead = getTask("tsk_lead")!;
    expect(lead.status).toBe("in_progress");
    expect(lead.wakePayload).toContain("A done");
    expect(lead.wakePayload).toContain("B broke");
    // Idempotent: a second wake is a no-op (the sole double-wake gate).
    expect(maybeWakeWaitingParent("tsk_lead")).toBe(false);
  });

  it("bus-wired watcher wakes the lead when the last child reports terminal", async () => {
    const dispose = initDelegationWatcher({ sweepIntervalMs: 60_000 });
    try {
      const a = spawn({ title: "A" });
      db.update(runs).set({ status: "succeeded" }).where(eq(runs.id, "run_lead")).run();
      updateTask(a.childTaskId, { status: "done", result: "done via bus" }, { triggerRun: false });
      await new Promise((r) => setTimeout(r, 150)); // debounce window
      expect(getTask("tsk_lead")!.status).toBe("in_progress");
      expect(getTask("tsk_lead")!.wakePayload).toContain("done via bus");
    } finally {
      dispose();
    }
  });

  it("delegation depth is capped (default 3) with an actionable error", () => {
    // Build a chain: tsk_lead(0) → c1(1) → c2(2) → c3(3); spawning under c3 would be depth 4.
    let parentId = "tsk_lead";
    let runId = "run_lead";
    for (let i = 1; i <= 3; i++) {
      const res = spawnSubtask({
        callerAgentId: getTask(parentId)!.assignedAgentId!,
        callerAgentName: "x",
        callerRunId: runId,
        parentTaskId: parentId,
        title: `level ${i}`,
        description: "d",
        assigneeId: i % 2 === 1 ? "agt_worker" : "agt_lead",
        assigneeName: "x",
        projectId: null,
      });
      parentId = res.childTaskId;
      expect(delegationDepth(parentId)).toBe(i);
      // Give the new child an in_progress status + running run so IT can spawn next level.
      runId = `run_l${i}`;
      db.insert(runs)
        .values({ id: runId, agentId: getTask(parentId)!.assignedAgentId!, trigger: "task", triggerRef: parentId, mode: "headless", prompt: "p", status: "running", createdAt: ts })
        .run();
      db.update(tasks).set({ status: "in_progress", runId }).where(eq(tasks.id, parentId)).run();
    }
    expect(() =>
      spawnSubtask({
        callerAgentId: getTask(parentId)!.assignedAgentId!,
        callerAgentName: "x",
        callerRunId: runId,
        parentTaskId: parentId,
        title: "level 4",
        description: "d",
        assigneeId: "agt_worker",
        assigneeName: "x",
        projectId: null,
      }),
    ).toThrow(/delegation depth limit/);
  });

  it("only the assignee may spawn under a task; non-active parents are rejected", () => {
    expect(() => spawn({ callerAgentId: "agt_worker" })).toThrow(/only spawn subtasks under the task you are assigned/);
    updateTask("tsk_lead", { status: "blocked" }, { triggerRun: false });
    expect(() => spawn()).toThrow(/can only be spawned while you are actively working/);
  });

  it("sharedTeamId ignores archived teams", () => {
    expect(sharedTeamId("agt_lead", "agt_worker")).toBe("team_1");
    expect(sharedTeamId("agt_lead", "agt_out")).toBeNull();
    db.update(teams).set({ archivedAt: ts }).where(eq(teams.id, "team_1")).run();
    expect(sharedTeamId("agt_lead", "agt_worker")).toBeNull();
  });

  it("C10 circuit breaker: cross-team thread halts at the limit, blocks the task, resets on an answered question", () => {
    const msg = (i: number, from = "agt_lead", to = "agt_out") =>
      db.insert(messages).values({ id: `msg_${i}`, fromType: "agent", fromAgentId: from, toAgentId: to, taskId: "tsk_lead", subject: "s", body: "b", status: "unread", createdAt: `2026-01-01T00:0${i}:00Z` }).run();
    const check = () =>
      checkCrossTeamBreaker({ fromAgentId: "agt_lead", fromAgentName: "Lead", toAgentId: "agt_out", toAgentName: "Outsider", taskId: "tsk_lead" });

    msg(1);
    msg(2, "agt_out", "agt_lead"); // both directions count as one thread
    expect(() => check()).not.toThrow();
    msg(3);
    expect(() => check()).toThrow(/circuit breaker/);
    expect(getTask("tsk_lead")!.status).toBe("blocked");
    const q = db.select().from(taskQuestions).where(eq(taskQuestions.taskId, "tsk_lead")).all();
    expect(q).toHaveLength(1);
    expect(q[0]!.question).toContain("circuit breaker");

    // The owner answers → the thread counter resets from that moment.
    db.update(taskQuestions)
      .set({ answer: "Yes — let the thread continue", answeredAt: "2026-01-01T00:09:00Z" })
      .where(eq(taskQuestions.id, q[0]!.id))
      .run();
    expect(() => check()).not.toThrow();

    // Same-team traffic is never counted.
    expect(() =>
      checkCrossTeamBreaker({ fromAgentId: "agt_lead", fromAgentName: "Lead", toAgentId: "agt_worker", toAgentName: "Worker", taskId: "tsk_lead" }),
    ).not.toThrow();
  });

  it("multi-assign creates an ephemeral team + children; container aggregates to review; terminal soft-archives the team", () => {
    const { parent, teamId } = createMultiAssignTask({
      title: "Swarm job",
      description: "shared brief",
      agentIds: ["agt_lead", "agt_worker"],
    });
    expect(parent.status).toBe("waiting_children");
    expect(parent.assignedAgentId).toBeNull();

    const team = db.select().from(teams).where(eq(teams.id, teamId)).get()!;
    expect(team.isEphemeral).toBe(true);
    expect(team.linkedTaskId).toBe(parent.id);
    expect(team.archivedAt).toBeNull();
    expect(db.select().from(teamMembers).where(eq(teamMembers.teamId, teamId)).all()).toHaveLength(2);

    const children = db.select().from(tasks).where(eq(tasks.parentTaskId, parent.id)).all();
    expect(children).toHaveLength(2);
    for (const c of children) {
      updateTask(c.id, { status: "done", result: `${c.assignedAgentId} finished` }, { triggerRun: false });
    }
    expect(maybeWakeWaitingParent(parent.id)).toBe(true);
    const container = getTask(parent.id)!;
    expect(container.status).toBe("review"); // no assignee → human review, not a run
    expect(container.result).toContain("agt_lead finished");
    expect(container.result).toContain("agt_worker finished");

    // Owner closes the container → the ephemeral team soft-archives (C6/P3-Q3).
    updateTask(parent.id, { status: "done" }, { triggerRun: false });
    const archived = db.select().from(teams).where(eq(teams.id, teamId)).get()!;
    expect(archived.archivedAt).not.toBeNull();
  });
});
