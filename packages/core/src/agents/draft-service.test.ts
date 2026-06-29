import { describe, expect, it } from "vitest";
import { clampDraft, extractJson, guessName } from "./draft-service.js";

describe("guessName (deterministic fallback)", () => {
  it("extracts an explicitly given name, preserving slug case/hyphens", () => {
    expect(guessName("Name it spec-writer")).toBe("spec-writer");
    expect(guessName("call it srs-architect please")).toBe("srs-architect");
    expect(guessName('let us name the agent "Researcher"')).toBe("Researcher");
  });

  it("returns undefined for a freeform description (never invents a sentence-name)", () => {
    expect(
      guessName("The agent should research the market and write an SRS document"),
    ).toBeUndefined();
  });
});

describe("clampDraft — the free-text → agent-config trust boundary", () => {
  it("keeps valid real-schema fields", () => {
    const d = clampDraft({
      name: "Reviewer",
      role: "code reviewer",
      provider: "claude-code",
      model: "sonnet",
      allowedTools: ["Read", "Bash(git diff)"],
    });
    expect(d.name).toBe("Reviewer");
    expect(d.provider).toBe("claude-code");
    expect(d.allowedTools).toEqual(["Read", "Bash(git diff)"]);
  });

  it("strips legacy design-module field names (workingDir/readScopes/skill)", () => {
    const d = clampDraft({
      name: "X",
      workingDir: "/tmp",
      readScopes: ["global"],
      skill: "stuff",
    } as Record<string, unknown>);
    expect("workingDir" in d).toBe(false);
    expect("readScopes" in d).toBe(false);
    expect("skill" in d).toBe(false);
    expect(d.name).toBe("X");
  });

  it("drops an invalid provider (e.g. codex) but keeps the rest", () => {
    const d = clampDraft({ name: "X", provider: "codex", model: "gpt-5" });
    expect(d.provider).toBeUndefined();
    expect(d.name).toBe("X");
    expect(d.model).toBe("gpt-5"); // model is a free string; provider enum is what gates runnability
  });

  it("never lets a draft self-escalate to bypassPermissions", () => {
    const d = clampDraft({ name: "X", permissionMode: "bypassPermissions" });
    expect(d.permissionMode).toBeUndefined();
  });

  it("keeps a safe permissionMode", () => {
    expect(clampDraft({ permissionMode: "plan" }).permissionMode).toBe("plan");
  });

  it("removes broad wildcard tool grants", () => {
    const d = clampDraft({
      allowedTools: ["*", "Bash", "Bash(*)", "Read", "Edit"],
    });
    expect(d.allowedTools).toEqual(["Read", "Edit"]);
  });
});

describe("extractJson", () => {
  it("parses bare JSON", () => {
    expect(extractJson('{"reply":"hi"}')).toEqual({ reply: "hi" });
  });

  it("parses JSON wrapped in prose", () => {
    expect(extractJson('Sure! {"reply":"hi","intent":"build"} done')).toEqual({
      reply: "hi",
      intent: "build",
    });
  });

  it("parses JSON inside a fenced code block", () => {
    expect(extractJson('```json\n{"reply":"hi"}\n```')).toEqual({ reply: "hi" });
  });

  it("returns null on unparseable text", () => {
    expect(extractJson("no json here")).toBeNull();
    expect(extractJson("{broken")).toBeNull();
  });
});
