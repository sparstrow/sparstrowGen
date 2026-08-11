import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getDb, openDb } from "../db/connection.js";
import { agents, runs } from "../db/schema.js";

/**
 * G-4 — the busy key is held across the WIP snapshot.
 *
 * Before M4, `finalize()` released the key and then snapshotted, so an
 * unrelated scheduler tick could start a run on that project while its working
 * tree was being read. That was accepted during the OQ-1 work on the grounds
 * that holding the key "stalls the queue for a backup"; M4 closes it, because
 * dispatch makes concurrent same-project runs materially more likely.
 *
 * The invariant has two halves, and the second is the one that bites: the key
 * must be released on EVERY path. A snapshot that throws and leaks the key
 * wedges that agent+project identity for the life of the process — a worse
 * failure than the race it replaced, and one that looks like "the agent just
 * stopped picking up work".
 *
 * finalize() is private and normally reached only by a real spawn, which is why
 * there was no test here before. It is called directly, with a fabricated
 * ActiveRun, because the alternative is a provider binary in unit tests.
 */

const snapshotWorkingTree = vi.fn();
const processRunCompletion = vi.fn();

vi.mock("../projects/wip-snapshot.js", () => ({
  snapshotWorkingTree: (...args: unknown[]) => snapshotWorkingTree(...args),
}));
vi.mock("./handoff.js", () => ({
  processRunCompletion: (...args: unknown[]) => processRunCompletion(...args),
}));
// The vault rescan at the end of finalize touches the filesystem and is not
// what this file is about.
vi.mock("../memory/vault.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  scanVault: () => ({ added: 0, updated: 0, removed: 0 }),
}));

/** Everything finalize() reads off the in-flight run. */
function activeRun(over: Record<string, unknown> = {}) {
  return {
    child: null,
    abort: null,
    agentId: "agt_1",
    busyKey: "agt_1::prj_1",
    events: [],
    seq: 0,
    cancelRequested: false,
    timedOut: false,
    timer: null,
    startedAtMs: Date.now() - 1000,
    stderrLines: [],
    isSandbox: false,
    delegated: false,
    rootDir: "D:/code/app",
    agentName: "Builder",
    ...over,
  };
}

const result = {
  resultText: "done",
  costUsd: 0.01,
  numTurns: 2,
  sessionId: "sess_1",
  isError: false,
};

describe("finalize — G-4: the busy key spans the snapshot", () => {
  let manager: { busyCount(): number; [key: string]: unknown };

  beforeEach(async () => {
    vi.clearAllMocks();
    closeDb();
    openDb(":memory:");

    const db = getDb();
    const now = new Date().toISOString();
    db.insert(agents)
      .values({
        id: "agt_1",
        name: "Builder",
        slug: "builder",
        provider: "claude-code",
        model: "sonnet",
        createdAt: now,
        updatedAt: now,
      })
      .run();
    db.insert(runs)
      .values({
        id: "run_1",
        agentId: "agt_1",
        projectId: "prj_1",
        trigger: "manual",
        mode: "headless",
        prompt: "go",
        status: "running",
        lane: "foreground",
        createdAt: new Date().toISOString(),
      })
      .run();

    const { RunManager } = await import("./run-manager.js");
    manager = new RunManager() as never;
    // Stand in for what start() would have registered.
    (manager.busyAgents as Set<string>).add("agt_1::prj_1");
    (manager.active as Map<string, unknown>).set("run_1", activeRun());
  });

  afterEach(() => closeDb());

  it("still holds the key while the snapshot is in flight", () => {
    // Never resolves during this test: the snapshot is still running when the
    // assertion below is made, which is exactly the window G-4 was about.
    snapshotWorkingTree.mockReturnValue(new Promise(() => {}));

    (manager.finalize as (...a: unknown[]) => void)("run_1", activeRun(), 0, result);

    expect(manager.busyCount()).toBe(1);
  });

  it("releases the key once the snapshot resolves", async () => {
    snapshotWorkingTree.mockResolvedValue(undefined);

    (manager.finalize as (...a: unknown[]) => void)("run_1", activeRun(), 0, result);
    expect(manager.busyCount()).toBe(1);

    await vi.waitFor(() => expect(manager.busyCount()).toBe(0));
    expect(snapshotWorkingTree).toHaveBeenCalledOnce();
  });

  it("releases the key even when the snapshot throws", async () => {
    // The failure that matters. A leaked key here is permanent: nothing else
    // ever deletes it, so that agent+project pair silently stops running.
    snapshotWorkingTree.mockRejectedValue(new Error("git exploded"));

    (manager.finalize as (...a: unknown[]) => void)("run_1", activeRun(), 0, result);

    await vi.waitFor(() => expect(manager.busyCount()).toBe(0));
  });

  it("hands off even when the snapshot throws — a failed backup must not strand a task", async () => {
    snapshotWorkingTree.mockRejectedValue(new Error("git exploded"));

    (manager.finalize as (...a: unknown[]) => void)("run_1", activeRun(), 0, result);

    await vi.waitFor(() => expect(processRunCompletion).toHaveBeenCalledOnce());
  });

  it("snapshots before handing off — handoff spawns the run that edits this tree", async () => {
    const order: string[] = [];
    snapshotWorkingTree.mockImplementation(async () => {
      order.push("snapshot");
    });
    processRunCompletion.mockImplementation(async () => {
      order.push("handoff");
    });

    (manager.finalize as (...a: unknown[]) => void)("run_1", activeRun(), 0, result);

    await vi.waitFor(() => expect(order).toEqual(["snapshot", "handoff"]));
  });
});
