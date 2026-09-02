import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COMMAND_POLL_INTERVAL_MS, SETTING_TERMINAL_ACCESS, SETTING_WIP_SNAPSHOT } from "@sparstrow/shared";
import { eq } from "drizzle-orm";
import { config } from "../config.js";
import { closeDb, getDb, openDb } from "../db/connection.js";
import { agents, settings } from "../db/schema.js";
import { runManager } from "../orchestrator/run-manager.js";
import { resetChatTurnInFlight } from "./chat-turn.js";
import { invalidatePairingCache, saveConnection } from "./client.js";
import { startCommandLoop, stopCommandLoop } from "./commands.js";
import { resetMemorySync, startMemorySync } from "./memory-sync.js";
import { resetDispatched } from "./run-reporter.js";

vi.mock("../logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: vi.fn() },
}));

vi.mock("../orchestrator/one-shot.js", () => ({
  completeOnce: vi.fn().mockReturnValue(new Promise(() => {})),
}));

const killAllSessionsMock = vi.fn();
vi.mock("../terminal/manager.js", () => ({
  killAllSessions: (...args: unknown[]) => killAllSessionsMock(...args),
}));

const getProviderMock = vi.fn();
vi.mock("../providers/index.js", () => ({
  getProvider: (...args: unknown[]) => getProviderMock(...args),
}));

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
    killAllSessionsMock.mockClear();
    vi.useFakeTimers();
    originalSecretsDir = config.secretsDir;
    originalCloudUrl = config.cloudUrl;
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "sparstrow-cmd-"));
    config.secretsDir = dir;
    config.cloudUrl = "http://cloud.test";
    invalidatePairingCache();
    resetDispatched();
    resetMemorySync();
    resetChatTurnInFlight();

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
    resetMemorySync();
    resetChatTurnInFlight();
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
    saveConnection({ token: "t", machineId: "mach-test", runtimes: [{ runtimeId: "rt", workspaceId: "ws" }] });
    const fetchMock = routeFetch({});

    startCommandLoop();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(COMMAND_POLL_INTERVAL_MS * 2);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("claims by GET, so nothing can smuggle a runtime id into the request", async () => {
    saveConnection({ token: "t", machineId: "mach-test", runtimes: [{ runtimeId: "rt", workspaceId: "ws" }] });
    const fetchMock = routeFetch({});

    startCommandLoop();
    await vi.advanceTimersByTimeAsync(0);

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
  });

  it("dispatches run.start to the run manager and acks done", async () => {
    saveConnection({ token: "t", machineId: "mach-test", runtimes: [{ runtimeId: "rt", workspaceId: "ws" }] });
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
    saveConnection({ token: "t", machineId: "mach-test", runtimes: [{ runtimeId: "rt", workspaceId: "ws" }] });
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
    saveConnection({ token: "t", machineId: "mach-test", runtimes: [{ runtimeId: "rt", workspaceId: "ws" }] });
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
    saveConnection({ token: "t", machineId: "mach-test", runtimes: [{ runtimeId: "rt", workspaceId: "ws" }] });
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
    saveConnection({ token: "t", machineId: "mach-test", runtimes: [{ runtimeId: "rt", workspaceId: "ws" }] });

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

  it("dispatches chat.turn and acks done as soon as it starts, not once it finishes", async () => {
    // The ack means "accepted, running" -- same split run.start's own ack vs.
    // /runs/:id/status reporting already has. completeOnce is mocked to a
    // promise that never resolves in this file's top-level mock, so a `done`
    // ack here can only be explained by the dispatch not waiting on it.
    saveConnection({ token: "t", machineId: "mach-test", runtimes: [{ runtimeId: "rt", workspaceId: "ws" }] });

    let claimed = false;
    const fetchMock = routeFetch({
      "/commands/cmd_1/ack": () => jsonResponse(200, { ok: true }),
      "/commands": () => {
        if (claimed) return jsonResponse(200, { commands: [] });
        claimed = true;
        return jsonResponse(200, {
          commands: [
            command({
              kind: "chat.turn",
              payload: {
                turnId: "ct_1",
                sessionId: "chs_1",
                sessionKind: "free",
                projectId: null,
                projectSlug: null,
                agentId: null,
                agentSlug: null,
                provider: "claude-code",
                model: "sonnet",
                attempt: 1,
                messages: [{ role: "user", content: "hi" }],
              },
            }),
          ],
        });
      },
    });

    startCommandLoop();
    await vi.advanceTimersByTimeAsync(0);

    const ack = fetchMock.mock.calls.find(([url]) => String(url).includes("/ack"));
    expect(ack).toBeDefined();
    expect(JSON.parse(String((ack?.[1] as RequestInit).body))).toMatchObject({ status: "done" });
  });

  it("acks a chat.turn with an unresolvable agent as failed with agent_not_available", async () => {
    saveConnection({ token: "t", machineId: "mach-test", runtimes: [{ runtimeId: "rt", workspaceId: "ws" }] });

    let claimed = false;
    const fetchMock = routeFetch({
      "/ack": () => jsonResponse(200, { ok: true }),
      "/commands": () => {
        if (claimed) return jsonResponse(200, { commands: [] });
        claimed = true;
        return jsonResponse(200, {
          commands: [
            command({
              kind: "chat.turn",
              payload: {
                turnId: "ct_2",
                sessionId: "chs_1",
                sessionKind: "agent",
                projectId: null,
                projectSlug: null,
                agentId: "cloud_agt_missing",
                agentSlug: "no-such-agent",
                provider: null,
                model: null,
                attempt: 1,
                messages: [{ role: "user", content: "hi" }],
              },
            }),
          ],
        });
      },
    });

    startCommandLoop();
    await vi.advanceTimersByTimeAsync(0);

    const ack = fetchMock.mock.calls.find(([url]) => String(url).includes("/ack"));
    expect(JSON.parse(String((ack?.[1] as RequestInit).body))).toMatchObject({
      status: "failed",
      reason: "agent_not_available",
    });
  });

  it("applies an allowlisted setting", async () => {
    saveConnection({ token: "t", machineId: "mach-test", runtimes: [{ runtimeId: "rt", workspaceId: "ws" }] });

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

  it("T-M17-04: switching SETTING_TERMINAL_ACCESS off kills every live session on the machine", async () => {
    saveConnection({ token: "t", machineId: "mach-test", runtimes: [{ runtimeId: "rt", workspaceId: "ws" }] });

    let claimed = false;
    routeFetch({
      "/ack": () => jsonResponse(200, { ok: true }),
      "/commands": () => {
        if (claimed) return jsonResponse(200, { commands: [] });
        claimed = true;
        return jsonResponse(200, {
          commands: [
            command({ kind: "settings.set", payload: { key: SETTING_TERMINAL_ACCESS, value: "off" } }),
          ],
        });
      },
    });

    startCommandLoop();
    await vi.advanceTimersByTimeAsync(0);

    expect(killAllSessionsMock).toHaveBeenCalledWith("access_revoked");
  });

  it("T-M17-04: switching SETTING_TERMINAL_ACCESS on (or setting an unrelated key) does not kill anything", async () => {
    saveConnection({ token: "t", machineId: "mach-test", runtimes: [{ runtimeId: "rt", workspaceId: "ws" }] });

    let claimed = false;
    routeFetch({
      "/ack": () => jsonResponse(200, { ok: true }),
      "/commands": () => {
        if (claimed) return jsonResponse(200, { commands: [] });
        claimed = true;
        return jsonResponse(200, {
          commands: [
            command({ kind: "settings.set", payload: { key: SETTING_TERMINAL_ACCESS, value: "on" } }),
          ],
        });
      },
    });

    startCommandLoop();
    await vi.advanceTimersByTimeAsync(0);

    expect(killAllSessionsMock).not.toHaveBeenCalled();
  });

  it("refuses a setting outside the allowlist", async () => {
    // Without the allowlist this command is a remote write into every setting
    // the machine has, including ones added later.
    saveConnection({ token: "t", machineId: "mach-test", runtimes: [{ runtimeId: "rt", workspaceId: "ws" }] });

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

  it("dispatches memory.sync to a pull and acks done", async () => {
    // M6's doorbell. The command carries no payload: this machine already knows
    // its own workspace from its own token, so the row is a wake-up rather than
    // a delivery.
    saveConnection({ token: "t", machineId: "mach-test", runtimes: [{ runtimeId: "rt", workspaceId: "ws" }] });

    let claimed = false;
    let pulls = 0;
    const fetchMock = routeFetch({
      "/ack": () => jsonResponse(200, { ok: true }),
      "/memory/pull": () => {
        pulls++;
        return jsonResponse(200, { notes: [], nextCursor: null });
      },
      "/commands": () => {
        if (claimed) return jsonResponse(200, { commands: [] });
        claimed = true;
        return jsonResponse(200, { commands: [command({ kind: "memory.sync", payload: {} })] });
      },
    });

    // Started and settled BEFORE the command arrives, so the pull this test
    // counts is the one the command caused and not the startup sweep's.
    startMemorySync();
    await vi.advanceTimersByTimeAsync(10);
    const afterStartup = pulls;

    startCommandLoop();
    await vi.advanceTimersByTimeAsync(0);

    expect(pulls).toBeGreaterThan(afterStartup);
    // Finding nothing new is success. Acking `failed` here would put a red mark
    // on the board for the command's most common outcome.
    const ack = fetchMock.mock.calls.find(([url]) => String(url).includes("/ack"));
    expect(JSON.parse(String((ack?.[1] as RequestInit).body))).toMatchObject({ status: "done" });
  });

  it("dispatches providers.discover_models: calls the provider, POSTs the result, acks done (T-CS3-03)", async () => {
    saveConnection({ token: "t", machineId: "mach-test", runtimes: [{ runtimeId: "rt", workspaceId: "ws" }] });
    const discoverModels = vi.fn().mockResolvedValue({
      models: ["Gemini 3.7 Flash (High)"],
      live: true,
      detail: null,
    });
    getProviderMock.mockReturnValue({ id: "antigravity", kind: "cli", discoverModels });

    let claimed = false;
    const fetchMock = routeFetch({
      "/ack": () => jsonResponse(200, { ok: true }),
      "/providers/discover-models": () => jsonResponse(200, { ok: true }),
      "/commands": () => {
        if (claimed) return jsonResponse(200, { commands: [] });
        claimed = true;
        return jsonResponse(200, {
          commands: [command({ kind: "providers.discover_models", payload: { provider: "antigravity" } })],
        });
      },
    });

    startCommandLoop();
    await vi.advanceTimersByTimeAsync(0);

    expect(discoverModels).toHaveBeenCalledOnce();
    const posted = fetchMock.mock.calls.find(([url]) => String(url).includes("/providers/discover-models"));
    expect(posted).toBeDefined();
    expect(JSON.parse(String((posted?.[1] as RequestInit).body))).toMatchObject({
      provider: "antigravity",
      models: ["Gemini 3.7 Flash (High)"],
      live: true,
    });
    const ack = fetchMock.mock.calls.find(([url]) => String(url).includes("/ack"));
    expect(JSON.parse(String((ack?.[1] as RequestInit).body))).toMatchObject({ status: "done" });
  });

  it("acks providers.discover_models done (not failed) when the provider has no live discovery", async () => {
    // Not this machine's fault -- claude-code doesn't implement discoverModels
    // at all (Band 26 plan decision: its aliases don't drift). The control
    // plane shouldn't dispatch this provider here, but there's nothing to
    // retry, so this is success, not a red mark on the board.
    saveConnection({ token: "t", machineId: "mach-test", runtimes: [{ runtimeId: "rt", workspaceId: "ws" }] });
    getProviderMock.mockReturnValue({ id: "claude-code", kind: "cli" });

    let claimed = false;
    const fetchMock = routeFetch({
      "/ack": () => jsonResponse(200, { ok: true }),
      "/commands": () => {
        if (claimed) return jsonResponse(200, { commands: [] });
        claimed = true;
        return jsonResponse(200, {
          commands: [command({ kind: "providers.discover_models", payload: { provider: "claude-code" } })],
        });
      },
    });

    startCommandLoop();
    await vi.advanceTimersByTimeAsync(0);

    const ack = fetchMock.mock.calls.find(([url]) => String(url).includes("/ack"));
    expect(JSON.parse(String((ack?.[1] as RequestInit).body))).toMatchObject({ status: "done" });
  });

  it("fails an unknown command kind explicitly, so the board says why", async () => {
    saveConnection({ token: "t", machineId: "mach-test", runtimes: [{ runtimeId: "rt", workspaceId: "ws" }] });

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
    saveConnection({ token: "t", machineId: "mach-test", runtimes: [{ runtimeId: "rt", workspaceId: "ws" }] });
    const fetchMock = routeFetch({ "/commands": () => jsonResponse(403, { error: "revoked" }) });

    startCommandLoop();
    await vi.advanceTimersByTimeAsync(0);
    const afterFirst = fetchMock.mock.calls.length;

    await vi.advanceTimersByTimeAsync(COMMAND_POLL_INTERVAL_MS * 5);
    expect(fetchMock.mock.calls.length).toBe(afterFirst);
  });

  it("keeps polling through network failure", async () => {
    saveConnection({ token: "t", machineId: "mach-test", runtimes: [{ runtimeId: "rt", workspaceId: "ws" }] });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));

    startCommandLoop();
    await vi.advanceTimersByTimeAsync(0);
    const afterFirst = fetchMock.mock.calls.length;
    expect(afterFirst).toBeGreaterThan(0);

    await vi.advanceTimersByTimeAsync(COMMAND_POLL_INTERVAL_MS * 3);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(afterFirst);
  });

  it("single-flights: a slow poll does not overlap the next tick", async () => {
    saveConnection({ token: "t", machineId: "mach-test", runtimes: [{ runtimeId: "rt", workspaceId: "ws" }] });
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
    saveConnection({ token: "t", machineId: "mach-test", runtimes: [{ runtimeId: "rt", workspaceId: "ws" }] });
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
