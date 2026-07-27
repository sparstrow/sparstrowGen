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
 * sanctioned successor to the now-retired Gemini CLI provider.
 *
 * Headless verified behavior (re-verified against agy v1.1.7, intake 0009):
 *  - `agy --model "<display>" --print "<prompt>"` — the prompt is `--print`'s
 *    VALUE. **agy has no stdin path in print mode**: `agy --print` with no value
 *    prints usage, and `agy --print -` sends the model the literal prompt "-",
 *    which it answers with a generic greeting while ignoring stdin entirely.
 *    That was the cause of intake 0009 (every turn returned "How can I help you
 *    today?"). Because `--print` consumes the next token, it must come LAST,
 *    after `--model` and every other flag.
 *  - The prompt therefore travels in argv, which is bounded by Windows' ~32KB
 *    command-line limit. Callers must budget it — chat does so in
 *    `buildTranscriptPrompt` (TRANSCRIPT_BUDGET_BYTES).
 *  - `--model` tokens are the exact `agy models` display strings (see KNOWN_MODELS).
 *  - `agy.exe` is a real binary, not an npm .cmd shim, so spawns run directly
 *    (viaCmdShell:false) — no cmd.exe quoting layer.
 *  - `--print` output is plain text, not a JSON envelope, so there are no
 *    cost/turn stats and no machine error field; extractResult joins stdout and
 *    flags only the empty case. Nonzero-exit failures are caught by the executor's
 *    finalize(code, …), which never reaches extractResult.
 * No MCP wiring: antigravity agents use the sparstrow-memory CLI and fenced
 * ```sparstrow``` directives (see orchestrator/preamble.ts).
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
    // The agent must reach its own memory vault plus any addDirs.
    return [...agent.addDirs, config.vaultPath].flatMap((d) => ["--add-dir", d]);
  }

  buildHeadlessSpawn(agent: Agent, prompt: string, opts: HeadlessSpawnOptions): SpawnSpec {
    // `--model` first, prompt last as `--print`'s value. Order is load-bearing:
    // --print consumes the next token, so it must come after every other flag.
    const args: string[] = [
      "--model",
      agent.model,
      ...this.permissionArgs(agent.permissionMode),
      ...this.workspaceDirArgs(agent),
      ...agent.extraArgs,
      "--print",
      prompt,
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
