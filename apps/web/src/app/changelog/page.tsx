import React from "react";
import { History } from "lucide-react";
import { PageContainer } from "@sparstrow/ui/components/layout/page-container";
import { Badge } from "@sparstrow/ui/components/ui/badge";
import { Markdown } from "@web/components/chat/markdown";
import { getAllChangelogEntries, type ChangelogEntry } from "@web/lib/changelog.server";

export const metadata = {
  title: "Changelog · Sparstrowgen",
};

function monthLabel(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

function groupByMonth(entries: ChangelogEntry[]): Array<{ month: string; entries: ChangelogEntry[] }> {
  const groups: Array<{ month: string; entries: ChangelogEntry[] }> = [];
  for (const entry of entries) {
    const month = monthLabel(entry.date);
    const last = groups[groups.length - 1];
    if (last && last.month === month) last.entries.push(entry);
    else groups.push({ month, entries: [entry] });
  }
  return groups;
}

/**
 * One page, both channels — a staging entry is what you'll see land on
 * stable next, not a separate feed. The desktop update-ready banner
 * (`update-banner.tsx`) deep-links here as `/changelog#v<version>`.
 */
export default function ChangelogPage() {
  const entries = getAllChangelogEntries();
  const groups = groupByMonth(entries);

  return (
    <PageContainer size="md" className="space-y-8">
      <div className="space-y-3">
        <div className="flex items-center gap-2.5">
          <History className="size-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold tracking-tight">Changelog</h2>
        </div>
        <p className="max-w-2xl text-sm text-muted-foreground">
          What shipped, release by release. Staging entries land here first — they're what's
          coming to the stable app next, not a separate track.
        </p>
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">No releases recorded yet.</p>
      ) : (
        <div className="space-y-10">
          {groups.map((group) => (
            <section key={group.month} className="space-y-6">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {group.month}
              </h3>
              <div className="space-y-8">
                {group.entries.map((entry) => (
                  <article
                    key={entry.version}
                    id={`v${entry.version}`}
                    className="scroll-mt-20 space-y-2 border-b pb-8 last:border-b-0"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-mono text-sm font-semibold">v{entry.version}</h4>
                      <Badge variant={entry.channel === "stable" ? "success" : "secondary"}>
                        {entry.channel}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{entry.date}</span>
                    </div>
                    <p className="text-sm font-medium">{entry.title}</p>
                    <Markdown content={entry.body} />
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
