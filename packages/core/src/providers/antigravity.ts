import { execFile } from "node:child_process";
import type { Agent, PermissionMode, ProviderHealth, RunResult } from "@sparstrow/shared";
import { KNOWN_MODELS } from "@sparstrow/shared";
import { config } from "../config.js";
import type {
  CliProvider,
  HeadlessSpawnOptions,
  InteractiveSpawnOptions,
  NormalizedEvent,
  SpawnSpec,
} from "./types.js";

/**
 * Provider for Google's Antigravity CLI (`agy`, verified against v1.1.0) — the
 * sanctioned successor after Gemini CLI was retired.
 *
 * Headless verified behavior (log-confirmed via ~/.gemini/antigravity-cli/cli.log):
 *  - `agy --model "<display>" --print -` reads the prompt from STDIN. The literal
 *    `-` is the stdin marker; it stops `--print` from greedily swallowing the
 *    trailing `--model` flag into the prompt text (which silently falls back to
 *    the settings.json default model — a per-agent-model no-op). So `--model`
 *    MUST come before `--print -`, and the prompt travels via SpawnSpec.stdinData.
 *  - `--model` tokens are the exact `agy models` display strings (see KNOWN_MODELS).
 *  - `agy.exe` is a real binary, not an npm .cmd shim, so spawns run directly
 *    (viaCmdShell:false) — no cmd.exe quoting layer.
 *  - `--print` output is plain text (no JSON envelope like gemini), so there are
 *    no cost/turn stats and no machine error field; extractResult joins stdout and
 *    flags only the empty case. Nonzero-exit failures are caught by the executor's
 *    finalize(code, …), which never reaches extractResult.
 * No MCP wiring: like gemini, antigravity agents use the sparstrow-memory CLI and
 * fenced ```sparstrow``` directives (see orchestrator/preamble.ts).
 */
export class AntigravityCliProvider implements CliProvider {
  readonly id = "antigravity" as const;
  readonly kind = "cli" as const;

  listModels(): string[] {
    return KNOWN_MODELS.antigravity ?? [];
  }

  /** Map Sparstrow permission modes to agy flags — exhaustive over PermissionMode. */
  private permissionArgs(mode: PermissionMode): string[] {
    switch (mode) {
      case "bypassPermissions":
        return ["--dangerously-skip-permissions"];
      case "acceptEdits":
        return ["--mode", "accept-edits"];
      case "plan":
        return ["--mode", "plan"];
      default:
        return [];
    }
  }

  private workspaceDirArgs(agent: Agent): string[] {
    // Mirror gemini: the agent must reach its own memory vault plus any addDirs.
    return [...agent.addDirs, config.vaultPath].flatMap((d) => ["--add-dir", d]);
  }

  buildHeadlessSpawn(agent: Agent, prompt: string, opts: HeadlessSpawnOptions): SpawnSpec {
    // `--model` before `--print -`; prompt via stdin. Order is load-bearing.
    const args: string[] = [
      "--model",
      agent.model,
      ...this.permissionArgs(agent.permissionMode),
      ...this.workspaceDirArgs(agent),
      ...agent.extraArgs,
      "--print",
      "-",
    ];
    return {
      command: config.antigravityPath,
      args,
      cwd: opts.rootDir ?? agent.cwd ?? opts.tempDir,
      env: {
        SPARSTROW_RUN_ID: opts.runId,
        SPARSTROW_API: `http://${config.host}:${config.port}`,
        ...opts.extraEnv,
      },
      stdinData: prompt,
      viaCmdShell: false,
    };
  }

  buildInteractiveSpawn(agent: Agent, opts: InteractiveSpawnOptions): SpawnSpec {
    // Interactive session — no --print; agy drops into its REPL against the PTY.
    const args: string[] = [
      "--model",
      agent.model,
      ...this.permissionArgs(agent.permissionMode),
      ...this.workspaceDirArgs(agent),
      ...agent.extraArgs,
    ];
    return {
      command: config.antigravityPath,
      args,
      cwd: agent.cwd ?? opts.tempDir,
      env: { ...opts.extraEnv },
      viaCmdShell: false,
    };
  }

  parseLine(line: string): NormalizedEvent[] {
    if (line.trim().length === 0) return [];
    return [{ type: "raw", payload: line }];
  }

  extractResult(events: NormalizedEvent[]): RunResult {
    const stdout = events
      .filter((e) => e.type === "raw" && typeof e.payload === "string")
      .map((e) => e.payload as string)
      .join("\n")
      .trim();
    return {
      resultText: stdout || null,
      costUsd: null, // agy --print reports no cost/token stats
      numTurns: null,
      sessionId: null, // --conversation resume is out of scope (P8.1 parity)
      isError: stdout.length === 0,
      errorMessage: stdout.length === 0 ? "no output from antigravity CLI" : undefined,
    };
  }

  healthCheck(): Promise<ProviderHealth> {
    return new Promise((resolve) => {
      execFile(
        config.antigravityPath,
        ["--version"],
        { timeout: 20_000, windowsHide: true },
        (err, stdout) => {
          if (err) {
            resolve({ id: this.id, ok: false, version: null, authenticated: null, detail: err.message });
          } else {
            resolve({
              id: this.id,
              ok: true,
              version: stdout.trim() || null,
              authenticated: null,
              detail: null,
            });
          }
        },
      );
    });
  }
}
