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

  it("passes the prompt via stdin, never argv (long prompts dodge the ~32KB Windows limit)", () => {
    const big = "x".repeat(50_000);
    const spec = provider.buildHeadlessSpawn(agentWith(), big, headlessOpts);
    expect(spec.stdinData).toBe(big);
    expect(spec.args.join(" ")).not.toContain(big);
  });

  it("puts --model before a trailing `--print -` so --print can't swallow the flag", () => {
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
    // `--print -` must be the tail, with `-` as its literal stdin marker.
    expect(spec.args.slice(-2)).toEqual(["--print", "-"]);
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
