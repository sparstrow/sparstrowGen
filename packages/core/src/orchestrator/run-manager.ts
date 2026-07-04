import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { spawn, type ChildProcess } from "node:child_process";
import treeKill from "tree-kill";
import { and, desc, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  DEFAULT_GLOBAL_CONCURRENCY,
  DEFAULT_RUN_TIMEOUT_MS,
  type Agent,
  type Run,
  type RunCreate,
  type RunStatus,
} from "@sparstrow/shared";
import { config } from "../config.js";
import { getDb } from "../db/connection.js";
import { agents, projects, runs, runEvents, tasks } from "../db/schema.js";
import { bus } from "../events/bus.js";
import { logger } from "../logger.js";
import { buildMemoryBlock } from "../memory/injector.js";
import { scanVault } from "../memory/vault.js";
import { getProvider } from "../providers/index.js";
import type { NormalizedEvent } from "../providers/types.js";
import { buildPreamble, type Assignment } from "./preamble.js";
import { resolveRunEffectiveTools } from "../agents/tool-resolution.js";
import { busyKey, ensureAgentInstance } from "../agents/instances.js";

const nowIso = () => new Date().toISOString();

interface ActiveRun {
  child: ChildProcess;
  agentId: string;
  /** Instance-keyed busy identity (P3-Q5): agentId::projectId, "" for no project. */
  busyKey: string;
  events: NormalizedEvent[];
  seq: number;
  cancelRequested: boolean;
  timedOut: boolean;
  timer: NodeJS.Timeout | null;
  startedAtMs: number;
  stderrLines: string[];
}

function rowToRun(row: typeof runs.$inferSelect): Run {
  return { ...row } as unknown as Run;
}

export class RunManager {
  private active = new Map<string, ActiveRun>();
  /**
   * Busy identities (P3-Q5: keyed on the INSTANCE — busyKey(agentId, projectId) —
   * so one template can run concurrently in different projects; the global cap
   * still bounds the total).
   */
  private busyAgents = new Set<string>();
  private globalCap = DEFAULT_GLOBAL_CONCURRENCY;

  /**
   * Mark runs left over from a previous service process as failed. EC1: also
   * emit run.completed and reconcile each orphaned run's task, so a task whose
   * run died mid-flight (e.g. a restart) doesn't stick in `in_progress` forever —
   * it reconciles to `failed` and surfaces, rather than silently orphaning a lead.
   */
  sweepOrphans(): void {
    const db = getDb();
    const orphaned = db
      .select()
      .from(runs)
      .where(inArray(runs.status, ["running", "queued"]))
      .all();
    if (orphaned.length === 0) return;
    db.update(runs)
      .set({ status: "failed", error: "orphaned at service start", finishedAt: nowIso() })
      .where(inArray(runs.status, ["running", "queued"]))
      .run();
    logger.warn({ count: orphaned.length }, "swept orphaned runs");
    for (const row of orphaned) {
      const run = this.getRun(row.id);
      if (!run) continue;
      bus.publish({ type: "run.completed", run });
      void import("./handoff.js")
        .then(({ processRunCompletion }) => processRunCompletion(run))
        .catch((err) => logger.warn({ err, runId: run.id }, "orphan reconciliation failed"));
    }
  }

  createRun(input: RunCreate): Run {
    const db = getDb();
    const agentRow = db.select().from(agents).where(eq(agents.id, input.agentId)).get();
    if (!agentRow) throw new HttpError(404, `agent not found: ${input.agentId}`);
    if (!agentRow.enabled) throw new HttpError(409, `agent is disabled: ${agentRow.name}`);
    if (input.projectId) {
      const project = db.select().from(projects).where(eq(projects.id, input.projectId)).get();
      if (!project) throw new HttpError(404, `project not found: ${input.projectId}`);
    }
    const id = `run_${nanoid(12)}`;
    const row: typeof runs.$inferInsert = {
      id,
      agentId: input.agentId,
      projectId: input.projectId ?? null,
      pipelineRunId: input.pipelineRunId ?? null,
      pipelineStepId: input.pipelineStepId ?? null,
      trigger: input.trigger,
      triggerRef: input.triggerRef ?? null,
      mode: "headless",
      prompt: input.prompt,
      status: "queued",
      // Fresh-run is the primary wake path (P1-Q1); resumeSessionId is a
      // claude-code optimization applied by the provider spawn, not stored here.
      sessionId: input.resumeSessionId ?? crypto.randomUUID(),
      lane: input.lane ?? "foreground",
      // effectiveTools is resolved + snapshotted at spawn (start()), not at create,
      // so a queued run reflects the policy in force when it actually runs (EH5).
      effectiveTools: null,
      createdAt: nowIso(),
    };
    db.insert(runs).values(row).run();
    const run = rowToRun(db.select().from(runs).where(eq(runs.id, id)).get()!);
    bus.publish({ type: "run.created", run });
    queueMicrotask(() => this.tick());
    return run;
  }

  cancel(runId: string): Run {
    const db = getDb();
    const row = db.select().from(runs).where(eq(runs.id, runId)).get();
    if (!row) throw new HttpError(404, `run not found: ${runId}`);
    const activeRun = this.active.get(runId);
    if (activeRun) {
      activeRun.cancelRequested = true;
      if (activeRun.child.pid) treeKill(activeRun.child.pid, "SIGTERM");
      return rowToRun(row);
    }
    if (row.status === "queued") {
      db.update(runs)
        .set({ status: "cancelled", finishedAt: nowIso() })
        .where(eq(runs.id, runId))
        .run();
      const updated = rowToRun(db.select().from(runs).where(eq(runs.id, runId)).get()!);
      bus.publish({ type: "run.completed", run: updated });
      // EC1: reconcile the cancelled run's task so it doesn't stick in_progress.
      void import("./handoff.js")
        .then(({ processRunCompletion }) => processRunCompletion(updated))
        .catch((err) => logger.warn({ err, runId }, "cancel reconciliation failed"));
      return updated;
    }
    throw new HttpError(409, `run is not cancellable (status: ${row.status})`);
  }

  private tick(): void {
    const db = getDb();
    while (this.active.size < this.globalCap) {
      const queued = db
        .select()
        .from(runs)
        .where(eq(runs.status, "queued"))
        .orderBy(runs.createdAt)
        .limit(50)
        .all();
      const next = queued.find((r) => !this.busyAgents.has(busyKey(r.agentId, r.projectId)));
      if (!next) return;
      const nextKey = busyKey(next.agentId, next.projectId);
      this.busyAgents.add(nextKey);
      this.start(next).catch((err) => {
        logger.error({ err, runId: next.id }, "run start failed");
        this.failRun(next.id, err instanceof Error ? err.message : String(err));
        this.busyAgents.delete(nextKey);
        this.active.delete(next.id);
        queueMicrotask(() => this.tick());
      });
    }
  }

  private async start(row: typeof runs.$inferSelect): Promise<void> {
    const db = getDb();
    const key = busyKey(row.agentId, row.projectId);
    const agentRow = db.select().from(agents).where(eq(agents.id, row.agentId)).get();
    if (!agentRow) {
      this.failRun(row.id, "agent deleted before run started");
      this.busyAgents.delete(key);
      return;
    }
    const agent = agentRow as unknown as Agent;
    let projectSlug: string | null = null;
    let projectRootDir: string | undefined;
    let projectRow: typeof projects.$inferSelect | undefined;
    if (row.projectId) {
      projectRow = db.select().from(projects).where(eq(projects.id, row.projectId)).get();
      projectSlug = projectRow?.slug ?? null;
      const root = projectRow?.rootDir ?? null;
      if (root) {
        if (!fs.existsSync(root)) {
          this.failRun(row.id, `project root dir does not exist: ${root}`);
          this.busyAgents.delete(key);
          return;
        }
        projectRootDir = root;
      }
    }
    const provider = getProvider(agent.provider);

    // P3 (locked D5): a project run executes as the (template, project) INSTANCE —
    // created lazily here, template self-notes copied on first create (P3-Q1).
    // The instance id is the EH4 audit seam stamped on the run below.
    let agentInstanceId: string | null = null;
    if (projectRow) {
      try {
        agentInstanceId = ensureAgentInstance({
          agentId: agent.id,
          agentSlug: agent.slug,
          projectId: projectRow.id,
          projectSlug: projectRow.slug,
        }).id;
      } catch (err) {
        logger.warn({ err, runId: row.id }, "agent instance ensure failed — run continues template-scoped");
      }
    }

    const memoryBlock = await buildMemoryBlock(agent, projectSlug, row.prompt);
    // A task-triggered run knows its task (DX-C2) — surface it as the assignment.
    let assignment: Assignment | undefined;
    let taskRow: typeof tasks.$inferSelect | undefined;
    if (row.trigger === "task" && row.triggerRef) {
      taskRow = db.select().from(tasks).where(eq(tasks.id, row.triggerRef)).get();
      if (taskRow) assignment = { taskId: taskRow.id, taskTitle: taskRow.title };
    }
    const preamble = buildPreamble(agent, projectSlug, assignment);
    const finalPrompt = [preamble, memoryBlock, `## Task\n${row.prompt}`]
      .filter((s) => s.length > 0)
      .join("\n\n");

    // P2/EH5: resolve the effective tool policy (Global→Agent→Project→Task) ONCE and
    // snapshot it on the run, so the provider reads an immutable set — a row edited
    // while the run was queued can't change what it may touch.
    const effectiveTools = resolveRunEffectiveTools({ agent, project: projectRow, task: taskRow });
    db.update(runs).set({ effectiveTools }).where(eq(runs.id, row.id)).run();

    const tempDir = path.join(config.tmpDir, row.id);
    fs.mkdirSync(tempDir, { recursive: true });

    const spec = provider.buildHeadlessSpawn(agent, finalPrompt, {
      runId: row.id,
      tempDir,
      effectiveTools,
      rootDir: projectRootDir,
      sessionId: row.sessionId ?? crypto.randomUUID(),
      extraEnv: {
        SPARSTROW_RUN_ID: row.id,
        SPARSTROW_API: `http://${config.host}:${config.port}`,
        // Per-agent git identity: one shared email links every agent to the
        // single agent GitHub account; the NAME carries which agent, so commits
        // are attributable (git log --author "<name>") and guardrails can key
        // off it. Set on the spawn env so it holds in any repo the agent touches.
        GIT_AUTHOR_NAME: `Sparstrow Agent · ${agent.name} (${agent.id})`,
        GIT_AUTHOR_EMAIL: config.agentEmail,
        GIT_COMMITTER_NAME: `Sparstrow Agent · ${agent.name} (${agent.id})`,
        GIT_COMMITTER_EMAIL: config.agentEmail,
      },
    });

    const child = spawn(
      spec.viaCmdShell ? "cmd.exe" : spec.command,
      spec.viaCmdShell ? ["/d", "/s", "/c", spec.command, ...spec.args] : spec.args,
      {
        cwd: spec.cwd,
        env: { ...process.env, ...spec.env },
        windowsHide: true,
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    const state: ActiveRun = {
      child,
      agentId: agent.id,
      busyKey: key,
      events: [],
      seq: 0,
      cancelRequested: false,
      timedOut: false,
      timer: null,
      startedAtMs: Date.now(),
      stderrLines: [],
    };
    this.active.set(row.id, state);

    db.update(runs)
      .set({
        status: "running",
        startedAt: nowIso(),
        pid: child.pid ?? null,
        injectedContext: memoryBlock || null,
        agentInstanceId,
      })
      .where(eq(runs.id, row.id))
      .run();
    bus.publish({ type: "run.updated", run: this.getRun(row.id)! });
    logger.info({ runId: row.id, agent: agent.name, pid: child.pid }, "run started");

    if (spec.stdinData != null && child.stdin) {
      child.stdin.write(spec.stdinData);
      child.stdin.end();
    }

    const timeoutMs = DEFAULT_RUN_TIMEOUT_MS;
    state.timer = setTimeout(() => {
      state.timedOut = true;
      if (child.pid) treeKill(child.pid, "SIGTERM");
      logger.warn({ runId: row.id }, "run timed out — killing process tree");
    }, timeoutMs);

    if (child.stdout) {
      const rl = readline.createInterface({ input: child.stdout });
      rl.on("line", (line) => {
        for (const event of provider.parseLine(line)) {
          this.recordEvent(row.id, state, event.type, event.payload);
          state.events.push(event);
        }
      });
    }
    if (child.stderr) {
      const rlErr = readline.createInterface({ input: child.stderr });
      rlErr.on("line", (line) => {
        state.stderrLines.push(line);
        if (state.stderrLines.length <= 200) {
          this.recordEvent(row.id, state, "stderr", line);
        }
      });
    }

    child.on("error", (err) => {
      logger.error({ err, runId: row.id }, "spawn error");
      state.stderrLines.push(`spawn error: ${err.message}`);
    });

    child.on("close", (code) => {
      if (state.timer) clearTimeout(state.timer);
      this.finalize(row.id, state, code, provider.extractResult(state.events));
    });
  }

  private recordEvent(runId: string, state: ActiveRun, type: string, payload: unknown): void {
    const db = getDb();
    const seq = state.seq++;
    const ts = nowIso();
    const inserted = db
      .insert(runEvents)
      .values({ runId, seq, ts, type, payload })
      .returning({ id: runEvents.id })
      .get();
    bus.publish({
      type: "run.event",
      runId,
      event: { id: inserted.id, runId, seq, ts, type: type as never, payload },
    });
  }

  private finalize(
    runId: string,
    state: ActiveRun,
    exitCode: number | null,
    result: ReturnType<ReturnType<typeof getProvider>["extractResult"]>,
  ): void {
    const db = getDb();
    let status: RunStatus;
    if (state.cancelRequested) status = "cancelled";
    else if (state.timedOut) status = "timeout";
    else if (exitCode === 0 && !result.isError) status = "succeeded";
    else status = "failed";

    const error =
      status === "failed"
        ? (result.errorMessage ??
          (state.stderrLines.length > 0
            ? state.stderrLines.slice(-10).join("\n")
            : `exit code ${exitCode}`))
        : status === "timeout"
          ? "run exceeded timeout"
          : null;

    db.update(runs)
      .set({
        status,
        resultText: result.resultText,
        costUsd: result.costUsd,
        numTurns: result.numTurns,
        sessionId: result.sessionId ?? undefined,
        durationMs: Date.now() - state.startedAtMs,
        exitCode,
        error,
        finishedAt: nowIso(),
      })
      .where(eq(runs.id, runId))
      .run();

    this.active.delete(runId);
    this.busyAgents.delete(state.busyKey);

    const run = this.getRun(runId)!;
    bus.publish({ type: "run.completed", run });
    logger.info({ runId, status, exitCode, durationMs: run.durationMs }, "run finished");

    // Handoff directives + task reconciliation (dynamic import avoids an
    // init-order cycle with the taskboard service, which spawns runs).
    void import("./handoff.js")
      .then(({ processRunCompletion }) => processRunCompletion(run))
      .catch((err) => logger.warn({ err, runId }, "run completion processing failed"));

    // Pick up any memory notes the agent wrote directly into the vault.
    try {
      const scan = scanVault();
      if (scan.added + scan.updated > 0) {
        logger.info({ ...scan }, "vault rescan after run");
      }
    } catch (err) {
      logger.warn({ err }, "post-run vault scan failed");
    }

    queueMicrotask(() => this.tick());
  }

  private failRun(runId: string, error: string): void {
    const db = getDb();
    db.update(runs)
      .set({ status: "failed", error, finishedAt: nowIso() })
      .where(eq(runs.id, runId))
      .run();
    const run = this.getRun(runId);
    if (run) bus.publish({ type: "run.completed", run });
  }

  getRun(runId: string): Run | null {
    const row = getDb().select().from(runs).where(eq(runs.id, runId)).get();
    return row ? rowToRun(row) : null;
  }

  listRuns(filter: {
    agentId?: string;
    projectId?: string;
    status?: string;
    limit?: number;
  }): Run[] {
    const conditions = [];
    if (filter.agentId) conditions.push(eq(runs.agentId, filter.agentId));
    if (filter.projectId) conditions.push(eq(runs.projectId, filter.projectId));
    if (filter.status) conditions.push(eq(runs.status, filter.status));
    const rows = getDb()
      .select()
      .from(runs)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(runs.createdAt))
      .limit(filter.limit ?? 100)
      .all();
    return rows.map(rowToRun);
  }
}

export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

export const runManager = new RunManager();
