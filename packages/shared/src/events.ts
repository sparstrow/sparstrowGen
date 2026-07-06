import type { Run, RunEvent } from "./schemas/run.js";
import type { Message, Task } from "./schemas/task.js";
import type { PipelineRun } from "./schemas/pipeline.js";
import type { MemoryNote } from "./schemas/memory.js";

/** Events broadcast over /ws. Discriminated on `type`. */
export type WsServerEvent =
  | { type: "run.created"; run: Run }
  | { type: "run.event"; runId: string; event: RunEvent }
  | { type: "run.updated"; run: Run }
  | { type: "run.completed"; run: Run }
  | { type: "pipeline-run.updated"; pipelineRun: PipelineRun }
  | { type: "task.created"; task: Task }
  | { type: "task.updated"; task: Task }
  | { type: "message.created"; message: Message }
  | { type: "cron.fired"; cronJobId: string; at: string }
  | { type: "memory.note.indexed"; note: MemoryNote }
  | { type: "memory.note.removed"; noteId: string; path: string }
  | { type: "terminal.session.opened"; sessionId: string; agentId: string }
  | { type: "terminal.session.closed"; sessionId: string }
  | { type: "system.health"; health: SystemHealth }
  | { type: "graph.engine.status"; status: GraphEngineStatus };

/**
 * P5: code-graph engine (codebase-memory-mcp) install status — engine-level
 * only; per-project index state travels separately. Published on every install
 * transition so the download is owner-visible, never silent.
 */
export interface GraphEngineStatus {
  state: "not-installed" | "installing" | "verifying" | "installed" | "error";
  installed: boolean;
  pinnedVersion: string;
  /** Variants on disk: `std` = query engine (no UI code), `ui` = 3D visualization. */
  variants: { std: boolean; ui: boolean };
  exePath: string | null;
  detail: string | null;
}

export interface ProviderHealth {
  id: string;
  ok: boolean;
  version: string | null;
  authenticated: boolean | null;
  detail: string | null;
}

export interface SystemHealth {
  ok: boolean;
  version: string;
  uptimeMs: number;
  db: { ok: boolean; path: string };
  vault: { ok: boolean; path: string };
  providers: ProviderHealth[];
  embedder: { ok: boolean; ready: boolean; model: string; detail: string | null };
  search: { vec: boolean; fts: boolean };
}
