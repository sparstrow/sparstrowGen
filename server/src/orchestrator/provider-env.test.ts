import { afterEach, describe, expect, it } from "vitest";
import {
  PROVIDER_ENV_GROUPS,
  ambientProviderKeys,
  discoverProviderEnv,
  resetProviderEnvCache,
} from "./provider-env.js";

/**
 * The failure these guard against was invisible and cost a wrong diagnosis
 * published to `main`.
 *
 * A daemon launched from an agent's shell inherited `ANTHROPIC_BASE_URL` and no
 * token, while the user's working `CLAUDE_CODE_OAUTH_TOKEN` sat in the Windows
 * persistent environment. Every `claude` child got an endpoint with no
 * credential, 401'd, retried for ~186 s, and was killed by the 120 s turn
 * ceiling — surfacing as "the provider timed out". Measured on the owner's
 * machine, where multica was running the same CLI successfully the whole time.
 */

afterEach(() => {
  resetProviderEnvCache();
});

describe("provider env groups", () => {
  it("keeps the endpoint switches in the same group as the credential", () => {
    // The point of grouping. If these ever drift into a different group (or
    // back into the OS runtime list) a token from saved settings can be aimed
    // at an endpoint from an ambient shell again.
    for (const key of [
      "ANTHROPIC_BASE_URL",
      "CLAUDE_CODE_OAUTH_TOKEN",
      "CLAUDE_CODE_USE_BEDROCK",
      "CLAUDE_CODE_USE_VERTEX",
    ]) {
      expect(PROVIDER_ENV_GROUPS.anthropic).toContain(key);
    }
  });

  it("never carries the app's own bearer or an arbitrary secret", () => {
    const all: string[] = Object.values(PROVIDER_ENV_GROUPS).flat();
    expect(all).not.toContain("SPARSTROW_TOKEN");
    expect(all).not.toContain("AWS_SECRET_ACCESS_KEY");
    expect(all.some((k) => /^SPARSTROW_/i.test(k))).toBe(false);
  });
});

describe("resolution", () => {
  it("reports an inherited value as ambient, not as configuration", () => {
    process.env.OLLAMA_HOST = "http://127.0.0.1:11434";
    resetProviderEnvCache();
    try {
      const d = discoverProviderEnv();
      expect(d.values.OLLAMA_HOST).toBe("http://127.0.0.1:11434");
      expect(d.sources.OLLAMA_HOST).toBe("process");
      expect(ambientProviderKeys(d)).toContain("OLLAMA_HOST");
    } finally {
      delete process.env.OLLAMA_HOST;
    }
  });

  it("marks a key with no value anywhere as none, and omits it", () => {
    delete process.env.GEMINI_API_KEY;
    resetProviderEnvCache();
    const d = discoverProviderEnv();
    if (d.sources.GEMINI_API_KEY === "none") {
      expect(d.values.GEMINI_API_KEY).toBeUndefined();
    }
  });

  it("caches, because a running process cannot see a later persistent change anyway", () => {
    resetProviderEnvCache();
    const first = discoverProviderEnv();
    process.env.OLLAMA_HOST = "http://changed-after-discovery:1";
    try {
      expect(discoverProviderEnv()).toBe(first);
      expect(discoverProviderEnv().values.OLLAMA_HOST).not.toBe(
        "http://changed-after-discovery:1",
      );
    } finally {
      delete process.env.OLLAMA_HOST;
    }
  });
});
