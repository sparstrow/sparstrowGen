import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, openDb } from "../db/connection.js";
import { agents, projects } from "../db/schema.js";
import { completeOnce } from "../orchestrator/one-shot.js";

vi.mock("../logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: vi.fn() },
}));

vi.mock("../orchestrator/one-shot.js", () => ({
  completeOnce: vi.fn(),
}));

vi.mock("../agents/preflight.js", () => ({
  runPreflight: vi.fn().mockResolvedValue({ matches: [], standards: [] }),
}));

import {
  buildTranscriptPrompt,
  classifyTurnError,
  createChatSession,
  fallbackTarget,
  getChatSession,
  listChatMessages,
  listChatSessions,
  postChatTurn,
  retryChatTurn,
  updateChatSession,
} from "./service.js";

const msg = (role: "user" | "assistant", content: string) =>
  ({ id: `m_${content.length}_${role}`, role, content }) as any;

describe("buildTranscriptPrompt — argv budget (intake 0009)", () => {
  it("keeps the newest messages within the byte budget, dropping oldest first", () => {
    const history = [
      msg("user", "A".repeat(20_000)),
      msg("assistant", "B".repeat(20_000)),
      msg("user", "what is 2+2?"),
    ];
    const prompt = buildTranscriptPrompt(history);
    // Must stay well under Windows' ~32KB command-line ceiling.
    expect(Buffer.byteLength(prompt, "utf8")).toBeLessThan(32_000);
    // The newest message survives; the oldest is dropped.
    expect(prompt).toContain("what is 2+2?");
    expect(prompt).not.toContain("A".repeat(20_000));
  });

  it("keeps the newest message even when it alone exceeds the budget", () => {
    const huge = "Z".repeat(40_000);
    const prompt = buildTranscriptPrompt([msg("user", huge)]);
    expect(prompt).toContain(huge);
  });

  it("keeps a short conversation intact", () => {
    const prompt = buildTranscriptPrompt([msg("user", "hi"), msg("assistant", "hello")]);
    expect(prompt).toContain("User: hi");
    expect(prompt).toContain("Assistant: hello");
  });
});

const ts = "2026-01-01T00:00:00Z";

const okResult = (text: string) => ({ text, sessionId: "s", isError: false }) as any;
const errResult = (errorMessage: string) =>
  ({ text: null, sessionId: "s", isError: true, errorMessage }) as any;

describe("chat service", () => {
  let db: ReturnType<typeof openDb>["db"];

  beforeEach(() => {
    closeDb();
    vi.mocked(completeOnce).mockReset();
    db = openDb(":memory:").db;
    db.insert(projects)
      .values({
        id: "proj_1",
        name: "Demo",
        slug: "demo",
        rootDir: "C:/repos/demo",
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    db.insert(agents)
      .values({
        id: "agent_1",
        name: "Reviewer",
        slug: "reviewer",
        provider: "claude-code",
        model: "sonnet",
        systemPrompt: "review things",
        createdAt: ts,
        updatedAt: ts,
      } as any)
      .run();
  });
  afterEach(() => closeDb());

  describe("session lifecycle", () => {
    it("creates a free session with defaults and lists it", () => {
      const session = createChatSession({ kind: "free" });
      expect(session.provider).toBe("claude-code");
      expect(session.model).toBe("sonnet");
      expect(session.status).toBe("active");
      expect(listChatSessions({}).map((s) => s.id)).toContain(session.id);
    });

    it("rejects direct-API providers for chat", () => {
      expect(() => createChatSession({ kind: "free", provider: "ollama" as any })).toThrowError(
        /CLI providers only/,
      );
    });

    it("project session requires an existing project", () => {
      expect(() => createChatSession({ kind: "project" })).toThrowError(/projectId is required/);
      expect(() => createChatSession({ kind: "project", projectId: "nope" })).toThrowError(
        /project not found/,
      );
      const session = createChatSession({ kind: "project", projectId: "proj_1" });
      expect(session.projectId).toBe("proj_1");
    });

    it("agent session mirrors the agent's provider/model", () => {
      const session = createChatSession({ kind: "agent", agentId: "agent_1" });
      expect(session.agentId).toBe("agent_1");
      expect(session.provider).toBe("claude-code");
      expect(session.model).toBe("sonnet");
    });

    it("filters by kind and status; archive works", () => {
      const a = createChatSession({ kind: "free" });
      createChatSession({ kind: "agent-creator" });
      updateChatSession(a.id, { status: "archived", title: "old chat" });
      expect(listChatSessions({ kind: "free", status: "active" })).toHaveLength(0);
      const archived = listChatSessions({ status: "archived" });
      expect(archived).toHaveLength(1);
      expect(archived[0]!.title).toBe("old chat");
    });
  });

  describe("free/project/agent turns", () => {
    it("stores both sides of a successful turn and auto-titles the session", async () => {
      vi.mocked(completeOnce).mockResolvedValueOnce(okResult("Hello there!"));
      const session = createChatSession({ kind: "free" });
      const turn = await postChatTurn(session.id, "Hi, what can you do?");
      expect(turn.error).toBeNull();
      expect(turn.assistantMessage?.content).toBe("Hello there!");
      expect(turn.assistantMessage?.meta).toMatchObject({ source: "ai", model: "sonnet" });
      const messages = listChatMessages(session.id);
      expect(messages.map((m) => m.role)).toEqual(["user", "assistant"]);
      expect(getChatSession(session.id).title).toBe("Hi, what can you do?");
      expect(getChatSession(session.id).lastMessageAt).toBeTruthy();
    });

    it("project turns run with read-only tools and the project cwd", async () => {
      vi.mocked(completeOnce).mockResolvedValueOnce(okResult("It's a Fastify app."));
      const session = createChatSession({ kind: "project", projectId: "proj_1" });
      await postChatTurn(session.id, "What framework does this use?");
      const [agentArg] = vi.mocked(completeOnce).mock.calls[0]!;
      expect(agentArg.cwd).toBe("C:/repos/demo");
      expect(agentArg.allowedTools).toEqual(["Read", "Grep", "Glob"]);
      expect(agentArg.systemPrompt).toContain("Demo");
    });

    it("agent turns use the stored agent row", async () => {
      vi.mocked(completeOnce).mockResolvedValueOnce(okResult("On it."));
      const session = createChatSession({ kind: "agent", agentId: "agent_1" });
      await postChatTurn(session.id, "Review the diff");
      const [agentArg, prompt] = vi.mocked(completeOnce).mock.calls[0]!;
      expect(agentArg.systemPrompt).toBe("review things");
      expect(prompt).toContain("Review the diff");
    });

    it("failed turn: retries the primary, then reports the reason + a fallback offer", async () => {
      vi.mocked(completeOnce)
        .mockResolvedValueOnce(errResult("usage limit reached"))
        .mockResolvedValueOnce(errResult("usage limit reached"));
      const session = createChatSession({ kind: "free" });
      const turn = await postChatTurn(session.id, "hello");
      expect(completeOnce).toHaveBeenCalledTimes(2);
      expect(turn.assistantMessage).toBeNull();
      expect(turn.error).toMatchObject({
        kind: "usage-limit",
        reason: "usage limit reached",
        attempts: 2,
        fallback: { provider: "claude-code", model: "haiku" },
      });
      // The user message stays pending for retry.
      expect(listChatMessages(session.id).map((m) => m.role)).toEqual(["user"]);
    });

    it("retry re-runs the pending user message on the approved secondary model", async () => {
      vi.mocked(completeOnce)
        .mockResolvedValueOnce(errResult("draft turn timed out"))
        .mockResolvedValueOnce(errResult("draft turn timed out"))
        .mockResolvedValueOnce(okResult("Recovered on haiku."));
      const session = createChatSession({ kind: "free" });
      const failed = await postChatTurn(session.id, "hello");
      expect(failed.error?.kind).toBe("timeout");

      const retried = await retryChatTurn(session.id, { provider: "claude-code", model: "haiku" });
      expect(retried.error).toBeNull();
      expect(retried.assistantMessage?.meta).toMatchObject({ model: "haiku" });
      expect(listChatMessages(session.id).map((m) => m.role)).toEqual(["user", "assistant"]);
      // A second user message is now accepted (previous turn completed).
      vi.mocked(completeOnce).mockResolvedValueOnce(okResult("Sure."));
      await expect(postChatTurn(session.id, "thanks")).resolves.toBeTruthy();
    });

    it("blocks a new turn while one is pending, and retry without a pending turn 409s", async () => {
      vi.mocked(completeOnce)
        .mockResolvedValueOnce(errResult("boom"))
        .mockResolvedValueOnce(errResult("boom"));
      const session = createChatSession({ kind: "free" });
      await postChatTurn(session.id, "hello");
      await expect(postChatTurn(session.id, "again")).rejects.toThrowError(/previous turn/);

      const fresh = createChatSession({ kind: "free" });
      await expect(retryChatTurn(fresh.id, undefined)).rejects.toThrowError(/nothing to run/);
    });

    it("switching the session model mid-conversation drives the next turn", async () => {
      vi.mocked(completeOnce)
        .mockResolvedValueOnce(okResult("From sonnet."))
        .mockResolvedValueOnce(okResult("From haiku."));
      const session = createChatSession({ kind: "free" });
      await postChatTurn(session.id, "first");

      const updated = updateChatSession(session.id, { provider: "claude-code", model: "haiku" });
      expect(updated.model).toBe("haiku");
      expect(() =>
        updateChatSession(session.id, { provider: "ollama" as any }),
      ).toThrowError(/CLI providers only/);

      const turn = await postChatTurn(session.id, "second");
      const [agentArg] = vi.mocked(completeOnce).mock.calls[1]!;
      expect(agentArg.model).toBe("haiku");
      expect(turn.assistantMessage?.meta).toMatchObject({ model: "haiku" });
      // The first reply keeps its original model stamp.
      const first = listChatMessages(session.id).find((m) => m.role === "assistant");
      expect(first?.meta).toMatchObject({ model: "sonnet" });
    });

    it("archived sessions refuse turns", async () => {
      const session = createChatSession({ kind: "free" });
      updateChatSession(session.id, { status: "archived" });
      await expect(postChatTurn(session.id, "hi")).rejects.toThrowError(/archived/);
    });
  });

  describe("agent-creator turns", () => {
    it("persists the interview and the clamped draft on the session", async () => {
      vi.mocked(completeOnce).mockResolvedValueOnce(
        okResult(
          JSON.stringify({
            reply: "Great — let me confirm my understanding before drafting.",
            intent: "build",
            draft: { name: "spec-writer", provider: "claude-code", model: "sonnet" },
            followups: ["Yes, that's right", "Change the output format"],
          }),
        ),
      );
      const session = createChatSession({ kind: "agent-creator" });
      const turn = await postChatTurn(session.id, "I want an agent that writes specs");
      expect(turn.error).toBeNull();
      expect(turn.draftTurn?.draft.name).toBe("spec-writer");
      expect(turn.assistantMessage?.meta).toMatchObject({
        source: "ai",
        followups: ["Yes, that's right", "Change the output format"],
      });
      const stored = getChatSession(session.id);
      expect(stored.draft).toMatchObject({ name: "spec-writer" });
      expect(listChatMessages(session.id)).toHaveLength(2);
    });

    it("transport failure surfaces the reason + fallback offer without a synthetic reply", async () => {
      vi.mocked(completeOnce).mockResolvedValue(errResult("draft turn timed out"));
      const session = createChatSession({ kind: "agent-creator" });
      const turn = await postChatTurn(session.id, "make me an agent");
      expect(turn.assistantMessage).toBeNull();
      expect(turn.error?.kind).toBe("timeout");
      expect(turn.error?.fallback).toEqual({ provider: "claude-code", model: "haiku" });
      expect(turn.draftTurn?.source).toBe("fallback");
      expect(listChatMessages(session.id).map((m) => m.role)).toEqual(["user"]);
    });
  });

  describe("helpers", () => {
    it("classifies failure reasons", () => {
      expect(classifyTurnError("draft turn timed out")).toBe("timeout");
      expect(classifyTurnError("spawn agy ENOENT")).toBe("not-installed");
      expect(classifyTurnError("429 too many requests")).toBe("usage-limit");
      expect(classifyTurnError("something odd")).toBe("provider");
      expect(classifyTurnError("")).toBe("unknown");
    });

    it("suggests a sane secondary model", () => {
      expect(fallbackTarget("claude-code", "sonnet")).toEqual({
        provider: "claude-code",
        model: "haiku",
      });
      expect(fallbackTarget("claude-code", "haiku")).toEqual({
        provider: "claude-code",
        model: "sonnet",
      });
      expect(fallbackTarget("antigravity", "Gemini 3.1 Pro (High)")).toEqual({
        provider: "claude-code",
        model: "sonnet",
      });
    });
  });
});
