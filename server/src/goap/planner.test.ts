import { describe, expect, it } from "vitest";
import {
  buildPlannerPrompt,
  buildReviewerPrompt,
  parseConsensusVerdict,
  parsePlannerPlan,
  type PlannerRosterEntry,
} from "./planner.js";

/**
 * Golden-transcript fixture tests (cross-cutting rule 9): recorded model-turn
 * shapes → parser/diagnostic assertions, plus the exact prompt strings the
 * Planner/Reviewer see. No DB, no processes.
 */

const ROSTER: PlannerRosterEntry[] = [
  { slug: "ui-coder", name: "UI Coder", role: "Builds React UI", allowed: ["Read", "Edit"], disallowed: ["Bash"] },
  { slug: "backend-coder", name: "Backend Coder", role: "Fastify + SQLite", allowed: [], disallowed: [] },
];

const GOAL = { prompt: "Build the memory settings page", teamId: null };

// --- recorded planner replies -----------------------------------------------

const GOLDEN_FENCED = `Here is the plan you asked for:

\`\`\`json
{
  "planSummary": "Two tracks joining at tests.",
  "actions": [
    {"id": "contract", "label": "Write the contract", "description": "Write the API contract.", "agentHint": "backend-coder"},
    {"id": "ui", "label": "Build the UI", "description": "Implement the page.", "agentHint": "ui-coder", "dependsOn": ["contract"]}
  ]
}
\`\`\`

Let me know if you'd like changes.`;

const GOLDEN_BARE = `{"planSummary":"", "actions":[{"id":"a","label":"L","description":"D","agentHint":"ui-coder"}]}`;

const GOLDEN_BROKEN = `Sure! The plan is: step one, write the schema; step two, build the page.`;

const GOLDEN_SCHEMA_VIOLATION = `{"actions":[{"id":"has spaces in id","label":"","description":"x"}]}`;

describe("parsePlannerPlan (golden transcripts)", () => {
  it("extracts a fenced JSON plan surrounded by prose", () => {
    const parsed = parsePlannerPlan(GOLDEN_FENCED);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.plan.actions).toHaveLength(2);
    expect(parsed.plan.actions[1]!.dependsOn).toEqual(["contract"]);
  });

  it("accepts a bare JSON object", () => {
    const parsed = parsePlannerPlan(GOLDEN_BARE);
    expect(parsed.ok).toBe(true);
  });

  it("bounces prose with no JSON, telling the model to send only JSON", () => {
    const parsed = parsePlannerPlan(GOLDEN_BROKEN);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.diagnostics[0]).toMatch(/no parseable JSON/);
  });

  it("bounces schema violations with per-field diagnostics", () => {
    const parsed = parsePlannerPlan(GOLDEN_SCHEMA_VIOLATION);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    const text = parsed.diagnostics.join("\n");
    expect(text).toMatch(/actions\.0\.id/);
    expect(text).toMatch(/actions\.0\.label/);
  });
});

describe("buildPlannerPrompt", () => {
  it("carries the goal, the roster with RESOLVED tools (S1-b), and the JSON shape", () => {
    const prompt = buildPlannerPrompt({ goal: GOAL, roster: ROSTER, projectName: "Shelfree" });
    expect(prompt).toContain("<goal>\nBuild the memory settings page\n</goal>");
    expect(prompt).toContain("Project: Shelfree");
    expect(prompt).toContain("ui-coder — UI Coder (Builds React UI). Tools: Read, Edit | denied: Bash");
    expect(prompt).toContain("backend-coder — Backend Coder (Fastify + SQLite). Tools: (default toolset)");
    expect(prompt).toContain('"agentHint": "roster slug"');
    expect(prompt).not.toContain("TEAM-BOUNDED");
    expect(prompt).not.toContain("REPLAN");
  });

  it("marks team-bounded goals", () => {
    const prompt = buildPlannerPrompt({
      goal: { ...GOAL, teamId: "team_1" },
      roster: ROSTER,
      projectName: null,
    });
    expect(prompt).toContain("TEAM-BOUNDED");
    expect(prompt).toContain("Project: (none — factory-level goal)");
  });

  it("replan rounds carry the failure, the plan state, and the carry-forward instruction", () => {
    const prompt = buildPlannerPrompt({
      goal: GOAL,
      roster: ROSTER,
      projectName: null,
      replan: {
        reason: 'node "Build the UI" (ui) failed: type error in Settings.tsx',
        nodes: [
          { actionId: "contract", label: "Write the contract", status: "done" },
          { actionId: "ui", label: "Build the UI", status: "failed" },
        ],
      },
    });
    expect(prompt).toContain("## REPLAN");
    expect(prompt).toContain("type error in Settings.tsx");
    expect(prompt).toContain("- [done] contract: Write the contract");
    expect(prompt).toContain("Keep the id of every [done] action EXACTLY the same");
  });

  it("bounce-back rounds carry diagnostics and the previous JSON", () => {
    const prompt = buildPlannerPrompt({
      goal: GOAL,
      roster: ROSTER,
      projectName: null,
      diagnostics: ['action "ui" names agent "frontend" which is not an enabled agent — use one of: ui-coder, backend-coder'],
      previousPlanJson: '{"actions":[]}',
    });
    expect(prompt).toContain("## Your previous plan was rejected");
    expect(prompt).toContain('names agent "frontend"');
    expect(prompt).toContain('{"actions":[]}');
  });
});

describe("buildReviewerPrompt / parseConsensusVerdict", () => {
  it("shows the goal, completed results (clamped) and the held push step", () => {
    const prompt = buildReviewerPrompt({
      goal: { prompt: "Fix the auth test", planSummary: "Diagnose then patch." },
      completed: [
        { label: "Diagnose", result: "Root cause: session-store returns stale token." },
        { label: "Patch", result: null },
      ],
      pushNode: { label: "Open the PR", description: "Push branch fix/auth and open a PR." },
    });
    expect(prompt).toContain("<goal>\nFix the auth test\n</goal>");
    expect(prompt).toContain("### Diagnose\nRoot cause: session-store returns stale token.");
    expect(prompt).toContain("### Patch\n(no result reported)");
    expect(prompt).toContain("Open the PR — Push branch fix/auth and open a PR.");
    expect(prompt).toContain('{"approve": boolean, "position": string}');
  });

  it("parses approve and reject verdicts; bounces prose", () => {
    const yes = parseConsensusVerdict('{"approve": true, "position": "Verified the diff — safe."}');
    expect(yes.ok && yes.verdict.approve).toBe(true);

    const no = parseConsensusVerdict('Verdict:\n```json\n{"approve": false, "position": "Tests missing."}\n```');
    expect(no.ok).toBe(true);
    if (no.ok) expect(no.verdict.approve).toBe(false);

    const bad = parseConsensusVerdict("Looks good to me!");
    expect(bad.ok).toBe(false);
  });
});
