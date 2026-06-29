import { describe, expect, it } from "vitest";
import { teamCreateSchema, teamMemberCreateSchema, teamUpdateSchema } from "./team.js";

describe("team schemas", () => {
  describe("teamCreateSchema", () => {
    it("validates correctly", () => {
      const valid = teamCreateSchema.parse({ name: "My Team" });
      expect(valid.name).toBe("My Team");
      expect(valid.description).toBe("");

      expect(() => teamCreateSchema.parse({})).toThrow("Required");
    });
  });

  describe("teamMemberCreateSchema", () => {
    it("validates agentId required", () => {
      const valid = teamMemberCreateSchema.parse({ agentId: "agt_123" });
      expect(valid.agentId).toBe("agt_123");
      expect(valid.teamRole).toBeUndefined();
      
      expect(() => teamMemberCreateSchema.parse({})).toThrow("Required");
    });
  });

  describe("teamUpdateSchema", () => {
    it("is partial", () => {
      const valid = teamUpdateSchema.parse({ description: "new desc" });
      expect(valid.description).toBe("new desc");
      expect(valid.name).toBeUndefined();
    });
  });
});
