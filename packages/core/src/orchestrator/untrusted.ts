import type { NormalizedEvent } from "../providers/types.js";

/**
 * EH6/EH7 (P5): decide whether a finished run "consumed untrusted/external
 * content". Three independent signals, any one is sufficient:
 *   1. sandbox — the run executed inside an is_sandbox project (untrusted by
 *      definition: cloned client code, unreviewed content);
 *   2. delegated — the task was agent-authored (its prompt embeds a
 *      <delegated-request> written by another agent, not the operator);
 *   3. external-content tool use — the transcript shows WebFetch/WebSearch or
 *      a foreign MCP tool (anything mcp__* that is not core's own
 *      sparstrow-memory server) actually being called.
 *
 * Signal notes extracted from an untrusted run are quarantined: a "pitfall"
 * note distilled from hostile content is a stored second-order prompt-
 * injection channel, non-injectable until the owner approves it.
 */

const EXTERNAL_CONTENT_TOOLS = new Set(["WebFetch", "WebSearch"]);
const CORE_MCP_PREFIX = "mcp__sparstrow-memory__";

function isExternalContentTool(name: string): boolean {
  if (EXTERNAL_CONTENT_TOOLS.has(name)) return true;
  return name.startsWith("mcp__") && !name.startsWith(CORE_MCP_PREFIX);
}

/**
 * Scan normalized provider events for external-content tool calls. Reads the
 * tool_use blocks inside 'assistant' message events (the same shape the UI's
 * graph-usage line consumes) plus bare 'tool_use' events for providers that
 * emit them directly.
 */
export function hasExternalContentToolUse(events: NormalizedEvent[]): boolean {
  for (const event of events) {
    if (event.type === "tool_use") {
      const name = (event.payload as { name?: unknown } | null)?.name;
      if (typeof name === "string" && isExternalContentTool(name)) return true;
      continue;
    }
    if (event.type !== "assistant") continue;
    const message = (event.payload as { message?: { content?: unknown } } | null)?.message;
    const content = message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      const b = block as { type?: unknown; name?: unknown };
      if (b.type === "tool_use" && typeof b.name === "string" && isExternalContentTool(b.name)) {
        return true;
      }
    }
  }
  return false;
}

export interface UntrustedSignals {
  isSandbox: boolean;
  delegated: boolean;
  events: NormalizedEvent[];
}

export function isUntrustedRun(signals: UntrustedSignals): boolean {
  return signals.isSandbox || signals.delegated || hasExternalContentToolUse(signals.events);
}
