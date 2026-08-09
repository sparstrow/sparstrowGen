"use client";

import * as React from "react";
import Link from "next/link";
import { BookOpen, Search, X } from "lucide-react";
import { Input } from "@sparstrow/ui/components/ui/input";
import { PageContainer } from "@sparstrow/ui/components/layout/page-container";
import {
  KNOWLEDGE_ARTICLES,
  groupBySection,
  type KnowledgeArticle,
} from "@sparstrow/ui/lib/knowledge";

function matches(article: KnowledgeArticle, needle: string): boolean {
  const q = needle.toLowerCase();
  return (
    article.title.toLowerCase().includes(q) ||
    article.description.toLowerCase().includes(q) ||
    article.body.toLowerCase().includes(q)
  );
}

export default function KnowledgePage() {
  const [query, setQuery] = React.useState("");
  const trimmed = query.trim();
  const filtered = trimmed
    ? KNOWLEDGE_ARTICLES.filter((a) => matches(a, trimmed))
    : KNOWLEDGE_ARTICLES;
  const groups = groupBySection(filtered);

  return (
    <PageContainer size="md" className="space-y-8">
      <div className="space-y-3">
        <div className="flex items-center gap-2.5">
          <BookOpen className="size-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold tracking-tight">Knowledge Center</h2>
        </div>
        <p className="max-w-2xl text-sm text-muted-foreground">
          How to use Sparstrowgen — every surface, workflow, and concept as a short
          tutorial. Docs are updated in the same PR as the features they describe, so
          what you read here matches the app you're running.
        </p>
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tutorials…"
            className="pl-8 pr-8"
            aria-label="Search tutorials"
          />
          {trimmed ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No tutorials match “{trimmed}”.{" "}
          <button
            type="button"
            onClick={() => setQuery("")}
            className="font-medium text-foreground underline underline-offset-2"
          >
            Clear the search
          </button>
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.section} className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {group.section}
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {group.articles.map((article) => (
                <Link
                  key={article.slug}
                  href={`/knowledge/${article.slug}`}
                  className="group rounded-lg border p-4 transition-colors hover:border-foreground/25 hover:bg-muted/40"
                >
                  <p className="font-medium leading-snug group-hover:underline group-hover:underline-offset-2">
                    {article.title}
                  </p>
                  {article.description ? (
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {article.description}
                    </p>
                  ) : null}
                </Link>
              ))}
            </div>
          </section>
        ))
      )}
    </PageContainer>
  );
}
