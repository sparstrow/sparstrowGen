import * as React from "react";
import { Link } from "@tanstack/react-router";
import { AlertCircle, CheckCircle2, ClipboardCheck } from "lucide-react";
import type { TaskQuestion } from "@sparstrow/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useAgents, useAnswerTask, useAttentionQueue, type AttentionRow } from "@/api/hooks";

function ageLabel(ms: number): string {
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** One blocked task: the agent's progress note + a labeled field per open question. */
function QuestionCard({ row, agentName }: { row: AttentionRow; agentName: string }) {
  const answer = useAnswerTask();
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});
  const [deferred, setDeferred] = React.useState<string | null>(null);

  const open = row.questions;
  const allAnswered = open.every((q) => (drafts[q.id] ?? "").trim().length > 0);

  function submit() {
    setDeferred(null);
    answer.mutate(
      { taskId: row.task.id, answers: open.map((q) => ({ questionId: q.id, answer: drafts[q.id]!.trim() })) },
      { onSuccess: (res) => { if (!res.applied) setDeferred(res.reason ?? "run still active — answer saved"); } },
    );
  }

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to="/tasks" className="text-sm font-semibold hover:underline">
            {row.task.title}
          </Link>
          <p className="text-xs text-muted-foreground">
            {agentName} · asked {ageLabel(row.ageMs)}
          </p>
        </div>
        <Badge variant="outline" className="border-amber-500/40 text-amber-600 dark:text-amber-400">
          blocked
        </Badge>
      </div>

      {row.task.result ? (
        <p className="mt-2 rounded border bg-background/60 px-2 py-1.5 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Progress so far: </span>
          {row.task.result}
        </p>
      ) : null}

      <div className="mt-3 space-y-3">
        {open.map((q: TaskQuestion, i) => (
          <div key={q.id} className="space-y-1.5">
            <p className="text-sm font-medium">
              {open.length > 1 ? `${i + 1}. ` : ""}
              {q.question}
            </p>
            {q.whyBlocked ? <p className="text-xs text-muted-foreground">{q.whyBlocked}</p> : null}
            {q.options && q.options.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {q.options.map((opt) => (
                  <Button
                    key={opt}
                    type="button"
                    size="sm"
                    variant={drafts[q.id] === opt ? "default" : "outline"}
                    onClick={() => setDrafts((d) => ({ ...d, [q.id]: opt }))}
                  >
                    {opt}
                    {q.recommendation === opt ? " ★" : ""}
                  </Button>
                ))}
              </div>
            ) : null}
            <Textarea
              rows={2}
              placeholder={q.recommendation ? `Recommended: ${q.recommendation}` : "Your answer…"}
              value={drafts[q.id] ?? ""}
              onChange={(e) => setDrafts((d) => ({ ...d, [q.id]: e.target.value }))}
            />
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-3">
        <Button size="sm" disabled={!allAnswered || answer.isPending} onClick={submit}>
          {answer.isPending ? "Waking…" : "Answer & wake"}
        </Button>
        {deferred ? (
          <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
            <AlertCircle className="size-3.5" /> {deferred}
          </span>
        ) : null}
        {answer.isError ? (
          <span className="text-xs text-destructive">{answer.error.message}</span>
        ) : null}
      </div>
    </div>
  );
}

function ReviewRow({ row }: { row: AttentionRow }) {
  return (
    <Link
      to="/tasks"
      className="flex items-center justify-between rounded-lg border px-3 py-2 transition-colors hover:bg-accent"
    >
      <div className="flex items-center gap-2">
        <ClipboardCheck className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">{row.task.title}</span>
      </div>
      <Badge variant="secondary">ready for review</Badge>
    </Link>
  );
}

export function AttentionQueue() {
  const queue = useAttentionQueue();
  const agents = useAgents();
  const agentName = (id: string | null) =>
    (id && agents.data?.find((a) => a.id === id)?.name) || "unassigned";

  const rows = queue.data ?? [];

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm">Human Attention Required</CardTitle>
        {rows.length > 0 ? <Badge variant="secondary">{rows.length}</Badge> : null}
      </CardHeader>
      <CardContent className="space-y-2">
        {queue.isLoading ? (
          <>
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 py-6 text-center">
            <CheckCircle2 className="size-6 text-emerald-500" />
            <p className="text-sm font-medium">All clear</p>
            <p className="text-xs text-muted-foreground">
              No agents are waiting on you. Blocked work and reviews land here.
            </p>
          </div>
        ) : (
          rows.map((row) =>
            row.type === "question" ? (
              <QuestionCard key={row.task.id} row={row} agentName={agentName(row.task.assignedAgentId)} />
            ) : (
              <ReviewRow key={row.task.id} row={row} />
            ),
          )
        )}
      </CardContent>
    </Card>
  );
}
