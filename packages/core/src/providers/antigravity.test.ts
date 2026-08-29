import { describe, expect, it, vi } from "vitest";
import type { Agent, PermissionMode } from "@sparstrow/shared";
import { DEFAULT_RUN_TIMEOUT_MS, KNOWN_MODELS } from "@sparstrow/shared";
import { config } from "../config.js";
import { AntigravityCliProvider, parseAgyModelsOutput } from "./antigravity.js";
import type { HeadlessSpawnOptions, NormalizedEvent } from "./types.js";

vi.mock("node-pty", () => ({ spawn: vi.fn() }));
import * as pty from "node-pty";

interface FakePty {
  kill: ReturnType<typeof vi.fn>;
  emitData: (chunk: string) => void;
  emitExit: (exitCode: number) => void;
}

function makeFakePty(): FakePty {
  let dataHandler: ((data: string) => void) | null = null;
  let exitHandler: ((e: { exitCode: number }) => void) | null = null;
  return {
    kill: vi.fn(),
    onData: (cb: (data: string) => void) => {
      dataHandler = cb;
    },
    onExit: (cb: (e: { exitCode: number }) => void) => {
      exitHandler = cb;
    },
    emitData: (chunk: string) => dataHandler?.(chunk),
    emitExit: (exitCode: number) => exitHandler?.({ exitCode }),
  } as unknown as FakePty;
}

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

  // BUG-2026-08-23-headless-spawn-skill-leak: a headless spawn has no TTY, so
  // a machine-global skill (installed under the operator's own
  // ~/.claude/skills, unrelated to Sparstrowgen) can never get the tool
  // permission it wants and denies the whole turn instead.
  it("disables skill expansion on a headless spawn, so a machine-global skill can't attach", () => {
    const spec = provider.buildHeadlessSpawn(agentWith(), "hi", headlessOpts);
    expect(spec.args).toContain("--disable-slash-commands");
  });

  it("keeps skills on for an interactive spawn — a real human is at the PTY", () => {
    const spec = provider.buildInteractiveSpawn(agentWith(), {
      tempDir: "/tmp/x",
      extraEnv: {},
    } as never);
    expect(spec.args).not.toContain("--disable-slash-commands");
  });

  // agy's own `--print-timeout` defaults to 5m (confirmed live via `agy
  // --help`), shorter than Sparstrowgen's own 15m external kill
  // (DEFAULT_RUN_TIMEOUT_MS) — left unset, agy would self-terminate a
  // legitimate long task-board run at 5m with no indication the cause was
  // its own unrelated internal clock.
  it("raises agy's own print-mode timeout past Sparstrowgen's external kill", () => {
    const spec = provider.buildHeadlessSpawn(agentWith(), "hi", headlessOpts);
    const idx = spec.args.indexOf("--print-timeout");
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(idx).toBeLessThan(spec.args.indexOf("--print"));
    const seconds = Number(spec.args[idx + 1]!.replace(/s$/, ""));
    expect(seconds).toBeGreaterThan(DEFAULT_RUN_TIMEOUT_MS / 1000);
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

// Byte-for-byte captured from a live agy v1.1.22 process spawned through
// node-pty (T-CS3-01, Band 26) -- NOT hand-guessed. `agy models` requires a
// real TTY: run through a plain pipe (no pty), it hangs indefinitely rather
// than exiting (confirmed: killed by Node's own `timeout`, `signal:
// 'SIGTERM'`, not a clean exit) -- this raw transcript is what a real
// pseudo-terminal actually receives: ANSI cursor-hide/clear/move sequences,
// braille spinner frames, occasional OSC window-title sets from *other*
// unrelated processes sharing the console (the "npm" one below is real
// capture noise, not something agy itself emits), then the model lines
// separated by \r\n with the two columns padded with spaces, not a tab.
const REAL_AGY_MODELS_PTY_OUTPUT =
  "\u001b[?9001h\u001b[?1004h\u001b[?25l\u001b[2J\u001b[m\u001b[H⠋ Fetching available models...\u001b]0;C:\\Users\\gsrih\\AppData\\Local\\agy\\bin\\agy.exe\u0007\u001b[?25h\u001b[?25l\u001b[H⠙ Fetching available models...\u001b[?25h\u001b]0;npm\u0007\u001b[?25l\u001b[H⠹ Fetching available models...\u001b[?25h\u001b]0;npm exec shadcn@latest mcp\u0007\u001b[?25l\u001b[H⠸ Fetching available models...\u001b[?25h\u001b[?25l\u001b[H⠼ Fetching available models...\u001b[?25h\u001b[?25l\u001b[H⠴ Fetching available models...\u001b[?25h\u001b[?25l\u001b[H⠦ Fetching available models...\u001b[?25h\u001b[?25l\u001b[H\u001b[K\u001b[?25hgemini-3.7-flash-high     Gemini 3.7 Flash (High)\r\ngemini-3.1-pro-high       Gemini 3.1 Pro (High)\r\nclaude-sonnet-4-6         Claude Sonnet 4.6 (Thinking)\r\n";

describe("parseAgyModelsOutput (T-CS3-01)", () => {
  it("recovers the label column from a real captured pty transcript, ANSI/spinner/OSC chrome and all", () => {
    expect(parseAgyModelsOutput(REAL_AGY_MODELS_PTY_OUTPUT)).toEqual([
      "Gemini 3.7 Flash (High)",
      "Gemini 3.1 Pro (High)",
      "Claude Sonnet 4.6 (Thinking)",
    ]);
  });

  it("returns nothing for pure spinner noise with no model lines", () => {
    expect(parseAgyModelsOutput("\u001b[?25l\u001b[H⠋ Fetching available models...\u001b[?25h")).toEqual([]);
  });
});

describe("AntigravityCliProvider — discoverModels (T-CS3-01)", () => {
  const mockSpawn = vi.mocked(pty.spawn);

  it("returns live:true with the parsed label list on a clean exit", async () => {
    const fake = makeFakePty();
    mockSpawn.mockReturnValue(fake as unknown as pty.IPty);

    const promise = provider.discoverModels!();
    fake.emitData(REAL_AGY_MODELS_PTY_OUTPUT);
    fake.emitExit(0);

    expect(await promise).toEqual({
      models: ["Gemini 3.7 Flash (High)", "Gemini 3.1 Pro (High)", "Claude Sonnet 4.6 (Thinking)"],
      live: true,
      detail: null,
    });
  });

  it("falls back to the static list on a nonzero exit, live:false", async () => {
    const fake = makeFakePty();
    mockSpawn.mockReturnValue(fake as unknown as pty.IPty);

    const promise = provider.discoverModels!();
    fake.emitExit(1);

    const result = await promise;
    expect(result.live).toBe(false);
    expect(result.detail).toMatch(/exited 1/);
    expect(result.models).toEqual(KNOWN_MODELS.antigravity);
  });

  it("falls back to the static list when spawn itself throws (e.g. binary not found)", async () => {
    mockSpawn.mockImplementation(() => {
      throw new Error("File not found");
    });

    const result = await provider.discoverModels!();
    expect(result.live).toBe(false);
    expect(result.detail).toMatch(/File not found/);
    expect(result.models).toEqual(KNOWN_MODELS.antigravity);
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
