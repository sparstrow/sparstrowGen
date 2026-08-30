import fs from "node:fs";
import path from "node:path";

export interface ChangelogEntry {
  /** e.g. "0.3.0" or "0.3.0-staging.42" — matches the version electron-updater compares against. */
  version: string;
  date: string;
  /** Which desktop channel this entry shipped on — see doc/plans (two-channel desktop release). */
  channel: "stable" | "staging";
  title: string;
  body: string;
}

/**
 * Same file-based, server-only pattern as `knowledge.server.ts` — content is
 * authored markdown in the repo, not a database table. A release doesn't need
 * its own write path or RLS policy; it needs a person to write what changed.
 */
function getChangelogDir() {
  const candidates = [
    path.resolve(process.cwd(), "apps/web/src/content/changelog"),
    path.resolve(process.cwd(), "src/content/changelog"),
    path.resolve(process.cwd(), "../../apps/web/src/content/changelog"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0]!;
}

function parseFrontmatter(source: string): { meta: Record<string, string>; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source);
  if (!match) return { meta: {}, body: source };
  const meta: Record<string, string> = {};
  for (const line of (match[1] ?? "").split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key) meta[key] = value;
  }
  return { meta, body: source.slice(match[0].length) };
}

/** Newest first by release date — matches the changelog's own display order. */
export function getAllChangelogEntries(): ChangelogEntry[] {
  const dir = getChangelogDir();
  if (!fs.existsSync(dir)) return [];

  const entries: ChangelogEntry[] = [];
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".md"))) {
    const source = fs.readFileSync(path.join(dir, file), "utf-8");
    const { meta, body } = parseFrontmatter(source);
    if (!meta.version || !meta.date) continue; // malformed entry — skip rather than crash the page
    entries.push({
      version: meta.version,
      date: meta.date,
      channel: meta.channel === "staging" ? "staging" : "stable",
      title: meta.title || `v${meta.version}`,
      body,
    });
  }

  entries.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return entries;
}
