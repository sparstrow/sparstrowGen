import { describe, expect, it } from "vitest";
import type { Agent, PermissionMode } from "@sparstrow/shared";
import { KNOWN_MODELS } from "@sparstrow/shared";
import { config } from "../config.js";
import { AntigravityCliProvider } from "./antigravity.js";
import type { HeadlessSpawnOptions, NormalizedEvent } from "./types.js";

const provider = new AntigravityCliProvider();

function agentWith(overrides: Partial<Agent> = {}): Agent {
  return {
    id: "agt_1",
    name: "Coder",
    slug: "coder",
    role: "writes code",
    systemPrompt: "",
    provider: "antigravity",
    model: "Claude Opus 4.6 (Thinking)",
    permissionMode: "default",
    addDirs: [],
    extraArgs: [],
    cwd: null,
    ...overrides,
  } as unknown as Agent;
}

const headlessOpts: HeadlessSpawnOptions = {
  runId: "run_1",
  tempDir: "/tmp/x",
  sessionId: "sess_1",
};

describe("AntigravityCliProvider — headless spawn", () => {
  it("runs the real binary directly (viaCmdShell false — agy.exe is not an npm .cmd shim)", () => {
    const spec = provider.buildHeadlessSpawn(agentWith(), "hi", headlessOpts);
    expect(spec.viaCmdShell).toBe(false);
    expect(spec.command).toBe(config.antigravityPath);
  });

  // Regression — intake 0009. `--print` takes the prompt as its VALUE; agy has no
  // stdin path at all (`agy --print` with no value prints usage). The old spawn
  // emitted `--print -`, so the model received the literal prompt "-" and answered
  // every turn with its generic greeting ("How can I help you today?"), ignoring
  // the user entirely. Verified against agy v1.1.7:
  //   agy --print -            + stdin "What is 2 plus 2?" → "How can I help you today?"
  //   agy --print "What is 2 plus 2? Reply with just the number." → "4"
  it("passes the prompt as --print's value, never the literal `-` (intake 0009)", () => {
    const spec = provider.buildHeadlessSpawn(agentWith(), "What is 2 plus 2?", headlessOpts);
    const printIdx = spec.args.indexOf("--print");
    expect(printIdx).toBeGreaterThanOrEqual(0);
    expect(spec.args[printIdx + 1]).toBe("What is 2 plus 2?");
    expect(spec.args).not.toContain("-");
  });

  it("does not rely on stdin — agy never reads it in print mode (intake 0009)", () => {
    const spec = provider.buildHeadlessSpawn(agentWith(), "hi", headlessOpts);
    expect(spec.stdinData).toBeUndefined();
  });

  it("puts --model before --print so --print can't swallow the flag", () => {
    const spec = provider.buildHeadlessSpawn(
      agentWith({ model: "Gemini 3.5 Flash (Low)" }),
      "hi",
      headlessOpts,
    );
    const modelIdx = spec.args.indexOf("--model");
    const printIdx = spec.args.indexOf("--print");
    expect(modelIdx).toBe(0);
    expect(spec.args[modelIdx + 1]).toBe("Gemini 3.5 Flash (Low)");
    expect(printIdx).toBeGreaterThan(modelIdx);
    // the prompt is the tail, as --print's value
    expect(spec.args[spec.args.length - 2]).toBe("--print");
  });

  it("asks agy for structured NDJSON via --output-format stream-json, before --print", () => {
    const spec = provider.buildHeadlessSpawn(agentWith(), "hi", headlessOpts);
    const fmtIdx = spec.args.indexOf("--output-format");
    expect(fmtIdx).toBeGreaterThanOrEqual(0);
    expect(spec.args[fmtIdx + 1]).toBe("stream-json");
    expect(fmtIdx).toBeLessThan(spec.args.indexOf("--print"));
  });

  it("always adds the memory vault to --add-dir alongside the agent's addDirs", () => {
    const spec = provider.buildHeadlessSpawn(
      agentWith({ addDirs: ["C:/proj"] }),
      "hi",
      headlessOpts,
    );
    // each dir is preceded by its own --add-dir flag
    const dirs = spec.args.filter((_, i) => spec.args[i - 1] === "--add-dir");
    expect(dirs).toContain("C:/proj");
    expect(dirs).toContain(config.vaultPath);
  });

  it("maps every PermissionMode exhaustively", () => {
    const flagsFor = (mode: PermissionMode) =>
      provider.buildHeadlessSpawn(agentWith({ permissionMode: mode }), "hi", headlessOpts).args;
    expect(flagsFor("bypassPermissions")).toContain("--dangerously-skip-permissions");
    expect(flagsFor("acceptEdits").join(" ")).toContain("--mode accept-edits");
    expect(flagsFor("plan").join(" ")).toContain("--mode plan");
    // default adds no permission/mode flag
    const def = flagsFor("default");
    expect(def).not.toContain("--mode");
    expect(def).not.toContain("--dangerously-skip-permissions");
  });
});

describe("AntigravityCliProvider — interactive spawn", () => {
  it("omits --print (REPL, not headless) but keeps the model", () => {
    const spec = provider.buildInteractiveSpawn(agentWith(), { tempDir: "/tmp/x" });
    expect(spec.args).not.toContain("--print");
    expect(spec.args[0]).toBe("--model");
    expect(spec.viaCmdShell).toBe(false);
  });
});

describe("AntigravityCliProvider — result + models", () => {
  const raw = (s: string): NormalizedEvent => ({ type: "raw", payload: s });

  it("joins plain-text stdout into resultText with no cost/session", () => {
    const r = provider.extractResult([raw("first line"), raw("second line")]);
    expect(r.resultText).toBe("first line\nsecond line");
    expect(r.isError).toBe(false);
    expect(r.costUsd).toBeNull();
    expect(r.sessionId).toBeNull();
  });

  it("flags empty output as an error (no JSON error field to read)", () => {
    const r = provider.extractResult([]);
    expect(r.isError).toBe(true);
    expect(r.resultText).toBeNull();
    expect(r.errorMessage).toMatch(/no output/i);
  });

  it("lists the known antigravity model tokens", () => {
    expect(provider.listModels()).toEqual(KNOWN_MODELS.antigravity);
  });
});

// Fixtures below are real lines captured from `agy --model "Gemini 3.5 Flash
// (Low)" --output-format stream-json --print "…"` against a live agy v1.1.18
// binary (BUG-2026-08-22-antigravity-transcript-not-rendered.md's
// Resolution) — not hand-guessed from --help text.
describe("AntigravityCliProvider — parseLine (stream-json)", () => {
  it("maps the init event to a system/init event (matches EventRow's 'session started' case)", () => {
    const line =
      '{"event":"init","conversation_id":"260bd636-97af-4afb-80a9-0395f7cd23c6","init":{"model":"Gemini 3.5 Flash (Low)","cwd":"D:\\\\repo","tools":["view_file"],"permission_mode":"request-review"}}';
    const events = provider.parseLine(line);
    expect(events).toEqual([{ type: "system", payload: { subtype: "init", model: "Gemini 3.5 Flash (Low)" } }]);
  });

  it("maps an agent_response text_delta to an assistant text block", () => {
    const line =
      '{"event":"step_update","step_update":{"conversation_id":"c1","step_index":2,"state":"ACTIVE","step_type":"agent_response","text_delta":"4"}}';
    const events = provider.parseLine(line);
    expect(events).toEqual([
      { type: "assistant", payload: { message: { content: [{ type: "text", text: "4" }] } } },
    ]);
  });

  it("drops agent_response updates with an empty text_delta", () => {
    const line =
      '{"event":"step_update","step_update":{"conversation_id":"c1","step_index":2,"state":"DONE","step_type":"agent_response","text_delta":""}}';
    expect(provider.parseLine(line)).toEqual([]);
  });

  it("drops bookkeeping steps (user_input, checkpoint) — nothing user-visible to render", () => {
    expect(
      provider.parseLine(
        '{"event":"step_update","step_update":{"step_index":0,"state":"DONE","step_type":"user_input"}}',
      ),
    ).toEqual([]);
    expect(
      provider.parseLine(
        '{"event":"step_update","step_update":{"step_index":1,"state":"DONE","step_type":"checkpoint","duration_seconds":0.78}}',
      ),
    ).toEqual([]);
  });

  it("maps a tool step's ACTIVE state to an assistant tool_use block", () => {
    const line =
      '{"event":"step_update","step_update":{"conversation_id":"c1","step_index":7,"state":"ACTIVE","step_type":"tool","tool_name":"list_dir","tool_info":{"name":"list_dir","parameters":{"DirectoryPath":"C:\\\\scratch"}}}}';
    const events = provider.parseLine(line);
    expect(events).toEqual([
      {
        type: "assistant",
        payload: {
          message: {
            content: [{ type: "tool_use", name: "list_dir", input: { DirectoryPath: "C:\\scratch" } }],
          },
        },
      },
    ]);
  });

  it("maps a tool step's DONE state to a user tool_result block carrying the output", () => {
    const line =
      '{"event":"step_update","step_update":{"conversation_id":"c1","step_index":7,"state":"DONE","step_type":"tool","tool_name":"list_dir","duration_seconds":0.066,"tool_info":{"name":"list_dir","parameters":{},"output":".system_generated/\\nscratch/"}}}';
    const events = provider.parseLine(line);
    expect(events).toEqual([
      {
        type: "user",
        payload: { message: { content: [{ type: "tool_result", content: ".system_generated/\nscratch/" }] } },
      },
    ]);
  });

  it("maps a tool step's ERROR state to a user tool_result block carrying the error message", () => {
    const line =
      '{"event":"step_update","step_update":{"conversation_id":"c1","step_index":9,"state":"ERROR","step_type":"tool","tool_name":"list_dir","tool_info":{"name":"list_dir","parameters":{},"error":{"type":"TOOL_ERROR","message":"permission check failed"}}}}';
    const events = provider.parseLine(line);
    expect(events).toEqual([
      {
        type: "user",
        payload: { message: { content: [{ type: "tool_result", content: "permission check failed" }] } },
      },
    ]);
  });

  it("maps the terminal result event to a result NormalizedEvent (SUCCESS)", () => {
    const line =
      '{"event":"result","result":{"conversation_id":"c1","status":"SUCCESS","response":"4\\n","duration_seconds":8.8,"num_turns":1,"usage":{"input_tokens":1}}}';
    const events = provider.parseLine(line);
    expect(events).toEqual([
      { type: "result", payload: { subtype: "success", result: "4\n", error: null, num_turns: 1 } },
    ]);
  });

  it("maps the terminal result event to a result NormalizedEvent (ERROR)", () => {
    const line =
      '{"event":"result","result":{"conversation_id":"c1","status":"ERROR","response":"partial text","error":"permission check failed for read_file","duration_seconds":12.7,"num_turns":1}}';
    const events = provider.parseLine(line);
    expect(events).toEqual([
      {
        type: "result",
        payload: {
          subtype: "error",
          result: "partial text",
          error: "permission check failed for read_file",
          num_turns: 1,
        },
      },
    ]);
  });

  it("falls back to raw for a non-JSON line (e.g. agy not actually in stream-json mode)", () => {
    expect(provider.parseLine("plain text banner")).toEqual([{ type: "raw", payload: "plain text banner" }]);
  });

  it("falls back to raw for a JSON line with an unrecognized event field", () => {
    const line = '{"event":"heartbeat","ts":123}';
    expect(provider.parseLine(line)).toEqual([{ type: "raw", payload: { event: "heartbeat", ts: 123 } }]);
  });

  it("drops blank lines", () => {
    expect(provider.parseLine("")).toEqual([]);
    expect(provider.parseLine("   ")).toEqual([]);
  });
});

describe("AntigravityCliProvider — extractResult (structured stream-json)", () => {
  it("prefers the terminal result event's response text over accumulated deltas", () => {
    const events: NormalizedEvent[] = [
      { type: "system", payload: { subtype: "init", model: "Gemini 3.5 Flash (Low)" } },
      { type: "assistant", payload: { message: { content: [{ type: "text", text: "4" }] } } },
      { type: "assistant", payload: { message: { content: [{ type: "text", text: "\n" }] } } },
      { type: "result", payload: { subtype: "success", result: "4\n", error: null, num_turns: 1 } },
    ];
    const r = provider.extractResult(events);
    expect(r.resultText).toBe("4\n");
    expect(r.isError).toBe(false);
    expect(r.numTurns).toBe(1);
    expect(r.costUsd).toBeNull();
    expect(r.sessionId).toBeNull();
  });

  it("falls back to accumulated assistant text when the result event has no response", () => {
    const events: NormalizedEvent[] = [
      { type: "assistant", payload: { message: { content: [{ type: "text", text: "partial " }] } } },
      { type: "assistant", payload: { message: { content: [{ type: "text", text: "answer" }] } } },
      { type: "result", payload: { subtype: "success", result: null, error: null, num_turns: 1 } },
    ];
    const r = provider.extractResult(events);
    expect(r.resultText).toBe("partial answer");
  });

  it("surfaces the structured error field and flags isError on an ERROR-status result", () => {
    const events: NormalizedEvent[] = [
      {
        type: "result",
        payload: {
          subtype: "error",
          result: "partial text",
          error: "permission check failed for read_file",
          num_turns: 1,
        },
      },
    ];
    const r = provider.extractResult(events);
    expect(r.isError).toBe(true);
    expect(r.errorMessage).toBe("permission check failed for read_file");
    expect(r.resultText).toBe("partial text");
  });

  it("still handles the legacy plain-text fallback when no result event is present", () => {
    const events: NormalizedEvent[] = [
      { type: "raw", payload: "first line" },
      { type: "raw", payload: "second line" },
    ];
    const r = provider.extractResult(events);
    expect(r.resultText).toBe("first line\nsecond line");
    expect(r.isError).toBe(false);
  });
});
