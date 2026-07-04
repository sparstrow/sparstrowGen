import yaml from "js-yaml";

/**
 * Minimal YAML frontmatter codec on js-yaml 4. Replaces gray-matter, which is
 * hard-broken under the workspace security override js-yaml@>=4.1.2
 * (pnpm-workspace.yaml — merge-key DoS fix): gray-matter 4.x still calls the
 * removed safeLoad/safeDump APIs, so every writeNote/readNote crashed at runtime.
 * We control the note format (simple scalar/array fields), so a focused codec is
 * safer than pinning a second js-yaml major back into the tree.
 *
 * Parity with gray-matter where callers depend on it:
 * - no frontmatter block ⇒ { data: {}, content: raw }
 * - malformed YAML ⇒ THROWS (scanVault catches and indexes as plain content)
 * - js-yaml 4 `load` is safe by default (no code execution).
 */

export interface ParsedFrontmatter {
  data: Record<string, unknown>;
  content: string;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n?---\r?\n?([\s\S]*)$/;

export function parseFrontmatter(raw: string): ParsedFrontmatter {
  const m = FRONTMATTER_RE.exec(raw);
  if (!m) return { data: {}, content: raw };
  const loaded = yaml.load(m[1] ?? "");
  const data =
    loaded && typeof loaded === "object" && !Array.isArray(loaded)
      ? (loaded as Record<string, unknown>)
      : {};
  return { data, content: m[2] ?? "" };
}

export function stringifyFrontmatter(content: string, data: Record<string, unknown>): string {
  const yamlStr = yaml.dump(data); // ends with "\n"
  const body = content.endsWith("\n") ? content : `${content}\n`;
  return `---\n${yamlStr}---\n${body}`;
}
