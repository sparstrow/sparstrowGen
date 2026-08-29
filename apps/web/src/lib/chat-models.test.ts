import { describe, expect, it } from "vitest";
import { KNOWN_MODELS } from "@sparstrow/shared";
import { defaultModelForProvider, modelsForProvider } from "./chat-models";

const cold = { models: [] as string[] };
const warm = { models: ["Gemini 3.7 Flash (High)", "Gemini 3.6 Flash (Low)"] };

describe("modelsForProvider", () => {
  it("reads antigravity from the cache, not the compiled-in list", () => {
    expect(modelsForProvider("antigravity", warm)).toEqual(warm.models);
    expect(modelsForProvider("antigravity", cold)).toEqual([]);
  });

  it("reads every other provider from the compiled-in list", () => {
    expect(modelsForProvider("claude-code", cold)).toEqual(KNOWN_MODELS["claude-code"]);
  });
});

describe("defaultModelForProvider", () => {
  it("uses the live cache when it has been fetched", () => {
    expect(defaultModelForProvider("antigravity", warm)).toBe("Gemini 3.7 Flash (High)");
  });

  /**
   * The regression T-CS6-02 found. Switching to antigravity before its cache
   * has loaded used to write `"sonnet"` — a claude-code model — onto the
   * session, which then dispatches `agy --model sonnet` and fails.
   */
  it("never returns another provider's model when the antigravity cache is cold", () => {
    const picked = defaultModelForProvider("antigravity", cold);
    expect(picked).not.toBe("sonnet");
    expect(KNOWN_MODELS.antigravity).toContain(picked);
  });

  it("never returns an empty model, which would dispatch --model ''", () => {
    for (const provider of ["antigravity", "claude-code"] as const) {
      for (const state of [cold, warm]) {
        expect(defaultModelForProvider(provider, state)).not.toBe("");
      }
    }
  });

  it("returns a model the chosen provider can actually run, in every state", () => {
    // Cold or warm, the pair must be valid — that is the whole invariant.
    expect(KNOWN_MODELS.antigravity).toContain(defaultModelForProvider("antigravity", cold));
    expect(warm.models).toContain(defaultModelForProvider("antigravity", warm));
    expect(KNOWN_MODELS["claude-code"]).toContain(defaultModelForProvider("claude-code", cold));
  });
});
