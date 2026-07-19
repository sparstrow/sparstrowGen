import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Runtime skill discovery (the Multica daemon's local-skills surface, adapted
 * to Sparstrowgen's single-machine shape): scan the CLI runtimes' own skill
 * directories plus the cross-tool universal root for SKILL.md packs, so an
 * already-installed skill can be promoted into the workspace library.
 *
 * Roots mirror Multica's provider mapping for the runtimes Sparstrowgen
 * ships: claude-code → ~/.claude/skills, antigravity →
 * ~/.gemini/antigravity-cli/skills, plus the universal ~/.agents/skills
 * (Codex/Gemini-CLI cross-tool convention). Roots are scanned in that order
 * and the first match of a skill key wins.
 */

const MAX_SKILL_MD_BYTES = 1 << 20; // 1 MB, matches Multica's per-file cap
const MAX_DIR_DEPTH = 4;
const MAX_FILE_COUNT = 128;

export interface LocalSkillRoot {
  path: string;
  provider: string;
  kind: "provider" | "universal";
}

export interface LocalSkillSummary {
  /** Relative dir path under its root — stable identity within a scan. */
  key: string;
  name: string;
  description: string;
  /** Absolute path to the SKILL.md — the import handle. */
  sourcePath: string;
  provider: string;
  root: "provider" | "universal";
  fileCount: number;
}

export function defaultLocalSkillRoots(home = os.homedir()): LocalSkillRoot[] {
  return [
    { path: path.join(home, ".claude", "skills"), provider: "claude-code", kind: "provider" },
    {
      path: path.join(home, ".gemini", "antigravity-cli", "skills"),
      provider: "antigravity",
      kind: "provider",
    },
    { path: path.join(home, ".agents", "skills"), provider: "universal", kind: "universal" },
  ];
}

/** Very small frontmatter reader: leading `---` block of `key: value` lines. */
export function parseSkillFrontmatter(raw: string): {
  frontmatter: Record<string, string>;
  body: string;
} {
  const match = /^---\r?\n([\s\S]*?\r?\n)---\r?\n?/.exec(raw);
  if (!match) return { frontmatter: {}, body: raw };
  const frontmatter: Record<string, string> = {};
  for (const line of match[1]!.split(/\r?\n/)) {
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!kv) continue;
    let value = kv[2]!.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (value) frontmatter[kv[1]!] = value;
  }
  return { frontmatter, body: raw.slice(match[0].length) };
}

function countFiles(dir: string): number {
  let count = 0;
  const walk = (d: string, depth: number) => {
    if (depth > MAX_DIR_DEPTH || count >= MAX_FILE_COUNT) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (count >= MAX_FILE_COUNT) return;
      if (e.isDirectory()) walk(path.join(d, e.name), depth + 1);
      else if (e.isFile()) count++;
    }
  };
  walk(dir, 0);
  return count;
}

export function discoverLocalSkills(
  roots: LocalSkillRoot[] = defaultLocalSkillRoots(),
): LocalSkillSummary[] {
  const found = new Map<string, LocalSkillSummary>();
  for (const root of roots) {
    const walk = (dir: string, depth: number) => {
      if (depth > MAX_DIR_DEPTH) return;
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return; // root/dir absent — normal
      }
      const skillMd = entries.find((e) => e.isFile() && e.name === "SKILL.md");
      if (skillMd && dir !== root.path) {
        const key = path.relative(root.path, dir).split(path.sep).join("/");
        if (!found.has(key)) {
          const sourcePath = path.join(dir, "SKILL.md");
          try {
            if (fs.statSync(sourcePath).size <= MAX_SKILL_MD_BYTES) {
              const { frontmatter } = parseSkillFrontmatter(fs.readFileSync(sourcePath, "utf8"));
              found.set(key, {
                key,
                name: frontmatter.name ?? path.basename(dir),
                description: frontmatter.description ?? "",
                sourcePath,
                provider: root.provider,
                root: root.kind,
                fileCount: countFiles(dir),
              });
            }
          } catch {
            // unreadable skill — skip
          }
        }
        return; // a skill dir doesn't nest further skills
      }
      for (const e of entries) {
        if (e.isDirectory()) walk(path.join(dir, e.name), depth + 1);
      }
    };
    walk(root.path, 0);
  }
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Read one discovered skill for import. The sourcePath MUST live inside a
 * known root — this is the trust boundary that keeps the import endpoint from
 * becoming an arbitrary-file read.
 */
export function readLocalSkill(
  sourcePath: string,
  roots: LocalSkillRoot[] = defaultLocalSkillRoots(),
): { name: string; description: string; content: string } {
  const resolved = path.resolve(sourcePath);
  const inRoot = roots.some((r) => {
    const rel = path.relative(path.resolve(r.path), resolved);
    return rel && !rel.startsWith("..") && !path.isAbsolute(rel);
  });
  if (!inRoot || path.basename(resolved) !== "SKILL.md") {
    throw new Error("sourcePath is not a SKILL.md inside a known runtime skill directory");
  }
  const stat = fs.statSync(resolved);
  if (stat.size > MAX_SKILL_MD_BYTES) throw new Error("SKILL.md exceeds the 1 MB import cap");
  const raw = fs.readFileSync(resolved, "utf8");
  const { frontmatter, body } = parseSkillFrontmatter(raw);
  return {
    name: frontmatter.name ?? path.basename(path.dirname(resolved)),
    description: frontmatter.description ?? "",
    content: body.trim(),
  };
}

const MAX_BUNDLE_BYTES = 8 << 20; // 8 MB total, matches Multica

/** Cheap binary sniff: a NUL byte in the first 8KB means "not text — skip". */
function isBinary(buf: Buffer): boolean {
  const probe = buf.subarray(0, 8192);
  return probe.includes(0);
}

export interface LocalSkillBundle {
  name: string;
  description: string;
  content: string;
  /** Supporting files (relative paths, forward slashes), SKILL.md excluded. */
  files: { path: string; content: string }[];
  /** Files skipped for being binary or over the per-file/bundle caps. */
  skipped: number;
}

/**
 * Read a discovered skill INCLUDING its supporting files — the full bundle a
 * Multica import carries. Same trust boundary as readLocalSkill; caps mirror
 * Multica's (128 files, 1 MB/file, 8 MB bundle); binary files are skipped.
 */
export function readLocalSkillBundle(
  sourcePath: string,
  roots: LocalSkillRoot[] = defaultLocalSkillRoots(),
): LocalSkillBundle {
  const base = readLocalSkill(sourcePath, roots);
  const skillDir = path.dirname(path.resolve(sourcePath));
  const files: { path: string; content: string }[] = [];
  let skipped = 0;
  let bundleBytes = 0;
  const walk = (dir: string, depth: number) => {
    if (depth > MAX_DIR_DEPTH) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        walk(full, depth + 1);
        continue;
      }
      if (!e.isFile()) continue;
      const rel = path.relative(skillDir, full).split(path.sep).join("/");
      if (rel === "SKILL.md") continue; // carried as `content`
      if (files.length >= MAX_FILE_COUNT) {
        skipped++;
        continue;
      }
      try {
        const stat = fs.statSync(full);
        if (stat.size > MAX_SKILL_MD_BYTES || bundleBytes + stat.size > MAX_BUNDLE_BYTES) {
          skipped++;
          continue;
        }
        const buf = fs.readFileSync(full);
        if (isBinary(buf)) {
          skipped++;
          continue;
        }
        bundleBytes += stat.size;
        files.push({ path: rel, content: buf.toString("utf8") });
      } catch {
        skipped++;
      }
    }
  };
  walk(skillDir, 0);
  return { ...base, files, skipped };
}

// ── Import from URL (ClawHub / skills.sh / GitHub / any raw SKILL.md) ──────

const MAX_URL_BYTES = 1 << 20;
const FETCH_TIMEOUT_MS = 15_000;

/** GitHub blob URLs → raw content; everything else passes through. */
export function normalizeSkillUrl(input: string): string {
  const url = new URL(input);
  if (url.hostname === "github.com") {
    const m = /^\/([^/]+)\/([^/]+)\/blob\/(.+)$/.exec(url.pathname);
    if (m) return `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}`;
  }
  return url.toString();
}

function assertFetchableUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("invalid URL");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("only http(s) URLs can be imported");
  }
  const host = url.hostname.toLowerCase();
  // The core listens on loopback with bearer auth; never let a skill import
  // point back at it (or anything else machine-local).
  if (host === "localhost" || host === "::1" || /^127\./.test(host) || host === "0.0.0.0") {
    throw new Error("refusing to fetch from a local address");
  }
  return url;
}

export async function fetchSkillFromUrl(
  input: string,
): Promise<{ name: string; description: string; content: string; sourceUrl: string }> {
  const normalized = normalizeSkillUrl(assertFetchableUrl(input).toString());
  assertFetchableUrl(normalized);
  const res = await fetch(normalized, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { Accept: "text/plain, text/markdown, */*" },
  });
  if (!res.ok) throw new Error(`fetch failed (${res.status}) for ${normalized}`);
  const raw = await res.text();
  if (raw.length > MAX_URL_BYTES) throw new Error("fetched skill exceeds the 1 MB import cap");
  if (/^\s*[<{]/.test(raw)) {
    throw new Error(
      "the URL did not return Markdown — link the raw SKILL.md file (for GitHub, the blob or raw URL)",
    );
  }
  const { frontmatter, body } = parseSkillFrontmatter(raw);
  const fallbackName = decodeURIComponent(
    new URL(normalized).pathname
      .split("/")
      .filter(Boolean)
      .filter((seg) => seg.toLowerCase() !== "skill.md")
      .pop() ?? "imported-skill",
  ).replace(/\.md$/i, "");
  return {
    name: frontmatter.name ?? fallbackName,
    description: frontmatter.description ?? "",
    content: body.trim(),
    sourceUrl: normalized,
  };
}
