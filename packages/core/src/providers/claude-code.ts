import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import type { Agent, ProviderHealth, RunResult } from "@sparstrow/shared";
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
 * Provider for the Claude Code CLI (verified against claude 2.1.x).
 * Headless: `claude -p --output-format stream-json --verbose` with the prompt on stdin
 * (prompts can exceed Windows' ~32k command-line limit once memory is injected).
 */
export class ClaudeCodeProvider implements ModelProvider {
  readonly id = "claude-code" as const;
  readonly kind = "cli" as const;

  listModels(): string[] {
    return KNOWN_MODELS["claude-code"] ?? [];
  }

  private commonArgs(agent: Agent, tempDir: string, runId?: string): string[] {
    const args: string[] = ["--model", agent.model];
    const allowedTools = [...agent.allowedTools];

    // Auto-wire the sparstrow-memory MCP server (memory_search / memory_save
    // and, from phase 3, task/message tools) into every run that has a run id.
    // Served over Streamable HTTP by the core itself — stdio MCP servers never
    // finish connecting in claude's headless mode on Windows.
    const mcpServers: Record<string, unknown> = { ...agent.mcpServers };
    if (runId) {
      mcpServers["sparstrow-memory"] = {
        type: "http",
        url: `http://${config.host}:${config.port}/mcp`,
        headers: { "x-sparstrow-run": runId },
      };
      allowedTools.push("mcp__sparstrow-memory");
    }

    if (allowedTools.length > 0) args.push("--allowedTools", allowedTools.join(","));
    if (agent.disallowedTools.length > 0)
      args.push("--disallowedTools", agent.disallowedTools.join(","));
    if (agent.permissionMode !== "default") args.push("--permission-mode", agent.permissionMode);
    for (const dir of agent.addDirs) args.push("--add-dir", dir);
    // Vault access so agents can read/write memory notes as files.
    args.push("--add-dir", config.vaultPath);
    if (Object.keys(mcpServers).length > 0) {
      const mcpConfigPath = path.join(tempDir, "mcp-config.json");
      fs.writeFileSync(mcpConfigPath, JSON.stringify({ mcpServers }, null, 2));
      args.push("--mcp-config", mcpConfigPath, "--strict-mcp-config");
    }
    if (agent.systemPrompt.trim().length > 0)
      args.push("--append-system-prompt", agent.systemPrompt);
    args.push(...agent.extraArgs);
    return args;
  }

  buildHeadlessSpawn(agent: Agent, prompt: string, opts: HeadlessSpawnOptions): SpawnSpec {
    const args: string[] = ["-p", "--output-format", "stream-json", "--verbose"];
    if (opts.resumeSessionId) args.push("--resume", opts.resumeSessionId);
    else args.push("--session-id", opts.sessionId);
    if (agent.maxTurns != null) args.push("--max-turns", String(agent.maxTurns));
    args.push(...this.commonArgs(agent, opts.tempDir, opts.runId));
    return {
      command: config.claudePath,
      args,
      cwd: opts.rootDir ?? agent.cwd ?? opts.tempDir,
      env: { ...opts.extraEnv },
      stdinData: prompt,
    };
  }

  buildInteractiveSpawn(agent: Agent, opts: InteractiveSpawnOptions): SpawnSpec {
    const args: string[] = [];
    if (opts.resumeSessionId) args.push("--resume", opts.resumeSessionId);
    args.push(...this.commonArgs(agent, opts.tempDir));
    return {
      command: config.claudePath,
      args,
      cwd: agent.cwd ?? opts.tempDir,
      env: { ...opts.extraEnv },
    };
  }

  parseLine(line: string): NormalizedEvent[] {
    const trimmed = line.trim();
    if (trimmed.length === 0) return [];
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return [{ type: "raw", payload: trimmed }];
    }
    const obj = parsed as Record<string, unknown>;
    switch (obj.type) {
      case "system":
        return [{ type: "system", payload: obj }];
      case "assistant":
        return [{ type: "assistant", payload: obj }];
      case "user":
        return [{ type: "user", payload: obj }];
      case "result":
        return [{ type: "result", payload: obj }];
      case "stream_event":
      case "rate_limit_event":
        return [{ type: "status", payload: obj }];
      default:
        return [{ type: "raw", payload: obj }];
    }
  }

  extractResult(events: NormalizedEvent[]): RunResult {
    let resultEvent: Record<string, unknown> | null = null;
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i];
      if (e?.type === "result") {
        resultEvent = e.payload as Record<string, unknown>;
        break;
      }
    }
    if (resultEvent) {
      const isError = resultEvent.is_error === true;
      return {
        resultText:
          typeof resultEvent.result === "string"
            ? resultEvent.result
            : (lastAssistantText(events) ?? null),
        costUsd: typeof resultEvent.total_cost_usd === "number" ? resultEvent.total_cost_usd : null,
        numTurns: typeof resultEvent.num_turns === "number" ? resultEvent.num_turns : null,
        sessionId: typeof resultEvent.session_id === "string" ? resultEvent.session_id : null,
        isError,
        errorMessage: isError
          ? typeof resultEvent.subtype === "string"
            ? resultEvent.subtype
            : "unknown error"
          : undefined,
      };
    }
    return {
      resultText: lastAssistantText(events),
      costUsd: null,
      numTurns: null,
      sessionId: null,
      isError: true,
      errorMessage: "no result event received from claude CLI",
    };
  }

  healthCheck(): Promise<ProviderHealth> {
    return new Promise((resolve) => {
      execFile(
        config.claudePath,
        ["--version"],
        { timeout: 15_000, windowsHide: true },
        (err, stdout) => {
          if (err) {
            resolve({
              id: this.id,
              ok: false,
              version: null,
              authenticated: null,
              detail: err.message,
            });
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

function lastAssistantText(events: NormalizedEvent[]): string | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e?.type !== "assistant") continue;
    const payload = e.payload as { message?: { content?: unknown } };
    const content = payload.message?.content;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      const texts = content
        .filter((b): b is { type: string; text: string } => b?.type === "text")
        .map((b) => b.text);
      if (texts.length > 0) return texts.join("\n");
    }
  }
  return null;
}
