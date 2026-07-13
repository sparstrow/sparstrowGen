import { Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { Markdown } from "@/components/chat/markdown";
import {
  KNOWLEDGE_ARTICLES,
  getArticle,
  groupBySection,
} from "@/lib/knowledge";

export function KnowledgeArticlePage() {
  const { articleId } = useParams({ strict: false }) as { articleId: string };
  const article = getArticle(articleId);

  if (!article) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-3 rounded-lg border border-dashed p-10 text-center">
        <BookOpen className="size-8 text-muted-foreground/50" />
        <p className="font-medium">Tutorial not found</p>
        <p className="text-sm text-muted-foreground">
          There's no article named “{articleId}”. It may have been renamed as the
          app evolved.
        </p>
        <Link
          to="/knowledge"
          className="text-sm font-medium underline underline-offset-2"
        >
          Back to the Knowledge Center
        </Link>
      </div>
    );
  }

  const index = KNOWLEDGE_ARTICLES.findIndex((a) => a.slug === article.slug);
  const prev = index > 0 ? KNOWLEDGE_ARTICLES[index - 1] : undefined;
  const next =
    index < KNOWLEDGE_ARTICLES.length - 1
      ? KNOWLEDGE_ARTICLES[index + 1]
      : undefined;

  return (
    <div className="mx-auto flex max-w-6xl gap-8">
      {/* Article sidebar — full tutorial map, current article highlighted. */}
      <aside className="sticky top-0 hidden w-56 shrink-0 self-start lg:block">
        <Link
          to="/knowledge"
          className="mb-4 flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Knowledge Center
        </Link>
        <nav className="space-y-4">
          {groupBySection().map((group) => (
            <div key={group.section}>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {group.section}
              </p>
              <ul className="space-y-0.5">
                {group.articles.map((a) => (
                  <li key={a.slug}>
                    <Link
                      to="/knowledge/$articleId"
                      params={{ articleId: a.slug }}
                      className={cn(
                        "block rounded-md px-2 py-1 text-sm transition-colors",
                        a.slug === article.slug
                          ? "bg-muted font-medium text-foreground"
                          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                      )}
                    >
                      {a.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      <article className="min-w-0 flex-1 pb-10">
        <Link
          to="/knowledge"
          className="mb-3 flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground lg:hidden"
        >
          <ArrowLeft className="size-3.5" />
          Knowledge Center
        </Link>
        <div className="mb-6 space-y-1.5 border-b pb-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {article.section}
          </p>
          <h2 className="text-xl font-semibold tracking-tight">{article.title}</h2>
          {article.updated ? (
            <p className="text-xs text-muted-foreground">Updated {article.updated}</p>
          ) : null}
        </div>

        <Markdown content={article.body} />

        <div className="mt-10 flex items-stretch justify-between gap-3 border-t pt-5">
          {prev ? (
            <Link
              to="/knowledge/$articleId"
              params={{ articleId: prev.slug }}
              className="group flex max-w-[45%] items-center gap-2 rounded-lg border p-3 text-sm transition-colors hover:bg-muted/40"
            >
              <ArrowLeft className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0">
                <span className="block text-xs text-muted-foreground">Previous</span>
                <span className="block truncate font-medium">{prev.title}</span>
              </span>
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link
              to="/knowledge/$articleId"
              params={{ articleId: next.slug }}
              className="group ml-auto flex max-w-[45%] items-center gap-2 rounded-lg border p-3 text-right text-sm transition-colors hover:bg-muted/40"
            >
              <span className="min-w-0">
                <span className="block text-xs text-muted-foreground">Next</span>
                <span className="block truncate font-medium">{next.title}</span>
              </span>
              <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          ) : null}
        </div>
      </article>
    </div>
  );
}
