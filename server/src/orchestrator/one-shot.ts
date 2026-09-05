import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { spawn } from "node:child_process";
import treeKill from "tree-kill";
import { nanoid } from "nanoid";
import type { Agent, ChatActivity } from "@sparstrow/shared";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { agentChildEnv } from "./child-env.js";
import { getProvider } from "../providers/index.js";
import type { NormalizedEvent } from "../providers/types.js";

export interface CompleteOnceOptions {
  /** Hard ceiling for the turn; the process tree is killed past it. */
  timeoutMs?: number;
  /** Resume an earlier provider session (multi-turn interview). */
  resumeSessionId?: string;
  /**
   * M12 — fired with the FULL accumulated reply text and background activities so far.
   */
  onEvent?: (delta: { seq: number; replyText: string; activities?: ChatActivity[] }) => void;
}

export interface CompleteOnceResult {
  text: string | null;
  sessionId: string;
  isError: boolean;
  errorMessage?: string;
  activities?: ChatActivity[];
}

/**
 * Fire a single headless model turn and await its result — NO run row, NO
 * memory injection, NO concurrency queue, short timeout. Reuses the same
 * provider spawn/parse layer RunManager uses (this realizes the reviewed
 * `createRunAndAwait` decision as a focused helper rather than bolting a
 * second lifecycle onto the queue-oriented RunManager).
 *
 * Built for the Agent Creator's /agents/draft endpoint, which needs a quick
 * synchronous structured reply, not a tracked long-running run. Passing an
 * empty runId makes the provider skip memory-MCP wiring.
 */
export async function completeOnce(
  agent: Agent,
  prompt: string,
  opts: CompleteOnceOptions = {},
): Promise<CompleteOnceResult> {
  const provider = getProvider(agent.provider);
  // completeOnce is the CLI-only one-shot path (Agent Creator drafts). Direct-API
  // agents run through the normal tool-loop path, never here.
  if (provider.kind !== "cli") {
    throw new Error(`completeOnce supports CLI providers only (got ${agent.provider})`);
  }
  const cli = provider;
  const sessionId = opts.resumeSessionId ?? crypto.randomUUID();
  const tempDir = path.join(config.tmpDir, `draft_${nanoid(8)}`);
  fs.mkdirSync(tempDir, { recursive: true });

  const spec = cli.buildHeadlessSpawn(agent, prompt, {
    runId: "", // no run context → provider skips memory-MCP + run-scoped tools
    tempDir,
    sessionId,
    resumeSessionId: opts.resumeSessionId,
  });

  const timeoutMs = opts.timeoutMs ?? 90_000;
  const events: NormalizedEvent[] = [];
  const stderr: string[] = [];

  return await new Promise<CompleteOnceResult>((resolve) => {
    const child = spawn(
      spec.viaCmdShell ? "cmd.exe" : spec.command,
      spec.viaCmdShell ? ["/d", "/s", "/c", spec.command, ...spec.args] : spec.args,
      {
        cwd: spec.cwd,
        // EC2 (P7): allowlisted child env — no process.env spread into agents.
        env: agentChildEnv(spec.env),
        windowsHide: true,
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    let settled = false;
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      if (child.pid) treeKill(child.pid, "SIGTERM");
    }, timeoutMs);

    const finish = (result: CompleteOnceResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fs.rm(tempDir, { recursive: true, force: true }, () => {});
      resolve(result);
    };

    if (spec.stdinData != null && child.stdin) {
      child.stdin.write(spec.stdinData);
      child.stdin.end();
    }
    let lastEmitted: string | null = null;
    let onEventSeq = 0;
    const activities: ChatActivity[] = [];
    let currentThinking: ChatActivity | null = null;
    let lastActivitiesCount = 0;

    if (child.stdout) {
      readline.createInterface({ input: child.stdout }).on("line", (line) => {
        const parsedEvents = cli.parseLine(line);
        for (const ev of parsedEvents) {
          events.push(ev);
          const now = new Date().toISOString();

          if (ev.type === "assistant") {
            const p = ev.payload as Record<string, unknown>;
            const msg = p.message as Record<string, unknown> | undefined;
            const content = msg?.content ?? p.content;

            if (Array.isArray(content)) {
              for (const block of content) {
                if (!block || typeof block !== "object") continue;
                const b = block as Record<string, unknown>;
                if (b.type === "thinking" && typeof b.thinking === "string") {
                  if (b.thinking.trim().length > 0) {
                    if (!currentThinking) {
                      currentThinking = {
                        id: `act_think_${Date.now()}`,
                        type: "thinking",
                        content: b.thinking,
                        timestamp: now,
                      };
                      activities.push(currentThinking);
                    } else {
                      currentThinking.content = b.thinking;
                    }
                  }
                } else if (b.type === "tool_use") {
                  currentThinking = null;
                  activities.push({
                    id: (b.id as string) ?? `act_tool_${Date.now()}`,
                    type: "tool_use",
                    tool: typeof b.name === "string" ? b.name : "tool",
                    callId: typeof b.id === "string" ? b.id : undefined,
                    input: (b.input as Record<string, unknown>) ?? {},
                    timestamp: now,
                  });
                }
              }
            }
          } else if (ev.type === "user") {
            const p = ev.payload as Record<string, unknown>;
            const msg = p.message as Record<string, unknown> | undefined;
            const content = msg?.content;
            if (Array.isArray(content)) {
              for (const block of content) {
                if (!block || typeof block !== "object") continue;
                const b = block as Record<string, unknown>;
                if (b.type === "tool_result") {
                  currentThinking = null;
                  const callId = typeof b.tool_use_id === "string" ? b.tool_use_id : undefined;
                  const existing = callId ? activities.find((a) => a.callId === callId) : null;
                  if (existing) {
                    existing.output = typeof b.content === "string" ? b.content : JSON.stringify(b.content);
                  } else {
                    activities.push({
                      id: `act_res_${Date.now()}`,
                      type: "tool_result",
                      callId,
                      output: typeof b.content === "string" ? b.content : JSON.stringify(b.content),
                      timestamp: now,
                    });
                  }
                }
              }
            }
          } else if (ev.type === "status") {
            const p = ev.payload as Record<string, unknown>;
            if (p.type === "stream_event") {
              const streamEvent = p.event as Record<string, unknown> | undefined;
              if (streamEvent?.type === "content_block_delta") {
                const delta = streamEvent.delta as Record<string, unknown> | undefined;
                if (delta?.type === "thinking_delta" && typeof delta.thinking === "string") {
                  if (delta.thinking.length > 0) {
                    if (!currentThinking) {
                      currentThinking = {
                        id: `act_think_${Date.now()}`,
                        type: "thinking",
                        content: delta.thinking,
                        timestamp: now,
                      };
                      activities.push(currentThinking);
                    } else {
                      currentThinking.content = (currentThinking.content ?? "") + delta.thinking;
                    }
                  }
                }
              } else if (streamEvent?.type === "content_block_stop") {
                currentThinking = null;
              }
            }
          }
        }

        if (!opts.onEvent) return;
        const partial = cli.extractResult(events).resultText;
        const hasTextChange = partial != null && partial !== lastEmitted;
        const currentActivitiesSignature = activities.reduce(
          (acc, a) => acc + (a.content?.length ?? 0) + (a.output?.length ?? 0),
          activities.length,
        );
        const hasActivityChange = currentActivitiesSignature !== lastActivitiesCount;

        if (hasTextChange || hasActivityChange) {
          if (partial != null) lastEmitted = partial;
          lastActivitiesCount = currentActivitiesSignature;
          opts.onEvent({
            seq: ++onEventSeq,
            replyText: partial ?? lastEmitted ?? "",
            activities: activities.map((a) => ({ ...a })),
          });
        }
      });
    }
    if (child.stderr) {
      readline.createInterface({ input: child.stderr }).on("line", (line) => {
        if (stderr.length < 50) stderr.push(line);
      });
    }

    child.on("error", (err) => {
      logger.warn({ err }, "completeOnce: provider process failed to start");
      finish({ text: null, sessionId, isError: true, errorMessage: err.message });
    });

    child.on("close", () => {
      if (timedOut) {
        finish({ text: null, sessionId, isError: true, errorMessage: "the provider timed out" });
        return;
      }
      const result = cli.extractResult(events);
      const cleanActivities = activities.filter(
        (a) => a.type !== "thinking" || (a.content && a.content.trim().length > 0),
      );
      finish({
        text: result.resultText,
        sessionId: result.sessionId ?? sessionId,
        isError: result.isError,
        errorMessage: result.errorMessage,
        activities: cleanActivities,
      });
    });
  });
}
