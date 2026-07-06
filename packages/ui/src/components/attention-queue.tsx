import * as React from "react";
import { Link } from "@tanstack/react-router";
import { AlertCircle, ArrowRightLeft, CheckCircle2, ClipboardCheck, GitCompareArrows, ShieldCheck } from "lucide-react";
import type { Task, TaskQuestion } from "@sparstrow/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  useAgents,
  useAnswerTask,
  useApproveTask,
  useAttentionQueue,
  useDenyTask,
  useResolveContradiction,
  type AttentionRow,
} from "@/api/hooks";

/** Task-backed rows (question/approval/review) always carry a task; the P5
 *  contradiction row is the task-null variant. */
type TaskAttentionRow = AttentionRow & { task: Task };

function ageLabel(ms: number): string {
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** One blocked task: the agent's progress note + a labeled field per open question. */
function QuestionCard({ row, agentName }: { row: TaskAttentionRow; agentName: string }) {
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

/**
 * A cross-team spawn awaiting the owner (P3-Q2). EM3: the verbatim agent-authored
 * description IS the primary content — it is the prompt-injection carrier, so the
 * owner reads exactly what the child agent would receive, plus the exact tool
 * bound it would run under.
 */
function ApprovalCard({ row }: { row: TaskAttentionRow }) {
  const approve = useApproveTask();
  const deny = useDenyTask();
  const [denying, setDenying] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const a = row.approval!;

  return (
    <div className="rounded-lg border border-sky-500/30 bg-sky-500/5 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <ArrowRightLeft className="size-3.5 shrink-0 text-sky-500" />
            {a.delegatedByAgentName ?? "An agent"} → {a.targetAgentName ?? "unknown agent"}
            <span className="font-normal text-muted-foreground">(cross-team)</span>
          </p>
          <p className="text-xs text-muted-foreground">
            {a.parentTaskTitle ? `part of "${a.parentTaskTitle}" · ` : ""}
            requested {ageLabel(row.ageMs)}
          </p>
        </div>
        <Badge variant="outline" className="border-sky-500/40 text-sky-600 dark:text-sky-400">
          approval
        </Badge>
      </div>

      <p className="mt-2 text-xs font-medium text-muted-foreground">
        Verbatim request "{row.task.title}" — written by the agent, read it as-is:
      </p>
      <p className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap rounded border bg-background/60 px-2 py-1.5 text-sm">
        {a.verbatimDescription || "(empty description)"}
      </p>

      <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="size-3.5 shrink-0" />
        {a.effectiveBound ? (
          <span>
            Would run with at most{" "}
            {a.effectiveBound.allowed.length > 0 ? (
              <span className="font-mono">{a.effectiveBound.allowed.join(", ")}</span>
            ) : (
              "the default toolset"
            )}
            {a.effectiveBound.disallowed.length > 0 && (
              <>
                {" "}— never <span className="font-mono">{a.effectiveBound.disallowed.join(", ")}</span>
              </>
            )}{" "}
            (clamped to the delegator's own limits)
          </span>
        ) : (
          <span>Tool bound: the target agent's own configured limits</span>
        )}
      </p>

      {denying ? (
        <div className="mt-3 space-y-2">
          <Textarea
            rows={2}
            autoFocus
            placeholder="Why deny? (sent to the delegating agent)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="flex items-center gap-2">
            <Button size="sm" variant="destructive" disabled={deny.isPending} onClick={() => deny.mutate({ id: row.task.id, reason: reason.trim() || undefined })}>
              {deny.isPending ? "Denying…" : "Confirm deny"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDenying(false)}>
              Back
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-2">
          <Button size="sm" disabled={approve.isPending} onClick={() => approve.mutate(row.task.id)}>
            {approve.isPending ? "Approving…" : "Approve & run"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setDenying(true)}>
            Deny
          </Button>
          {(approve.isError || deny.isError) && (
            <span className="text-xs text-destructive">
              {approve.error?.message ?? deny.error?.message}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * P5 dream-cycle contradiction flag (P5-Q3: FLAG-ONLY). The owner resolves by
 * editing/archiving one of the notes in Memory, then dismissing the flag here.
 */
function ContradictionCard({ row }: { row: AttentionRow }) {
  const resolve = useResolveContradiction();
  const c = row.contradiction!;
  return (
    <div className="rounded-lg border border-violet-500/30 bg-violet-500/5 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <GitCompareArrows className="size-3.5 shrink-0 text-violet-500" />
            Memory contradiction
            {c.projectSlug && <span className="font-normal text-muted-foreground">({c.projectSlug})</span>}
          </p>
          <p className="text-xs text-muted-foreground">
            flagged {ageLabel(row.ageMs)} · confidence {Math.round(c.confidence * 100)}% · {c.severity}
          </p>
        </div>
        <Badge variant="outline" className="border-violet-500/40 text-violet-600 dark:text-violet-400">
          contradiction
        </Badge>
      </div>
      {c.axis && <p className="mt-2 text-sm">{c.axis}</p>}
      <p className="mt-1 text-xs text-muted-foreground">
        <Link to="/memory" className="font-medium hover:underline">
          "{c.noteATitle}"
        </Link>{" "}
        vs{" "}
        <Link to="/memory" className="font-medium hover:underline">
          "{c.noteBTitle}"
        </Link>{" "}
        — open Memory to edit or archive the stale side; nothing is auto-resolved.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={resolve.isPending}
          onClick={() => resolve.mutate({ id: c.id, resolution: "dismissed by owner" })}
        >
          Dismiss flag
        </Button>
        {resolve.isError && <span className="text-xs text-destructive">{resolve.error.message}</span>}
      </div>
    </div>
  );
}

function ReviewRow({ row }: { row: TaskAttentionRow }) {
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
            row.type === "contradiction" ? (
              <ContradictionCard key={row.contradiction!.id} row={row} />
            ) : row.type === "question" ? (
              <QuestionCard
                key={row.task!.id}
                row={row as TaskAttentionRow}
                agentName={agentName(row.task!.assignedAgentId)}
              />
            ) : row.type === "approval" ? (
              <ApprovalCard key={row.task!.id} row={row as TaskAttentionRow} />
            ) : (
              <ReviewRow key={row.task!.id} row={row as TaskAttentionRow} />
            ),
          )
        )}
      </CardContent>
    </Card>
  );
}
