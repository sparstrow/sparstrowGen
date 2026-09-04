import { afterEach, describe, expect, it } from "vitest";
import { AGENT_ENV_ALLOWLIST, agentChildEnv } from "./child-env.js";
import {
  PROVIDER_ENV_GROUPS,
  ambientProviderKeys,
  discoverProviderEnv,
  resetProviderEnvCache,
} from "./provider-env.js";

/**
 * EC2 (P7): the child env handed to an agent spawn must be an explicit allowlist,
 * NOT a spread of process.env. These tests are the regression guard the plan
 * mandates — "an env-whitelist test is not enough; the spread itself must go" —
 * so they assert both halves: secrets never pass, essentials do.
 */

const PLANTED = [
  "SPARSTROW_TOKEN", // the app's own full-API bearer — the worst leak
  "SPARSTROW_SECRET_CANARY",
  "SPARSTROW_DATA_DIR",
  "GITHUB_PAT",
  "GH_TOKEN",
  "EVIL_TOKEN",
  "EVIL_KEY",
  "AWS_SECRET_ACCESS_KEY",
  "SOME_RANDOM_AMBIENT_VAR",
];

afterEach(() => {
  for (const key of PLANTED) delete process.env[key];
});

describe("agentChildEnv — EC2 no-process.env-spread allowlist", () => {
  it("strips every ambient secret / non-allowlisted var from the child env", () => {
    for (const key of PLANTED) process.env[key] = "must-not-leak";
    const env = agentChildEnv();
    for (const key of PLANTED) {
      expect(env[key], `${key} must be stripped`).toBeUndefined();
    }
  });

  it("forwards runtime essentials that ARE present (PATH)", () => {
    // Node always populates PATH (or Path on Windows) for the running process.
    const env = agentChildEnv();
    expect(env.PATH ?? env.Path).toBeDefined();
  });

  it("passes extraEnv through and lets it win over the allowlisted base", () => {
    const env = agentChildEnv({
      SPARSTROW_RUN_ID: "run_123",
      SPARSTROW_API: "http://127.0.0.1:48750",
      GIT_AUTHOR_EMAIL: "agent@sparstrow.com",
      PATH: "/agent/only/path",
    });
    expect(env.SPARSTROW_RUN_ID).toBe("run_123");
    expect(env.SPARSTROW_API).toBe("http://127.0.0.1:48750");
    expect(env.GIT_AUTHOR_EMAIL).toBe("agent@sparstrow.com");
    // extraEnv overrides the base PATH (git identity / run wiring is authoritative).
    expect(env.PATH).toBe("/agent/only/path");
  });

  it("forwards a provider credential from a group this machine has NOT configured", () => {
    // Deliberately `OLLAMA_HOST` and not an ANTHROPIC_* key.
    //
    // This test used to plant `ANTHROPIC_API_KEY` in `process.env` and assert
    // it came through — and it passed only because the registry read was
    // silently broken, so every group fell back to ambient. With discovery
    // working, a machine that has ANY anthropic key saved persistently
    // resolves that whole group from the registry and drops ambient
    // siblings, which is the entire point of the fix. Testing the fallback
    // needs a group the machine has not configured.
    process.env.OLLAMA_HOST = "http://127.0.0.1:11434";
    resetProviderEnvCache();
    try {
      expect(agentChildEnv().OLLAMA_HOST).toBe("http://127.0.0.1:11434");
    } finally {
      delete process.env.OLLAMA_HOST;
      resetProviderEnvCache();
    }
  });

  it("reports an inherited provider credential as ambient rather than passing it silently", () => {
    // A credential that came from this process depends on how the daemon was
    // launched. It is still forwarded — a developer exporting a key locally is
    // a real workflow — but never silently.
    process.env.OLLAMA_HOST = "http://127.0.0.1:9999";
    resetProviderEnvCache();
    try {
      expect(agentChildEnv().OLLAMA_HOST).toBe("http://127.0.0.1:9999");
      expect(ambientProviderKeys()).toContain("OLLAMA_HOST");
    } finally {
      delete process.env.OLLAMA_HOST;
      resetProviderEnvCache();
    }
  });

  it("drops an ambient key whose provider IS configured persistently", () => {
    // The failure that started all of this: a good token from saved settings
    // combined with a stray endpoint from an agent's shell is a credential
    // pointed at the wrong server. Only meaningful on a machine that actually
    // has anthropic configured, which is why it is conditional rather than
    // asserted blindly.
    resetProviderEnvCache();
    const anthropicIsSaved = PROVIDER_ENV_GROUPS.anthropic.some(
      (k) => discoverProviderEnv().sources[k] === "persistent",
    );
    if (!anthropicIsSaved) return;

    process.env.ANTHROPIC_BASE_URL = "http://127.0.0.1:9999/rogue";
    resetProviderEnvCache();
    try {
      expect(agentChildEnv().ANTHROPIC_BASE_URL).toBeUndefined();
    } finally {
      delete process.env.ANTHROPIC_BASE_URL;
      resetProviderEnvCache();
    }
  });

  it("reports nothing as ambient when no provider credential is inherited", () => {
    resetProviderEnvCache();
    const inherited = ambientProviderKeys();
    // Whatever this machine happens to have set, every reported key must be one
    // from the closed list — never an arbitrary ambient variable.
    for (const key of inherited) {
      expect(AGENT_ENV_ALLOWLIST).toContain(key);
    }
  });

  it("the allowlist never contains the app bearer token or a wildcard secret name", () => {
    expect(AGENT_ENV_ALLOWLIST).not.toContain("SPARSTROW_TOKEN");
    expect(AGENT_ENV_ALLOWLIST.some((k) => /SPARSTROW_/i.test(k))).toBe(false);
  });
});
