import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatTurnStartPayload } from "@sparstrow/shared";
import { config } from "../config.js";
import { closeDb, getDb, openDb } from "../db/connection.js";
import { agents, projects } from "../db/schema.js";
import { completeOnce } from "../orchestrator/one-shot.js";
import { invalidatePairingCache, savePairing } from "./client.js";

vi.mock("../logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: vi.fn() },
}));

vi.mock("../orchestrator/one-shot.js", () => ({
  completeOnce: vi.fn(),
}));

import { resetChatTurnInFlight, runChatTurnCommand } from "./chat-turn.js";

/**
 * T-M12-04's own tests. `completeOnce` is mocked here (not spawned for
 * real, same discipline as `chat/service.test.ts`) — what these tests own is
 * everything AROUND that call: agent/project resolution reused from the
 * local path, the in-memory replay guard, batched event pushes, and that the
 * terminal `seq` always exceeds every streamed one.
 */

const now = "2026-08-10T00:00:00Z";
let tmpDir: string;

function payload(over: Partial<ChatTurnStartPayload> = {}): ChatTurnStartPayload {
  return {
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
    attachments: [],
    ...over,
  };
}

function jsonResponse(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function routeFetch(handlers: Record<string, () => Response>) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    for (const [fragment, respond] of Object.entries(handlers)) {
      if (url.includes(fragment)) return respond();
    }
    return jsonResponse(200, {});
  });
}

function bodiesFor(fetchMock: ReturnType<typeof routeFetch>, fragment: string): unknown[] {
  return fetchMock.mock.calls
    .filter(([url]) => String(url).includes(fragment))
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)));
}

describe("runChatTurnCommand", () => {
  let originalSecretsDir: string;
  let originalCloudUrl: string;
  let originalTmpDir: string;

  beforeEach(() => {
    vi.useFakeTimers();
    originalSecretsDir = config.secretsDir;
    originalCloudUrl = config.cloudUrl;
    originalTmpDir = config.tmpDir;
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sparstrow-chatturn-"));
    config.secretsDir = tmpDir;
    // T-CS6-02: point `tmpDir` at this test's own directory too. Left alone,
    // these tests wrote into the REAL `config.tmpDir` (`<dataDir>/tmp`) —
    // which passes on any machine that has run the daemon and creates that
    // directory, and fails with ENOENT on a clean one. That is exactly what
    // happened: green on a dev box, three failures in CI.
    config.tmpDir = path.join(tmpDir, "tmp");
    fs.mkdirSync(config.tmpDir, { recursive: true });
    config.cloudUrl = "http://cloud.test";
    invalidatePairingCache();
    savePairing({ token: "t", runtimeId: "rt", workspaceId: "ws" });

    closeDb();
    openDb(":memory:");
    vi.mocked(completeOnce).mockReset();
    resetChatTurnInFlight();
  });

  afterEach(() => {
    resetChatTurnInFlight();
    vi.useRealTimers();
    vi.restoreAllMocks();
    config.secretsDir = originalSecretsDir;
    config.cloudUrl = originalCloudUrl;
    config.tmpDir = originalTmpDir;
    fs.rmSync(tmpDir, { recursive: true, force: true });
    invalidatePairingCache();
    closeDb();
  });

  it("rejects a payload missing turnId/sessionId without touching completeOnce", () => {
    const outcome = runChatTurnCommand(payload({ turnId: "" }));
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.failure.reason).toBe("spawn_failed");
    expect(completeOnce).not.toHaveBeenCalled();
  });

  it("free session: resolves the synthetic chat agent and returns ok immediately (before completeOnce settles)", async () => {
    let resolveCompletion!: (r: unknown) => void;
    vi.mocked(completeOnce).mockReturnValue(
      new Promise((resolve) => {
        resolveCompletion = resolve;
      }) as never,
    );
    routeFetch({
      "/chat/turns/ct_1/result": () => jsonResponse(200, { ok: true }),
    });

    const outcome = runChatTurnCommand(payload());
    expect(outcome.ok).toBe(true);
    // completeOnce is called synchronously inside the fire-and-forget branch,
    // but the command's own ack does not wait for it.
    expect(completeOnce).toHaveBeenCalledTimes(1);
    const [agentArg, promptArg] = vi.mocked(completeOnce).mock.calls[0]!;
    expect((agentArg as { provider: string }).provider).toBe("claude-code");
    expect(promptArg).toContain("User: hi");

    resolveCompletion({ text: "hello", isError: false });
    await vi.runAllTimersAsync();
  });

  it("agent session: 404s with agent_not_available when the slug is unknown locally", () => {
    const outcome = runChatTurnCommand(
      payload({ sessionKind: "agent", agentId: "cloud_agt_1", agentSlug: "missing-agent" }),
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.failure.reason).toBe("agent_not_available");
    expect(completeOnce).not.toHaveBeenCalled();
  });

  it("agent session: resolves the local agent by slug and uses its provider/model when the payload has none", () => {
    getDb()
      .insert(agents)
      .values({
        id: "agt_local1",
        name: "Reviewer",
        slug: "reviewer",
        provider: "claude-code",
        model: "haiku",
        createdAt: now,
        updatedAt: now,
      })
      .run();
    vi.mocked(completeOnce).mockReturnValue(new Promise(() => {}) as never);

    const outcome = runChatTurnCommand(
      payload({
        sessionKind: "agent",
        agentId: "cloud_agt_1",
        agentSlug: "reviewer",
        provider: null,
        model: null,
      }),
    );
    expect(outcome.ok).toBe(true);
    const [agentArg] = vi.mocked(completeOnce).mock.calls[0]!;
    expect((agentArg as { provider: string; model: string }).provider).toBe("claude-code");
    expect((agentArg as { provider: string; model: string }).model).toBe("haiku");
  });

  it("project session: resolves the project's rootDir/name into the synthetic agent's prompt", () => {
    getDb()
      .insert(projects)
      .values({
        id: "prj_local1",
        name: "Demo",
        slug: "demo",
        rootDir: tmpDir,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    vi.mocked(completeOnce).mockReturnValue(new Promise(() => {}) as never);

    const outcome = runChatTurnCommand(
      payload({ sessionKind: "project", projectId: "cloud_prj_1", projectSlug: "demo" }),
    );
    expect(outcome.ok).toBe(true);
    const [agentArg] = vi.mocked(completeOnce).mock.calls[0]!;
    expect((agentArg as { systemPrompt: string }).systemPrompt).toContain("Demo");
    expect((agentArg as { cwd: string }).cwd).toBe(tmpDir);
  });

  it("project session: project_not_available when the directory is gone", () => {
    getDb()
      .insert(projects)
      .values({
        id: "prj_local1",
        name: "Demo",
        slug: "demo",
        rootDir: path.join(tmpDir, "does-not-exist"),
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const outcome = runChatTurnCommand(
      payload({ sessionKind: "project", projectId: "cloud_prj_1", projectSlug: "demo" }),
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.failure.reason).toBe("project_not_available");
  });

  it("does not start a second execution for a redelivered (in-flight) turn", () => {
    vi.mocked(completeOnce).mockReturnValue(new Promise(() => {}) as never);

    const first = runChatTurnCommand(payload());
    const second = runChatTurnCommand(payload());
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(completeOnce).toHaveBeenCalledTimes(1);
  });

  it("posts the terminal result with status succeeded and the full text on success", async () => {
    let onEventCb: ((d: { seq: number; replyText: string }) => void) | undefined;
    vi.mocked(completeOnce).mockImplementation(async (_agent, _prompt, opts) => {
      onEventCb = opts?.onEvent;
      return { text: "final answer", sessionId: "s", isError: false };
    });
    const fetchMock = routeFetch({
      "/chat/turns/ct_1/events": () => jsonResponse(200, { ok: true, storedThroughSeq: 1 }),
      "/chat/turns/ct_1/result": () => jsonResponse(200, { ok: true }),
    });

    runChatTurnCommand(payload());
    await vi.runAllTimersAsync();
    void onEventCb; // completeOnce resolves immediately in this mock; no deltas fired

    const resultBodies = bodiesFor(fetchMock, "/chat/turns/ct_1/result");
    expect(resultBodies).toHaveLength(1);
    expect(resultBodies[0]).toMatchObject({ status: "succeeded", replyText: "final answer" });
  });

  it("posts the terminal result with status failed when completeOnce reports an error", async () => {
    vi.mocked(completeOnce).mockResolvedValue({
      text: null,
      sessionId: "s",
      isError: true,
      errorMessage: "usage limit reached",
    });
    const fetchMock = routeFetch({
      "/chat/turns/ct_1/result": () => jsonResponse(200, { ok: true }),
    });

    runChatTurnCommand(payload());
    await vi.runAllTimersAsync();

    const resultBodies = bodiesFor(fetchMock, "/chat/turns/ct_1/result");
    expect(resultBodies[0]).toMatchObject({ status: "failed", error: "usage limit reached" });
  });

  it("posts the terminal result as failed when completeOnce itself throws", async () => {
    vi.mocked(completeOnce).mockRejectedValue(new Error("spawn ENOENT"));
    const fetchMock = routeFetch({
      "/chat/turns/ct_1/result": () => jsonResponse(200, { ok: true }),
    });

    runChatTurnCommand(payload());
    await vi.runAllTimersAsync();

    const resultBodies = bodiesFor(fetchMock, "/chat/turns/ct_1/result");
    expect(resultBodies[0]).toMatchObject({ status: "failed", error: "spawn ENOENT" });
  });

  it("batches onEvent deltas on a timer rather than posting one per call", async () => {
    // All three fire synchronously within completeOnce's mock body, before
    // its own returned promise resolves -- the pusher's flush timer is set
    // once on the first push and not re-armed by the following two.
    vi.mocked(completeOnce).mockImplementation(async (_agent, _prompt, opts) => {
      opts?.onEvent?.({ seq: 1, replyText: "Hel" });
      opts?.onEvent?.({ seq: 2, replyText: "Hello" });
      opts?.onEvent?.({ seq: 3, replyText: "Hello there" });
      return { text: "Hello there!", sessionId: "s", isError: false };
    });
    const fetchMock = routeFetch({
      "/chat/turns/ct_1/events": () => jsonResponse(200, { ok: true, storedThroughSeq: 3 }),
      "/chat/turns/ct_1/result": () => jsonResponse(200, { ok: true }),
    });

    runChatTurnCommand(payload());
    await vi.runAllTimersAsync();

    const eventBodies = bodiesFor(fetchMock, "/chat/turns/ct_1/events") as { events: unknown[] }[];
    // One flush, not three calls for three pushes.
    expect(eventBodies).toHaveLength(1);
    expect(eventBodies[0]!.events).toHaveLength(3);
  });

  it("the terminal seq always exceeds every streamed seq, even after several deltas", async () => {
    vi.mocked(completeOnce).mockImplementation(async (_agent, _prompt, opts) => {
      for (let i = 1; i <= 5; i++) opts?.onEvent?.({ seq: i, replyText: `partial ${i}` });
      return { text: "final", sessionId: "s", isError: false };
    });
    const fetchMock = routeFetch({
      "/chat/turns/ct_1/events": () => jsonResponse(200, { ok: true, storedThroughSeq: 5 }),
      "/chat/turns/ct_1/result": () => jsonResponse(200, { ok: true }),
    });

    runChatTurnCommand(payload());
    await vi.runAllTimersAsync();

    const eventBodies = bodiesFor(fetchMock, "/chat/turns/ct_1/events") as { events: { seq: number }[] }[];
    const maxStreamedSeq = Math.max(...eventBodies.flatMap((b) => b.events.map((e) => e.seq)));
    const resultBodies = bodiesFor(fetchMock, "/chat/turns/ct_1/result") as { seq: number }[];
    expect(resultBodies[0]!.seq).toBeGreaterThan(maxStreamedSeq);
  });

  // T-CS5-03
  describe("attachments", () => {
    function signRoute(signedUrl = "http://storage.test/signed/a.txt") {
      return { "/chat/attachments/sign": () => jsonResponse(200, { signedUrl }) };
    }

    it("free session: downloads into a fresh tempDir, clamps to cwd+Read for this call only, and names the path in the prompt", async () => {
      vi.mocked(completeOnce).mockResolvedValue({ text: "ok", sessionId: "s", isError: false });
      const fetchMock = routeFetch({
        ...signRoute(),
        "storage.test/signed/a.txt": () => new Response("attachment bytes", { status: 200 }),
        "/chat/turns/ct_1/result": () => jsonResponse(200, { ok: true }),
      });

      runChatTurnCommand(
        payload({ attachments: [{ storagePath: "ws_1/chs_1/a.txt", filename: "notes.txt" }] }),
      );
      await vi.runAllTimersAsync();

      const [agentArg, promptArg] = vi.mocked(completeOnce).mock.calls[0]!;
      const agent = agentArg as { cwd: string | null; allowedTools: string[] };
      expect(agent.allowedTools).toEqual(["Read"]);
      expect(agent.cwd).toBeTruthy();
      expect(promptArg as string).toContain(agent.cwd!);
      expect(promptArg as string).toContain('originally named "notes.txt"');

      // The tempDir is this turn's own, cleaned up once the turn settles --
      // not the session's, not the agent's, and not left behind.
      expect(fs.existsSync(agent.cwd!)).toBe(false);

      const signBody = bodiesFor(fetchMock, "/chat/attachments/sign")[0];
      expect(signBody).toEqual({ storagePath: "ws_1/chs_1/a.txt" });
    });

    it("project session: places the file in rootDir, unchanged agent (no cwd/allowedTools override)", async () => {
      getDb()
        .insert(projects)
        .values({ id: "prj_local1", name: "Demo", slug: "demo", rootDir: tmpDir, createdAt: now, updatedAt: now })
        .run();
      vi.mocked(completeOnce).mockResolvedValue({ text: "ok", sessionId: "s", isError: false });
      routeFetch({
        ...signRoute(),
        "storage.test/signed/a.txt": () => new Response("attachment bytes", { status: 200 }),
        "/chat/turns/ct_1/result": () => jsonResponse(200, { ok: true }),
      });

      runChatTurnCommand(
        payload({
          sessionKind: "project",
          projectId: "cloud_prj_1",
          projectSlug: "demo",
          attachments: [{ storagePath: "ws_1/chs_1/a.txt", filename: "notes.txt" }],
        }),
      );
      await vi.runAllTimersAsync();

      const [agentArg, promptArg] = vi.mocked(completeOnce).mock.calls[0]!;
      const agent = agentArg as { cwd: string; allowedTools: string[] };
      expect(agent.cwd).toBe(tmpDir); // still the project's own rootDir, not a tempDir
      expect(agent.allowedTools).toEqual(["Read", "Grep", "Glob"]); // unchanged from chatAgent()'s project branch
      expect(promptArg as string).toContain(tmpDir);

      // Downloaded straight into the real project directory -- confirm the
      // file actually landed, not just that the prompt claims a path.
      const downloaded = fs.readdirSync(tmpDir).filter((f) => f.endsWith("-notes.txt"));
      expect(downloaded).toHaveLength(1);
    });

    it("a turn with no attachments never calls the sign route", async () => {
      vi.mocked(completeOnce).mockResolvedValue({ text: "ok", sessionId: "s", isError: false });
      const fetchMock = routeFetch({ "/chat/turns/ct_1/result": () => jsonResponse(200, { ok: true }) });

      runChatTurnCommand(payload());
      await vi.runAllTimersAsync();

      expect(bodiesFor(fetchMock, "/chat/attachments/sign")).toHaveLength(0);
    });

    it("fails the turn legibly, without ever calling completeOnce, when the download itself fails", async () => {
      const fetchMock = routeFetch({
        ...signRoute(),
        "storage.test/signed/a.txt": () => new Response("not found", { status: 404 }),
        "/chat/turns/ct_1/result": () => jsonResponse(200, { ok: true }),
      });

      runChatTurnCommand(
        payload({ attachments: [{ storagePath: "ws_1/chs_1/a.txt", filename: "notes.txt" }] }),
      );
      await vi.runAllTimersAsync();

      expect(completeOnce).not.toHaveBeenCalled();
      const resultBodies = bodiesFor(fetchMock, "/chat/turns/ct_1/result");
      expect(resultBodies).toHaveLength(1);
      expect(resultBodies[0]).toMatchObject({ status: "failed" });
      expect((resultBodies[0] as { error: string }).error).toMatch(/404/);
    });

    it("times out a hung download rather than hanging the turn past its own budget", async () => {
      // routeFetch's handlers don't see the request `init`, so a hung
      // connection that genuinely honours AbortSignal (as real fetch does)
      // needs its own mock here rather than routeFetch's simpler one.
      const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const url = String(input);
        if (url.includes("/chat/attachments/sign")) {
          return jsonResponse(200, { signedUrl: "http://storage.test/signed/a.txt" });
        }
        if (url.includes("storage.test/signed/a.txt")) {
          // Never resolves on its own -- exactly a hung connection. Only
          // rejects if the caller's AbortSignal actually fires, same as a
          // real fetch would.
          return new Promise<Response>((_resolve, reject) => {
            const signal = (init as RequestInit | undefined)?.signal;
            signal?.addEventListener("abort", () => reject(new Error("The operation was aborted.")));
          });
        }
        if (url.includes("/chat/turns/ct_1/result")) return jsonResponse(200, { ok: true });
        return jsonResponse(200, {});
      });

      runChatTurnCommand(
        payload({ attachments: [{ storagePath: "ws_1/chs_1/a.txt", filename: "notes.txt" }] }),
      );
      await vi.runAllTimersAsync();

      expect(completeOnce).not.toHaveBeenCalled();
      const resultBodies = bodiesFor(fetchMock, "/chat/turns/ct_1/result");
      expect(resultBodies[0]).toMatchObject({ status: "failed" });
      expect((resultBodies[0] as { error: string }).error).toMatch(/timed out/);
    });
  });
});
