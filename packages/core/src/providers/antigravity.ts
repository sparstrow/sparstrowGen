import { execFile } from "node:child_process";
import type { Agent, PermissionMode, ProviderHealth, RunResult } from "@sparstrow/shared";
import { KNOWN_MODELS } from "@sparstrow/shared";
import { config } from "../config.js";
import type {
  CliProvider,
  HeadlessSpawnOptions,
  InteractiveSpawnOptions,
  NormalizedEvent,
  SpawnSpec,
} from "./types.js";

/**
 * Provider for Google's Antigravity CLI (`agy`, verified against v1.1.0) — the
 * sanctioned successor to the now-retired Gemini CLI provider.
 *
 * Headless verified behavior (re-verified against agy v1.1.7, intake 0009):
 *  - `agy --model "<display>" --print "<prompt>"` — the prompt is `--print`'s
 *    VALUE. **agy has no stdin path in print mode**: `agy --print` with no value
 *    prints usage, and `agy --print -` sends the model the literal prompt "-",
 *    which it answers with a generic greeting while ignoring stdin entirely.
 *    That was the cause of intake 0009 (every turn returned "How can I help you
 *    today?"). Because `--print` consumes the next token, it must come LAST,
 *    after `--model` and every other flag.
 *  - The prompt therefore travels in argv, which is bounded by Windows' ~32KB
 *    command-line limit. Callers must budget it — chat does so in
 *    `buildTranscriptPrompt` (TRANSCRIPT_BUDGET_BYTES).
 *  - `--model` tokens are the exact `agy models` display strings (see KNOWN_MODELS).
 *  - `agy.exe` is a real binary, not an npm .cmd shim, so spawns run directly
 *    (viaCmdShell:false) — no cmd.exe quoting layer.
 *  - Headless spawn asks for `--output-format stream-json` (verified against a
 *    real agy v1.1.18 process — see parseLine's doc comment and
 *    BUG-2026-08-22-antigravity-transcript-not-rendered.md), so stdout is
 *    NDJSON, not plain text: one `init`/`step_update`/`result` object per
 *    line. Still no cost stats in that envelope (agy reports token usage, not
 *    USD), so extractResult's `costUsd` stays null; num_turns and a
 *    machine-readable error DO come through on the terminal `result` event
 *    now. Nonzero-exit failures are caught by the executor's finalize(code,
 *    …), which never reaches extractResult.
 * No MCP wiring: antigravity agents use the sparstrow-memory CLI and fenced
 * ```sparstrow``` directives (see orchestrator/preamble.ts).
 */
export class AntigravityCliProvider implements CliProvider {
  readonly id = "antigravity" as const;
  readonly kind = "cli" as const;

  listModels(): string[] {
    return KNOWN_MODELS.antigravity ?? [];
  }

  /** Map Sparstrow permission modes to agy flags — exhaustive over PermissionMode. */
  private permissionArgs(mode: PermissionMode): string[] {
    switch (mode) {
      case "bypassPermissions":
        return ["--dangerously-skip-permissions"];
      case "acceptEdits":
        return ["--mode", "accept-edits"];
      case "plan":
        return ["--mode", "plan"];
      default:
        return [];
    }
  }

  private workspaceDirArgs(agent: Agent): string[] {
    // The agent must reach its own memory vault plus any addDirs.
    return [...agent.addDirs, config.vaultPath].flatMap((d) => ["--add-dir", d]);
  }

  buildHeadlessSpawn(agent: Agent, prompt: string, opts: HeadlessSpawnOptions): SpawnSpec {
    // `--model` first, prompt last as `--print`'s value. Order is load-bearing:
    // --print consumes the next token, so it must come after every other flag.
    //
    // `--output-format stream-json` asks agy for structured NDJSON instead of
    // its default plain text, so parseLine below can produce the same
    // system/assistant/user/result NormalizedEvent shapes claude-code's
    // provider does, instead of wrapping every stdout line as an opaque "raw"
    // event. Verified empirically against a real agy v1.1.18 process (see
    // BUG-2026-08-22-antigravity-transcript-not-rendered.md's Resolution) —
    // `agy --output-format stream-json --print "…"` emits one JSON object per
    // line shaped `{"event": "init"|"step_update"|"result", ...}`.
    const args: string[] = [
      "--model",
      agent.model,
      "--output-format",
      "stream-json",
      // A headless spawn has no TTY, so an unattended, machine-global skill
      // installed under the operator's own ~/.claude/skills can never get
      // the tool permission it needs -- agy denies it immediately (observed
      // as "permission check failed for command …", see
      // BUG-2026-08-23-headless-spawn-skill-leak.md), which reads as a
      // provider failure that has nothing to do with the actual chat turn.
      // Keeps the headless tool surface exactly what Sparstrowgen granted,
      // same reasoning as claude-code's --disable-slash-commands.
      "--disable-slash-commands",
      ...this.permissionArgs(agent.permissionMode),
      ...this.workspaceDirArgs(agent),
      ...agent.extraArgs,
      "--print",
      prompt,
    ];
    return {
      command: config.antigravityPath,
      args,
      cwd: opts.rootDir ?? agent.cwd ?? opts.tempDir,
      env: {
        SPARSTROW_RUN_ID: opts.runId,
        SPARSTROW_API: `http://${config.host}:${config.port}`,
        ...opts.extraEnv,
      },
      viaCmdShell: false,
    };
  }

  buildInteractiveSpawn(agent: Agent, opts: InteractiveSpawnOptions): SpawnSpec {
    // Interactive session — no --print; agy drops into its REPL against the PTY.
    const args: string[] = [
      "--model",
      agent.model,
      ...this.permissionArgs(agent.permissionMode),
      ...this.workspaceDirArgs(agent),
      ...agent.extraArgs,
    ];
    return {
      command: config.antigravityPath,
      args,
      cwd: agent.cwd ?? opts.tempDir,
      env: { ...opts.extraEnv },
      viaCmdShell: false,
    };
  }

  /**
   * Parses one line of `agy --output-format stream-json` NDJSON into the
   * same NormalizedEvent shapes claude-code's provider produces, so
   * run-transcript.tsx's existing system/assistant/user/result renderers
   * apply unmodified. Shapes below were captured from a real agy v1.1.18
   * process (`agy --model … --output-format stream-json --print "…"`); see
   * the antigravity.test.ts fixtures and the bug's Resolution section for
   * the raw captures.
   *
   *  - `{"event":"init","init":{"model":…}}` → one `system` event
   *    (`{subtype:"init", model}`) — matches EventRow's existing "session
   *    started" case.
   *  - `{"event":"step_update","step_update":{"step_type":"agent_response",
   *    "text_delta":…}}` → an `assistant` text block per line. agy streams
   *    narration as incremental deltas (not full accumulated text), and
   *    parseLine is called per-line with no cross-line state (the provider
   *    instance is a shared singleton across concurrent runs — see
   *    packages/core/src/providers/index.ts — so it must stay stateless),
   *    so each delta becomes its own small assistant bubble rather than one
   *    bubble per reasoning step. That still satisfies the "progressive"
   *    requirement (US3 scenario 2 / G-13): text appears as it streams,
   *    just in finer-grained pieces than claude-code's per-turn messages.
   *  - `{"event":"step_update","step_update":{"step_type":"tool","state":
   *    "ACTIVE",…}}` → an `assistant` `tool_use` block (call started).
   *  - the matching `"state":"DONE"|"ERROR"` line for that same tool step →
   *    a `user` `tool_result` block (call finished, or its error message).
   *  - `{"event":"result","result":{…}}` → one `result` event mirroring
   *    claude-code's `{subtype, result, num_turns}` shape.
   *  - "user_input" / "checkpoint" step_updates carry nothing user-visible
   *    and are dropped.
   *  - anything else (unrecognized `event`, or a non-JSON line — e.g. if
   *    agy is ever invoked without `--output-format stream-json`) falls
   *    back to a `raw` event, same floor as before this fix, now also
   *    rendered by run-transcript.tsx's "raw" case.
   */
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
    switch (obj.event) {
      case "init": {
        const init = obj.init as Record<string, unknown> | undefined;
        return [
          {
            type: "system",
            payload: { subtype: "init", model: typeof init?.model === "string" ? init.model : null },
          },
        ];
      }
      case "step_update":
        return this.parseStepUpdate(obj.step_update as Record<string, unknown> | undefined);
      case "result": {
        const result = obj.result as Record<string, unknown> | undefined;
        if (!result) return [];
        const status = typeof result.status === "string" ? result.status : "";
        return [
          {
            type: "result",
            payload: {
              subtype: status === "SUCCESS" ? "success" : "error",
              result: typeof result.response === "string" ? result.response : null,
              error: typeof result.error === "string" ? result.error : null,
              num_turns: typeof result.num_turns === "number" ? result.num_turns : null,
            },
          },
        ];
      }
      default:
        // Unrecognized event shape — surface it rather than dropping it silently.
        return [{ type: "raw", payload: obj }];
    }
  }

  private parseStepUpdate(step: Record<string, unknown> | undefined): NormalizedEvent[] {
    if (!step) return [];
    const stepType = typeof step.step_type === "string" ? step.step_type : "";
    const state = typeof step.state === "string" ? step.state : "";

    if (stepType === "agent_response") {
      const text = typeof step.text_delta === "string" ? step.text_delta : "";
      if (text.length === 0) return [];
      return [{ type: "assistant", payload: { message: { content: [{ type: "text", text }] } } }];
    }

    if (stepType === "tool") {
      const toolName = typeof step.tool_name === "string" ? step.tool_name : "tool";
      const toolInfo = step.tool_info as Record<string, unknown> | undefined;
      if (state === "DONE" || state === "ERROR") {
        const errorInfo = toolInfo?.error as Record<string, unknown> | undefined;
        const content =
          state === "ERROR"
            ? typeof errorInfo?.message === "string"
              ? errorInfo.message
              : "tool call failed"
            : typeof toolInfo?.output === "string"
              ? toolInfo.output
              : "";
        return [
          {
            type: "user",
            payload: { message: { content: [{ type: "tool_result", content }] } },
          },
        ];
      }
      // ACTIVE (or any other pre-completion state) — the tool call just started.
      return [
        {
          type: "assistant",
          payload: {
            message: {
              content: [{ type: "tool_use", name: toolName, input: toolInfo?.parameters ?? {} }],
            },
          },
        },
      ];
    }

    // "user_input", "checkpoint" — bookkeeping steps with nothing to render.
    return [];
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
      const isError = resultEvent.subtype !== "success";
      const structuredText =
        typeof resultEvent.result === "string" && resultEvent.result.trim().length > 0
          ? resultEvent.result
          : lastAssistantText(events);
      const errorText = typeof resultEvent.error === "string" ? resultEvent.error.trim() : "";
      return {
        resultText: structuredText,
        costUsd: null, // agy reports no cost stats
        numTurns: typeof resultEvent.num_turns === "number" ? resultEvent.num_turns : null,
        sessionId: null, // --conversation resume is out of scope (P8.1 parity)
        isError,
        errorMessage: isError ? errorText || "antigravity run failed" : undefined,
      };
    }
    // Legacy fallback — no structured `result` event, e.g. a line that failed
    // JSON parsing throughout, or a pre-fix plain-text (`--output-format text`)
    // stdout captured before this run's spawn args took effect.
    const stdout = events
      .filter((e) => e.type === "raw" && typeof e.payload === "string")
      .map((e) => e.payload as string)
      .join("\n")
      .trim();
    return {
      resultText: stdout || null,
      costUsd: null,
      numTurns: null,
      sessionId: null,
      isError: stdout.length === 0,
      errorMessage: stdout.length === 0 ? "no output from antigravity CLI" : undefined,
    };
  }

  healthCheck(): Promise<ProviderHealth> {
    return new Promise((resolve) => {
      execFile(
        config.antigravityPath,
        ["--version"],
        { timeout: 20_000, windowsHide: true },
        (err, stdout) => {
          if (err) {
            resolve({ id: this.id, ok: false, version: null, authenticated: null, detail: err.message });
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

/** Concatenates every assistant text_delta seen so far — parseStepUpdate's
 * fallback when agy's terminal `result` event carries no `response` text
 * (observed on some error paths, per the real capture in the bug's
 * Resolution section). Deltas are joined directly (no separator): they are
 * literal streamed text fragments, already carrying their own whitespace. */
function lastAssistantText(events: NormalizedEvent[]): string | null {
  const texts: string[] = [];
  for (const e of events) {
    if (e.type !== "assistant") continue;
    const payload = e.payload as { message?: { content?: unknown } };
    const content = payload.message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      const b = block as { type?: string; text?: string };
      if (b.type === "text" && typeof b.text === "string") texts.push(b.text);
    }
  }
  return texts.length > 0 ? texts.join("") : null;
}
