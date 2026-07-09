import { describe, it, expect, vi, beforeEach } from "vitest";
import { runPipelineDraftTurn, extractJson, clampDraft } from "./pipeline-draft-service.js";
import { completeOnce } from "../orchestrator/one-shot.js";

vi.mock("../logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../orchestrator/one-shot.js", () => ({
  completeOnce: vi.fn(),
}));

describe("Pipeline Draft Service", () => {
  const roster = [
    { id: "agent_1", name: "Researcher" },
    { id: "agent_2", name: "Writer" },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("clampDraft", () => {
    it("maps existing agent ID correctly", () => {
      const raw = {
        name: "Test",
        steps: [{ agentId: "agent_1", promptTemplate: "Do research" }],
      };
      const clamped = clampDraft(raw, roster);
      expect(clamped.steps?.[0]?.agentId).toBe("agent_1");
      expect(clamped.steps?.[0]?.unresolvedAgentName).toBeUndefined();
    });

    it("maps existing agent Name to ID", () => {
      const raw = {
        name: "Test",
        steps: [{ agentId: "Writer", promptTemplate: "Write it" }],
      };
      const clamped = clampDraft(raw, roster);
      expect(clamped.steps?.[0]?.agentId).toBe("agent_2");
      expect(clamped.steps?.[0]?.unresolvedAgentName).toBeUndefined();
    });

    it("sets unresolvedAgentName for unknown agent", () => {
      const raw = {
        name: "Test",
        steps: [{ agentId: "Designer", promptTemplate: "Design it" }],
      };
      const clamped = clampDraft(raw, roster);
      expect(clamped.steps?.[0]?.agentId).toBeUndefined();
      expect(clamped.steps?.[0]?.unresolvedAgentName).toBe("Designer");
    });

    it("strips invalid fields (tampered input)", () => {
      const raw = {
        name: "Test",
        hackedField: "yes",
        steps: [{ agentId: "agent_1", extraStuff: true, allowedTools: ["*"] }],
      };
      const clamped = clampDraft(raw, roster);
      expect((clamped as any).hackedField).toBeUndefined();
      expect((clamped.steps?.[0] as any).extraStuff).toBeUndefined();
      expect((clamped.steps?.[0] as any).allowedTools).toBeUndefined();
    });
  });

  describe("extractJson", () => {
    it("extracts json from markdown", () => {
      const text = `Here is your json:\n\`\`\`json\n{"reply": "hi"}\n\`\`\``;
      expect(extractJson(text)).toEqual({ reply: "hi" });
    });
    
    it("returns null for malformed json", () => {
      expect(extractJson(`{"reply": "hi"`)).toBeNull();
    });
  });

  describe("runPipelineDraftTurn", () => {
    it("returns successful AI turn", async () => {
      vi.mocked(completeOnce).mockResolvedValueOnce({
        text: `{"reply": "Done", "draft": {"name": "My Pipeline", "steps": [{"agentId": "agent_1"}]}}`,
        isError: false,
      } as any);

      const res = await runPipelineDraftTurn({ message: "Make it", mode: "draft", draft: {} }, roster);
      expect(res.source).toBe("ai");
      expect(res.reply).toBe("Done");
      expect(res.draft.name).toBe("My Pipeline");
      expect(res.draft.steps?.[0]?.agentId).toBe("agent_1");
    });

    it("does one strict repair retry on malformed JSON", async () => {
      vi.mocked(completeOnce)
        .mockResolvedValueOnce({ text: `{"reply": "Oops"`, isError: false } as any) // Broken JSON
        .mockResolvedValueOnce({
          text: `{"reply": "Fixed", "draft": {"name": "Repaired"}}`,
          isError: false,
        } as any); // Fixed JSON

      const res = await runPipelineDraftTurn({ message: "Make it", mode: "draft", draft: {} }, roster);
      expect(completeOnce).toHaveBeenCalledTimes(2);
      expect(res.source).toBe("ai");
      expect(res.reply).toBe("Fixed");
    });

    it("falls back gracefully if repair fails", async () => {
      vi.mocked(completeOnce)
        .mockResolvedValueOnce({ text: `{"reply": "Oops"`, isError: false } as any)
        .mockResolvedValueOnce({ text: `{"reply": "Oops Again"`, isError: false } as any);

      const res = await runPipelineDraftTurn({ message: "Make it", mode: "draft", draft: {} }, roster);
      expect(completeOnce).toHaveBeenCalledTimes(2);
      expect(res.source).toBe("fallback");
    });

    it("falls back immediately on transport error", async () => {
      vi.mocked(completeOnce).mockResolvedValueOnce({ isError: true, errorMessage: "timeout" } as any);

      const res = await runPipelineDraftTurn({ message: "Make it", mode: "draft", draft: {} }, roster);
      expect(completeOnce).toHaveBeenCalledTimes(1); // No repair retry for transport errors
      expect(res.source).toBe("fallback");
    });
  });
});
