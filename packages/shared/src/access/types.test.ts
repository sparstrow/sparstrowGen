import { describe, expect, it } from "vitest";
import { atLeast, AccessLevel } from "./types";
import * as schemas from "./schemas";

describe("access/types", () => {
  describe("atLeast", () => {
    const levels: AccessLevel[] = ["see", "use", "configure", "administer"];

    it("evaluates equality as true", () => {
      for (const level of levels) {
        expect(atLeast(level, level)).toBe(true);
      }
    });

    it("evaluates strictly greater held levels as true", () => {
      expect(atLeast("use", "see")).toBe(true);
      expect(atLeast("configure", "see")).toBe(true);
      expect(atLeast("administer", "see")).toBe(true);
      
      expect(atLeast("configure", "use")).toBe(true);
      expect(atLeast("administer", "use")).toBe(true);
      
      expect(atLeast("administer", "configure")).toBe(true);
    });

    it("evaluates strictly lesser held levels as false", () => {
      expect(atLeast("see", "use")).toBe(false);
      expect(atLeast("see", "configure")).toBe(false);
      expect(atLeast("see", "administer")).toBe(false);
      
      expect(atLeast("use", "configure")).toBe(false);
      expect(atLeast("use", "administer")).toBe(false);
      
      expect(atLeast("configure", "administer")).toBe(false);
    });
  });

  describe("ResolvedAccess", () => {
    it("has no exported Zod schema", () => {
      expect(schemas).not.toHaveProperty("ResolvedAccessSchema");
      
      type ExtractedSchemas = keyof typeof schemas;
      // @ts-expect-error - ResolvedAccessSchema should not exist
      const check: "ResolvedAccessSchema" extends ExtractedSchemas ? true : false = false;
      expect(check).toBe(false);
    });
  });
});
