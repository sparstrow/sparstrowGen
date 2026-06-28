/**
 * SKILL.md projection of an agent row.
 *
 * The DB row is the source of truth; this renders it into a SKILL.md document.
 * The SkillViewer tab, the Agent Creator live preview, and the core's on-disk
 * writer all call this one function so their output is byte-identical. It is
 * pure and deterministic and NEVER truncates the system prompt (the "<40 lines"
 * guidance in the Agent Creator applies to what the model drafts, not to this
 * faithful renderer).
 */

/** Structural subset of an agent needed to render SKILL.md. A full `Agent`
 *  satisfies this, and so does a partial Creator draft (with a name/model). */
export interface SkillMdSource {
  name: string;
  role?: string | null;
  provider: string;
  model: string;
  systemPrompt?: string | null;
  allowedTools?: string[];
  disallowedTools?: string[];
  permissionMode?: string;
}

/** Double-quoted YAML scalar via JSON.stringify — always parseable; escapes
 *  colons, hashes, quotes, and newlines that would otherwise break frontmatter. */
function yamlString(value: string): string {
  return JSON.stringify(value);
}

function yamlList(items: string[]): string {
  return `[${items.map((item) => JSON.stringify(item)).join(", ")}]`;
}

export function renderSkillMd(agent: SkillMdSource): string {
  const lines: string[] = ["---"];
  lines.push(`name: ${yamlString(agent.name)}`);
  const role = (agent.role ?? "").trim();
  if (role.length > 0) lines.push(`role: ${yamlString(role)}`);
  lines.push(`provider: ${yamlString(agent.provider)}`);
  lines.push(`model: ${yamlString(agent.model)}`);
  lines.push(`tools: ${yamlList(agent.allowedTools ?? [])}`);
  if ((agent.disallowedTools ?? []).length > 0) {
    lines.push(`disallowedTools: ${yamlList(agent.disallowedTools ?? [])}`);
  }
  if (agent.permissionMode) lines.push(`permissionMode: ${yamlString(agent.permissionMode)}`);
  lines.push("---", "");

  const body = (agent.systemPrompt ?? "").trim();
  lines.push(body.length > 0 ? body : "<!-- No system prompt set. Add one in Overview. -->");
  lines.push("");
  return lines.join("\n");
}
