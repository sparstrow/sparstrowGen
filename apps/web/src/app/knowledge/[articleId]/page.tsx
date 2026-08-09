import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, BookOpen } from "lucide-react";
import { cn } from "@sparstrow/ui/lib/utils";
import { Markdown } from "@sparstrow/ui/components/chat/markdown";
import {
  getAllArticles,
  getArticleBySlug,
  groupBySectionServer,
} from "@web/lib/knowledge.server";

export async function generateStaticParams() {
  const articles = getAllArticles();
  return articles.map((article) => ({
    articleId: article.slug,
  }));
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ articleId: string }>;
}) {
  const { articleId } = await params;
  const article = getArticleBySlug(articleId);

  if (!article) {
    notFound();
  }

  const articles = getAllArticles();
  const index = articles.findIndex((a) => a.slug === article.slug);
  const prev = index > 0 ? articles[index - 1] : undefined;
  const next = index < articles.length - 1 ? articles[index + 1] : undefined;
  const groups = groupBySectionServer(articles);

  return (
    <div className="mx-auto flex max-w-6xl gap-8">
      {/* Article sidebar — full tutorial map, current article highlighted. */}
      <aside className="sticky top-0 hidden w-56 shrink-0 self-start lg:block">
        <Link
          href="/knowledge"
          className="mb-4 flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Knowledge Center
        </Link>
        <nav className="space-y-4">
          {groups.map((group) => (
            <div key={group.section}>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {group.section}
              </p>
              <ul className="space-y-0.5">
                {group.articles.map((a) => (
                  <li key={a.slug}>
                    <Link
                      href={`/knowledge/${a.slug}`}
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
          href="/knowledge"
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
              href={`/knowledge/${prev.slug}`}
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
              href={`/knowledge/${next.slug}`}
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
