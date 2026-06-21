import type { Agent, ProviderHealth, ProviderId, RunEventType, RunResult } from "@sparstrow/shared";

export interface SpawnSpec {
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string | undefined>;
  /** Written to the child's stdin then closed (used to pass long prompts past Windows arg-length limits). */
  stdinData?: string;
  /** Spawn through cmd.exe (needed for npm .cmd shims like gemini). */
  viaCmdShell?: boolean;
}

export interface NormalizedEvent {
  type: RunEventType;
  payload: unknown;
}

export interface HeadlessSpawnOptions {
  runId: string;
  /** Pre-created scratch dir the provider may write config files into (mcp config, GEMINI.md…). */
  tempDir: string;
  /** Session id we assign so the run can be resumed later. */
  sessionId: string;
  /** Resume an earlier provider session instead of starting fresh. */
  resumeSessionId?: string;
  extraEnv?: Record<string, string>;
}

export interface InteractiveSpawnOptions {
  tempDir: string;
  resumeSessionId?: string;
  extraEnv?: Record<string, string>;
}

export interface ModelProvider {
  readonly id: ProviderId;
  readonly kind: "cli";
  listModels(): string[];
  buildHeadlessSpawn(agent: Agent, prompt: string, opts: HeadlessSpawnOptions): SpawnSpec;
  buildInteractiveSpawn(agent: Agent, opts: InteractiveSpawnOptions): SpawnSpec;
  /** Parse one stdout line into zero or more normalized events. Never throws. */
  parseLine(line: string): NormalizedEvent[];
  /** Extract the final result from the full ordered event list. */
  extractResult(events: NormalizedEvent[]): RunResult;
  healthCheck(): Promise<ProviderHealth>;
}
