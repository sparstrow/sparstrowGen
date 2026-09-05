import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import type { Agent, EffectiveTools, ProviderHealth, RunResult } from "@sparstrow/shared";
import { KNOWN_MODELS } from "@sparstrow/shared";
import { config } from "../config.js";
import type {
  HeadlessSpawnOptions,
  InteractiveSpawnOptions,
  CliModelDiscovery,
  CliProvider,
  NormalizedEvent,
  SpawnSpec,
} from "./types.js";

/** Resolves an active Anthropic token/key from process env or local credentials. */
export function getClaudeAuthToken(): string | null {
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN) return process.env.CLAUDE_CODE_OAUTH_TOKEN;
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  try {
    const credPath = path.join(os.homedir(), ".claude", ".credentials.json");
    if (fs.existsSync(credPath)) {
      const parsed = JSON.parse(fs.readFileSync(credPath, "utf-8"));
      if (parsed.claudeAiOauth?.accessToken) {
        return parsed.claudeAiOauth.accessToken;
      }
    }
  } catch {}
  return null;
}

/**
 * Provider for the Claude Code CLI (verified against claude 2.1.x).
 * Headless: `claude -p --output-format stream-json --verbose` with the prompt on stdin
 * (prompts can exceed Windows' ~32k command-line limit once memory is injected).
 */
export class ClaudeCodeProvider implements CliProvider {
  readonly id = "claude-code" as const;
  readonly kind = "cli" as const;

  listModels(): string[] {
    return KNOWN_MODELS["claude-code"] ?? [];
  }

  /**
   * Live model discovery via Anthropic's model API endpoint using the active
   * OAuth or API token. If offline or unauthenticated, degrades to KNOWN_MODELS.
   */
  async discoverModels(): Promise<CliModelDiscovery> {
    const token = getClaudeAuthToken();
    if (!token) {
      return {
        models: this.listModels(),
        live: false,
        detail: "No active CLAUDE_CODE_OAUTH_TOKEN or credentials found; using catalog seed",
      };
    }

    try {
      const headers: Record<string, string> = {
        "anthropic-version": "2023-06-01",
      };
      if (token.startsWith("sk-ant-oat") || token.startsWith("ey")) {
        headers["authorization"] = `Bearer ${token}`;
      } else {
        headers["x-api-key"] = token;
      }

      const res = await fetch("https://api.anthropic.com/v1/models?limit=100", {
        headers,
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) {
        return {
          models: this.listModels(),
          live: false,
          detail: `Anthropic API returned ${res.status}: ${res.statusText}`,
        };
      }

      const data = (await res.json()) as { data?: Array<{ id: string; display_name?: string }> };
      if (Array.isArray(data.data) && data.data.length > 0) {
        const discovered = data.data.map((m) => m.id);
        const baseAliases = ["opus", "sonnet", "haiku"];
        const merged = Array.from(new Set([...baseAliases, ...discovered, ...this.listModels()]));
        return {
          models: merged,
          live: true,
          detail: null,
        };
      }
    } catch (err) {
      return {
        models: this.listModels(),
        live: false,
        detail: err instanceof Error ? err.message : String(err),
      };
    }

    return {
      models: this.listModels(),
      live: false,
      detail: "Anthropic API returned no models",
    };
  }

  private commonArgs(
    agent: Agent,
    tempDir: string,
    runId?: string,
    effectiveTools?: EffectiveTools,
  ): string[] {
    const args: string[] = ["--model", agent.model];
    // EH5: prefer the immutable per-run snapshot; fall back to the live agent row
    // only for interactive/test spawns that have no resolved policy.
    const allowedTools = [...(effectiveTools?.allowed ?? agent.allowedTools)];
    const disallowedTools = effectiveTools?.disallowed ?? agent.disallowedTools;

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
    if (disallowedTools.length > 0)
      args.push("--disallowedTools", disallowedTools.join(","));
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
    // A headless spawn has no TTY, so an unattended, machine-global skill
    // installed under the operator's OWN ~/.claude/skills (e.g. one with a
    // preamble that expects to run first every session) can never get the
    // tool permission it needs -- the run just stalls until it times out.
    // `--disable-slash-commands` ("Disable all skills") keeps every headless
    // run's tool surface exactly what `allowedTools`/`disallowedTools` grant,
    // independent of whatever the machine it happens to run on has installed.
    // Interactive spawns (a real human at the PTY, e.g. Terminals) keep skills
    // on -- there, the operator's own skills are the point.
    const args: string[] = [
      "-p",
      "--output-format",
      "stream-json",
      "--verbose",
      "--disable-slash-commands",
      "--include-partial-messages",
    ];
    if (opts.resumeSessionId) args.push("--resume", opts.resumeSessionId);
    else args.push("--session-id", opts.sessionId);
    if (agent.maxTurns != null) args.push("--max-turns", String(agent.maxTurns));
    args.push(...this.commonArgs(agent, opts.tempDir, opts.runId, opts.effectiveTools));
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

  /**
   * The message a person should see for a failed run.
   *
   * NOT `subtype`. That field describes the SHAPE of the final turn —
   * "success", "error_max_turns", "error_during_execution" — and the CLI
   * routinely sets `is_error: true` alongside `subtype: "success"` when the
   * turn completed normally but its content is an error. Reading it as the
   * error produced the memorable nonsense of a failed run whose error column
   * said "success", found during M4 verification against an expired token.
   *
   * `result` carries the actual text ("Failed to authenticate. API Error:
   * 401 …"), so prefer it, and fall back to `subtype` only when it says
   * something a reader can use.
   */
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
        errorMessage: isError ? errorMessageFrom(resultEvent) : undefined,
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
            const hasAuthToken = !!getClaudeAuthToken();
            execFile(
              config.claudePath,
              ["auth", "status"],
              { timeout: 5_000, windowsHide: true },
              (_authErr, authStdout) => {
                let authenticated = hasAuthToken;
                if (authStdout) {
                  try {
                    const parsed = JSON.parse(authStdout.trim());
                    if (parsed.loggedIn != null) authenticated = Boolean(parsed.loggedIn);
                  } catch {}
                }
                resolve({
                  id: this.id,
                  ok: true,
                  version: stdout.trim() || null,
                  authenticated,
                  detail: null,
                });
              },
            );
          }
        },
      );
    });
  }
}

/** See the note on `extractResult`. Exported for its test. */
export function errorMessageFrom(resultEvent: Record<string, unknown>): string {
  const result = typeof resultEvent.result === "string" ? resultEvent.result.trim() : "";
  if (result) return result;

  const subtype = typeof resultEvent.subtype === "string" ? resultEvent.subtype.trim() : "";
  // "success" as an error message is worse than saying nothing specific: it
  // sends the reader looking for a run that worked.
  if (subtype && subtype !== "success") return subtype;

  return "unknown error";
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
