export const OPAQUE_COLUMNS: Record<string, string[]> = {
  run_events:       ["payload"],
  runs:             ["injected_memory", "effective_tools"],
  runtime_commands: ["payload"],
  agents:           ["mcp_servers", "specter_report"],
  tasks:            ["parent_effective_tools"],
  chat_sessions:    ["draft"],
  chat_messages:    ["meta"],
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
