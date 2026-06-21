import * as React from "react";
import { CalendarClock, Pencil, Play, Plus, Trash2 } from "lucide-react";
import type { CronJob, CronTargetType } from "@sparstrow/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  useAgents,
  useCreateCronJob,
  useCronJobs,
  useDeleteCronJob,
  usePipelines,
  useRunCronJobNow,
  useUpdateCronJob,
} from "@/api/hooks";
import { formatDate, shortId } from "@/lib/format";

const PRESETS: { label: string; expr: string }[] = [
  { label: "Every 15 minutes", expr: "*/15 * * * *" },
  { label: "Hourly", expr: "0 * * * *" },
  { label: "Daily 9am", expr: "0 9 * * *" },
  { label: "Weekdays 9am", expr: "0 9 * * 1-5" },
  { label: "Mondays 8am", expr: "0 8 * * 1" },
];

export function SchedulePage() {
  const jobs = useCronJobs();
  const agents = useAgents();
  const pipelines = usePipelines();
  const createJob = useCreateCronJob();
  const updateJob = useUpdateCronJob();
  const deleteJob = useDeleteCronJob();
  const runNow = useRunCronJobNow();

  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<CronJob | null>(null);

  const [name, setName] = React.useState("");
  const [cronExpr, setCronExpr] = React.useState("0 9 * * *");
  const [targetType, setTargetType] = React.useState<CronTargetType>("agent");
  const [targetId, setTargetId] = React.useState("");
  const [prompt, setPrompt] = React.useState("");

  const targetName = (job: CronJob) =>
    job.targetType === "agent"
      ? (agents.data?.find((a) => a.id === job.targetId)?.name ?? shortId(job.targetId))
      : (pipelines.data?.find((p) => p.id === job.targetId)?.name ?? shortId(job.targetId));

  const openCreate = () => {
    setEditing(null);
    setName("");
    setCronExpr("0 9 * * *");
    setTargetType("agent");
    setTargetId("");
    setPrompt("");
    setEditorOpen(true);
  };

  const openEdit = (job: CronJob) => {
    setEditing(job);
    setName(job.name);
    setCronExpr(job.cronExpr);
    setTargetType(job.targetType);
    setTargetId(job.targetId);
    setPrompt(job.prompt);
    setEditorOpen(true);
  };

  const saving = createJob.isPending || updateJob.isPending;
  const valid = name.trim() && cronExpr.trim() && targetId && prompt.trim();

  const submit = () => {
    const body = {
      name: name.trim(),
      cronExpr: cronExpr.trim(),
      targetType,
      targetId,
      prompt,
    };
    const onSuccess = () => setEditorOpen(false);
    if (editing) {
      updateJob.mutate({ id: editing.id, data: body }, { onSuccess });
    } else {
      createJob.mutate(
        { ...body, projectId: null, timezone: "system", enabled: true },
        { onSuccess },
      );
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <p className="text-sm text-muted-foreground">
          Cron jobs fire agents or pipelines unattended — the service just needs to be running.
        </p>
        <div className="flex-1" />
        <Button onClick={openCreate}>
          <Plus className="size-4" /> New cron job
        </Button>
      </div>

      {jobs.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : (jobs.data ?? []).length === 0 ? (
        <div className="rounded-xl border py-16 text-center">
          <CalendarClock className="mx-auto size-8 text-muted-foreground/40" />
          <p className="mt-3 text-sm font-medium">Nothing scheduled</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Schedule a daily research brief, a weekly review pipeline, anything.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Schedule</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Last run</TableHead>
                <TableHead>Next run</TableHead>
                <TableHead>Enabled</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(jobs.data ?? []).map((job) => (
                <TableRow key={job.id}>
                  <TableCell className="font-medium">{job.name}</TableCell>
                  <TableCell className="font-mono text-xs">{job.cronExpr}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-[10px]">
                      {job.targetType}
                    </Badge>{" "}
                    {targetName(job)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(job.lastRunAt)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {job.enabled ? formatDate(job.nextRunAt) : "—"}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={job.enabled}
                      onCheckedChange={(enabled) =>
                        updateJob.mutate({ id: job.id, data: { enabled } })
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        title="Run now"
                        onClick={() => runNow.mutate(job.id)}
                        disabled={runNow.isPending}
                      >
                        <Play className="size-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" title="Edit" onClick={() => openEdit(job)}>
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        title="Delete"
                        className="text-destructive hover:text-destructive"
                        onClick={() => deleteJob.mutate(job.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${editing.name}` : "New cron job"}</DialogTitle>
            <DialogDescription>
              Standard 5-field cron expression (minute hour day month weekday), local time.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Morning brief" />
              </div>
              <div className="space-y-1.5">
                <Label>Cron expression</Label>
                <Input
                  value={cronExpr}
                  onChange={(e) => setCronExpr(e.target.value)}
                  className="font-mono"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <Button
                  key={p.expr}
                  size="sm"
                  variant={cronExpr === p.expr ? "secondary" : "outline"}
                  className="h-7 text-xs"
                  onClick={() => setCronExpr(p.expr)}
                >
                  {p.label}
                </Button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Target type</Label>
                <Select
                  value={targetType}
                  onValueChange={(v) => {
                    setTargetType(v as CronTargetType);
                    setTargetId("");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="agent">Agent</SelectItem>
                    <SelectItem value="pipeline">Pipeline</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{targetType === "agent" ? "Agent" : "Pipeline"}</Label>
                <Select value={targetId} onValueChange={setTargetId}>
                  <SelectTrigger>
                    <SelectValue placeholder={`Pick a ${targetType}`} />
                  </SelectTrigger>
                  <SelectContent>
                    {targetType === "agent"
                      ? (agents.data ?? [])
                          .filter((a) => a.enabled)
                          .map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              {a.name}
                            </SelectItem>
                          ))
                      : (pipelines.data ?? [])
                          .filter((p) => p.enabled)
                          .map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name}
                            </SelectItem>
                          ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Prompt</Label>
              <Textarea
                rows={5}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="What should run on this schedule?"
              />
            </div>
            {(createJob.isError || updateJob.isError) && (
              <p className="text-sm text-destructive">
                {createJob.error?.message ?? updateJob.error?.message}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={!valid || saving}>
              {saving ? "Saving…" : editing ? "Save changes" : "Create job"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
