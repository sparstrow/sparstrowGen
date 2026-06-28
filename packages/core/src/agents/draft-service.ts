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

function guessName(text: string): string | undefined {
  const words = text
    .replace(/[^a-zA-Z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4);
  if (words.length === 0) return undefined;
  const name = words.map((w) => w[0]!.toUpperCase() + w.slice(1)).join(" ").slice(0, 60);
  return name.length > 0 ? name : undefined;
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

/**
 * Run one Agent Creator turn. Calls Claude via the one-shot transport, extracts
 * + validates strict JSON, clamps the draft to the trust boundary, and falls
 * back to an announced deterministic turn on any failure. FIND-by-capability is
 * handled client-side (the agents list is already loaded), so `matches` stays
 * empty here.
 */
export async function runAgentDraftTurn(req: DraftRequest): Promise<DraftTurn> {
  let result;
  try {
    result = await completeOnce(creatorAgent(), buildPrompt(req), { timeoutMs: 90_000 });
  } catch (err) {
    logger.warn({ err }, "agent draft turn failed; using deterministic fallback");
    return deterministicTurn(req);
  }

  if (result.isError || !result.text) {
    logger.info({ err: result.errorMessage }, "agent draft: AI unavailable; deterministic fallback");
    return deterministicTurn(req);
  }

  const json = extractJson(result.text);
  const parsed = json ? modelTurnSchema.safeParse(json) : null;
  if (!parsed || !parsed.success) {
    logger.info("agent draft: model returned unparseable JSON; deterministic fallback");
    return deterministicTurn(req);
  }

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
