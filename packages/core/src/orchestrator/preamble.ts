import path from "node:path";
import type { Agent } from "@sparstrow/shared";
import { config } from "../config.js";
import { scopeDir } from "../memory/vault.js";

/**
 * Standing instructions prepended to every headless run: identity, memory
 * protocol (phase 1: direct file writes into allowed vault folders).
 */
export function buildPreamble(agent: Agent, currentProjectSlug: string | null): string {
  const writeDirs: string[] = [];
  for (const scope of agent.memoryWriteScopes) {
    try {
      if (scope === "global") writeDirs.push(scopeDir("global"));
      else if (scope === "agent:self") writeDirs.push(scopeDir("agent", null, agent.slug));
      else if (scope.startsWith("agent:"))
        writeDirs.push(scopeDir("agent", null, scope.slice("agent:".length)));
      else if (scope === "project:*") {
        if (currentProjectSlug) writeDirs.push(scopeDir("project", currentProjectSlug));
      } else if (scope.startsWith("project:"))
        writeDirs.push(scopeDir("project", scope.slice("project:".length)));
    } catch {
      // skip unresolvable scopes
    }
  }
  const absWriteDirs = writeDirs.map((d) => path.join(config.vaultPath, d.split("/").join(path.sep)));

  const isGemini = agent.provider === "gemini-cli";
  const lines: string[] = [];
  // gemini has no --append-system-prompt; carry the system prompt in-band.
  if (isGemini && agent.systemPrompt.trim().length > 0) {
    lines.push("## System instructions", agent.systemPrompt.trim(), "");
  }
  lines.push(
    `You are "${agent.name}"${agent.role ? ` — ${agent.role}` : ""}, an agent managed by Sparstrowgen.`,
  );
  if (currentProjectSlug) lines.push(`Current project: ${currentProjectSlug}`);
  lines.push(
    "",
    "## Memory protocol",
    `Your long-term memory is an Obsidian vault at: ${config.vaultPath}`,
  );
  if (isGemini) {
    lines.push(
      `To look up additional knowledge mid-task, run: node "${config.memoryCliPath}" search "your query" (semantic + keyword search over your allowed scopes; requires the SPARSTROW_RUN_ID env var already set for you).`,
      `To hand work to another agent or report a task outcome, end your final reply with a fenced block:`,
      "```sparstrow",
      `{"handoff": {"to_agent": "<agent name>", "title": "<short title>", "prompt": "<full instructions>"}}`,
      "```",
    );
  } else {
    lines.push(
      "To look up additional knowledge mid-task, use the mcp__sparstrow-memory__memory_search tool (semantic + keyword search over your allowed scopes).",
      "To hand work to another agent, use the mcp__sparstrow-memory__task_create tool (assignToAgent). To message the user or another agent, use mcp__sparstrow-memory__message_send.",
    );
  }
  if (absWriteDirs.length > 0) {
    lines.push(
      "When you learn something durable and worth remembering, save it with the mcp__sparstrow-memory__memory_save tool (preferred). If that tool is unavailable, write a new .md file into one of these folders (your allowed write scopes):",
      ...absWriteDirs.map((d) => `- ${d}`),
      `File notes need YAML frontmatter: title, tags (list), source: agent:${agent.slug}. Keep one fact/topic per note. Never modify or delete notes you did not create. Do not re-save anything already shown to you in the <memory> block.`,
    );
  } else {
    lines.push("You have no memory write access — do not write into the vault.");
  }
  return lines.join("\n");
}
