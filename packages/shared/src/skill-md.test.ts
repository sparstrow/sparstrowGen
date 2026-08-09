import { describe, expect, it } from "vitest";
import { renderSkillMd, type SkillMdSource } from "./skill-md";

const base: SkillMdSource = {
  name: "Researcher",
  role: "market research assistant",
  provider: "claude-code",
  model: "sonnet",
  systemPrompt: "Be concise.\nCite sources.",
  allowedTools: ["Read", "WebSearch"],
  disallowedTools: ["Bash"],
  permissionMode: "default",
};

describe("renderSkillMd", () => {
  it("renders frontmatter + system prompt body", () => {
    const md = renderSkillMd(base);
    expect(md).toContain('name: "Researcher"');
    expect(md).toContain('role: "market research assistant"');
    expect(md).toContain('tools: ["Read", "WebSearch"]');
    expect(md).toContain('disallowedTools: ["Bash"]');
    expect(md).toContain("Be concise.\nCite sources.");
  });

  it("omits empty role and disallowedTools, renders empty tools as []", () => {
    const md = renderSkillMd({ ...base, role: "", allowedTools: [], disallowedTools: [] });
    expect(md).not.toContain("role:");
    expect(md).not.toContain("disallowedTools:");
    expect(md).toContain("tools: []");
  });

  it("uses a placeholder body when systemPrompt is empty", () => {
    const md = renderSkillMd({ ...base, systemPrompt: "" });
    expect(md).toContain("<!-- No system prompt set");
  });

  it("keeps frontmatter parseable when name/role contain YAML metacharacters", () => {
    const md = renderSkillMd({ ...base, name: 'Weird: #1 "agent"', role: "a: b" });
    // The whole value is JSON-quoted, so the colon/hash/quote stay inside the scalar.
    expect(md).toContain('name: "Weird: #1 \\"agent\\""');
    expect(md).toContain('role: "a: b"');
  });

  it("never truncates a long system prompt", () => {
    const longPrompt = Array.from({ length: 80 }, (_, i) => `line ${i}`).join("\n");
    const md = renderSkillMd({ ...base, systemPrompt: longPrompt });
    expect(md).toContain("line 79");
  });

  it("is deterministic (stable across calls)", () => {
    expect(renderSkillMd(base)).toBe(renderSkillMd(base));
  });
});
