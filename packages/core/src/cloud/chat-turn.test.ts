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
      // AM1 (T-AM1-02): Write was added alongside Read so a turn that BOTH
      // reads an attachment and hands something back can actually write to
      // its outbox -- see that task's own trap.
      expect(agent.allowedTools).toEqual(["Read", "Write"]);
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

  // T-AM1-02
  describe("outbox", () => {
    function outboxDirFrom(agentArg: unknown): string {
      const addDirs = (agentArg as { addDirs: string[] }).addDirs;
      // Appended last, regardless of which branch (plain or attachment-clamped
      // agent) constructed the rest of addDirs first.
      return addDirs[addDirs.length - 1]!;
    }

    it("creates a fresh outbox for every turn, tells the agent about it, and removes it once the turn ends", async () => {
      let capturedOutbox = "";
      vi.mocked(completeOnce).mockImplementation(async (agentArg, promptArg) => {
        capturedOutbox = outboxDirFrom(agentArg);
        expect(fs.existsSync(capturedOutbox)).toBe(true);
        expect(promptArg as string).toContain(capturedOutbox);
        return { text: "done", sessionId: "s", isError: false };
      });
      routeFetch({ "/chat/turns/ct_1/result": () => jsonResponse(200, { ok: true }) });

      runChatTurnCommand(payload());
      await vi.runAllTimersAsync();

      expect(capturedOutbox).toBeTruthy();
      expect(fs.existsSync(capturedOutbox)).toBe(false);
    });

    it("keeps a file the agent writes into the outbox, and does not add anything to the reply when nothing was refused", async () => {
      vi.mocked(completeOnce).mockImplementation(async (agentArg) => {
        const outbox = outboxDirFrom(agentArg);
        fs.writeFileSync(path.join(outbox, "chart.png"), "fake png bytes");
        return { text: "Here you go!", sessionId: "s", isError: false };
      });
      const fetchMock = routeFetch({ "/chat/turns/ct_1/result": () => jsonResponse(200, { ok: true }) });

      runChatTurnCommand(payload());
      await vi.runAllTimersAsync();

      const resultBodies = bodiesFor(fetchMock, "/chat/turns/ct_1/result");
      expect(resultBodies[0]).toMatchObject({ status: "succeeded", replyText: "Here you go!" });
    });

    it("ignores a subdirectory the agent creates inside the outbox", async () => {
      vi.mocked(completeOnce).mockImplementation(async (agentArg) => {
        const outbox = outboxDirFrom(agentArg);
        fs.mkdirSync(path.join(outbox, "scratch"));
        fs.writeFileSync(path.join(outbox, "scratch", "ignored.png"), "x");
        fs.writeFileSync(path.join(outbox, "chart.png"), "fake png bytes");
        return { text: "ok", sessionId: "s", isError: false };
      });
      const fetchMock = routeFetch({ "/chat/turns/ct_1/result": () => jsonResponse(200, { ok: true }) });

      runChatTurnCommand(payload());
      await vi.runAllTimersAsync();

      // No refusal note for the subdirectory's file -- it was never seen.
      const resultBodies = bodiesFor(fetchMock, "/chat/turns/ct_1/result");
      expect((resultBodies[0] as { replyText: string }).replyText).toBe("ok");
    });

    it("refuses an oversized file and names it in the reply, without failing the turn", async () => {
      vi.mocked(completeOnce).mockImplementation(async (agentArg) => {
        const outbox = outboxDirFrom(agentArg);
        const big = Buffer.alloc(11 * 1024 * 1024, 1); // over CHAT_PRODUCED_MAX_BYTES (10 MB)
        fs.writeFileSync(path.join(outbox, "huge.png"), big);
        return { text: "made it", sessionId: "s", isError: false };
      });
      const fetchMock = routeFetch({ "/chat/turns/ct_1/result": () => jsonResponse(200, { ok: true }) });

      runChatTurnCommand(payload());
      await vi.runAllTimersAsync();

      const resultBodies = bodiesFor(fetchMock, "/chat/turns/ct_1/result");
      const body = resultBodies[0] as { status: string; replyText: string };
      expect(body.status).toBe("succeeded"); // the turn itself did not fail
      expect(body.replyText).toContain("made it");
      expect(body.replyText).toContain("huge.png");
      expect(body.replyText).toMatch(/too large|larger than/);
    });

    it("refuses a file of an unrecognized type without failing the turn", async () => {
      vi.mocked(completeOnce).mockImplementation(async (agentArg) => {
        const outbox = outboxDirFrom(agentArg);
        fs.writeFileSync(path.join(outbox, "archive.zip"), "not a real zip");
        return { text: "done", sessionId: "s", isError: false };
      });
      const fetchMock = routeFetch({ "/chat/turns/ct_1/result": () => jsonResponse(200, { ok: true }) });

      runChatTurnCommand(payload());
      await vi.runAllTimersAsync();

      const resultBodies = bodiesFor(fetchMock, "/chat/turns/ct_1/result");
      const body = resultBodies[0] as { replyText: string };
      expect(body.replyText).toContain("archive.zip");
    });

    it("a turn that writes nothing to the outbox costs nothing extra in the reply (SC-005)", async () => {
      vi.mocked(completeOnce).mockResolvedValue({ text: "just words", sessionId: "s", isError: false });
      const fetchMock = routeFetch({ "/chat/turns/ct_1/result": () => jsonResponse(200, { ok: true }) });

      runChatTurnCommand(payload());
      await vi.runAllTimersAsync();

      const resultBodies = bodiesFor(fetchMock, "/chat/turns/ct_1/result");
      expect(resultBodies[0]).toMatchObject({ status: "succeeded", replyText: "just words" });
    });

    it("clamp interaction: a turn with BOTH an attachment and an outbox write can do both", async () => {
      const fetchMock = routeFetch({
        "/chat/attachments/sign": () => jsonResponse(200, { signedUrl: "http://storage.test/signed/a.txt" }),
        "storage.test/signed/a.txt": () => new Response("attachment bytes", { status: 200 }),
        "/chat/turns/ct_1/result": () => jsonResponse(200, { ok: true }),
      });
      vi.mocked(completeOnce).mockImplementation(async (agentArg, promptArg) => {
        const agent = agentArg as { allowedTools: string[]; cwd: string };
        // The clamp must include Write, or this file write would be a lie
        // about what the agent could actually do in a real spawn.
        expect(agent.allowedTools).toContain("Write");
        expect(promptArg as string).toContain("notes.txt");
        const outbox = outboxDirFrom(agentArg);
        fs.writeFileSync(path.join(outbox, "reply.png"), "img bytes");
        return { text: "used your file and made one", sessionId: "s", isError: false };
      });

      runChatTurnCommand(
        payload({ attachments: [{ storagePath: "ws_1/chs_1/a.txt", filename: "notes.txt" }] }),
      );
      await vi.runAllTimersAsync();

      const resultBodies = bodiesFor(fetchMock, "/chat/turns/ct_1/result");
      expect(resultBodies[0]).toMatchObject({ status: "succeeded" });
    });

    it("project session: the outbox is still separate from the project's rootDir (FR-016)", async () => {
      getDb()
        .insert(projects)
        .values({ id: "prj_local1", name: "Demo", slug: "demo", rootDir: tmpDir, createdAt: now, updatedAt: now })
        .run();

      let capturedOutbox = "";
      vi.mocked(completeOnce).mockImplementation(async (agentArg) => {
        const agent = agentArg as { cwd: string };
        capturedOutbox = outboxDirFrom(agentArg);
        // The project's own rootDir is untouched -- the outbox is a sibling
        // temp directory, never the project folder itself.
        expect(agent.cwd).toBe(tmpDir);
        expect(capturedOutbox).not.toBe(tmpDir);
        expect(capturedOutbox.startsWith(tmpDir)).toBe(false);
        return { text: "ok", sessionId: "s", isError: false };
      });
      routeFetch({ "/chat/turns/ct_1/result": () => jsonResponse(200, { ok: true }) });

      runChatTurnCommand(
        payload({ sessionKind: "project", projectId: "cloud_prj_1", projectSlug: "demo" }),
      );
      await vi.runAllTimersAsync();

      expect(capturedOutbox).toBeTruthy();
    });
  });

  // T-AM1-03. The outbox tests above pre-date the upload step and, left
  // unmocked, the sign-upload/PUT calls fall through `routeFetch`'s
  // catch-all (a bare 200) rather than actually failing -- which is why they
  // still pass without proving the upload wiring itself. These tests mock
  // both calls explicitly.
  describe("produced files (upload + bind)", () => {
    function outboxDirFrom(agentArg: unknown): string {
      const addDirs = (agentArg as { addDirs: string[] }).addDirs;
      return addDirs[addDirs.length - 1]!;
    }

    function uploadRoute(signedUrl = "http://storage.test/upload/signed") {
      return { "/chat/attachments/sign-upload": () => jsonResponse(200, { signedUrl, token: "tok", path: "x" }) };
    }

    it("uploads a kept file via sign-upload + PUT and includes it in the posted result's produced field", async () => {
      vi.mocked(completeOnce).mockImplementation(async (agentArg) => {
        const outbox = outboxDirFrom(agentArg);
        fs.writeFileSync(path.join(outbox, "chart.png"), "fake png bytes");
        return { text: "Here you go!", sessionId: "s", isError: false };
      });
      const fetchMock = routeFetch({
        ...uploadRoute(),
        "storage.test/upload/signed": () => new Response(null, { status: 200 }),
        "/chat/turns/ct_1/result": () => jsonResponse(200, { ok: true }),
      });

      runChatTurnCommand(payload());
      await vi.runAllTimersAsync();

      // The upload itself: a PUT with the file's bytes and its mime type.
      const putCall = fetchMock.mock.calls.find(
        ([url, init]) => String(url).includes("storage.test/upload/signed") && (init as RequestInit)?.method === "PUT",
      );
      expect(putCall).toBeTruthy();
      const putInit = putCall![1] as RequestInit;
      expect(putInit.body?.toString()).toContain("fake png bytes");
      expect((putInit.headers as Record<string, string>)["content-type"]).toBe("image/png");

      const resultBodies = bodiesFor(fetchMock, "/chat/turns/ct_1/result") as {
        replyText: string;
        status: string;
        produced: Array<{ storagePath: string; filename: string; mimeType: string; sizeBytes: number }>;
      }[];
      const body = resultBodies[0]!;
      expect(body.status).toBe("succeeded");
      expect(body.replyText).toBe("Here you go!");
      expect(body.produced).toHaveLength(1);
      expect(body.produced[0]).toMatchObject({ filename: "chart.png", mimeType: "image/png" });
    });

    it("the produced storagePath has exactly two folder segments and starts with the workspace id (matches 025's storage policy)", async () => {
      vi.mocked(completeOnce).mockImplementation(async (agentArg) => {
        const outbox = outboxDirFrom(agentArg);
        fs.writeFileSync(path.join(outbox, "chart.png"), "bytes");
        return { text: "ok", sessionId: "s", isError: false };
      });
      let requestedStoragePath = "";
      const fetchMock = routeFetch({
        "/chat/attachments/sign-upload": () => jsonResponse(200, { signedUrl: "http://storage.test/upload/signed", token: "tok" }),
        "storage.test/upload/signed": () => new Response(null, { status: 200 }),
        "/chat/turns/ct_1/result": () => jsonResponse(200, { ok: true }),
      });

      runChatTurnCommand(payload());
      await vi.runAllTimersAsync();

      const signCall = fetchMock.mock.calls.find(([url]) => String(url).includes("/chat/attachments/sign-upload"));
      requestedStoragePath = (JSON.parse(String((signCall![1] as RequestInit).body)) as { storagePath: string }).storagePath;

      const folderSegments = requestedStoragePath.split("/").length - 1;
      expect(folderSegments).toBe(2);
      expect(requestedStoragePath.startsWith("ws/")).toBe(true); // "ws" is this test file's own pairing workspaceId
    });

    it("an upload failure becomes a refusal sentence, not a lost turn or a lost reply", async () => {
      vi.mocked(completeOnce).mockImplementation(async (agentArg) => {
        const outbox = outboxDirFrom(agentArg);
        fs.writeFileSync(path.join(outbox, "chart.png"), "bytes");
        return { text: "made you a chart", sessionId: "s", isError: false };
      });
      const fetchMock = routeFetch({
        ...uploadRoute(),
        "storage.test/upload/signed": () => new Response("server error", { status: 500 }),
        "/chat/turns/ct_1/result": () => jsonResponse(200, { ok: true }),
      });

      runChatTurnCommand(payload());
      await vi.runAllTimersAsync();

      const resultBodies = bodiesFor(fetchMock, "/chat/turns/ct_1/result") as {
        status: string;
        replyText: string;
        produced: unknown[];
      }[];
      const body = resultBodies[0]!;
      expect(body.status).toBe("succeeded"); // the model's own work did not fail
      expect(body.replyText).toContain("made you a chart");
      expect(body.replyText).toContain("chart.png");
      expect(body.replyText).toMatch(/could not be saved/);
      expect(body.produced).toHaveLength(0);
    });

    it("FR-004: a turn that produced a file and wrote no text is succeeded, not failed", async () => {
      vi.mocked(completeOnce).mockImplementation(async (agentArg) => {
        const outbox = outboxDirFrom(agentArg);
        fs.writeFileSync(path.join(outbox, "chart.png"), "bytes");
        return { text: "", sessionId: "s", isError: false };
      });
      const fetchMock = routeFetch({
        ...uploadRoute(),
        "storage.test/upload/signed": () => new Response(null, { status: 200 }),
        "/chat/turns/ct_1/result": () => jsonResponse(200, { ok: true }),
      });

      runChatTurnCommand(payload());
      await vi.runAllTimersAsync();

      const resultBodies = bodiesFor(fetchMock, "/chat/turns/ct_1/result") as {
        status: string;
        error: string | null;
        produced: unknown[];
      }[];
      // Before this task, `!result.text` alone marked this `failed` -- the
      // exact bug FR-004 exists to fix (phase README finding 4).
      const body = resultBodies[0]!;
      expect(body.status).toBe("succeeded");
      expect(body.error).toBeNull();
      expect(body.produced).toHaveLength(1);
    });

    it("a turn with genuinely no text and no produced file is still failed (unchanged pre-existing behavior)", async () => {
      vi.mocked(completeOnce).mockResolvedValue({ text: "", sessionId: "s", isError: false });
      const fetchMock = routeFetch({ "/chat/turns/ct_1/result": () => jsonResponse(200, { ok: true }) });

      runChatTurnCommand(payload());
      await vi.runAllTimersAsync();

      const resultBodies = bodiesFor(fetchMock, "/chat/turns/ct_1/result") as { status: string; produced: unknown[] }[];
      const body = resultBodies[0]!;
      expect(body.status).toBe("failed");
      expect(body.produced).toHaveLength(0);
    });

    it("FR-013: a turn that produced a file and then errored still reports the file, alongside the failure", async () => {
      // The model wrote a file to the outbox before its own run errored --
      // partial work is not thrown away. `result.isError` still forces
      // status=failed (the model DID fail), but `produced` is populated
      // unconditionally, not gated by status -- that is what lets the SQL
      // side (029_chat_produced_files.sql) bind the file to a message even
      // on a failed turn.
      vi.mocked(completeOnce).mockImplementation(async (agentArg) => {
        const outbox = outboxDirFrom(agentArg);
        fs.writeFileSync(path.join(outbox, "partial.png"), "bytes");
        return { text: null, sessionId: "s", isError: true, errorMessage: "usage limit reached" };
      });
      const fetchMock = routeFetch({
        ...uploadRoute(),
        "storage.test/upload/signed": () => new Response(null, { status: 200 }),
        "/chat/turns/ct_1/result": () => jsonResponse(200, { ok: true }),
      });

      runChatTurnCommand(payload());
      await vi.runAllTimersAsync();

      const resultBodies = bodiesFor(fetchMock, "/chat/turns/ct_1/result") as {
        status: string;
        error: string | null;
        produced: unknown[];
      }[];
      const body = resultBodies[0]!;
      expect(body.status).toBe("failed");
      expect(body.error).toBe("usage limit reached");
      expect(body.produced).toHaveLength(1);
    });
  });
});
