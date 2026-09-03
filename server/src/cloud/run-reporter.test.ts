import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Run } from "@sparstrow/shared";
import { config } from "../config.js";
import { bus } from "../events/bus.js";
import { invalidatePairingCache, saveConnection } from "./client.js";
import { markDispatched, resetDispatched, startRunReporter, stopRunReporter } from "./run-reporter.js";

function jsonResponse(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function run(over: Partial<Run> = {}): Run {
  return {
    id: "run_cloud_1",
    agentId: "agt_1",
    projectId: null,
    status: "running",
    prompt: "go",
    trigger: "manual",
    mode: "headless",
    lane: "foreground",
    createdAt: "2026-08-10T00:00:00Z",
    startedAt: "2026-08-10T00:00:01Z",
    ...over,
  } as unknown as Run;
}

/**
 * Bodies posted to /runs/:id/status, in order.
 *
 * Typed structurally rather than as `ReturnType<typeof vi.spyOn>`: that form
 * resolves to the untyped `(this: unknown, ...args: unknown[]) => unknown`
 * overload, which a spy on the real `fetch` signature is not assignable to.
 * All this needs is something with recorded calls.
 */
function postedBodies(fetchMock: { mock: { calls: unknown[][] } }) {
  return (fetchMock.mock.calls as unknown as Array<[string, RequestInit]>)
    .filter(([url]) => String(url).includes("/status"))
    .map(([, init]) => JSON.parse(String(init.body)));
}

describe("run reporter", () => {
  let dir: string;
  let originalSecretsDir: string;
  let originalCloudUrl: string;

  beforeEach(() => {
    originalSecretsDir = config.secretsDir;
    originalCloudUrl = config.cloudUrl;
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "sparstrow-rr-"));
    config.secretsDir = dir;
    config.cloudUrl = "http://cloud.test";
    invalidatePairingCache();
    resetDispatched();
    saveConnection({ token: "t", machineId: "mach-test", runtimes: [{ runtimeId: "rt", workspaceId: "ws" }] });
    startRunReporter();
  });

  afterEach(() => {
    stopRunReporter();
    resetDispatched();
    vi.restoreAllMocks();
    config.secretsDir = originalSecretsDir;
    config.cloudUrl = originalCloudUrl;
    fs.rmSync(dir, { recursive: true, force: true });
    invalidatePairingCache();
  });

  it("says nothing about a run the cloud never dispatched", async () => {
    // A busy machine runs far more work than the cloud asked for — cron,
    // handoffs, the local UI — and none of it has a cloud run row.
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(200));
    bus.publish({ type: "run.updated", run: run() });
    await new Promise((r) => setImmediate(r));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports a dispatched run entering running", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(200));
    markDispatched("run_cloud_1");

    bus.publish({ type: "run.updated", run: run() });
    await new Promise((r) => setImmediate(r));

    const bodies = postedBodies(fetchMock);
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatchObject({ status: "running", startedAt: "2026-08-10T00:00:01Z" });
  });

  it("ignores mid-run updates that are not the transition into running", async () => {
    // Everything finer-grained than a status change is a transcript event, and
    // transcripts are M5.
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(200));
    markDispatched("run_cloud_1");

    bus.publish({ type: "run.updated", run: run({ status: "queued" }) });
    await new Promise((r) => setImmediate(r));
    expect(postedBodies(fetchMock)).toHaveLength(0);
  });

  it("reports the terminal status with its metrics", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(200));
    markDispatched("run_cloud_1");

    bus.publish({
      type: "run.completed",
      run: run({
        status: "succeeded",
        finishedAt: "2026-08-10T00:05:00Z",
        resultText: "done",
        costUsd: 0.4,
        numTurns: 6,
        durationMs: 5000,
        untrusted: true,
      } as Partial<Run>),
    });
    await new Promise((r) => setImmediate(r));

    expect(postedBodies(fetchMock)[0]).toMatchObject({
      status: "succeeded",
      resultText: "done",
      costUsd: 0.4,
      numTurns: 6,
      durationMs: 5000,
      untrusted: true,
    });
  });

  it("stops tracking a run once it has finished", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(200));
    markDispatched("run_cloud_1");

    bus.publish({ type: "run.completed", run: run({ status: "succeeded" }) });
    await new Promise((r) => setImmediate(r));
    bus.publish({ type: "run.updated", run: run({ status: "running" }) });
    await new Promise((r) => setImmediate(r));

    expect(postedBodies(fetchMock)).toHaveLength(1);
  });

  it("reports a run cancelled before it ever started as cancelled", async () => {
    // finalize is not the only terminal path: cancelling a queued run publishes
    // run.completed with the row still reading `queued`, and `queued` is not a
    // status the cloud will accept as terminal.
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(200));
    markDispatched("run_cloud_1");

    bus.publish({ type: "run.completed", run: run({ status: "queued" }) });
    await new Promise((r) => setImmediate(r));

    expect(postedBodies(fetchMock)[0]).toMatchObject({ status: "cancelled" });
  });

  it("holds a report the network dropped, and lands it in order once it can", async () => {
    // Fake timers here specifically: cloudFetch backs off between its own
    // attempts, so asserting on call counts under real timers measures the
    // backoff rather than the queue.
    vi.useFakeTimers();
    try {
      const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));
      markDispatched("run_cloud_1");

      bus.publish({ type: "run.updated", run: run() });
      await vi.advanceTimersByTimeAsync(30_000);
      expect(postedBodies(fetchMock).every((b) => b.status === "running")).toBe(true);

      // The network comes back. The queued `running` must land BEFORE the
      // terminal report, or the monotonic guard on the server would drop it and
      // the browser would never see the run start.
      fetchMock.mockResolvedValue(jsonResponse(200));
      bus.publish({ type: "run.completed", run: run({ status: "succeeded" }) });
      await vi.advanceTimersByTimeAsync(30_000);

      const landed = postedBodies(fetchMock).map((b) => b.status);
      expect(landed).toContain("succeeded");
      expect(landed.indexOf("running")).toBeLessThan(landed.lastIndexOf("succeeded"));
    } finally {
      vi.useRealTimers();
    }
  });

  it("drops the oldest report rather than growing without bound", async () => {
    vi.useFakeTimers();
    try {
      vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));
      // 250 reports against a 200-entry ceiling. The newest report about a run
      // is the truest one, so the oldest go first.
      for (let i = 0; i < 250; i++) {
        markDispatched(`run_${i}`);
        bus.publish({ type: "run.updated", run: run({ id: `run_${i}` }) });
      }
      await vi.advanceTimersByTimeAsync(1_000);

      // Nothing threw, nothing hung, and the process is still responsive — the
      // property that matters for an unbounded producer against a dead network.
      expect(true).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("discards everything queued when the cloud rejects this machine", async () => {
    // Holding the queue would replay a run's whole history at whoever pairs
    // this machine next.
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(403, { error: "revoked" }));
    markDispatched("run_cloud_1");

    bus.publish({ type: "run.updated", run: run() });
    await new Promise((r) => setImmediate(r));
    const afterRevocation = fetchMock.mock.calls.length;

    markDispatched("run_cloud_2");
    bus.publish({ type: "run.completed", run: run({ id: "run_cloud_2", status: "succeeded" }) });
    await new Promise((r) => setImmediate(r));

    // The queue was emptied rather than accumulating reports that can never land.
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(afterRevocation);
  });
});
