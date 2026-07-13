/**
 * Knowledge Center content registry (intake 0003).
 *
 * Tutorial articles are markdown files in `src/content/knowledge/`, bundled at
 * build time via Vite's glob-raw import — no backend, no DB. Living in the repo
 * is the point: the FACTORY-LOOP §⑤ checklist step updates the matching article
 * in the same PR as the feature it documents.
 *
 * Frontmatter (all string `key: value` lines between `---` fences):
 *   title       — display title (falls back to the filename)
 *   section     — one of SECTION_ORDER (falls back to "Reference")
 *   description — one-liner shown on index cards + search
 *   order       — sort position within its section (number; default 999)
 *   updated     — YYYY-MM-DD of the last meaningful content update
 */

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

const files = import.meta.glob("../content/knowledge/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/** Minimal frontmatter split — a malformed block degrades to "no frontmatter". */
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

function buildRegistry(): KnowledgeArticle[] {
  const articles: KnowledgeArticle[] = [];
  for (const [path, source] of Object.entries(files)) {
    const slug = (path.split("/").pop() ?? path).replace(/\.md$/, "");
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

/** All articles, section-ordered then order-ordered. Computed once per bundle. */
export const KNOWLEDGE_ARTICLES: KnowledgeArticle[] = buildRegistry();

export function getArticle(slug: string): KnowledgeArticle | undefined {
  return KNOWLEDGE_ARTICLES.find((a) => a.slug === slug);
}

/** Section → articles, preserving global order. Sections without articles are omitted. */
export function groupBySection(
  articles: KnowledgeArticle[] = KNOWLEDGE_ARTICLES,
): Array<{ section: string; articles: KnowledgeArticle[] }> {
  const groups: Array<{ section: string; articles: KnowledgeArticle[] }> = [];
  for (const article of articles) {
    const last = groups[groups.length - 1];
    if (last && last.section === article.section) last.articles.push(article);
    else groups.push({ section: article.section, articles: [article] });
  }
  return groups;
}
