import type { Run, RunEvent } from "./schemas/run.js";
import type { Message, Task } from "./schemas/task.js";
import type { PipelineRun } from "./schemas/pipeline.js";
import type { MemoryContradiction, MemoryNote } from "./schemas/memory.js";
import type { Goal } from "./schemas/goal.js";

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
  | { type: "graph.engine.status"; status: GraphEngineStatus }
  | { type: "graph.project.status"; projectId: string; status: GraphProjectStatus }
  | { type: "memory.contradiction.flagged"; contradiction: MemoryContradiction }
  | { type: "dream.completed"; projectId: string; report: DreamReport }
  // P6: goal row changed (status/pause/version/blocked). Node-level liveness
  // rides on the existing task.updated events (node status is DERIVED from its
  // task — EM4); plan.updated says "the graph itself changed, refetch detail".
  | { type: "goal.updated"; goal: Goal }
  | { type: "goal.plan.updated"; goalId: string; planVersion: number };

/**
 * P5 dream cycle: one night's consolidation outcome for a project. Pushed
 * over /ws for the project page's Dream-cycle panel; the same counts go into
 * the daily digest inbox message.
 */
export interface DreamReport {
  projectId: string;
  status: "ok" | "partial" | "skipped" | "failed";
  /** Why partial/skipped/failed (budget hit, engine error, overlap guard). */
  detail: string | null;
  runsScanned: number;
  signalsWritten: number;
  signalsQuarantined: number;
  notesMerged: number;
  synthesisWritten: number;
  contradictionsFlagged: number;
  costUsd: number | null;
  finishedAt: string;
}

/**
 * P5: per-project code-graph index state (derived data — persisted as a JSON
 * file inside the project's engine store dir, no DB migration). Drives the
 * project page's Code-graph panel; pushed over /ws on every transition.
 */
export interface GraphProjectStatus {
  state: "none" | "queued" | "indexing" | "ready" | "failed" | "stale";
  detail: string | null;
  indexedAt: string | null;
  nodes: number | null;
  edges: number | null;
}

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
