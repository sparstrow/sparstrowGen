import { describe, expect, it } from "vitest";
import { TOOL_CATALOGUE, describeToolRule } from "./tool-catalogue.js";

describe("Tool Catalogue", () => {
  it("every catalogue entry has a non-empty description (FR-003)", () => {
    for (const [providerId, tools] of Object.entries(TOOL_CATALOGUE)) {
      for (const tool of tools) {
        expect(tool.description.trim().length).toBeGreaterThan(0);
      }
    }
  });

  describe("describeToolRule", () => {
    it("returns applies for a known tool", () => {
      const effect = describeToolRule({
        providerId: "claude-code",
        tool: "Bash",
        intent: "allow",
        higherLevels: {},
      });
      expect(effect).toEqual({ effect: "applies" });
    });

    it("returns applies for an uncatalogued provider", () => {
      const effect = describeToolRule({
        providerId: "some-unknown-provider",
        tool: "Bash",
        intent: "allow",
        higherLevels: {},
      });
      expect(effect).toEqual({ effect: "applies" });
    });

    it("returns unknown-tool for a mistyped tool", () => {
      const effect = describeToolRule({
        providerId: "claude-code",
        tool: "Bahs",
        intent: "allow",
        higherLevels: {},
      });
      expect(effect).toEqual({
        effect: "unknown-tool",
        reason: 'Tool "Bahs" is not in the known catalogue for this provider.',
      });
    });

    it("returns applies for a valid wildcard", () => {
      const effect = describeToolRule({
        providerId: "claude-code",
        tool: "*",
        intent: "allow",
        higherLevels: {},
      });
      expect(effect).toEqual({ effect: "applies" });
    });

    it("returns already-denied-above if allowed tool is denied at project level", () => {
      const effect = describeToolRule({
        providerId: "claude-code",
        tool: "Bash",
        intent: "allow",
        higherLevels: {
          project: { allowed: [], disallowed: ["Bash"] },
        },
      });
      expect(effect).toEqual({ effect: "already-denied-above", by: "project" });
    });

    it("returns already-denied-above if wildcard deny exists at a higher level", () => {
      const effect = describeToolRule({
        providerId: "claude-code",
        tool: "Bash",
        intent: "allow",
        higherLevels: {
          agent: { allowed: [], disallowed: ["*"] },
        },
      });
      expect(effect).toEqual({ effect: "already-denied-above", by: "agent" });
    });

    it("evaluates levels from top to bottom, returning the highest denying level", () => {
      const effect = describeToolRule({
        providerId: "claude-code",
        tool: "Bash",
        intent: "allow",
        higherLevels: {
          global: { allowed: [], disallowed: ["Bash"] },
          project: { allowed: [], disallowed: ["Bash"] },
        },
      });
      expect(effect).toEqual({ effect: "already-denied-above", by: "global" });
    });
  });
});
