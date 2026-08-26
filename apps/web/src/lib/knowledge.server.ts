import fs from "node:fs";
import path from "node:path";

export interface KnowledgeArticle {
  slug: string;
  title: string;
  section: string;
  description: string;
  order: number;
  updated: string;
  body: string;
}

export const SECTION_ORDER = [
  "Getting started",
  "Surfaces",
  "Concepts",
  "Reference",
] as const;

/**
 * T-VR-07: the content moved from `packages/ui/src/content/knowledge` into
 * `apps/web/src/content/knowledge` alongside this file, closing a stale
 * cross-package fs reference. `process.cwd()` still varies with where the
 * process was launched from (repo root vs. `apps/web`, dev vs. build), which
 * is why this stays multi-candidate rather than collapsing to one path.
 */
function getKnowledgeDir() {
  const candidates = [
    path.resolve(process.cwd(), "apps/web/src/content/knowledge"),
    path.resolve(process.cwd(), "src/content/knowledge"),
    path.resolve(process.cwd(), "../../apps/web/src/content/knowledge"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0]!;
}

function parseFrontmatter(source: string): {
  meta: Record<string, string>;
  body: string;
} {
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

function titleFromSlug(slug: string): string {
  return slug
    .split("-")
    .map((w) => (w ? w[0]?.toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export interface KnowledgeIndexEntry {
  slug: string;
  title: string;
}

/**
 * `{slug, title}` only, for the two CLIENT components (`breadcrumbs.tsx`,
 * `tab-strip.tsx`) that need to show an article's real title instead of its
 * raw slug. They cannot import this file's `fs` reads directly — Client
 * Components cannot bundle `node:fs` — so `RootLayout` reads this once,
 * server-side, and passes it down as a prop. Small and static enough
 * (repo content, not user data) that this beats a second API route and a
 * second client-side fetch for the same lookup.
 *
 * Replaces `packages/ui/src/lib/knowledge.ts`, deleted in `T-VR-07` —
 * see `BUG-2026-08-24-knowledge-breadcrumb-title-silently-blank.md`. That
 * file built its registry with Vite's `import.meta.glob`, which Turbopack
 * silently no-ops rather than erroring on, so its `getArticle()` had
 * returned `undefined` on every call since the Vite host was deleted.
 */
export function getKnowledgeIndex(): KnowledgeIndexEntry[] {
  return getAllArticles().map(({ slug, title }) => ({ slug, title }));
}

export function getAllArticles(): KnowledgeArticle[] {
  const dir = getKnowledgeDir();
  if (!fs.existsSync(dir)) return [];

  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
  const articles: KnowledgeArticle[] = [];

  for (const file of files) {
    const slug = file.replace(/\.md$/, "");
    const fullPath = path.join(dir, file);
    const source = fs.readFileSync(fullPath, "utf-8");
    const { meta, body } = parseFrontmatter(source);
    const order = Number(meta["order"]);

    articles.push({
      slug,
      title: meta["title"] || titleFromSlug(slug),
      section: meta["section"] || "Reference",
      description: meta["description"] || "",
      order: Number.isFinite(order) ? order : 999,
      updated: meta["updated"] || "",
      body,
    });
  }

  const sectionRank = (s: string) => {
    const i = (SECTION_ORDER as readonly string[]).indexOf(s);
    return i === -1 ? SECTION_ORDER.length : i;
  };

  articles.sort(
    (a, b) =>
      sectionRank(a.section) - sectionRank(b.section) ||
      a.order - b.order ||
      a.title.localeCompare(b.title),
  );

  return articles;
}

export function getArticleBySlug(slug: string): KnowledgeArticle | undefined {
  const target = decodeURIComponent(slug).toLowerCase();
  return getAllArticles().find((a) => a.slug.toLowerCase() === target);
}

export function groupBySectionServer(
  articles: KnowledgeArticle[] = getAllArticles(),
): Array<{ section: string; articles: KnowledgeArticle[] }> {
  const groups: Array<{ section: string; articles: KnowledgeArticle[] }> = [];
  for (const article of articles) {
    const last = groups[groups.length - 1];
    if (last && last.section === article.section) last.articles.push(article);
    else groups.push({ section: article.section, articles: [article] });
  }
  return groups;
}
