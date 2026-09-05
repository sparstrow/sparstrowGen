/**
 * The wire-format convention: Postgres speaks `snake_case`, clients speak
 * `camelCase`, and these two functions are the only place that is true.
 *
 * Moved here from `apps/web/src/lib/case.ts` by restructure Phase 1. It is a
 * contract, not a web-app utility — `server/` encodes with `toCamel` on the way
 * out and decodes with `toSnake` on the way in, and every client must agree
 * about both. A second copy on the client side would be a second convention.
 *
 * `OPAQUE_COLUMNS` is the load-bearing half. These columns hold caller-supplied
 * JSON whose *own* keys are data, not identifiers — a `payload`, an agent's
 * `mcp_servers` block, a node's `position`. Converting inside them would
 * silently rewrite a user's data, so they are copied through untouched. A new
 * jsonb column that stores anything but a fixed, code-defined shape belongs in
 * this list.
 */
export const OPAQUE_COLUMNS: Record<string, string[]> = {
  run_events:       ["payload"],
  runs:             ["injected_memory", "effective_tools"],
  runtime_commands: ["payload"],
  agents:           ["mcp_servers", "specter_report"],
  tasks:            ["parent_effective_tools"],
  chat_sessions:    ["draft"],
  chat_messages:    ["meta"],
  chat_turns:       ["activities"],
  goals:            ["world_state", "version_log"],
  plan_nodes:       ["position"],
} as const;

export function toCamel(row: any, opaqueKeys: string[] = []): any {
  return deepConvert(row, true, opaqueKeys);
}

export function toSnake(obj: any, opaqueKeys: string[] = []): any {
  return deepConvert(obj, false, opaqueKeys);
}

function convert(str: string, toCamel: boolean): string {
  if (toCamel) {
    return str.replace(/([-_][a-z])/g, group =>
      group.toUpperCase().replace("-", "").replace("_", "")
    );
  } else {
    // Also handle numbers if needed, but standard camel to snake usually just does uppercase letters
    // Next.js / typical JS camel to snake:
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  }
}

function deepConvert(obj: any, toCamelFlag: boolean, opaqueKeys: string[]): any {
  if (Array.isArray(obj)) {
    return obj.map(item => deepConvert(item, toCamelFlag, opaqueKeys));
  }
  
  if (obj !== null && typeof obj === "object" && !(obj instanceof Date)) {
    const res: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      const convertedKey = convert(key, toCamelFlag);
      const snakeKey = toCamelFlag ? key : convertedKey;
      
      if (opaqueKeys.includes(snakeKey)) {
        res[convertedKey] = value;
      } else {
        res[convertedKey] = deepConvert(value, toCamelFlag, opaqueKeys);
      }
    }
    return res;
  }
  
  return obj;
}
