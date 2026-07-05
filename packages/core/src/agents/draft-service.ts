import { z } from "zod";
import {
  KNOWN_MODELS,
  agentDraftSchema,
  draftIntentSchema,
  providerIdSchema,
  type Agent,
  type AgentDraft,
  type DraftRequest,
  type DraftTurn,
} from "@sparstrow/shared";
import { logger } from "../logger.js";
import { completeOnce } from "../orchestrator/one-shot.js";

const providerList = providerIdSchema.options.join(", ");
const modelList = providerIdSchema.options
  .map((p) => `${p} → ${(KNOWN_MODELS[p] ?? []).join(" | ")}`)
  .join("; ");

/** Built from the REAL enum + model list so the model can't draft a provider
 *  (e.g. the design module's `codex`) the app cannot run. */
const CREATOR_SYSTEM_PROMPT = `You are the Agent Creator for Sparstrowgen, a local-first harness that runs CLI coding agents.
Interview the user to design ONE agent. Ask exactly ONE focused question per turn.
Respond with STRICT JSON ONLY — no prose, no markdown fences:
{"reply": string, "intent": "build" | "find", "draft": { ... }, "readyToCreate": boolean, "followups": string[]}
draft fields (all optional, use ONLY these names):
- name (string), role (short string), systemPrompt (markdown body, keep under 40 lines)
- provider: one of ${providerList}
- model: ${modelList}
- cwd (string or null), allowedTools (string[]), disallowedTools (string[])
- permissionMode: one of default | acceptEdits | plan
- memoryReadScopes (string[]), memoryWriteScopes (string[])
Rules:
- NEVER set permissionMode to "bypassPermissions". NEVER grant wildcard tools like "*" or "Bash(*)". Prefer least privilege.
- Echo the accumulated draft each turn, adding newly learned fields.
- Set readyToCreate true only once name, role, provider and model are all set.
- Keep "reply" to 1-2 sentences. "followups": up to 3 short suggested user replies.`;

const ISO = "2026-01-01T00:00:00.000Z";

/** Synthetic, non-persisted agent used only to drive the Creator turn. No
 *  tools, read-only — it just emits JSON. Never written to the agents table. */
function creatorAgent(): Agent {
  return {
    id: "agent-creator",
    name: "Agent Creator",
    slug: "agent-creator",
    role: "",
    systemPrompt: CREATOR_SYSTEM_PROMPT,
    provider: "claude-code",
    model: "sonnet",
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
    isSystem: false,
    createdAt: ISO,
    updatedAt: ISO,
  };
}

const modelTurnSchema = z.object({
  reply: z.string().default(""),
  intent: draftIntentSchema.optional(),
  draft: z.record(z.unknown()).optional(),
  readyToCreate: z.boolean().optional(),
  followups: z.array(z.string()).optional(),
});

const DRAFT_KEYS = Object.keys(agentDraftSchema.shape);

function isBroadGrant(tool: string): boolean {
  const t = tool.trim();
  return t === "*" || /\(\s*\*\s*\)/.test(t) || /^bash$/i.test(t);
}

/**
 * Coerce an untrusted draft (model- or client-supplied) into a safe, schema-
 * valid AgentDraft. Unknown/legacy field names (workingDir, readScopes, skill)
 * and individually-invalid fields are dropped; permission/tool escalations are
 * clamped. This is the trust boundary for free-text → agent config.
 */
export function clampDraft(raw: Record<string, unknown>): AgentDraft {
  const clean: Record<string, unknown> = {};
  for (const key of DRAFT_KEYS) {
    if (!(key in raw)) continue;
    const probe = agentDraftSchema.safeParse({ [key]: raw[key] });
    if (probe.success) Object.assign(clean, probe.data);
  }
  let draft = agentDraftSchema.parse(clean);
  if (draft.permissionMode === "bypassPermissions") {
    const { permissionMode: _drop, ...rest } = draft;
    draft = rest;
  }
  if (draft.allowedTools && draft.allowedTools.length > 0) {
    draft = { ...draft, allowedTools: draft.allowedTools.filter((t) => !isBroadGrant(t)) };
  }
  return draft;
}

/** readyToCreate is decided server-side from the REAL required fields, never
 *  from the model's self-assessment. */
function isReady(draft: AgentDraft): boolean {
  return Boolean(draft.name && draft.model && draft.provider);
}

/**
 * Extract an agent name from a user message ONLY when they explicitly name it
 * ("name it spec-writer", "call it X", a quoted/backticked token). Returns
 * undefined for freeform descriptions — the fallback should never invent a name
 * out of a sentence (that produced "Name It Spec Writer" from "Name it
 * spec-writer"). The token's original case/hyphenation is preserved.
 */
export function guessName(text: string): string | undefined {
  const explicit = text.match(
    /\b(?:names?|call(?:ed)?)\s+(?:it|this|the agent|the)?\s*["'`]?([A-Za-z][\w-]{1,59})/i,
  );
  if (explicit?.[1]) return explicit[1];
  const quoted = text.match(/["'`]([A-Za-z][\w-]{1,59})["'`]/);
  if (quoted?.[1]) return quoted[1];
  return undefined;
}

/** Announced deterministic turn: used when the AI is unavailable or returns
 *  unusable output. The UI shows `source: "fallback"` so it never looks like
 *  a silent substitution. */
function deterministicTurn(req: DraftRequest): DraftTurn {
  const lastUser = [...req.messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const draft = clampDraft({ ...(req.draft ?? {}) });
  if (!draft.name) {
    const guessed = guessName(lastUser);
    if (guessed) draft.name = guessed;
  }
  if (!draft.provider) draft.provider = "claude-code";
  if (!draft.model) draft.model = "sonnet";
  return {
    reply:
      "AI drafting is unavailable right now, so I'm in basic mode. I've prefilled what I could — edit the fields on the right, or switch to the manual form.",
    intent: "build",
    draft,
    readyToCreate: isReady(draft),
    followups: ["Set the role", "Add allowed tools", "Open the manual form"],
    matches: [],
    sessionId: null,
    source: "fallback",
  };
}

function buildPrompt(req: DraftRequest): string {
  const transcript = req.messages
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n");
  return [
    "Current draft so far (JSON):",
    JSON.stringify(req.draft ?? {}, null, 2),
    "",
    "Conversation:",
    transcript,
    "",
    "Produce the next turn as STRICT JSON only.",
  ].join("\n");
}

export function extractJson(text: string): Record<string, unknown> | null {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) t = fence[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  try {
    const parsed = JSON.parse(t.slice(start, end + 1));
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Turn one model reply into a validated DraftTurn, or null if it didn't yield
 *  usable JSON. */
function parseTurn(text: string, req: DraftRequest): DraftTurn | null {
  const json = extractJson(text);
  const parsed = json ? modelTurnSchema.safeParse(json) : null;
  if (!parsed || !parsed.success) return null;
  const draft = clampDraft({ ...(req.draft ?? {}), ...(parsed.data.draft ?? {}) });
  return {
    reply: parsed.data.reply || "Got it.",
    intent: parsed.data.intent ?? "build",
    draft,
    readyToCreate: isReady(draft),
    followups: (parsed.data.followups ?? []).slice(0, 3),
    matches: [],
    sessionId: null,
    source: "ai",
  };
}

async function aiAttempt(
  prompt: string,
  req: DraftRequest,
): Promise<{ turn: DraftTurn | null; transportFailed: boolean }> {
  let result;
  try {
    result = await completeOnce(creatorAgent(), prompt, { timeoutMs: 90_000 });
  } catch (err) {
    logger.warn({ err }, "agent draft turn threw");
    return { turn: null, transportFailed: true };
  }
  if (result.isError || !result.text) {
    logger.info({ err: result.errorMessage }, "agent draft: AI unavailable");
    return { turn: null, transportFailed: true };
  }
  return { turn: parseTurn(result.text, req), transportFailed: false };
}

/**
 * Run one Agent Creator turn. Calls Claude via the one-shot transport, extracts
 * + validates strict JSON, clamps the draft to the trust boundary. A single
 * JSON slip triggers one strict "repair" retry before giving up (a transport
 * failure skips the retry — it won't help and just doubles the wait). On real
 * failure it returns an announced deterministic turn. FIND-by-capability is
 * handled client-side, so `matches` stays empty here.
 */
export async function runAgentDraftTurn(req: DraftRequest): Promise<DraftTurn> {
  const prompt = buildPrompt(req);
  const first = await aiAttempt(prompt, req);
  if (first.turn) return first.turn;

  if (!first.transportFailed) {
    const repairPrompt = `${prompt}\n\nIMPORTANT: Respond with ONLY the JSON object — no prose, no markdown code fences.`;
    const second = await aiAttempt(repairPrompt, req);
    if (second.turn) return second.turn;
    logger.info("agent draft: model JSON unparseable after repair retry; deterministic fallback");
  }

  return deterministicTurn(req);
}
