import { execFile } from "node:child_process";
import type { Agent, PermissionMode, ProviderHealth, RunResult } from "@sparstrow/shared";
import { KNOWN_MODELS } from "@sparstrow/shared";
import { config } from "../config.js";
import type {
  HeadlessSpawnOptions,
  InteractiveSpawnOptions,
  ModelProvider,
  NormalizedEvent,
  SpawnSpec,
} from "./types.js";

/**
 * Provider for the Gemini CLI (verified against gemini 0.46).
 * Windows: gemini installs as an npm .cmd shim, so spawns go through
 * `cmd.exe /d /s /c` (SpawnSpec.viaCmdShell). Headless output is one JSON
 * document — stdout lines are buffered as raw events and the result is
 * reassembled in extractResult. No MCP wiring: gemini agents use the
 * sparstrow-memory CLI and fenced ```sparstrow``` directives instead.
 */
export class GeminiCliProvider implements ModelProvider {
  readonly id = "gemini-cli" as const;
  readonly kind = "cli" as const;

  listModels(): string[] {
    return KNOWN_MODELS["gemini-cli"] ?? [];
  }

  private approvalMode(mode: PermissionMode): string {
    switch (mode) {
      case "bypassPermissions":
        return "yolo";
      case "acceptEdits":
        return "auto_edit";
      default:
        return "default";
    }
  }

  buildHeadlessSpawn(agent: Agent, prompt: string, opts: HeadlessSpawnOptions): SpawnSpec {
    const args: string[] = ["--output-format", "json", "-m", agent.model];
    args.push("--approval-mode", this.approvalMode(agent.permissionMode));
    const dirs = [...agent.addDirs, config.vaultPath];
    args.push("--include-directories", dirs.join(","));
    // gemini lacks --append-system-prompt; the system prompt is prepended to
    // the stdin prompt by the caller via finalPrompt — nothing to add here.
    args.push(...agent.extraArgs);
    return {
      command: config.geminiPath,
      args,
      cwd: agent.cwd ?? opts.tempDir,
      env: {
        SPARSTROW_RUN_ID: opts.runId,
        SPARSTROW_API: `http://${config.host}:${config.port}`,
        ...opts.extraEnv,
      },
      stdinData: prompt,
      viaCmdShell: true,
    };
  }

  buildInteractiveSpawn(agent: Agent, opts: InteractiveSpawnOptions): SpawnSpec {
    const args: string[] = ["-m", agent.model];
    args.push("--approval-mode", this.approvalMode(agent.permissionMode));
    const dirs = [...agent.addDirs, config.vaultPath];
    args.push("--include-directories", dirs.join(","));
    args.push(...agent.extraArgs);
    return {
      command: config.geminiPath,
      args,
      cwd: agent.cwd ?? opts.tempDir,
      env: { ...opts.extraEnv },
      viaCmdShell: true,
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
      .join("\n");
    const jsonStart = stdout.indexOf("{");
    if (jsonStart >= 0) {
      try {
        const parsed = JSON.parse(stdout.slice(jsonStart)) as {
          response?: string;
          stats?: { models?: Record<string, unknown> };
          error?: { message?: string };
        };
        if (parsed.error?.message) {
          return {
            resultText: parsed.response ?? null,
            costUsd: null,
            numTurns: null,
            sessionId: null,
            isError: true,
            errorMessage: parsed.error.message,
          };
        }
        return {
          resultText: parsed.response ?? stdout.trim() ?? null,
          costUsd: null, // gemini CLI reports token stats, not dollars
          numTurns: null,
          sessionId: null,
          isError: false,
        };
      } catch {
        // fall through to raw text
      }
    }
    return {
      resultText: stdout.trim() || null,
      costUsd: null,
      numTurns: null,
      sessionId: null,
      isError: stdout.trim().length === 0,
      errorMessage: stdout.trim().length === 0 ? "no output from gemini CLI" : undefined,
    };
  }

  healthCheck(): Promise<ProviderHealth> {
    return new Promise((resolve) => {
      execFile(
        "cmd.exe",
        ["/d", "/s", "/c", `${config.geminiPath} --version`],
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
