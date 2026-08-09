import React from "react";
import { BookOpen } from "lucide-react";
import { PageContainer } from "@sparstrow/ui/components/layout/page-container";
import { getAllArticles } from "@web/lib/knowledge.server";
import { KnowledgeSearch } from "./knowledge-search";

export default function KnowledgePage() {
  const articles = getAllArticles();

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
      </div>

      <KnowledgeSearch articles={articles} />
    </PageContainer>
  );
}
