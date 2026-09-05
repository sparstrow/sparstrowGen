import type { ProviderId } from "@sparstrow/shared";
import type { CliModelDiscovery } from "../providers/types.js";

export type AgentMessageType =
  | "text"
  | "thinking"
  | "tool_use"
  | "tool_result"
  | "status"
  | "error"
  | "log";

export interface AgentMessage {
  type: AgentMessageType;
  content?: string;
  tool?: string;
  callId?: string;
  input?: Record<string, unknown>;
  output?: string;
  status?: string;
  level?: string;
  sessionId?: string;
  timestamp?: string;
}

export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  costUsd?: number;
}

export interface AgentResult {
  status: "completed" | "failed" | "aborted" | "timeout" | "cancelled";
  output: string;
  error?: string;
  durationMs: number;
  sessionId?: string;
  usage?: Record<string, TokenUsage>;
  resumeRejected?: boolean;
}

export interface ExecOptions {
  cwd?: string;
  model?: string;
  systemPrompt?: string;
  maxTurns?: number;
  timeoutMs?: number;
  idleWatchdogMs?: number;
  resumeSessionId?: string;
  extraArgs?: string[];
  mcpConfig?: Record<string, unknown>;
  allowedTools?: string[];
  disallowedTools?: string[];
  permissionMode?: string;
  addDirs?: string[];
  env?: Record<string, string | undefined>;
}

export interface AgentSession {
  readonly messages: AsyncIterable<AgentMessage>;
  readonly result: Promise<AgentResult>;
  cancel(): void;
}

/**
 * Universal AgentBackend interface that every agent runtime provider implements.
 * Modeled after Multica's `server/pkg/agent.Backend`.
 */
export interface AgentBackend {
  readonly id: ProviderId;
  listModels(): string[];
  discoverModels(): Promise<CliModelDiscovery>;
  execute(prompt: string, opts: ExecOptions, signal?: AbortSignal): Promise<AgentSession>;
}
