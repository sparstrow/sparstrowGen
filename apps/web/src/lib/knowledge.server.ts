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

function getKnowledgeDir() {
  const candidates = [
    path.resolve(process.cwd(), "packages/ui/src/content/knowledge"),
    path.resolve(process.cwd(), "../../packages/ui/src/content/knowledge"),
    path.resolve(process.cwd(), "../packages/ui/src/content/knowledge"),
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
