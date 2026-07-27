import { and, desc, eq, type SQL } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  executionModeForProvider,
  type Agent,
  type ChatMessage,
  type ChatMessageMeta,
  type ChatSession,
  type ChatSessionCreate,
  type ChatSessionListQuery,
  type ChatSessionUpdate,
  type ChatTurn,
  type ChatTurnError,
  type DraftTurn,
  type ProviderId,
} from "@sparstrow/shared";
import { getDb } from "../db/connection.js";
import { agents, chatMessages, chatSessions, projects } from "../db/schema.js";
import { logger } from "../logger.js";
import { completeOnce } from "../orchestrator/one-shot.js";
import { HttpError } from "../orchestrator/run-manager.js";
import { runAgentDraftTurn } from "../agents/draft-service.js";

const nowIso = () => new Date().toISOString();

/** Attempts per model within one turn/retry call. After both fail, the turn
 *  errors out and waits for user input (intake 0001 blind-spot answer). */
const ATTEMPTS_PER_MODEL = 2;

/** Only the last N messages are replayed to the model each turn. */
const TRANSCRIPT_WINDOW = 40;

/** Byte ceiling for the replayed transcript. CLI providers that take the prompt
 *  as an argv value (antigravity — see intake 0009) hit Windows' ~32KB command
 *  line limit, so the window is capped by size as well as by count. Oldest
 *  messages drop first; the newest message is always kept even if it alone
 *  exceeds the budget, because dropping it would send a promptless turn. */
const TRANSCRIPT_BUDGET_BYTES = 24_000;

const TURN_TIMEOUT_MS = 120_000;

const rowToSession = (row: typeof chatSessions.$inferSelect): ChatSession =>
  ({ ...row }) as unknown as ChatSession;
const rowToMessage = (row: typeof chatMessages.$inferSelect): ChatMessage =>
  ({ ...row }) as unknown as ChatMessage;

/** Chat turns run through the CLI one-shot path; direct-API providers would
 *  need the in-process tool-loop and are not wired into chat yet. */
function assertCliProvider(provider: string): void {
  if (executionModeForProvider(provider) !== "cli") {
    throw new HttpError(400, `chat supports CLI providers only (got ${provider})`);
  }
}

export function createChatSession(input: ChatSessionCreate): ChatSession {
  const db = getDb();
  const now = nowIso();
  let provider: string | null = input.provider ?? null;
  let model: string | null = input.model ?? null;
  let projectId: string | null = null;
  let agentId: string | null = null;

  if (input.kind === "project") {
    if (!input.projectId) throw new HttpError(400, "projectId is required for a project chat");
    const project = db.select().from(projects).where(eq(projects.id, input.projectId)).get();
    if (!project) throw new HttpError(404, `project not found: ${input.projectId}`);
    projectId = project.id;
    provider = provider ?? "claude-code";
    model = model ?? "sonnet";
  } else if (input.kind === "agent") {
    if (!input.agentId) throw new HttpError(400, "agentId is required for an agent chat");
    const agent = db.select().from(agents).where(eq(agents.id, input.agentId)).get();
    if (!agent) throw new HttpError(404, `agent not found: ${input.agentId}`);
    assertCliProvider(agent.provider);
    agentId = agent.id;
    projectId = input.projectId ?? null;
    provider = agent.provider;
    model = agent.model;
  } else if (input.kind === "free") {
    provider = provider ?? "claude-code";
    model = model ?? "sonnet";
  } else {
    // agent-creator: the draft service owns provider/model (overridable per turn).
    provider = provider ?? "claude-code";
    model = model ?? "sonnet";
  }
  if (provider) assertCliProvider(provider);

  const row: typeof chatSessions.$inferInsert = {
    id: `chs_${nanoid(10)}`,
    kind: input.kind,
    title: input.title ?? "",
    projectId,
    agentId,
    provider,
    model,
    status: "active",
    draft: input.kind === "agent-creator" ? {} : null,
    lastMessageAt: null,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(chatSessions).values(row).run();
  return rowToSession(db.select().from(chatSessions).where(eq(chatSessions.id, row.id)).get()!);
}

export function listChatSessions(query: ChatSessionListQuery): ChatSession[] {
  const db = getDb();
  const clauses: SQL[] = [];
  if (query.kind) clauses.push(eq(chatSessions.kind, query.kind));
  if (query.projectId) clauses.push(eq(chatSessions.projectId, query.projectId));
  if (query.agentId) clauses.push(eq(chatSessions.agentId, query.agentId));
  if (query.status) clauses.push(eq(chatSessions.status, query.status));
  const rows = db
    .select()
    .from(chatSessions)
    .where(clauses.length > 0 ? and(...clauses) : undefined)
    .orderBy(desc(chatSessions.updatedAt))
    .limit(200)
    .all();
  return rows.map(rowToSession);
}

export function getChatSession(id: string): ChatSession {
  const row = getDb().select().from(chatSessions).where(eq(chatSessions.id, id)).get();
  if (!row) throw new HttpError(404, `chat session not found: ${id}`);
  return rowToSession(row);
}

export function listChatMessages(sessionId: string): ChatMessage[] {
  getChatSession(sessionId);
  const rows = getDb()
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.sessionId, sessionId))
    .orderBy(chatMessages.createdAt, chatMessages.id)
    .all();
  return rows.map(rowToMessage);
}

export function updateChatSession(id: string, patch: ChatSessionUpdate): ChatSession {
  const db = getDb();
  getChatSession(id);
  if (patch.provider !== undefined) assertCliProvider(patch.provider);
  db.update(chatSessions)
    .set({
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.provider !== undefined ? { provider: patch.provider } : {}),
      ...(patch.model !== undefined ? { model: patch.model } : {}),
      updatedAt: nowIso(),
    })
    .where(eq(chatSessions.id, id))
    .run();
  return getChatSession(id);
}

function insertMessage(
  sessionId: string,
  role: "user" | "assistant",
  content: string,
  meta: ChatMessageMeta | null,
): ChatMessage {
  const db = getDb();
  const row: typeof chatMessages.$inferInsert = {
    id: `chm_${nanoid(10)}`,
    sessionId,
    role,
    content,
    meta: meta as Record<string, unknown> | null,
    createdAt: nowIso(),
  };
  db.insert(chatMessages).values(row).run();
  return rowToMessage(db.select().from(chatMessages).where(eq(chatMessages.id, row.id)).get()!);
}

function touchSession(id: string, extra: Partial<typeof chatSessions.$inferInsert> = {}): void {
  const now = nowIso();
  getDb()
    .update(chatSessions)
    .set({ lastMessageAt: now, updatedAt: now, ...extra })
    .where(eq(chatSessions.id, id))
    .run();
}

/** Classify a provider failure so the UI can name the ACTUAL reason (intake
 *  0001: "what is the actual reason for unavailability"). */
export function classifyTurnError(message: string): ChatTurnError["kind"] {
  const m = message.toLowerCase();
  if (m.includes("timed out") || m.includes("timeout")) return "timeout";
  if (m.includes("enoent") || m.includes("not recognized") || m.includes("command not found"))
    return "not-installed";
  if (/usage limit|rate limit|quota|overloaded|too many requests|429/.test(m)) return "usage-limit";
  if (m.trim().length === 0) return "unknown";
  return "provider";
}

/** Suggested secondary model when the primary fails. The UI must ask the user
 *  before re-running with it — failover is never silent. */
export function fallbackTarget(
  provider: string | null,
  model: string | null,
): { provider: ProviderId; model: string } {
  if (provider === "claude-code") {
    return { provider: "claude-code", model: model === "sonnet" ? "haiku" : "sonnet" };
  }
  return { provider: "claude-code", model: "sonnet" };
}

const ISO = "2026-01-01T00:00:00.000Z";

/** Synthetic, non-persisted agent that drives free/project chat turns. Free
 *  chat gets no tools; project chat gets read-only repo access. */
function chatAgent(
  session: ChatSession,
  provider: ProviderId,
  model: string,
  project: { name: string; description: string; rootDir: string | null } | null,
): Agent {
  const base: Agent = {
    id: `chat-${session.kind}`,
    name: "Chat",
    slug: `chat-${session.kind}`,
    role: "",
    systemPrompt:
      "You are a helpful assistant inside Sparstrowgen, a local-first agent factory. Answer the user's latest message directly and conversationally. Use markdown when it helps.",
    provider,
    model,
    cwd: null,
    addDirs: [],
    allowedTools: [],
    disallowedTools: [],
    permissionMode: "default",
    mcpServers: {},
    maxTurns: null,
    memoryReadScopes: [],
    memoryWriteScopes: [],
    extraArgs: [],
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
  if (session.kind === "project" && project) {
    return {
      ...base,
      systemPrompt: `You are a project assistant inside Sparstrowgen, chatting about the project "${project.name}"${project.description ? ` — ${project.description}` : ""}. You have READ-ONLY access to the project's repository${project.rootDir ? ` at ${project.rootDir}` : ""}. Use Read/Grep/Glob to answer questions about the code truthfully — never guess when you can look. Never modify files. Answer the user's latest message directly.`,
      cwd: project.rootDir,
      allowedTools: ["Read", "Grep", "Glob"],
    };
  }
  return base;
}

export function buildTranscriptPrompt(history: ChatMessage[]): string {
  const lines = history
    .slice(-TRANSCRIPT_WINDOW)
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`);

  // Keep the newest messages that fit the byte budget, dropping oldest first.
  // The last line is always kept — a turn with no prompt is worse than a long one.
  const kept: string[] = [];
  let bytes = 0;
  for (let i = lines.length - 1; i >= 0; i--) {
    const size = Buffer.byteLength(lines[i]!, "utf8") + 2;
    if (kept.length > 0 && bytes + size > TRANSCRIPT_BUDGET_BYTES) break;
    kept.unshift(lines[i]!);
    bytes += size;
  }

  return `Conversation so far:\n\n${kept.join("\n\n")}\n\nRespond to the user's latest message.`;
}

interface ModelTarget {
  provider: ProviderId;
  model: string;
}

/** Run a plain (non-creator) turn: up to ATTEMPTS_PER_MODEL tries on the given
 *  target, returning either the reply text or the last failure reason. */
async function attemptChatCompletion(
  agent: Agent,
  prompt: string,
): Promise<{ text: string | null; errorReason: string }> {
  let lastError = "unknown error";
  for (let attempt = 1; attempt <= ATTEMPTS_PER_MODEL; attempt++) {
    try {
      const result = await completeOnce(agent, prompt, { timeoutMs: TURN_TIMEOUT_MS });
      if (!result.isError && result.text) return { text: result.text, errorReason: "" };
      lastError = result.errorMessage ?? "the model returned no output";
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    logger.info({ attempt, agent: agent.slug, err: lastError }, "chat turn attempt failed");
  }
  return { text: null, errorReason: lastError };
}

async function runCreatorTurn(
  session: ChatSession,
  history: ChatMessage[],
  clientDraft: Record<string, unknown> | undefined,
  override: ModelTarget | null,
): Promise<ChatTurn> {
  const mergedDraft = { ...(session.draft ?? {}), ...(clientDraft ?? {}) };
  const turn: DraftTurn = await runAgentDraftTurn(
    {
      messages: history.map((m) => ({ role: m.role, content: m.content })),
      draft: mergedDraft,
    },
    override ?? {},
  );

  if (turn.source === "fallback" && turn.errorReason) {
    // The AI never answered — don't store a synthetic assistant message; keep
    // the user message pending so /retry can re-run it (primary or secondary).
    touchSession(session.id, { draft: turn.draft as Record<string, unknown> });
    const target = override ?? { provider: "claude-code" as ProviderId, model: "sonnet" };
    return {
      session: getChatSession(session.id),
      userMessage: history[history.length - 1] ?? null,
      assistantMessage: null,
      error: {
        kind: classifyTurnError(turn.errorReason),
        reason: turn.errorReason,
        attempts: ATTEMPTS_PER_MODEL,
        fallback: fallbackTarget(target.provider, target.model),
      },
      draftTurn: turn,
    };
  }

  const assistantMessage = insertMessage(session.id, "assistant", turn.reply, {
    source: turn.source,
    followups: turn.followups,
    matches: turn.matches,
    readyToCreate: turn.readyToCreate,
    ...(override ? { provider: override.provider, model: override.model } : {}),
  });
  touchSession(session.id, {
    draft: turn.draft as Record<string, unknown>,
    ...(session.title ? {} : turn.draft.name ? { title: `Agent: ${turn.draft.name}` } : {}),
  });
  return {
    session: getChatSession(session.id),
    userMessage: history[history.length - 1] ?? null,
    assistantMessage,
    error: null,
    draftTurn: turn,
  };
}

async function runTurn(
  sessionId: string,
  override: ModelTarget | null,
  clientDraft?: Record<string, unknown>,
): Promise<ChatTurn> {
  const db = getDb();
  const session = getChatSession(sessionId);
  if (session.status !== "active") throw new HttpError(409, "chat session is archived");
  const history = listChatMessages(sessionId);
  const last = history[history.length - 1];
  if (!last || last.role !== "user") {
    throw new HttpError(409, "nothing to run: the last message is not a pending user message");
  }

  if (session.kind === "agent-creator") {
    return runCreatorTurn(session, history, clientDraft, override);
  }

  const target: ModelTarget = override ?? {
    provider: (session.provider ?? "claude-code") as ProviderId,
    model: session.model ?? "sonnet",
  };
  assertCliProvider(target.provider);

  let agent: Agent;
  if (session.kind === "agent") {
    const row = db.select().from(agents).where(eq(agents.id, session.agentId!)).get();
    if (!row) throw new HttpError(404, `agent not found: ${session.agentId}`);
    agent = { ...(row as unknown as Agent), provider: target.provider, model: target.model };
  } else {
    const project = session.projectId
      ? (db.select().from(projects).where(eq(projects.id, session.projectId)).get() ?? null)
      : null;
    agent = chatAgent(session, target.provider, target.model, project);
  }

  const prompt = buildTranscriptPrompt(history);
  const { text, errorReason } = await attemptChatCompletion(agent, prompt);

  if (text === null) {
    touchSession(session.id);
    return {
      session: getChatSession(session.id),
      userMessage: last,
      assistantMessage: null,
      error: {
        kind: classifyTurnError(errorReason),
        reason: errorReason,
        attempts: ATTEMPTS_PER_MODEL,
        fallback: fallbackTarget(target.provider, target.model),
      },
      draftTurn: null,
    };
  }

  const assistantMessage = insertMessage(session.id, "assistant", text, {
    source: "ai",
    provider: target.provider,
    model: target.model,
  });
  touchSession(session.id);
  return {
    session: getChatSession(session.id),
    userMessage: last,
    assistantMessage,
    error: null,
    draftTurn: null,
  };
}

/** One user turn: store the message, run the session's model, store the reply.
 *  On failure the user message is kept pending and `error` explains why. */
export async function postChatTurn(
  sessionId: string,
  content: string,
  clientDraft?: Record<string, unknown>,
): Promise<ChatTurn> {
  const session = getChatSession(sessionId);
  if (session.status !== "active") throw new HttpError(409, "chat session is archived");
  const history = listChatMessages(sessionId);
  const last = history[history.length - 1];
  if (last && last.role === "user") {
    throw new HttpError(409, "the previous turn hasn't completed — retry or wait for it first");
  }
  insertMessage(sessionId, "user", content, null);
  if (!session.title) {
    const title = content.trim().slice(0, 60);
    getDb().update(chatSessions).set({ title }).where(eq(chatSessions.id, sessionId)).run();
  }
  return runTurn(sessionId, null, clientDraft);
}

/** Re-run the last failed turn — same model, or a user-approved secondary. */
export async function retryChatTurn(
  sessionId: string,
  override: { provider?: ProviderId; model?: string } | undefined,
  clientDraft?: Record<string, unknown>,
): Promise<ChatTurn> {
  const target: ModelTarget | null =
    override?.provider || override?.model
      ? {
          provider: override.provider ?? ("claude-code" as ProviderId),
          model: override.model ?? "sonnet",
        }
      : null;
  return runTurn(sessionId, target, clientDraft);
}
