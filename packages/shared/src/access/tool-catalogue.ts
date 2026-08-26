import type { PolicyLevel, ToolPolicyLevels } from "../tool-policy.js";

export interface CatalogueTool {
  id: string;              // exactly the string passed to the provider
  label: string;           // "Edit files"
  description: string;     // one sentence, plain language, owner-facing
  danger: "read" | "write" | "execute" | "network";
}

export type ToolCatalogue = Record<string /* providerId */, CatalogueTool[]>;

export const CATALOGUE_REVISION = "2026-08-25";

export const TOOL_CATALOGUE: ToolCatalogue = {
  "claude-code": [
    {
      id: "Bash",
      label: "Bash",
      description: "Executes shell commands in the project working directory.",
      danger: "execute",
    },
    {
      id: "Write",
      label: "Write File",
      description: "Creates or completely overwrites a file on disk.",
      danger: "write",
    },
    {
      id: "Edit",
      label: "Edit File",
      description: "Modifies existing file contents.",
      danger: "write",
    },
    {
      id: "Read",
      label: "Read File",
      description: "Reads the contents of one or more files.",
      danger: "read",
    },
    {
      id: "Glob",
      label: "Glob",
      description: "Searches for files matching a pattern.",
      danger: "read",
    },
    {
      id: "Grep",
      label: "Grep",
      description: "Searches inside files for a specific text pattern.",
      danger: "read",
    },
    {
      id: "WebFetch",
      label: "Web Fetch",
      description: "Fetches and reads the contents of a specific URL.",
      danger: "network",
    },
    {
      id: "WebSearch",
      label: "Web Search",
      description: "Performs a web search to find current information.",
      danger: "network",
    },
    {
      id: "mcp__sparstrow-memory",
      label: "Sparstrow Memory",
      description: "Reads from and writes to the agent's project memory.",
      danger: "read",
    },
  ],
  "antigravity": [],
  "anthropic-api": [
    {
      id: "task_block",
      label: "Block Task",
      description: "Declares a task blocked and stops to ask the human for input.",
      danger: "write",
    },
    {
      id: "spawn_subtask",
      label: "Spawn Subtask",
      description: "Delegates part of a task to another agent and waits for the result.",
      danger: "write",
    },
  ],
  "ollama": [
    {
      id: "task_block",
      label: "Block Task",
      description: "Declares a task blocked and stops to ask the human for input.",
      danger: "write",
    },
    {
      id: "spawn_subtask",
      label: "Spawn Subtask",
      description: "Delegates part of a task to another agent and waits for the result.",
      danger: "write",
    },
  ],
};

export type RuleEffect =
  | { effect: "applies" }
  | { effect: "unknown-tool"; reason: string }
  | { effect: "already-denied-above"; by: PolicyLevel };

export function describeToolRule(input: {
  providerId: string;
  tool: string;
  intent: "allow" | "deny";
  higherLevels: ToolPolicyLevels;
}): RuleEffect {
  const catalogue = TOOL_CATALOGUE[input.providerId];

  // An uncatalogued provider is a different situation from a mistyped tool
  if (!catalogue) {
    return { effect: "applies" };
  }

  // Check if it's a valid tool for this provider
  const isKnown = input.tool === "*" || catalogue.some((t) => t.id === input.tool) || input.tool.startsWith("mcp__");
  if (!isKnown) {
    return {
      effect: "unknown-tool",
      reason: `Tool "${input.tool}" is not in the known catalogue for this provider.`,
    };
  }

  if (input.intent === "allow") {
    // Check if it's already denied at a higher level, evaluating from highest to lowest.
    const levels: { name: PolicyLevel; policy: typeof input.higherLevels.global }[] = [
      { name: "global", policy: input.higherLevels.global },
      { name: "agent", policy: input.higherLevels.agent },
      { name: "project", policy: input.higherLevels.project },
      { name: "task", policy: input.higherLevels.task },
    ];

    for (const level of levels) {
      if (level.policy && level.policy.disallowed.includes(input.tool)) {
        return { effect: "already-denied-above", by: level.name };
      }
      // Also catch if a wildcard deny is present at this level
      if (level.policy && level.policy.disallowed.includes("*") && input.tool !== "*") {
        return { effect: "already-denied-above", by: level.name };
      }
    }
  }

  return { effect: "applies" };
}
