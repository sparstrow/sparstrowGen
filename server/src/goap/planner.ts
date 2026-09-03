import {
  consensusVerdictSchema,
  plannerPlanSchema,
  type ConsensusVerdict,
  type Goal,
  type PlanNodeView,
  type PlannerPlan,
} from "@sparstrow/shared";
import { extractJson } from "../agents/draft-service.js";

/**
 * P6 Planner/Reviewer prompt + parse layer — pure functions, no DB, no bus,
 * so the golden-transcript fixture tests (cross-cutting rule 9) can drive the
 * exact strings agents see and the exact parses core applies.
 */

export interface PlannerRosterEntry {
  slug: string;
  name: string;
  role: string;
  /** P2-resolved effective toolset (CEO S1-b) — what this agent can ACTUALLY use. */
  allowed: string[];
  disallowed: string[];
}

const PLAN_JSON_SHAPE = `{
  "planSummary": "one short paragraph describing the approach",
  "actions": [
    {
      "id": "short_stable_slug",
      "label": "Imperative step title (<=120 chars)",
      "description": "Self-contained instructions for the assigned agent — it sees ONLY this text plus prerequisite results.",
      "agentHint": "roster slug",
      "dependsOn": ["ids of actions whose OUTPUT this step needs"],
      "kind": "work" | "push",
      "pre": ["optional human-readable preconditions (annotation only)"],
      "effects": ["optional human-readable outcomes (annotation only)"],
      "cost": 1
    }
  ]
}`;

function rosterBlock(roster: PlannerRosterEntry[]): string {
  const lines = roster.map((r) => {
    const allowed = r.allowed.length > 0 ? r.allowed.join(", ") : "(default toolset)";
    const denied = r.disallowed.length > 0 ? ` | denied: ${r.disallowed.join(", ")}` : "";
    return `- ${r.slug} — ${r.name}${r.role ? ` (${r.role})` : ""}. Tools: ${allowed}${denied}`;
  });
  return lines.join("\n");
}

export interface PlannerPromptInput {
  goal: Pick<Goal, "prompt" | "teamId">;
  roster: PlannerRosterEntry[];
  projectName: string | null;
  /** Validation diagnostics from the PREVIOUS attempt (bounce-back round). */
  diagnostics?: string[] | null;
  /** The previous attempt's raw plan JSON (so the model repairs, not restarts). */
  previousPlanJson?: string | null;
  /** Replan context: current plan state + what failed (adaptive replanning). */
  replan?: {
    reason: string;
    nodes: Array<Pick<PlanNodeView, "actionId" | "label" | "status">>;
  } | null;
}

/** Build the Planner run's prompt (initial plan, bounce-back repair, or replan). */
export function buildPlannerPrompt(input: PlannerPromptInput): string {
  const parts: string[] = [
    "Plan the following goal as a dependency DAG of agent work.",
    "",
    "<goal>",
    input.goal.prompt,
    "</goal>",
    "",
    `Project: ${input.projectName ?? "(none — factory-level goal)"}`,
    input.goal.teamId
      ? "This goal is TEAM-BOUNDED: every agentHint must come from the roster below (the team's members)."
      : "",
    "",
    "## Available agents (assign every action to one of these slugs)",
    rosterBlock(input.roster),
    "",
    "## Output",
    "Respond with ONE JSON object of this exact shape — no prose, no markdown fences:",
    PLAN_JSON_SHAPE,
    "Rules:",
    "- 3-12 actions; each completable by one agent in one focused session.",
    "- dependsOn ONLY where a step needs another step's output — independent steps run in parallel.",
    '- Exactly the actions that push/PR/deploy/publish get kind "push" (usually the final step; analysis-only goals have none).',
  ];

  if (input.replan) {
    parts.push(
      "",
      "## REPLAN — the current plan hit a failure",
      `Failure: ${input.replan.reason}`,
      "Current plan state:",
      ...input.replan.nodes.map((n) => `- [${n.status}] ${n.actionId}: ${n.label}`),
      "Produce the NEW full plan. Keep the id of every [done] action EXACTLY the same (its completed work carries forward and will not re-run). Re-plan the failed path — add, remove or reroute the remaining actions as needed.",
    );
  }

  if (input.diagnostics && input.diagnostics.length > 0) {
    parts.push(
      "",
      "## Your previous plan was rejected — fix these and resend the FULL corrected JSON",
      ...input.diagnostics.map((d) => `- ${d}`),
    );
    if (input.previousPlanJson) {
      parts.push("", "Your previous plan:", input.previousPlanJson);
    }
  }

  return parts.filter((p) => p !== "").join("\n");
}

export type PlannerParse =
  | { ok: true; plan: PlannerPlan }
  | { ok: false; diagnostics: string[] };

/**
 * Parse one Planner reply into a schema-valid plan, or bounce-back
 * diagnostics phrased FOR the repair prompt (zod issues → per-field lines).
 */
export function parsePlannerPlan(text: string): PlannerParse {
  const json = extractJson(text);
  if (!json) {
    return {
      ok: false,
      diagnostics: ["your reply contained no parseable JSON object — respond with ONLY the JSON."],
    };
  }
  const parsed = plannerPlanSchema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      diagnostics: parsed.error.issues
        .slice(0, 10)
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
    };
  }
  return { ok: true, plan: parsed.data };
}

export interface ReviewerPromptInput {
  goal: Pick<Goal, "prompt" | "planSummary">;
  completed: Array<{ label: string; result: string | null }>;
  pushNode: { label: string; description: string };
}

/** Build the consensus Reviewer run's prompt (P6-Q3). */
export function buildReviewerPrompt(input: ReviewerPromptInput): string {
  const clamp = (s: string | null, n: number) =>
    s == null ? "(no result reported)" : s.length > n ? `${s.slice(0, n)}…` : s;
  return [
    "Consensus review before this goal's push step runs. Verify, then vote.",
    "",
    "<goal>",
    input.goal.prompt,
    "</goal>",
    "",
    `Plan approach: ${input.goal.planSummary ?? "(none recorded)"}`,
    "",
    "## Completed steps and their reported results",
    ...input.completed.map((c) => `### ${c.label}\n${clamp(c.result, 2000)}`),
    "",
    "## The push step awaiting your verdict",
    `${input.pushNode.label} — ${input.pushNode.description}`,
    "",
    'Respond with ONE JSON object only: {"approve": boolean, "position": string}',
    "Verify claims against the repository where you can (read-only). Approve only if the work satisfies the goal and is safe to push.",
  ].join("\n");
}

export type VerdictParse =
  | { ok: true; verdict: ConsensusVerdict }
  | { ok: false; detail: string };

/** Parse one Reviewer reply into a verdict, or a repair-retry detail. */
export function parseConsensusVerdict(text: string): VerdictParse {
  const json = extractJson(text);
  const parsed = json ? consensusVerdictSchema.safeParse(json) : null;
  if (!parsed || !parsed.success) {
    return { ok: false, detail: "reply was not a parseable {approve, position} JSON object" };
  }
  return { ok: true, verdict: parsed.data };
}
