import { describe, expect, it } from "vitest";
import { slugify, slugSchema } from "./common";

describe("slugify", () => {
  it("lowercases and hyphenates words", () => {
    expect(slugify("My Cool Agent")).toBe("my-cool-agent");
  });

  it("collapses non-alphanumerics and trims edge hyphens", () => {
    expect(slugify("  Hello, World!!  ")).toBe("hello-world");
  });

  it("caps output at 80 characters", () => {
    expect(slugify("a".repeat(100))).toHaveLength(80);
  });

  it("produces slugSchema-valid output for normal names", () => {
    expect(slugSchema.safeParse(slugify("Researcher 01")).success).toBe(true);
  });
});
