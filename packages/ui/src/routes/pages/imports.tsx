import * as React from "react";
import { Download, Loader2, ShieldAlert, ShieldCheck, ShieldX } from "lucide-react";
import type { Agent, SkillImport, SkillImportStatus, SpecterReport, SpecterVerdict } from "@sparstrow/shared";
import { renderSkillMd } from "@sparstrow/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  useDiscardAgent,
  usePromoteAgent,
  useSkillImportDetail,
  useSkillImports,
  useStartSkillImport,
} from "@/api/hooks";

function repoLabel(url: string): string {
  return (
    url
      .replace(/\.git$/i, "")
      .split(/[/\\]/)
      .filter(Boolean)
      .slice(-2)
      .join("/") || url
  );
}

const STATUS_LABEL: Record<SkillImportStatus, string> = {
  cloning: "Cloning repo",
  extracting: "Extracting skills",
  reviewing: "Specter reviewing",
  ready: "Ready",
  failed: "Failed",
};

function ImportStatusBadge({ status }: { status: SkillImportStatus }) {
  const tone =
    status === "ready"
      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
      : status === "failed"
        ? "bg-red-500/10 text-red-600 dark:text-red-400"
        : "bg-amber-500/10 text-amber-600 dark:text-amber-400";
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", tone)}>
      {status !== "ready" && status !== "failed" && <Loader2 className="size-3 animate-spin" />}
      {STATUS_LABEL[status]}
    </span>
  );
}

const VERDICT: Record<SpecterVerdict, { label: string; tone: string; Icon: typeof ShieldCheck }> = {
  pass: { label: "Pass", tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", Icon: ShieldCheck },
  flag: { label: "Flag", tone: "bg-amber-500/10 text-amber-600 dark:text-amber-400", Icon: ShieldAlert },
  block: { label: "Block", tone: "bg-red-500/10 text-red-600 dark:text-red-400", Icon: ShieldX },
};

function VerdictBadge({ verdict }: { verdict: SpecterVerdict }) {
  const { label, tone, Icon } = VERDICT[verdict];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", tone)}>
      <Icon className="size-3.5" /> {label}
    </span>
  );
}

function SpecterReportView({ report }: { report: SpecterReport }) {
  return (
    <div className="space-y-2 rounded-md border bg-muted/30 p-3 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-foreground">Skill Specter review</span>
        {!report.llmReviewed && (
          <span className="text-muted-foreground">static heuristics only (LLM review unavailable)</span>
        )}
      </div>
      {report.summary && <p className="text-muted-foreground">{report.summary}</p>}
      {report.staticFlags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {report.staticFlags.map((f) => (
            <span key={f} className="rounded bg-red-500/10 px-1.5 py-0.5 font-mono text-[10px] text-red-600 dark:text-red-400">
              {f}
            </span>
          ))}
        </div>
      )}
      {report.findings.length > 0 && (
        <ul className="space-y-1">
          {report.findings.map((f, i) => (
            <li key={i} className="flex gap-1.5">
              <span
                className={cn(
                  "mt-0.5 h-fit rounded px-1 text-[10px] font-semibold uppercase",
                  f.severity === "critical"
                    ? "bg-red-500/15 text-red-600 dark:text-red-400"
                    : f.severity === "warn"
                      ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {f.severity}
              </span>
              <span className="text-muted-foreground">
                <span className="font-medium text-foreground">{f.category}:</span> {f.detail}
              </span>
            </li>
          ))}
        </ul>
      )}
      {report.suggestedModifications.length > 0 && (
        <div>
          <div className="font-medium text-foreground">Suggested modifications</div>
          <ul className="list-inside list-disc text-muted-foreground">
            {report.suggestedModifications.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function DraftCard({ draft }: { draft: Agent }) {
  const promote = usePromoteAgent();
  const discard = useDiscardAgent();
  const [showSkill, setShowSkill] = React.useState(false);
  const [promoting, setPromoting] = React.useState(false);
  const [tools, setTools] = React.useState("");
  const [ack, setAck] = React.useState(false);

  if (draft.status === "active") {
    return (
      <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3 text-sm">
        <span className="font-medium">{draft.name}</span> — promoted &amp; enabled.
      </div>
    );
  }
  if (draft.status === "discarded") {
    return (
      <div className="rounded-lg border p-3 text-sm text-muted-foreground">
        <span className="font-medium text-foreground line-through">{draft.name}</span> — discarded.
      </div>
    );
  }

  const doPromote = () => {
    if (!ack) return;
    promote.mutate({
      id: draft.id,
      data: {
        allowedTools: tools.split(",").map((t) => t.trim()).filter(Boolean),
        disallowedTools: [],
        memoryReadScopes: [],
        memoryWriteScopes: [],
        acknowledgedReadSkill: true,
      },
    });
  };

  const report = draft.specterReport;
  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium">{draft.name}</div>
          {draft.role && <div className="text-xs text-muted-foreground">{draft.role}</div>}
        </div>
        {report && <VerdictBadge verdict={report.verdict} />}
      </div>

      {report && <SpecterReportView report={report} />}

      <div>
        <button
          onClick={() => setShowSkill((s) => !s)}
          className="text-xs font-medium text-primary hover:underline"
        >
          {showSkill ? "Hide" : "Show"} raw SKILL.md
        </button>
        {showSkill && (
          <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-xs">
            {renderSkillMd(draft)}
          </pre>
        )}
      </div>

      {!promoting ? (
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setPromoting(true)}>
            Promote…
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => discard.mutate(draft.id)}
            disabled={discard.isPending}
          >
            Discard
          </Button>
        </div>
      ) : (
        <div className="space-y-2 rounded-md border p-3">
          {report?.verdict === "block" && (
            <p className="rounded bg-red-500/10 px-2 py-1 text-xs text-red-600 dark:text-red-400">
              Specter flagged this as <strong>block</strong>. Promote only if you understand the risk.
            </p>
          )}
          <label className="block text-xs font-medium">
            Grant tools (comma-separated — wildcards and Bash(*) are stripped server-side)
          </label>
          <Input value={tools} onChange={(e) => setTools(e.target.value)} placeholder="Read, Glob, Grep" />
          <label className="flex items-start gap-2 text-xs">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
            />
            I have read the raw SKILL.md above and accept the Specter review.
          </label>
          <div className="flex gap-2">
            <Button size="sm" onClick={doPromote} disabled={!ack || promote.isPending}>
              Enable agent
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPromoting(false)}>
              Cancel
            </Button>
          </div>
          {promote.error && <p className="text-xs text-destructive">{promote.error.message}</p>}
        </div>
      )}
    </div>
  );
}

function ImportDetail({ id }: { id: string }) {
  const detail = useSkillImportDetail(id);
  if (detail.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!detail.data) return <p className="text-sm text-destructive">Import not found.</p>;
  const { import: imp, drafts } = detail.data;

  if (imp.status === "failed") {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
        Import failed: {imp.error ?? "unknown error"}
      </div>
    );
  }
  if (imp.status !== "ready") {
    return (
      <div className="rounded-md border p-4 text-sm">
        <div className="flex items-center gap-2 text-foreground">
          <Loader2 className="size-4 animate-spin" /> {STATUS_LABEL[imp.status]}…
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Core is cloning the repo into a sandbox, reconstructing its skills read-only, and running
          the Skill Specter. This can take a minute.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {drafts.length === 0 ? (
        <p className="text-sm text-muted-foreground">No skills were found in this repository.</p>
      ) : (
        drafts.map((d) => <DraftCard key={d.id} draft={d} />)
      )}
    </div>
  );
}

export function ImportsPage() {
  const imports = useSkillImports();
  const start = useStartSkillImport();
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [url, setUrl] = React.useState("");

  React.useEffect(() => {
    if (!selectedId && imports.data && imports.data.length > 0) {
      setSelectedId(imports.data[0]!.id);
    }
  }, [imports.data, selectedId]);

  const submit = () => {
    const sourceUrl = url.trim();
    if (!sourceUrl) return;
    start.mutate(
      { sourceUrl },
      {
        onSuccess: (imp: SkillImport) => {
          setUrl("");
          setSelectedId(imp.id);
        },
      },
    );
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Skill Imports</h2>
        <p className="text-sm text-muted-foreground">
          Ingest external agents/skills through a security quarantine. Core clones the repo into a
          sandbox, reconstructs each skill as a disabled draft with no tools, and the Skill Specter
          reviews it — you promote only after reading the SKILL.md.
        </p>
      </div>

      <div className="space-y-1">
        <div className="flex gap-2">
          <Input
            placeholder="https://github.com/owner/repo(.git)"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
          />
          <Button onClick={submit} disabled={start.isPending || !url.trim()}>
            <Download className="size-4" /> Import
          </Button>
        </div>
        {start.error && <p className="text-xs text-destructive">Import failed: {start.error.message}</p>}
      </div>

      <div className="grid grid-cols-[minmax(220px,260px)_1fr] gap-4">
        <div className="space-y-1">
          {imports.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {imports.data?.length === 0 && (
            <p className="text-sm text-muted-foreground">No imports yet.</p>
          )}
          {imports.data?.map((imp) => (
            <button
              key={imp.id}
              onClick={() => setSelectedId(imp.id)}
              className={cn(
                "w-full rounded-md border px-3 py-2 text-left text-sm transition-colors",
                selectedId === imp.id ? "bg-accent" : "hover:bg-accent/50",
              )}
            >
              <div className="truncate font-medium">{repoLabel(imp.sourceUrl)}</div>
              <div className="mt-1 flex items-center gap-2">
                <ImportStatusBadge status={imp.status} />
                {imp.status === "ready" && (
                  <span className="text-xs text-muted-foreground">{imp.foundSkillCount} skill(s)</span>
                )}
              </div>
            </button>
          ))}
        </div>

        <div>
          {selectedId ? (
            <ImportDetail id={selectedId} />
          ) : (
            <p className="text-sm text-muted-foreground">Select an import to review its skills.</p>
          )}
        </div>
      </div>
    </div>
  );
}
