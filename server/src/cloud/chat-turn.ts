import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import {
  CHAT_PRODUCED_ALLOWED_TYPES,
  CHAT_PRODUCED_MAX_BYTES,
  producedStoragePath,
  type Agent,
  type ChatTurnEventPush,
  type ChatTurnProducedFile,
  type ChatTurnResultPayload,
  type ChatTurnStartPayload,
  type CommandFailureReason,
  type ProviderId,
  type RunStartPayload,
} from "@sparstrow/shared";
import { config } from "../config.js";
import { getDb } from "../db/connection.js";
import { agents, projects } from "../db/schema.js";
import { logger } from "../logger.js";
import { buildTranscriptPrompt, chatAgent, TURN_TIMEOUT_MS } from "../chat/service.js";
import { completeOnce } from "../orchestrator/one-shot.js";
import { cloudFetch, getWorkspaceId } from "./client.js";
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
 * AM1 (`T-AM1-02`) — the hand-back mechanism. Phase decision 1: a per-turn
 * directory the agent may write into, not an MCP tool — chat turns have no
 * MCP tools at all (`completeOnce` passes `runId: ""`), and this works
 * identically for `claude-code` and `antigravity`, since writing a file is
 * the one capability every CLI agent has.
 *
 * The last sentence is load-bearing for FR-016: it stops an agent in a
 * `project` chat from helpfully copying a file it just edited into the
 * outbox. The outbox itself is never the project root under any session
 * kind (see `executeChatTurn`), so FR-016 holds structurally — there is no
 * filter to get wrong at sweep time.
 */
function outboxPromptNote(outboxDir: string): string {
  return (
    `\n\nAnything you produce for the user — an image, a chart, a document — ` +
    `write it as a file into ${outboxDir}. Files left there are shown to the ` +
    `user with your reply. Do not put working notes or intermediate files ` +
    `there. Do not copy files that already live somewhere on this machine.`
  );
}

interface KeptOutboxFile {
  localPath: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

interface RefusedOutboxFile {
  filename: string;
  sizeBytes: number;
  reason: "too large to keep" | "unrecognized file type" | "upload failed";
}

interface OutboxSweepResult {
  kept: KeptOutboxFile[];
  refused: RefusedOutboxFile[];
}

/** `CHAT_PRODUCED_ALLOWED_TYPES` maps mimeType -> extension; the sweep needs
 *  the reverse to classify a file it finds on disk by its extension alone. */
const EXTENSION_TO_MIME_TYPE: Record<string, string> = Object.fromEntries(
  Object.entries(CHAT_PRODUCED_ALLOWED_TYPES).map(([mimeType, ext]) => [ext, mimeType]),
);

/**
 * Harvests any files generated by Antigravity CLI's built-in tools (e.g. `generate_image`)
 * which write directly to ~/.gemini/antigravity-cli/brain/<conversationId>/ or ~/.gemini/antigravity/brain/<conversationId>/
 * into the chat turn's outboxDir so they are included in the sweep, uploaded, and displayed.
 */
export function harvestAntigravityBrainFiles(
  sessionId: string | null,
  outboxDir: string,
  sinceMs: number = Date.now() - 60_000,
): void {
  const home = os.homedir();
  const targetDirs = new Set<string>();

  if (sessionId) {
    targetDirs.add(path.join(home, ".gemini", "antigravity-cli", "brain", sessionId));
    targetDirs.add(path.join(home, ".gemini", "antigravity", "brain", sessionId));
  } else {
    const brainRoots = [
      path.join(home, ".gemini", "antigravity-cli", "brain"),
      path.join(home, ".gemini", "antigravity", "brain"),
    ];
    for (const root of brainRoots) {
      if (!fs.existsSync(root)) continue;
      try {
        const convDirs = fs.readdirSync(root, { withFileTypes: true });
        for (const d of convDirs) {
          if (!d.isDirectory()) continue;
          const fullDir = path.join(root, d.name);
          try {
            const stat = fs.statSync(fullDir);
            if (stat.mtimeMs >= sinceMs) {
              targetDirs.add(fullDir);
            }
          } catch {
            // ignore
          }
        }
      } catch {
        // ignore
      }
    }
  }

  for (const brainDir of targetDirs) {
    if (!fs.existsSync(brainDir)) continue;
    try {
      const entries = fs.readdirSync(brainDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const ext = path.extname(entry.name).slice(1).toLowerCase();
        if (!["png", "jpg", "jpeg", "webp", "gif", "svg", "pdf"].includes(ext)) continue;
        const src = path.join(brainDir, entry.name);
        try {
          const stat = fs.statSync(src);
          if (stat.mtimeMs < sinceMs) continue;
        } catch {
          continue;
        }

        const dest = path.join(outboxDir, entry.name);
        if (!fs.existsSync(dest)) {
          fs.copyFileSync(src, dest);
        }
      }
    } catch {
      // Best-effort harvest
    }
  }
}

/**
 * Sweeps the top level of `outboxDir` ONLY — a subdirectory an agent creates
 * is ignored rather than walked, which keeps "produced a file" from
 * accidentally meaning "produced a node_modules" (phase README trap).
 *
 * Deliberately does not upload or bind anything: `T-AM1-03` consumes `kept`
 * for that. This task's job stops at "here is what the agent left, and here
 * is what could not be kept and why."
 */
function sweepOutbox(outboxDir: string): OutboxSweepResult {
  const kept: KeptOutboxFile[] = [];
  const refused: RefusedOutboxFile[] = [];

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(outboxDir, { withFileTypes: true });
  } catch {
    // The outbox itself failed to exist by sweep time -- nothing produced.
    return { kept, refused };
  }

  for (const entry of entries) {
    if (!entry.isFile()) continue; // non-recursive, by design

    const filename = entry.name;
    const fullPath = path.join(outboxDir, filename);
    const stat = fs.statSync(fullPath);

    const ext = path.extname(filename).slice(1).toLowerCase();
    const mimeType = EXTENSION_TO_MIME_TYPE[ext];

    if (!mimeType) {
      refused.push({ filename, sizeBytes: stat.size, reason: "unrecognized file type" });
      continue;
    }
    if (stat.size > CHAT_PRODUCED_MAX_BYTES) {
      refused.push({ filename, sizeBytes: stat.size, reason: "too large to keep" });
      continue;
    }

    kept.push({ localPath: fullPath, filename, mimeType, sizeBytes: stat.size });
  }

  return { kept, refused };
}

/**
 * Phase decision 4 — a refusal is told to the owner in the reply text, since
 * AM1 ships no UI of its own to say it anywhere else. Formatted as plain
 * sentences appended to whatever the model already wrote.
 */
function refusalNote(refused: RefusedOutboxFile[]): string {
  if (refused.length === 0) return "";
  const mb = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1);
  const lines = refused.map((r) => {
    switch (r.reason) {
      case "too large to keep":
        return `"${r.filename}" (${mb(r.sizeBytes)} MB) could not be kept — it is larger than the ${mb(CHAT_PRODUCED_MAX_BYTES)} MB limit.`;
      case "unrecognized file type":
        return `"${r.filename}" could not be kept — its file type is not supported.`;
      case "upload failed":
        // AM1 (T-AM1-03) -- a storage hiccup must not lose the agent's text,
        // so this is reported the same honest way a size/type refusal is.
        return `"${r.filename}" could not be saved — something went wrong uploading it.`;
    }
  });
  return `\n\n${lines.join("\n")}`;
}

/** `POST /api/daemon/chat/attachments/sign-upload` — see that route's own
 *  header for the workspace-prefix check it enforces before minting. */
async function signUploadUrl(storagePath: string): Promise<string> {
  const { signedUrl } = await cloudFetch<{ signedUrl: string }>("/chat/attachments/sign-upload", {
    method: "POST",
    body: { storagePath },
    retries: 1,
    timeoutMs: 15_000,
  });
  return signedUrl;
}

/**
 * AM1 (T-AM1-03). Bare PUT to the signed URL, no extra headers beyond
 * content-type -- mirroring `downloadToFile`'s bare GET above, on the theory
 * that a Supabase Storage signed URL (upload or download) embeds its own
 * auth as a `?token=` query parameter and needs nothing further. This exact
 * HTTP call has not been exercised against a live Supabase Storage endpoint
 * in this environment (no paired daemon) -- see `G-55`'s sibling entry for
 * this task. If it turns out wrong, the fix is here, in one function.
 */
async function uploadToSignedUrl(signedUrl: string, localPath: string, mimeType: string): Promise<void> {
  const bytes = fs.readFileSync(localPath);
  const res = await fetch(signedUrl, {
    method: "PUT",
    body: bytes,
    headers: { "content-type": mimeType },
  });
  if (!res.ok) throw new Error(`produced file upload returned ${res.status}`);
}

/**
 * Uploads every kept outbox file, converting an upload failure into a
 * refusal sentence rather than losing the agent's text over a storage
 * hiccup (phase decision: "a storage hiccup must not lose the agent's
 * text"). Returns both the successfully-uploaded descriptors AND any
 * upload-time refusals, so the caller can fold the latter into the same
 * `refusalNote` treatment the sweep's own refusals already get.
 */
async function uploadKeptFiles(
  kept: KeptOutboxFile[],
  workspaceId: string,
  sessionId: string,
): Promise<{ uploaded: ChatTurnProducedFile[]; uploadFailures: RefusedOutboxFile[] }> {
  const uploaded: ChatTurnProducedFile[] = [];
  const uploadFailures: RefusedOutboxFile[] = [];

  for (const file of kept) {
    try {
      const storagePath = producedStoragePath(workspaceId, sessionId, file.filename, crypto.randomUUID());
      const signedUrl = await signUploadUrl(storagePath);
      await uploadToSignedUrl(signedUrl, file.localPath, file.mimeType);
      uploaded.push({
        storagePath,
        filename: file.filename,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
      });
    } catch (err) {
      logger.warn(
        { filename: file.filename, err: err instanceof Error ? err.message : String(err) },
        "produced file upload failed — reporting as a refusal rather than losing the turn's text",
      );
      uploadFailures.push({ filename: file.filename, sizeBytes: file.sizeBytes, reason: "upload failed" });
    }
  }

  return { uploaded, uploadFailures };
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
  // AM1 (T-AM1-02) -- created for EVERY turn, not only attachment turns: an
  // agent may hand something back on a turn where the owner attached
  // nothing. Never the project root under any session kind -- that is what
  // makes FR-016 hold structurally rather than by a filter someone could get
  // wrong at sweep time.
  let outboxDir: string | null = null;

  try {
    // Same ENOENT reasoning `attachmentTempDir` below already carries
    // (T-CS6-02): a long-lived daemon can outlive `ensureDirs()`'s startup
    // creation of `config.tmpDir`, so recreate it defensively here too.
    fs.mkdirSync(config.tmpDir, { recursive: true });
    outboxDir = fs.mkdtempSync(path.join(config.tmpDir, "chat-outbox-"));

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
        // AM1 (T-AM1-02): `Write` added to the existing `Read`-only clamp --
        // without it, a turn with BOTH an attachment and a request to
        // produce something back would silently produce nothing, since the
        // agent's `cwd` here is a scratch dir it cannot write into. `cwd`
        // and `--add-dir` still bound what is reachable; this only expands
        // WHAT may be done inside that already-bounded scratch space.
        effectiveAgent = { ...agent, cwd: attachmentTempDir, allowedTools: ["Read", "Write"] };
      }
    }

    // The outbox is reachable regardless of which branch above ran --
    // `addDirs` grows on whichever agent (original or attachment-clamped)
    // is about to run.
    effectiveAgent = { ...effectiveAgent, addDirs: [...effectiveAgent.addDirs, outboxDir] };

    const turnStartTime = Date.now();
    const prompt = buildTranscriptPrompt(payload.messages) + attachmentNote + outboxPromptNote(outboxDir);

    const result = await completeOnce(effectiveAgent, prompt, {
      timeoutMs: TURN_TIMEOUT_MS,
      onEvent: (delta) => pusher.push({ seq: ++seq, replyText: delta.replyText }),
    });

    await pusher.drain();

    if (payload.sessionKind === "project") {
      try {
        const { execSync } = require("child_process");
        const diffOutput = execSync("git diff HEAD", { encoding: "utf-8", cwd: effectiveAgent.cwd ?? process.cwd(), stdio: ["pipe", "pipe", "ignore"] });
        if (diffOutput && diffOutput.trim().length > 0) {
          fs.writeFileSync(path.join(outboxDir, "changes.diff"), diffOutput);
        }
      } catch (e) {
        // Best-effort diff generation
      }
    }

    if (outboxDir && result.sessionId) {
      harvestAntigravityBrainFiles(result.sessionId, outboxDir, turnStartTime);
    }

    // Swept BEFORE postResult, deliberately not in `finally`: `finally` runs
    // on the failure path too and removes the outbox, but the upload step
    // right below needs `kept`'s files to still exist on disk when it reads
    // them. Sweeping here, before the outbox is ever removed, is what makes
    // that safe on both the success and failure paths.
    const { kept, refused: sweepRefused } = sweepOutbox(outboxDir);

    // AM1 (T-AM1-03). Uploaded AFTER completeOnce settles, BEFORE postResult
    // -- an upload failure becomes a refusal sentence, same treatment as a
    // sweep-time refusal, rather than losing the turn's text over a storage
    // hiccup. Needs the workspace id to compose each file's storage path;
    // `getWorkspaceId()` reads the daemon's own pairing state (set once at
    // pairing time), not anything from the payload.
    const workspaceId = getWorkspaceId();
    const { uploaded, uploadFailures } =
      kept.length > 0 && workspaceId
        ? await uploadKeptFiles(kept, workspaceId, payload.sessionId)
        : { uploaded: [], uploadFailures: [] as RefusedOutboxFile[] };

    const replyText = (result.text ?? "") + refusalNote([...sweepRefused, ...uploadFailures]);

    // AM1 (T-AM1-03), FR-004: a turn that handed something back did work,
    // even with no text -- `!result.text` alone would mark it `failed`, the
    // exact bug this phase exists to fix (see the phase README's finding 4).
    const producedSomething = uploaded.length > 0;
    await postResult(payload.turnId, {
      seq: ++seq,
      replyText,
      status: result.isError || (!result.text && !producedSomething) ? "failed" : "succeeded",
      error: result.isError
        ? (result.errorMessage ?? "the model returned no output")
        : !result.text && !producedSomething
          ? "the model returned no output"
          : null,
      produced: uploaded,
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
    if (outboxDir) {
      fs.rmSync(outboxDir, { recursive: true, force: true });
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
