import { afterEach, describe, expect, it } from "vitest";
import { AGENT_ENV_ALLOWLIST, agentChildEnv } from "./child-env.js";

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

  it("forwards a provider credential from the closed auth list when present", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    try {
      expect(agentChildEnv().ANTHROPIC_API_KEY).toBe("sk-ant-test");
    } finally {
      delete process.env.ANTHROPIC_API_KEY;
    }
  });

  it("the allowlist never contains the app bearer token or a wildcard secret name", () => {
    expect(AGENT_ENV_ALLOWLIST).not.toContain("SPARSTROW_TOKEN");
    expect(AGENT_ENV_ALLOWLIST.some((k) => /SPARSTROW_/i.test(k))).toBe(false);
  });
});
