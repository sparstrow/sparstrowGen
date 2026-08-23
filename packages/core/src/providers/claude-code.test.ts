import os from "node:os";
import { describe, expect, it } from "vitest";
import type { Agent } from "@sparstrow/shared";
import { ClaudeCodeProvider, errorMessageFrom } from "./claude-code.js";
import type { HeadlessSpawnOptions, InteractiveSpawnOptions } from "./types.js";

function agentWith(overrides: Partial<Agent> = {}): Agent {
  return {
    id: "agt_1",
    name: "Coder",
    slug: "coder",
    role: "writes code",
    systemPrompt: "",
    provider: "claude-code",
    model: "sonnet",
    permissionMode: "default",
    allowedTools: [],
    disallowedTools: [],
    addDirs: [],
    extraArgs: [],
    mcpServers: {},
    maxTurns: null,
    cwd: null,
    ...overrides,
  } as unknown as Agent;
}

const headlessOpts: HeadlessSpawnOptions = {
  runId: "run_1",
  tempDir: os.tmpdir(),
  sessionId: "sess_1",
};

// BUG-2026-08-23-headless-spawn-skill-leak: a headless spawn has no TTY, so a
// machine-global skill (installed under the operator's own ~/.claude/skills,
// unrelated to Sparstrowgen) can never get the tool permission it wants —
// claude-code stalls waiting on it until the run's own timeout fires.
describe("ClaudeCodeProvider — headless spawn skill isolation", () => {
  const provider = new ClaudeCodeProvider();

  it("disables skill expansion on a headless spawn, so a machine-global skill can't attach", () => {
    const spec = provider.buildHeadlessSpawn(agentWith(), "hi", headlessOpts);
    expect(spec.args).toContain("--disable-slash-commands");
  });

  it("keeps skills on for an interactive spawn — a real human is at the PTY", () => {
    const spec = provider.buildInteractiveSpawn(agentWith(), {
      tempDir: "/tmp/x",
      extraEnv: {},
    } as InteractiveSpawnOptions);
    expect(spec.args).not.toContain("--disable-slash-commands");
  });
});

/**
 * Found in M4 verification, against a machine whose Claude OAuth token had
 * expired: the run failed and its `error` column read **"success"**.
 *
 * The cause is that `subtype` describes the shape of the final turn, not the
 * outcome. The CLI sets `is_error: true` with `subtype: "success"` when the
 * turn completed normally but its content is an error — and the real message
 * was sitting in `result` the whole time.
 */
describe("errorMessageFrom", () => {
  it("prefers the CLI's own message over the turn subtype", () => {
    expect(
      errorMessageFrom({
        is_error: true,
        subtype: "success",
        result: 'Failed to authenticate. API Error: 401 {"type":"error"}',
      }),
    ).toMatch(/Failed to authenticate/);
  });

  it("never reports 'success' as the reason a run failed", () => {
    // The exact regression. "success" in an error column sends the reader
    // looking for a run that worked.
    expect(errorMessageFrom({ is_error: true, subtype: "success" })).not.toBe("success");
  });

  it("falls back to a subtype that actually says something", () => {
    expect(errorMessageFrom({ is_error: true, subtype: "error_max_turns" })).toBe(
      "error_max_turns",
    );
  });

  it("ignores an empty or whitespace-only result", () => {
    expect(errorMessageFrom({ is_error: true, subtype: "error_during_execution", result: "   " })).toBe(
      "error_during_execution",
    );
  });

  it("says something rather than nothing when the CLI offers neither", () => {
    expect(errorMessageFrom({ is_error: true })).toBe("unknown error");
  });
});
