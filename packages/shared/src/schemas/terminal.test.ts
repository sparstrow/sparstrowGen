import { describe, expect, it } from "vitest";
import { machineControlTopic, terminalSessionTopic } from "../cloud";
import {
  machineReplySchema,
  machineRequestSchema,
  terminalAttachReplySchema,
  terminalAttachRequestSchema,
  terminalCloseReplySchema,
  terminalCloseRequestSchema,
  terminalInputMessageSchema,
  terminalListReplySchema,
  terminalListRequestSchema,
  terminalOpenReplySchema,
  terminalOpenRequestSchema,
  terminalOutputMessageSchema,
  terminalRefusalSchema,
  terminalSessionInfoSchema,
} from "./terminal";

const SESSION = {
  id: "term_abc123",
  agentId: "agent_1",
  agentName: "Researcher",
  cols: 220,
  rows: 50,
  createdAt: "2026-08-26T00:00:00.000Z",
  ageMs: 1234,
  attached: true,
};

describe("topic helpers", () => {
  it("machineControlTopic produces the documented string", () => {
    expect(machineControlTopic("ws1", "rt1")).toBe("machine:ws1:rt1");
  });

  it("terminalSessionTopic produces the documented string", () => {
    expect(terminalSessionTopic("ws1", "term_abc123")).toBe("terminal:ws1:term_abc123");
  });
});

describe("terminalSessionInfoSchema", () => {
  it("accepts a valid session", () => {
    expect(terminalSessionInfoSchema.safeParse(SESSION).success).toBe(true);
  });

  it("rejects a session missing required fields", () => {
    const { cols: _cols, ...rest } = SESSION;
    expect(terminalSessionInfoSchema.safeParse(rest).success).toBe(false);
  });
});

describe("terminalRefusalSchema", () => {
  it("accepts every documented reason", () => {
    for (const reason of [
      "terminal_access_disabled",
      "session_limit_reached",
      "unknown_session",
      "agent_not_interactive",
      "agent_not_found",
      "spawn_failed",
    ]) {
      expect(terminalRefusalSchema.safeParse(reason).success).toBe(true);
    }
  });

  it("rejects an unrecognised reason", () => {
    expect(terminalRefusalSchema.safeParse("timed_out").success).toBe(false);
  });
});

describe("control requests", () => {
  it("terminal.list accepts a bare requestId", () => {
    const req = { requestId: "req1", kind: "terminal.list" };
    expect(terminalListRequestSchema.safeParse(req).success).toBe(true);
    expect(machineRequestSchema.safeParse(req).success).toBe(true);
  });

  it("terminal.open accepts an optional agentId and requires cols/rows", () => {
    const req = { requestId: "req2", kind: "terminal.open", agentId: null, cols: 80, rows: 24 };
    expect(terminalOpenRequestSchema.safeParse(req).success).toBe(true);
    expect(
      terminalOpenRequestSchema.safeParse({ requestId: "req2", kind: "terminal.open" }).success,
    ).toBe(false);
  });

  it("terminal.close requires a sessionId", () => {
    expect(
      terminalCloseRequestSchema.safeParse({ requestId: "req3", kind: "terminal.close", sessionId: "term_1" })
        .success,
    ).toBe(true);
    expect(terminalCloseRequestSchema.safeParse({ requestId: "req3", kind: "terminal.close" }).success).toBe(
      false,
    );
  });

  it("terminal.attach requires sessionId, cols and rows", () => {
    const req = { requestId: "req4", kind: "terminal.attach", sessionId: "term_1", cols: 80, rows: 24 };
    expect(terminalAttachRequestSchema.safeParse(req).success).toBe(true);
  });

  it("rejects an unknown request kind", () => {
    expect(machineRequestSchema.safeParse({ requestId: "req5", kind: "terminal.resize" }).success).toBe(false);
  });
});

describe("control replies", () => {
  it("terminal.list reply carries sessions, machineStartedAt and interactiveProviders", () => {
    const reply = {
      requestId: "req1",
      kind: "terminal.list",
      sessions: [SESSION],
      machineStartedAt: "2026-08-26T00:00:00.000Z",
      interactiveProviders: ["claude-code", "antigravity"],
    };
    expect(terminalListReplySchema.safeParse(reply).success).toBe(true);
    expect(machineReplySchema.safeParse(reply).success).toBe(true);
  });

  it("terminal.list reply rejects a provider id outside the closed set", () => {
    const reply = {
      requestId: "req1",
      kind: "terminal.list",
      sessions: [SESSION],
      machineStartedAt: "2026-08-26T00:00:00.000Z",
      interactiveProviders: ["not-a-real-provider"],
    };
    expect(terminalListReplySchema.safeParse(reply).success).toBe(false);
  });

  it("terminal.open reply accepts either a session or an error, not both missing", () => {
    expect(
      terminalOpenReplySchema.safeParse({ requestId: "req2", kind: "terminal.open", session: SESSION }).success,
    ).toBe(true);
    expect(
      terminalOpenReplySchema.safeParse({ requestId: "req2", kind: "terminal.open", error: "spawn_failed" })
        .success,
    ).toBe(true);
    expect(terminalOpenReplySchema.safeParse({ requestId: "req2", kind: "terminal.open" }).success).toBe(false);
  });

  it("terminal.close reply is ok:true or an error", () => {
    expect(
      terminalCloseReplySchema.safeParse({ requestId: "req3", kind: "terminal.close", ok: true }).success,
    ).toBe(true);
    expect(
      terminalCloseReplySchema.safeParse({ requestId: "req3", kind: "terminal.close", ok: false }).success,
    ).toBe(false);
  });

  it("terminal.attach reply carries session + replay, or an error", () => {
    expect(
      terminalAttachReplySchema.safeParse({
        requestId: "req4",
        kind: "terminal.attach",
        session: SESSION,
        replay: "$ ",
      }).success,
    ).toBe(true);
    expect(
      terminalAttachReplySchema.safeParse({ requestId: "req4", kind: "terminal.attach", error: "unknown_session" })
        .success,
    ).toBe(true);
  });
});

describe("session channel messages", () => {
  it("input and output both accept a plain data string", () => {
    expect(terminalInputMessageSchema.safeParse({ data: "ls -la\n" }).success).toBe(true);
    expect(terminalOutputMessageSchema.safeParse({ data: "total 0\n" }).success).toBe(true);
  });

  it("both reject a message with no data field", () => {
    expect(terminalInputMessageSchema.safeParse({}).success).toBe(false);
    expect(terminalOutputMessageSchema.safeParse({}).success).toBe(false);
  });
});
