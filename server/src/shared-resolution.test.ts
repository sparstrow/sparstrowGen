import { describe, expect, it } from "vitest";
import { KNOWN_MODELS, slugify } from "@sparstrow/shared";

// Smoke test: proves vitest runs in core AND the @sparstrow/shared workspace
// package resolves through vite's resolver (TS source, .js-extension exports).
describe("core ↔ @sparstrow/shared resolution", () => {
  it("imports shared utilities", () => {
    expect(slugify("Agent One")).toBe("agent-one");
    expect(KNOWN_MODELS["claude-code"]).toContain("sonnet");
  });
});
