/**
 * Pure agent-capability metadata + preamble rendering (no handler imports, so it
 * can't create an import cycle with run-manager). This is the docs half of the
 * capability registry (rule 20): the single source the preamble reads and, when
 * P8 lands, the direct-API native tool schemas are generated from. capability-
 * registry.ts owns the MCP handlers and cross-checks against this list.
 */

export type CapabilityIntent = "do-work" | "delegate" | "escalate" | "remember" | "look-up";

export interface CapabilityDoc {
  name: string;
  intent: CapabilityIntent;
  /** One-line WHEN, shown in the preamble tools-by-intent list. */
  whenToUse: string;
}

export const CAPABILITY_DOCS: CapabilityDoc[] = [
  {
    name: "task_block",
    intent: "escalate",
    whenToUse:
      "You are stuck and only a human can unblock you (a missing decision, credentials, or an ambiguous requirement).",
  },
  {
    name: "message_send",
    intent: "escalate",
    whenToUse: "Your lead or a peer can likely answer — ask them before escalating to a human.",
  },
  {
    name: "task_create",
    intent: "delegate",
    whenToUse:
      "Fire-and-forget hand-off; use spawn_subtask (P3) if you need the result back, to wait, or to stay accountable.",
  },
  {
    name: "task_update",
    intent: "do-work",
    whenToUse:
      "Report your own task's status — done, failed (work itself impossible, not a question), or in_progress.",
  },
  {
    name: "memory_save",
    intent: "remember",
    whenToUse: "You learned something durable worth keeping across runs. One topic per note.",
  },
  {
    name: "memory_search",
    intent: "look-up",
    whenToUse: "You need knowledge you don't have in context — search before guessing.",
  },
];

const INTENT_ORDER: CapabilityIntent[] = ["do-work", "delegate", "escalate", "remember", "look-up"];
const INTENT_LABEL: Record<CapabilityIntent, string> = {
  "do-work": "Do the work",
  delegate: "Delegate",
  escalate: "Escalate",
  remember: "Remember",
  "look-up": "Look up",
};

/**
 * The preamble "tools by intent" section (DX2/DX-H2). Optionally filter to the
 * names an agent actually has. Ends with the escalation ladder so a fresh agent
 * knows message_send→lead vs task_block→human vs task_update(failed)→impossible.
 */
export function renderCapabilityDocs(available?: string[]): string {
  const caps = available
    ? CAPABILITY_DOCS.filter((c) => available.includes(c.name))
    : CAPABILITY_DOCS;
  const lines: string[] = ["## Your tools, by intent"];
  for (const intent of INTENT_ORDER) {
    const group = caps.filter((c) => c.intent === intent);
    if (group.length === 0) continue;
    lines.push(`**${INTENT_LABEL[intent]}**`);
    for (const c of group) lines.push(`- \`${c.name}\` — ${c.whenToUse}`);
  }
  lines.push(
    "",
    "Escalation ladder when you can't proceed: ask your lead via `message_send` first (a peer can often answer); use `task_block` only when a human must decide (missing decision, credentials, ambiguous requirement); use `task_update(failed)` when the work itself is impossible, not when you have a question.",
  );
  return lines.join("\n");
}
