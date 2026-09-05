import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { spawn } from "node:child_process";
import treeKill from "tree-kill";
import { nanoid } from "nanoid";
import type { Agent, ProviderId } from "@sparstrow/shared";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { agentChildEnv } from "../orchestrator/child-env.js";
import type { CliModelDiscovery, CliProvider, NormalizedEvent } from "../providers/types.js";
import type { AgentBackend, AgentMessage, AgentResult, AgentSession, ExecOptions } from "./backend.js";

class AsyncQueue<T> {
  private queue: T[] = [];
  private waiters: ((value: IteratorResult<T>) => void)[] = [];
  private done = false;

  push(item: T) {
    if (this.done) return;
    if (this.waiters.length > 0) {
      this.waiters.shift()!({ value: item, done: false });
    } else {
      this.queue.push(item);
    }
  }

  close() {
    this.done = true;
    while (this.waiters.length > 0) {
      this.waiters.shift()!({ value: undefined as any, done: true });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        if (this.queue.length > 0) {
          return Promise.resolve({ value: this.queue.shift()!, done: false });
        }
        if (this.done) {
          return Promise.resolve({ value: undefined as any, done: true });
        }
        return new Promise<IteratorResult<T>>((resolve) => {
          this.waiters.push(resolve);
        });
      },
    };
  }
}

function buildSyntheticAgent(opts: ExecOptions, provider: ProviderId, fallbackModel: string): Agent {
  const ISO = new Date().toISOString();
  return {
    id: `agt_${nanoid(10)}`,
    slug: `chat-${provider}`,
    name: "Chat Agent",
    role: "Chat Assistant",
    systemPrompt: opts.systemPrompt ?? "",
    provider,
    model: opts.model ?? fallbackModel,
    cwd: opts.cwd ?? null,
    addDirs: opts.addDirs ?? [],
    allowedTools: opts.allowedTools ?? [],
    disallowedTools: opts.disallowedTools ?? [],
    permissionMode: (opts.permissionMode as any) ?? "default",
    mcpServers: (opts.mcpConfig as any) ?? {},
    maxTurns: opts.maxTurns ?? null,
    memoryReadScopes: [],
    memoryWriteScopes: [],
    extraArgs: opts.extraArgs ?? [],
    enabled: true,
    signalExtraction: false,
    isSystem: false,
    origin: "user",
    status: "active",
    specterReport: null,
    importId: null,
    sandboxProjectId: null,
    createdAt: ISO,
    updatedAt: ISO,
  };
}

/**
 * Universal adapter that turns any CliProvider (ClaudeCodeProvider, AntigravityCliProvider)
 * into an AgentBackend adhering to the Multica execution model.
 */
export function createCliBackend(cli: CliProvider, defaultModel: string): AgentBackend {
  return {
    id: cli.id,
    listModels(): string[] {
      return cli.listModels();
    },
    async discoverModels(): Promise<CliModelDiscovery> {
      if (cli.discoverModels) return cli.discoverModels();
      return { models: cli.listModels(), live: false, detail: null };
    },
    async execute(prompt: string, opts: ExecOptions = {}, signal?: AbortSignal): Promise<AgentSession> {
      const sessionId = opts.resumeSessionId ?? crypto.randomUUID();
      const tempDir = path.join(config.tmpDir, `exec_${nanoid(8)}`);
      fs.mkdirSync(tempDir, { recursive: true });

      const agent = buildSyntheticAgent(opts, cli.id, defaultModel);
      const spec = cli.buildHeadlessSpawn(agent, prompt, {
        runId: "",
        tempDir,
        sessionId,
        resumeSessionId: opts.resumeSessionId,
        rootDir: opts.cwd,
        extraEnv: opts.env as Record<string, string> | undefined,
      });

      const messageQueue = new AsyncQueue<AgentMessage>();
      const events: NormalizedEvent[] = [];
      const startTime = Date.now();

      const child = spawn(
        spec.viaCmdShell ? "cmd.exe" : spec.command,
        spec.viaCmdShell ? ["/d", "/s", "/c", spec.command, ...spec.args] : spec.args,
        {
          cwd: spec.cwd,
          env: agentChildEnv(spec.env),
          windowsHide: true,
          shell: false,
          stdio: ["pipe", "pipe", "pipe"],
        },
      );

      let childKilled = false;
      const killChild = () => {
        if (!childKilled && child.pid) {
          childKilled = true;
          treeKill(child.pid, "SIGTERM");
        }
      };

      if (signal) {
        if (signal.aborted) killChild();
        else signal.addEventListener("abort", killChild, { once: true });
      }

      if (spec.stdinData != null && child.stdin) {
        child.stdin.write(spec.stdinData);
        child.stdin.end();
      }

      const forwardEvents = (evList: NormalizedEvent[]) => {
        for (const ev of evList) {
          events.push(ev);
          const now = new Date().toISOString();

          if (ev.type === "assistant") {
            const p = ev.payload as Record<string, unknown>;
            const msg = p.message as Record<string, unknown> | undefined;
            const content = msg?.content ?? p.content;

            if (typeof content === "string") {
              messageQueue.push({ type: "text", content, timestamp: now });
            } else if (Array.isArray(content)) {
              for (const block of content) {
                if (!block || typeof block !== "object") continue;
                const b = block as Record<string, unknown>;
                if (b.type === "text" && typeof b.text === "string") {
                  messageQueue.push({ type: "text", content: b.text, timestamp: now });
                } else if (b.type === "thinking" && typeof b.thinking === "string") {
                  messageQueue.push({ type: "thinking", content: b.thinking, timestamp: now });
                } else if (b.type === "tool_use") {
                  messageQueue.push({
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
                  messageQueue.push({
                    type: "tool_result",
                    callId: typeof b.tool_use_id === "string" ? b.tool_use_id : undefined,
                    output: typeof b.content === "string" ? b.content : JSON.stringify(b.content),
                    timestamp: now,
                  });
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
                  messageQueue.push({ type: "thinking", content: delta.thinking, timestamp: now });
                } else if (delta?.type === "text_delta" && typeof delta.text === "string") {
                  messageQueue.push({ type: "text", content: delta.text, timestamp: now });
                }
              }
            }
          } else if (ev.type === "stderr") {
            messageQueue.push({
              type: "log",
              content: typeof ev.payload === "string" ? ev.payload : JSON.stringify(ev.payload),
              level: "warn",
              timestamp: now,
            });
          }
        }
      };

      if (child.stdout) {
        readline.createInterface({ input: child.stdout }).on("line", (line) => {
          try {
            forwardEvents(cli.parseLine(line));
          } catch (err) {
            logger.warn({ err, line }, "error parsing cli stdout line");
          }
        });
      }

      if (child.stderr) {
        readline.createInterface({ input: child.stderr }).on("line", (line) => {
          const trimmed = line.trim();
          if (trimmed.length > 0) {
            forwardEvents([{ type: "stderr", payload: trimmed }]);
          }
        });
      }

      const resultPromise = new Promise<AgentResult>((resolve) => {
        child.on("close", (code) => {
          messageQueue.close();
          fs.rm(tempDir, { recursive: true, force: true }, () => {});

          const durationMs = Date.now() - startTime;
          let parsedResult: ReturnType<typeof cli.extractResult>;
          try {
            parsedResult = cli.extractResult(events);
          } catch (err) {
            parsedResult = {
              resultText: null,
              costUsd: null,
              numTurns: null,
              sessionId,
              isError: true,
              errorMessage: err instanceof Error ? err.message : String(err),
            };
          }

          if (parsedResult.isError || (code !== 0 && !parsedResult.resultText)) {
            resolve({
              status: childKilled ? "cancelled" : "failed",
              output: parsedResult.resultText ?? "",
              error: parsedResult.errorMessage ?? `Process exited with code ${code}`,
              durationMs,
              sessionId: parsedResult.sessionId ?? sessionId,
            });
          } else {
            resolve({
              status: "completed",
              output: parsedResult.resultText ?? "",
              durationMs,
              sessionId: parsedResult.sessionId ?? sessionId,
              usage: parsedResult.costUsd != null ? { default: { costUsd: parsedResult.costUsd } } : undefined,
            });
          }
        });

        child.on("error", (err) => {
          messageQueue.close();
          fs.rm(tempDir, { recursive: true, force: true }, () => {});
          resolve({
            status: "failed",
            output: "",
            error: err.message,
            durationMs: Date.now() - startTime,
            sessionId,
          });
        });
      });

      return {
        messages: messageQueue,
        result: resultPromise,
        cancel() {
          killChild();
        },
      };
    },
  };
}
