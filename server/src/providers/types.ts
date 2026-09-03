import type {
  Agent,
  EffectiveTools,
  ProviderHealth,
  ProviderId,
  RunEventType,
  RunResult,
} from "@sparstrow/shared";

export interface SpawnSpec {
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string | undefined>;
  /** Written to the child's stdin then closed (used to pass long prompts past Windows arg-length limits). */
  stdinData?: string;
  /** Spawn through cmd.exe (needed for npm .cmd shims). */
  viaCmdShell?: boolean;
}

export interface NormalizedEvent {
  type: RunEventType;
  payload: unknown;
}

export interface HeadlessSpawnOptions {
  runId: string;
  /** Pre-created scratch dir the provider may write config files into (mcp config, per-CLI context files…). */
  tempDir: string;
  /** Session id we assign so the run can be resumed later. */
  sessionId: string;
  /** Project root to run in (the run's project rootDir), when set and it exists. */
  rootDir?: string;
  /** Resume an earlier provider session instead of starting fresh. */
  resumeSessionId?: string;
  /**
   * Immutable per-run effective tool policy (P2, EH5). When present, the provider
   * MUST use it instead of the live agent row so a row edited while the run was
   * queued can't change what the run may touch.
   */
  effectiveTools?: EffectiveTools;
  extraEnv?: Record<string, string>;
}

export interface InteractiveSpawnOptions {
  tempDir: string;
  resumeSessionId?: string;
  extraEnv?: Record<string, string>;
}

/** Result of asking a CLI provider to check its own live model list. */
export interface CliModelDiscovery {
  models: string[];
  live: boolean;
  detail: string | null;
}

/** A provider that spawns a headless CLI child and streams its stdout (P1–P7). */
export interface CliProvider {
  readonly id: ProviderId;
  readonly kind: "cli";
  listModels(): string[];
  /**
   * Live model discovery, for CLI providers whose model lineup can be
   * queried without a full agent spawn (CS3, Band 26). Optional: a provider
   * with no such capability (e.g. claude-code's aliases don't drift) simply
   * doesn't implement it — callers must check for its presence.
   */
  discoverModels?(): Promise<CliModelDiscovery>;
  buildHeadlessSpawn(agent: Agent, prompt: string, opts: HeadlessSpawnOptions): SpawnSpec;
  buildInteractiveSpawn(agent: Agent, opts: InteractiveSpawnOptions): SpawnSpec;
  /** Parse one stdout line into zero or more normalized events. Never throws. */
  parseLine(line: string): NormalizedEvent[];
  /** Extract the final result from the full ordered event list. */
  extractResult(events: NormalizedEvent[]): RunResult;
  healthCheck(): Promise<ProviderHealth>;
}

// ── P8: direct-API providers run core's in-process tool-loop ──
//
// The provider is thin: it converts ONE normalized turn to/from its wire format
// and returns the assistant's text + any tool calls. The loop (orchestrator/
// tool-loop.ts) is provider-agnostic and shared across Anthropic/Gemini/Ollama —
// divergence would be a compile error, not a silent behavior split.

/** A provider-neutral content block in the tool-loop's message history. */
export type ChatBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; toolUseId: string; content: string; isError?: boolean };

export interface ChatMessage {
  role: "user" | "assistant";
  content: ChatBlock[];
}

/** A tool advertised to the provider — `inputSchema` is JSON Schema. */
export interface ChatToolSchema {
  name: string;
  description: string;
  inputSchema: unknown;
}

export interface ChatRequest {
  model: string;
  system: string;
  messages: ChatMessage[];
  tools: ChatToolSchema[];
  maxTokens: number;
}

export interface ChatTurn {
  /** Assistant content blocks (text + tool_use) this turn — the run's assistant event. */
  content: ChatBlock[];
  /** Tool calls the model requested this turn (subset of content). */
  toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }>;
  /** Concatenated assistant text this turn. */
  text: string;
  stopReason: "end_turn" | "tool_use" | "max_tokens" | "refusal" | "other";
  usage: { inputTokens: number; outputTokens: number };
}

export interface DirectApiProvider {
  readonly id: ProviderId;
  readonly kind: "direct_api";
  listModels(): string[];
  healthCheck(): Promise<ProviderHealth>;
  /** Live model list; may throw (no key / unreachable) — the caller degrades. */
  discoverModels(): Promise<string[]>;
  /** Whether a stored API key is required (ollama runs local, so false). */
  readonly requiresApiKey: boolean;
  /** Run ONE provider turn. Must honor `signal` (cancel/timeout). */
  chat(req: ChatRequest, signal: AbortSignal): Promise<ChatTurn>;
  /** Per-1M-token price for cost attribution; null ⇒ free/unknown. */
  price(model: string): { inputPerMTok: number; outputPerMTok: number } | null;
}

export type ModelProvider = CliProvider | DirectApiProvider;
