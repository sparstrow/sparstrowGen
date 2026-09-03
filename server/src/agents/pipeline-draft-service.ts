// TODO(debt): This copies the completeOnce + extractJson + repair-retry skeleton from draft-service.ts.
// In the future, this should be extracted to a shared helper for multi-turn JSON drafts.

import { z } from "zod";
import {
  draftPipelineSchema,
  type DraftPipeline,
  type TeamManagerChatRequest,
  type PipelineDraftTurn,
} from "@sparstrow/shared";
import { logger } from "../logger.js";
import { completeOnce } from "../orchestrator/one-shot.js";
import type { Agent } from "@sparstrow/shared";

// The pipeline manager doesn't need provider/model, it just needs agent steps
const PIPELINE_CREATOR_SYSTEM_PROMPT = `You are the Pipeline Draft Manager for Sparstrowgen.
Help the user design ONE linear pipeline of agents for their team.
You have access ONLY to the agents currently assigned to this team.
Respond with STRICT JSON ONLY — no prose, no markdown fences:
{"reply": string, "draft": { ... }}

draft fields (all optional):
- name (string)
- description (string)
- steps (array of objects):
  - agentId (string) - Use an agent ID from the Roster. If the user asks for an agent not in the roster, use their requested name as the agentId (it will be flagged for resolution).
  - promptTemplate (string) - Instructions for this step. Can use {{input}} to pipe the previous step's output.
  - onFailure ("abort" | "continue")

Rules:
- Echo the accumulated draft each turn, updating fields based on user requests.
- Keep "reply" to 1-2 sentences.`;

const ISO = "2026-01-01T00:00:00.000Z";

function creatorAgent(): Agent {
  return {
    id: "pipeline-creator",
    name: "Pipeline Creator",
    slug: "pipeline-creator",
    role: "",
    systemPrompt: PIPELINE_CREATOR_SYSTEM_PROMPT,
    provider: "claude-code", // assuming we default to this
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

const modelTurnSchema = z.object({
  reply: z.string().default(""),
  draft: z.record(z.unknown()).optional(),
});

const DRAFT_KEYS = Object.keys(draftPipelineSchema.shape);

/**
 * Coerce an untrusted draft (model- or client-supplied) into a safe, schema-
 * valid DraftPipeline. Unknown/legacy field names are dropped.
 * Maps unknown agents to unresolvedAgentName for UI fix-up chips.
 */
export function clampDraft(raw: Record<string, unknown>, roster: { id: string; name: string }[]): DraftPipeline {
  const clean: Record<string, unknown> = {};
  for (const key of DRAFT_KEYS) {
    if (!(key in raw)) continue;
    // We parse individual keys leniently
    const probe = draftPipelineSchema.safeParse({ [key]: raw[key] });
    if (probe.success) Object.assign(clean, probe.data);
  }
  
  // Zod's parse inherently strips bypassPermissions or tool wildcard grants if they somehow sneak in,
  // as the schema does not include those fields.
  let draft = draftPipelineSchema.parse(clean);
  
  // Resolve unknown agents
  if (draft.steps && draft.steps.length > 0) {
    draft.steps = draft.steps.map(step => {
      if (step.agentId) {
        const found = roster.find(r => r.id === step.agentId || r.name.toLowerCase() === step.agentId?.toLowerCase());
        if (found) {
          step.agentId = found.id; // Normalize to ID
          step.unresolvedAgentName = undefined;
        } else {
          step.unresolvedAgentName = step.agentId;
          step.agentId = undefined;
        }
      }
      return step;
    });
  }
  return draft;
}

function deterministicTurn(req: TeamManagerChatRequest, roster: { id: string; name: string }[]): PipelineDraftTurn {
  const draft = clampDraft({ ...(req.draft ?? {}) }, roster);
  return {
    reply: "AI drafting is unavailable right now. I've preserved your draft progress.",
    draft,
    source: "fallback",
  };
}

function buildPrompt(req: TeamManagerChatRequest, roster: { id: string; name: string }[]): string {
  const parts: string[] = [
    "Team Roster (AVAILABLE AGENTS):",
    ...roster.map(r => `- ${r.name} (id: ${r.id})`),
    "",
    "Current draft so far (JSON):",
    JSON.stringify(req.draft ?? {}, null, 2),
    "",
    "User:",
    req.message,
    "",
    "Produce the next turn as STRICT JSON only.",
  ];
  return parts.join("\n");
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

function parseTurn(text: string, req: TeamManagerChatRequest, roster: { id: string; name: string }[]): PipelineDraftTurn | null {
  const json = extractJson(text);
  const parsed = json ? modelTurnSchema.safeParse(json) : null;
  if (!parsed || !parsed.success) return null;
  const draft = clampDraft({ ...(req.draft ?? {}), ...(parsed.data.draft ?? {}) }, roster);
  return {
    reply: parsed.data.reply || "Got it.",
    draft,
    source: "ai",
  };
}

async function aiAttempt(
  prompt: string,
  req: TeamManagerChatRequest,
  roster: { id: string; name: string }[]
): Promise<{ turn: PipelineDraftTurn | null; transportFailed: boolean }> {
  let result;
  try {
    result = await completeOnce(creatorAgent(), prompt, { timeoutMs: 90_000 });
  } catch (err) {
    logger.warn({ err }, "pipeline draft turn threw");
    return { turn: null, transportFailed: true };
  }
  if (result.isError || !result.text) {
    logger.info({ err: result.errorMessage }, "pipeline draft: AI unavailable");
    return { turn: null, transportFailed: true };
  }
  return { turn: parseTurn(result.text, req, roster), transportFailed: false };
}

export async function runPipelineDraftTurn(
  req: TeamManagerChatRequest,
  roster: { id: string; name: string }[]
): Promise<PipelineDraftTurn> {
  const prompt = buildPrompt(req, roster);

  const first = await aiAttempt(prompt, req, roster);
  let turn = first.turn;
  if (!turn && !first.transportFailed) {
    const repairPrompt = `${prompt}\n\nIMPORTANT: Respond with ONLY the JSON object — no prose, no markdown code fences.`;
    turn = (await aiAttempt(repairPrompt, req, roster)).turn;
    if (!turn) logger.info("pipeline draft: model JSON unparseable after repair retry; deterministic fallback");
  }

  const resolved = turn ?? deterministicTurn(req, roster);
  return resolved;
}
