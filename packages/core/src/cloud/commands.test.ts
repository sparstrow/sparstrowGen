import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COMMAND_POLL_INTERVAL_MS, SETTING_WIP_SNAPSHOT } from "@sparstrow/shared";
import { eq } from "drizzle-orm";
import { config } from "../config.js";
import { closeDb, getDb, openDb } from "../db/connection.js";
import { agents, settings } from "../db/schema.js";
import { runManager } from "../orchestrator/run-manager.js";
import { invalidatePairingCache, savePairing } from "./client.js";
import { startCommandLoop, stopCommandLoop } from "./commands.js";
import { resetDispatched } from "./run-reporter.js";

const now = "2026-08-10T00:00:00Z";

function jsonResponse(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function command(over: Record<string, unknown> = {}) {
  return {
    id: "cmd_1",
    kind: "run.start",
    payload: {
      runId: "run_cloud_1",
      agentId: "cloud-agent",
      agentSlug: "builder",
      projectId: null,
      projectSlug: null,
      taskId: null,
      prompt: "do the thing",
      trigger: "manual",
      lane: "foreground",
    },
    attempts: 1,
    leaseExpiresAt: null,
    createdAt: now,
    ...over,
  };
}

/** URL → the response to give. Anything unmatched is an empty claim. */
function routeFetch(handlers: Record<string, () => Response>) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    for (const [fragment, respond] of Object.entries(handlers)) {
      if (url.includes(fragment)) return respond();
    }
    return jsonResponse(200, { commands: [] });
  });
}

describe("command loop", () => {
  let dir: string;
  let originalSecretsDir: string;
  let originalCloudUrl: string;

  beforeEach(() => {
    vi.useFakeTimers();
    originalSecretsDir = config.secretsDir;
    originalCloudUrl = config.cloudUrl;
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "sparstrow-cmd-"));
    config.secretsDir = dir;
    config.cloudUrl = "http://cloud.test";
    invalidatePairingCache();
    resetDispatched();

    closeDb();
    openDb(":memory:");
    getDb()
      .insert(agents)
      .values({
        id: "agt_local",
        name: "Builder",
        slug: "builder",
        provider: "claude-code",
        model: "sonnet",
        createdAt: now,
        updatedAt: now,
      })
      .run();
  });

  afterEach(() => {
    stopCommandLoop();
    vi.useRealTimers();
    vi.restoreAllMocks();
    config.secretsDir = originalSecretsDir;
    config.cloudUrl = originalCloudUrl;
    fs.rmSync(dir, { recursive: true, force: true });
    invalidatePairingCache();
    closeDb();
  });

  it("does not call the cloud on an unpaired machine", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    startCommandLoop();
    await vi.advanceTimersByTimeAsync(COMMAND_POLL_INTERVAL_MS * 3);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("polls immediately and then on the interval", async () => {
    savePairing({ token: "t", runtimeId: "rt", workspaceId: "ws" });
    const fetchMock = routeFetch({});

    startCommandLoop();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(COMMAND_POLL_INTERVAL_MS * 2);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("claims by GET, so nothing can smuggle a runtime id into the request", async () => {
    savePairing({ token: "t", runtimeId: "rt", workspaceId: "ws" });
    const fetchMock = routeFetch({});

    startCommandLoop();
    await vi.advanceTimersByTimeAsync(0);

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
  });

  it("dispatches run.start to the run manager and acks done", async () => {
    savePairing({ token: "t", runtimeId: "rt", workspaceId: "ws" });
    const createRun = vi.spyOn(runManager, "createRun").mockReturnValue({ id: "run_cloud_1" } as never);

    let claimed = false;
    const fetchMock = routeFetch({
      "/commands/cmd_1/ack": () => jsonResponse(200, { ok: true }),
      "/commands": () => {
        if (claimed) return jsonResponse(200, { commands: [] });
        claimed = true;
        return jsonResponse(200, { commands: [command()] });
      },
    });

    startCommandLoop();
    await vi.advanceTimersByTimeAsync(0);

    // The cloud's run id is adopted verbatim — one id end to end is what lets
    // M5 attach events to the run the browser is already watching.
    expect(createRun).toHaveBeenCalledWith(
      expect.objectContaining({ id: "run_cloud_1", agentId: "agt_local", prompt: "do the thing" }),
    );

    const ack = fetchMock.mock.calls.find(([url]) => String(url).includes("/ack"));
    expect(ack).toBeDefined();
    expect(JSON.parse(String((ack?.[1] as RequestInit).body))).toMatchObject({ status: "done" });
  });

  it("acks a command it cannot resolve, rather than throwing out of the loop", async () => {
    // One bad row must not stop every other command on the machine.
    savePairing({ token: "t", runtimeId: "rt", workspaceId: "ws" });
    getDb().delete(agents).where(eq(agents.id, "agt_local")).run();

    let claimed = false;
    const fetchMock = routeFetch({
      "/ack": () => jsonResponse(200, { ok: true }),
      "/commands": () => {
        if (claimed) return jsonResponse(200, { commands: [] });
        claimed = true;
        return jsonResponse(200, { commands: [command()] });
      },
    });

    startCommandLoop();
    await vi.advanceTimersByTimeAsync(0);

    const ack = fetchMock.mock.calls.find(([url]) => String(url).includes("/ack"));
    const body = JSON.parse(String((ack?.[1] as RequestInit).body));
    expect(body).toMatchObject({ status: "failed", reason: "agent_not_available" });
    expect(body.error).toContain("builder");
  });

  it("acks a throwing createRun as failed instead of dying", async () => {
    savePairing({ token: "t", runtimeId: "rt", workspaceId: "ws" });
    vi.spyOn(runManager, "createRun").mockImplementation(() => {
      throw new Error("agent is disabled: Builder");
    });

    let claimed = false;
    const fetchMock = routeFetch({
      "/ack": () => jsonResponse(200, { ok: true }),
      "/commands": () => {
        if (claimed) return jsonResponse(200, { commands: [] });
        claimed = true;
        return jsonResponse(200, { commands: [command()] });
      },
    });

    startCommandLoop();
    await vi.advanceTimersByTimeAsync(0);

    const ack = fetchMock.mock.calls.find(([url]) => String(url).includes("/ack"));
    const body = JSON.parse(String((ack?.[1] as RequestInit).body));
    expect(body).toMatchObject({ status: "failed", reason: "spawn_failed" });
  });

  it("treats a redelivered run.start as a replay and does not run it twice", async () => {
    // The exact scenario exactly-once exists for: the ack was lost, the lease
    // expired, and the row came back.
    savePairing({ token: "t", runtimeId: "rt", workspaceId: "ws" });
    vi.spyOn(runManager, "getRun").mockReturnValue({ id: "run_cloud_1" } as never);
    const createRun = vi.spyOn(runManager, "createRun");

    let claimed = false;
    const fetchMock = routeFetch({
      "/ack": () => jsonResponse(200, { ok: true }),
      "/commands": () => {
        if (claimed) return jsonResponse(200, { commands: [] });
        claimed = true;
        return jsonResponse(200, { commands: [command()] });
      },
    });

    startCommandLoop();
    await vi.advanceTimersByTimeAsync(0);

    expect(createRun).not.toHaveBeenCalled();
    const ack = fetchMock.mock.calls.find(([url]) => String(url).includes("/ack"));
    expect(JSON.parse(String((ack?.[1] as RequestInit).body))).toMatchObject({ status: "done" });
  });

  it("acks a cancel for an unknown run as done, not failed", async () => {
    // The command asked for that run not to be executing, and it is not.
    savePairing({ token: "t", runtimeId: "rt", workspaceId: "ws" });

    let claimed = false;
    const fetchMock = routeFetch({
      "/ack": () => jsonResponse(200, { ok: true }),
      "/commands": () => {
        if (claimed) return jsonResponse(200, { commands: [] });
        claimed = true;
        return jsonResponse(200, {
          commands: [command({ kind: "run.cancel", payload: { runId: "run_gone" } })],
        });
      },
    });

    startCommandLoop();
    await vi.advanceTimersByTimeAsync(0);

    const ack = fetchMock.mock.calls.find(([url]) => String(url).includes("/ack"));
    expect(JSON.parse(String((ack?.[1] as RequestInit).body))).toMatchObject({ status: "done" });
  });

  it("applies an allowlisted setting", async () => {
    savePairing({ token: "t", runtimeId: "rt", workspaceId: "ws" });

    let claimed = false;
    routeFetch({
      "/ack": () => jsonResponse(200, { ok: true }),
      "/commands": () => {
        if (claimed) return jsonResponse(200, { commands: [] });
        claimed = true;
        return jsonResponse(200, {
          commands: [
            command({ kind: "settings.set", payload: { key: SETTING_WIP_SNAPSHOT, value: "off" } }),
          ],
        });
      },
    });

    startCommandLoop();
    await vi.advanceTimersByTimeAsync(0);

    const row = getDb().select().from(settings).where(eq(settings.key, SETTING_WIP_SNAPSHOT)).get();
    expect(row?.value).toBe("off");
  });

  it("refuses a setting outside the allowlist", async () => {
    // Without the allowlist this command is a remote write into every setting
    // the machine has, including ones added later.
    savePairing({ token: "t", runtimeId: "rt", workspaceId: "ws" });

    let claimed = false;
    const fetchMock = routeFetch({
      "/ack": () => jsonResponse(200, { ok: true }),
      "/commands": () => {
        if (claimed) return jsonResponse(200, { commands: [] });
        claimed = true;
        return jsonResponse(200, {
          commands: [
            command({ kind: "settings.set", payload: { key: "github.pat", value: "ghp_evil" } }),
          ],
        });
      },
    });

    startCommandLoop();
    await vi.advanceTimersByTimeAsync(0);

    expect(getDb().select().from(settings).where(eq(settings.key, "github.pat")).get()).toBeUndefined();
    const ack = fetchMock.mock.calls.find(([url]) => String(url).includes("/ack"));
    expect(JSON.parse(String((ack?.[1] as RequestInit).body))).toMatchObject({
      status: "failed",
      reason: "setting_not_allowed",
    });
  });

  it("fails an unknown command kind explicitly, so the board says why", async () => {
    savePairing({ token: "t", runtimeId: "rt", workspaceId: "ws" });

    let claimed = false;
    const fetchMock = routeFetch({
      "/ack": () => jsonResponse(200, { ok: true }),
      "/commands": () => {
        if (claimed) return jsonResponse(200, { commands: [] });
        claimed = true;
        return jsonResponse(200, { commands: [command({ kind: "run.teleport", payload: {} })] });
      },
    });

    startCommandLoop();
    await vi.advanceTimersByTimeAsync(0);

    const ack = fetchMock.mock.calls.find(([url]) => String(url).includes("/ack"));
    expect(JSON.parse(String((ack?.[1] as RequestInit).body))).toMatchObject({
      status: "failed",
      reason: "unknown_kind",
    });
  });

  it("stops permanently when the pairing was revoked", async () => {
    savePairing({ token: "t", runtimeId: "rt", workspaceId: "ws" });
    const fetchMock = routeFetch({ "/commands": () => jsonResponse(403, { error: "revoked" }) });

    startCommandLoop();
    await vi.advanceTimersByTimeAsync(0);
    const afterFirst = fetchMock.mock.calls.length;

    await vi.advanceTimersByTimeAsync(COMMAND_POLL_INTERVAL_MS * 5);
    expect(fetchMock.mock.calls.length).toBe(afterFirst);
  });

  it("keeps polling through network failure", async () => {
    savePairing({ token: "t", runtimeId: "rt", workspaceId: "ws" });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));

    startCommandLoop();
    await vi.advanceTimersByTimeAsync(0);
    const afterFirst = fetchMock.mock.calls.length;
    expect(afterFirst).toBeGreaterThan(0);

    await vi.advanceTimersByTimeAsync(COMMAND_POLL_INTERVAL_MS * 3);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(afterFirst);
  });

  it("single-flights: a slow poll does not overlap the next tick", async () => {
    savePairing({ token: "t", runtimeId: "rt", workspaceId: "ws" });
    // Definite assignment, not `| null`: the executor runs synchronously when
    // the mock builds the promise, so this is assigned before any use — but
    // control-flow analysis cannot see that and narrows the union to `null`,
    // which makes the call below an error against type `never`.
    let resolveClaim!: (r: Response) => void;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      () => new Promise<Response>((resolve) => { resolveClaim = resolve; }),
    );

    startCommandLoop();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Three intervals pass while the first claim is still outstanding.
    await vi.advanceTimersByTimeAsync(COMMAND_POLL_INTERVAL_MS * 3);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveClaim?.(jsonResponse(200, { commands: [] }));
    await vi.advanceTimersByTimeAsync(COMMAND_POLL_INTERVAL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not hold the process open", () => {
    savePairing({ token: "t", runtimeId: "rt", workspaceId: "ws" });
    routeFetch({});
    const unrefs: unknown[] = [];
    const original = globalThis.setInterval;
    vi.spyOn(globalThis, "setInterval").mockImplementation(((...args: Parameters<typeof setInterval>) => {
      const timer = original(...args);
      const spy = vi.spyOn(timer, "unref");
      unrefs.push(spy);
      return timer;
    }) as typeof setInterval);

    startCommandLoop();
    expect(unrefs.length).toBe(1);
    expect(unrefs[0]).toHaveBeenCalled();
  });
});
