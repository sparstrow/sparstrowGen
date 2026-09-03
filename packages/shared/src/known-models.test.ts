import { describe, expect, it } from "vitest";
import { KNOWN_MODELS } from "./constants";

/**
 * These do not check that the lists are *current* — no test can, because
 * "current" is a fact about a vendor's API that changes without touching this
 * repo. They check the properties that stop the lists from rotting silently.
 *
 * The failure being guarded against is real and was measured: on 2026-09-03 the
 * antigravity fallback still offered three Gemini 3.5 Flash tiers that no
 * longer existed and hid nine that did. Nothing failed. Nothing warned. The
 * picker just quietly offered models that could not run.
 */

describe("KNOWN_MODELS — fallbacks that must not rot silently", () => {
  it("keeps claude-code's self-updating aliases, which is the whole anti-rot mechanism", () => {
    // `--model sonnet` resolves to the newest Sonnet every time the CLI runs.
    // These three entries are the only ones here that cannot go stale, so
    // losing them would turn the one maintenance-free provider into another
    // list somebody has to remember to update.
    for (const alias of ["opus", "sonnet", "haiku"]) {
      expect(KNOWN_MODELS["claude-code"]).toContain(alias);
    }
  });

  it("puts the aliases first, so the durable choice is the obvious one", () => {
    expect(KNOWN_MODELS["claude-code"]!.slice(0, 3)).toEqual(["opus", "sonnet", "haiku"]);
  });

  it("leaves ollama empty rather than guessing at a machine's installed models", () => {
    // Ollama runs what has been pulled onto this computer. Naming popular
    // models would fill a picker with things that are not installed and cannot
    // run — a worse answer than an honest "none found".
    expect(KNOWN_MODELS.ollama).toEqual([]);
  });

  it("lists no model twice in any provider", () => {
    for (const [provider, models] of Object.entries(KNOWN_MODELS)) {
      expect(new Set(models).size, `${provider} has a duplicate`).toBe(models.length);
    }
  });

  it("never carries a blank or untrimmed entry into a picker", () => {
    for (const [provider, models] of Object.entries(KNOWN_MODELS)) {
      for (const model of models) {
        expect(model, `${provider} has a blank entry`).not.toBe("");
        expect(model, `${provider} has an untrimmed entry: ${JSON.stringify(model)}`).toBe(
          model.trim(),
        );
      }
    }
  });

  it("has an entry for every provider a picker can be opened for", () => {
    // A missing key reads as "this provider has no models", which is
    // indistinguishable in the UI from a provider whose discovery failed.
    for (const provider of ["claude-code", "antigravity", "anthropic-api", "ollama"]) {
      expect(KNOWN_MODELS, `no fallback for ${provider}`).toHaveProperty(provider);
    }
  });
});
