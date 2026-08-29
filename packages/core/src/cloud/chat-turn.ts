import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import type {
  Agent,
  ChatTurnEventPush,
  ChatTurnResultPayload,
  ChatTurnStartPayload,
  CommandFailureReason,
  ProviderId,
  RunStartPayload,
} from "@sparstrow/shared";
import { config } from "../config.js";
import { getDb } from "../db/connection.js";
import { agents, projects } from "../db/schema.js";
import { logger } from "../logger.js";
import { buildTranscriptPrompt, chatAgent, TURN_TIMEOUT_MS } from "../chat/service.js";
import { completeOnce } from "../orchestrator/one-shot.js";
import { cloudFetch } from "./client.js";
import { resolveAgent, resolveProject, type ResolutionFailure } from "./resolve.js";

/**
 * M12, T-M12-04 — the daemon side of a cloud-dispatched chat turn.
 *
 * Mirrors `commands.ts`'s `startRun` deliberately: `runChatTurnCommand`
 * returns as soon as the turn has been ACCEPTED and kicked off in the
 * background, not once it finishes — the command's ack means "I am handling
 * this," the same way `run.start`'s does. Completion is reported separately,
 * through T-M12-03's routes, exactly as a run's completion is reported
 * through `/api/daemon/runs/:id/status` rather than through the ack.
 *
 * ─── No local row, by design ────────────────────────────────────────────────
 *
 * `run.start` persists a `runs` row locally and uses it as its own replay
 * guard (`runManager.getRun(payload.runId)`). A chat turn deliberately writes
 * NOTHING into this machine's SQLite — the phase's own Trap: the payload's
 * transcript window and the cloud routes are the only interface. The replay
 * guard here is therefore in-memory only (`inFlight`, below), which does not
 * survive a process restart. That is a narrower window than `run.start`'s,
 * bounded by the command's own lease (default 60s) and made safe rather than
 * merely unlikely by `ingest_chat_turn_reply`'s idempotent, seq-scoped writes
 * on the server: a genuine double-execution cannot corrupt the row, at worst
 * two completions race and the later `seq` wins. Recorded here rather than
 * silently assumed away.
 */

/** Turn ids currently being executed by THIS process. Prevents a redelivered
 *  claim (lease expired while still running) from starting a second one. */
const inFlight = new Set<string>();

type Outcome = { ok: true } | { ok: false; failure: { reason: CommandFailureReason; error: string; detail?: string } };

function toOutcome(failure: ResolutionFailure): Outcome {
  return { ok: false, failure };
}

/**
 * Resolve the `Agent` shape `completeOnce` needs. Not `resolveAgent` alone —
 * that function assumes a real agent binding (`RunStartPayload.agentId`
 * required); a `free`/`project` chat turn has none, and reusing the local
 * synthetic-agent builder (`chatAgent`) for that case is what DD-6 means by
 * "builds the prompt locally," not a reimplementation of it.
 */
function resolveChatAgent(payload: ChatTurnStartPayload): { ok: true; value: Agent } | { ok: false; failure: ResolutionFailure } {
  if (payload.sessionKind === "agent") {
    if (!payload.agentId || !payload.agentSlug) {
      return {
        ok: false,
        failure: { reason: "agent_not_available", error: "This chat turn has no agent binding." },
      };
    }

    // Only the four fields `resolveAgent`/`resolveProject` actually read
    // (see resolve.ts) — the rest are `run.start`-only and filled with inert
    // values so this satisfies `RunStartPayload` without an unsafe cast.
    const resolved = resolveAgent({
      runId: payload.turnId,
      agentId: payload.agentId,
      agentSlug: payload.agentSlug,
      projectId: payload.projectId,
      projectSlug: payload.projectSlug,
      taskId: null,
      prompt: "",
      trigger: "manual",
      lane: "foreground",
    } satisfies RunStartPayload);

    if (!resolved.ok) return resolved;

    const row = getDb().select().from(agents).where(eq(agents.id, resolved.value.localAgentId)).get();
    if (!row) {
      // Resolved a moment ago, gone now (deleted between the two reads) —
      // same "miss is a legible refusal" rule resolve.ts documents.
      return {
        ok: false,
        failure: { reason: "agent_not_available", error: "The resolved agent no longer exists on this machine." },
      };
    }

    const agent: Agent = {
      ...(row as unknown as Agent),
      // The turn's own override (set by a retry) beats the agent's stored
      // default — same precedence `assign_or_park_chat_turn` already applied
      // when it decided `payload.provider`/`payload.model`.
      provider: (payload.provider ?? row.provider) as ProviderId,
      model: payload.model ?? row.model,
    };
    return { ok: true, value: agent };
  }

  const projectResult = resolveProject({ projectId: payload.projectId, projectSlug: payload.projectSlug });
  if (!projectResult.ok) return projectResult;

  const provider = (payload.provider ?? "claude-code") as ProviderId;
  const model = payload.model ?? "sonnet";

  let project: { name: string; description: string; rootDir: string | null } | null = null;
  if (projectResult.value.localProjectId) {
    const row = getDb().select().from(projects).where(eq(projects.id, projectResult.value.localProjectId)).get();
    if (row) project = { name: row.name, description: row.description, rootDir: row.rootDir };
  }

  return { ok: true, value: chatAgent(payload.sessionKind, provider, model, project) };
}

/**
 * T-CS5-03 — one attachment, downloaded to local disk before the prompt is
 * built. Bounded (this task's own Trap: must not hang the turn past
 * `TURN_TIMEOUT_MS`) and fails legibly rather than silently.
 */
const ATTACHMENT_DOWNLOAD_TIMEOUT_MS = 30_000;

interface PendingAttachment {
  storagePath: string;
  filename: string;
}

interface PlacedAttachment {
  localPath: string;
  filename: string;
}

/** `POST /api/daemon/chat/attachments/sign` — see that route's own header for
 *  why this is minted lazily, on demand, rather than carried in the payload. */
async function signAttachmentUrl(storagePath: string): Promise<string> {
  const { signedUrl } = await cloudFetch<{ signedUrl: string }>("/chat/attachments/sign", {
    method: "POST",
    body: { storagePath },
    retries: 1,
    timeoutMs: 15_000,
  });
  return signedUrl;
}

async function downloadToFile(signedUrl: string, destPath: string): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ATTACHMENT_DOWNLOAD_TIMEOUT_MS);
  try {
    const res = await fetch(signedUrl, { signal: controller.signal });
    if (!res.ok) throw new Error(`attachment download returned ${res.status}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(destPath, bytes);
  } catch (err) {
    // Named explicitly rather than left as fetch's own AbortError message,
    // so `classifyTurnError` (chat/service.ts) buckets this the same way it
    // already buckets a completeOnce timeout — one consistent "timeout"
    // experience in TurnErrorBanner, not two differently-worded ones.
    if (controller.signal.aborted) throw new Error("attachment download timed out");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Downloads every pending attachment into `destDir`, uuid-prefixed so a
 * `project` session's own repo files are never collided with or overwritten
 * (this task's own Trap) — the original name is kept only as a suffix, for
 * the prompt note to reference something recognizable.
 */
async function placeAttachments(
  attachments: PendingAttachment[],
  destDir: string,
): Promise<PlacedAttachment[]> {
  const placed: PlacedAttachment[] = [];
  for (const att of attachments) {
    const signedUrl = await signAttachmentUrl(att.storagePath);
    const safeName = `${crypto.randomUUID()}-${path.basename(att.filename)}`;
    const localPath = path.join(destDir, safeName);
    await downloadToFile(signedUrl, localPath);
    placed.push({ localPath, filename: att.filename });
  }
  return placed;
}

function attachmentPromptNote(placed: PlacedAttachment[]): string {
  if (placed.length === 0) return "";
  const lines = placed.map(
    (p) => `The user attached a file at ${p.localPath} (originally named "${p.filename}").`,
  );
  return `\n\n${lines.join("\n")}`;
}

/**
 * Batches `onEvent` deltas and flushes them to T-M12-03's events route on a
 * short timer rather than one POST per line — "batched reasonably, not
 * per-line" per this task's own doc. Best-effort: a lost live delta is not a
 * lost reply, since the terminal call (below) always carries the full final
 * text regardless of what streamed successfully.
 */
const CHAT_FLUSH_INTERVAL_MS = 800;

function makeEventPusher(turnId: string) {
  let pending: ChatTurnEventPush[] = [];
  let timer: NodeJS.Timeout | null = null;
  let flushing = false;

  async function flush(): Promise<void> {
    if (flushing || pending.length === 0) return;
    flushing = true;
    const batch = pending;
    pending = [];
    try {
      await cloudFetch(`/chat/turns/${turnId}/events`, {
        body: { events: batch },
        retries: 1,
        timeoutMs: 15_000,
      });
    } catch (err) {
      logger.warn(
        { turnId, err: err instanceof Error ? err.message : String(err) },
        "chat turn event push failed — the terminal result still carries the full reply",
      );
    } finally {
      flushing = false;
      if (pending.length > 0) void flush();
    }
  }

  return {
    push(delta: { seq: number; replyText: string }): void {
      pending.push(delta);
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        void flush();
      }, CHAT_FLUSH_INTERVAL_MS);
      timer.unref?.();
    },
    /** Stop the timer and send whatever is left — called once before the
     *  terminal POST, so nothing queued is dropped on the floor. */
    async drain(): Promise<void> {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      await flush();
    },
  };
}

async function postResult(turnId: string, result: ChatTurnResultPayload): Promise<void> {
  try {
    await cloudFetch(`/chat/turns/${turnId}/result`, { body: result, retries: 2, timeoutMs: 15_000 });
  } catch (err) {
    // Unlike the events pusher, this loss is real: nothing else will ever
    // close this turn. The lease-expiry path is the only backstop (a
    // redelivered command tries the whole turn again), which is the same
    // exposure `run.start`'s own dispatch failures already accept.
    logger.warn(
      { turnId, err: err instanceof Error ? err.message : String(err) },
      "chat turn result post failed — the turn may sit in_progress until its command is redelivered",
    );
  }
}

async function executeChatTurn(payload: ChatTurnStartPayload, agent: Agent): Promise<void> {
  const pusher = makeEventPusher(payload.turnId);
  // One counter for the turn's ENTIRE life, streamed deltas and the terminal
  // call alike — T-M12-03's routes only close a turn on a `seq` that exceeds
  // every one already stored, so restarting this at 0 for the terminal call
  // would leave the turn stuck in_progress. See that task's Result section.
  let seq = 0;

  // T-CS5-03. `project`-with-a-real-rootDir places files where the agent's
  // existing `allowedTools: ["Read","Grep","Glob"]` already reaches them —
  // no override needed. Everything else (`free`, `agent`, or a `project`
  // session with no rootDir configured) gets its own scratch directory for
  // this turn only, and is clamped to `Read` there — overriding whatever
  // the resolved agent's own normal tool configuration is, deliberately:
  // an `agent`-kind session may have broader permissions as its everyday
  // default, and an attachment must not inherit them. See
  // doc/security/SEC-2026-08-28-antigravity-headless-tools-unrestricted.md
  // for why this restriction is real for `claude-code` but currently a
  // no-op for `antigravity` — `agy` wires neither `allowedTools` nor a
  // working `cwd` sandbox; this still sets both, correctly, so the
  // restriction takes effect the moment that provider gap closes.
  let effectiveAgent = agent;
  let attachmentTempDir: string | null = null;
  let attachmentNote = "";

  try {
    if (payload.attachments.length > 0) {
      const placeInProjectRoot = payload.sessionKind === "project" && Boolean(agent.cwd);
      // `ensureDirs()` creates `config.tmpDir` at startup, but a long-lived
      // daemon outlives that: on Linux a /tmp reaper can remove it underneath
      // a running process, and `mkdtempSync` then fails with ENOENT for a
      // reason that has nothing to do with the attachment. Recreating it is
      // idempotent and costs one syscall on a path that already exists.
      // T-CS6-02 found this the hard way — see that task's Result.
      const destDir = placeInProjectRoot
        ? agent.cwd!
        : (attachmentTempDir = (() => {
            fs.mkdirSync(config.tmpDir, { recursive: true });
            return fs.mkdtempSync(path.join(config.tmpDir, "chat-attach-"));
          })());

      const placed = await placeAttachments(payload.attachments, destDir);
      attachmentNote = attachmentPromptNote(placed);

      if (!placeInProjectRoot) {
        effectiveAgent = { ...agent, cwd: attachmentTempDir, allowedTools: ["Read"] };
      }
    }

    const prompt = buildTranscriptPrompt(payload.messages) + attachmentNote;

    const result = await completeOnce(effectiveAgent, prompt, {
      timeoutMs: TURN_TIMEOUT_MS,
      onEvent: (delta) => pusher.push({ seq: ++seq, replyText: delta.replyText }),
    });

    await pusher.drain();

    await postResult(payload.turnId, {
      seq: ++seq,
      replyText: result.text ?? "",
      status: result.isError || !result.text ? "failed" : "succeeded",
      error: result.isError ? (result.errorMessage ?? "the model returned no output") : null,
    });
  } catch (err) {
    await pusher.drain();
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ turnId: payload.turnId, err: message }, "chat turn execution failed");
    await postResult(payload.turnId, { seq: ++seq, replyText: "", status: "failed", error: message });
  } finally {
    // Synchronous, unlike `completeOnce`'s own fire-and-forget tempDir
    // cleanup: this directory can hold a scoped-Read grant's ENTIRE
    // contents, so it should stop existing the moment the turn is done,
    // not "eventually."
    if (attachmentTempDir) {
      fs.rmSync(attachmentTempDir, { recursive: true, force: true });
    }
  }
}

/**
 * `case "chat.turn":` — called from `commands.ts`'s dispatch switch.
 * Synchronous return; the actual turn runs in the background, matching
 * `startRun`'s own "accepted, not yet finished" ack semantics.
 */
export function runChatTurnCommand(payload: ChatTurnStartPayload): Outcome {
  if (!payload?.turnId || !payload.sessionId) {
    return {
      ok: false,
      failure: { reason: "spawn_failed", error: "The chat.turn command was missing a turn id or session id." },
    };
  }

  if (inFlight.has(payload.turnId)) {
    logger.info({ turnId: payload.turnId }, "chat turn already running locally — acking the replayed command");
    return { ok: true };
  }

  const resolved = resolveChatAgent(payload);
  if (!resolved.ok) return toOutcome(resolved.failure);

  inFlight.add(payload.turnId);
  void executeChatTurn(payload, resolved.value).finally(() => inFlight.delete(payload.turnId));

  return { ok: true };
}

/** Test seam — same pattern as `resetDispatched`/`resetMemorySync`. */
export function resetChatTurnInFlight(): void {
  inFlight.clear();
}
