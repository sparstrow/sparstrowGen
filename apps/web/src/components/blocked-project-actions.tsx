import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, DownloadCloud, FolderSearch, Link2Off, Loader2, MonitorUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Task } from "@sparstrow/shared";
import { useProjects, useRuntimeProjects, useRuntimes } from "@web/api/hooks";
import { callAction } from "@web/lib/call-action";
import { cloneProjectAction, relinkProjectAction, unbindProjectAction } from "@web/app/machines/actions";
import { updateTaskAction } from "@web/app/tasks/actions";

/**
 * M4 — what to do about a task blocked on a project the machine does not have.
 *
 * The four actions plan decision 1 promised: relink, clone, unbind, reassign.
 * They live on the task, not in a settings page, because that is where the
 * problem appears. A user who has to go looking for the fix has already been
 * failed by the error message.
 *
 * Ordered by what they cost the person. Reassign needs nothing and cannot go
 * wrong, so it goes first when it is possible at all; relink asks for a path;
 * clone copies a repository; unbind destroys a binding. Actions that cannot
 * work are hidden rather than shown disabled — a clone button on a project with
 * no git remote is an invitation to a dead end.
 */

/** A path field that only appears once the action is chosen. */
function PathPrompt({
  label,
  placeholder,
  pending,
  onCancel,
  onSubmit,
}: {
  label: string;
  placeholder: string;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (value: string) => void;
}) {
  const [value, setValue] = React.useState("");

  return (
    <div className="mt-2 space-y-1.5">
      <label className="text-xs text-muted-foreground">{label}</label>
      <div className="flex items-center gap-1.5">
        <Input
          autoFocus
          value={value}
          placeholder={placeholder}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && value.trim()) onSubmit(value.trim());
            if (event.key === "Escape") onCancel();
          }}
          className="h-7 font-mono text-xs"
        />
        <Button size="sm" disabled={!value.trim() || pending} onClick={() => onSubmit(value.trim())}>
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function BlockedProjectActions({ task }: { task: Task }) {
  const runtimes = useRuntimes();
  const bindings = useRuntimeProjects();
  const projects = useProjects();
  const queryClient = useQueryClient();

  const [relinkPending, startRelink] = React.useTransition();
  const [clonePending, startClone] = React.useTransition();
  const [unbindPending, startUnbind] = React.useTransition();
  const [reassignPending, startReassign] = React.useTransition();
  const [cloneQueued, setCloneQueued] = React.useState(false);
  const [failure, setFailure] = React.useState<string | null>(null);

  const [prompting, setPrompting] = React.useState<"relink" | "clone" | null>(null);

  if (!task.projectId) return null;

  const project = (projects.data ?? []).find((p) => p.id === task.projectId);
  const machines = runtimes.data ?? [];

  // The machine the work was aimed at. Without a pin there is nothing to
  // relink or unbind — the enqueue simply found no candidate — so only
  // reassign and clone make sense, and both need a machine chosen explicitly.
  const target = machines.find((m) => m.id === task.targetRuntimeId) ?? null;

  const boundElsewhere = (bindings.data ?? []).filter(
    (b) => b.projectId === task.projectId && b.state === "bound" && b.runtimeId !== target?.id,
  );
  const reassignTo = machines.find(
    (m) => m.online && boundElsewhere.some((b) => b.runtimeId === m.id),
  );

  const busy = relinkPending || clonePending || unbindPending || reassignPending;

  const invalidateBindings = () => {
    void queryClient.invalidateQueries({ queryKey: ["runtime-projects"] });
    void queryClient.invalidateQueries({ queryKey: ["tasks"] });
  };

  return (
    <div className="mt-2 rounded-md border border-warning/40 bg-warning/5 p-2">
      <p className="flex items-start gap-1.5 text-xs font-medium text-warning">
        <AlertTriangle className="mt-px size-3.5 shrink-0" />
        <span>
          {target
            ? `${target.name} does not have ${project?.name ?? "this project"} on disk.`
            : `No machine has ${project?.name ?? "this project"} on disk.`}
        </span>
      </p>

      {prompting === "relink" && target ? (
        <PathPrompt
          label={`Where is it on ${target.name}?`}
          placeholder="D:\\code\\my-project"
          pending={relinkPending}
          onCancel={() => setPrompting(null)}
          onSubmit={(localPath) => {
            setFailure(null);
            startRelink(async () => {
              const r = await callAction(() =>
                relinkProjectAction(target.id, task.projectId!, localPath),
              );
              if (!r.ok) {
                setFailure(r.error);
                return;
              }
              invalidateBindings();
              setPrompting(null);
              // Back to todo: the blocker is gone, so the task should be
              // runnable again rather than sitting in a state named after
              // a problem that has been fixed.
              void callAction(() => updateTaskAction(task.id, { status: "todo" }));
            });
          }}
        />
      ) : prompting === "clone" && target ? (
        <PathPrompt
          label={`Where should it be cloned on ${target.name}?`}
          placeholder="D:\\code\\my-project"
          pending={clonePending}
          onCancel={() => setPrompting(null)}
          onSubmit={(localPath) => {
            setFailure(null);
            startClone(async () => {
              const r = await callAction(() =>
                cloneProjectAction(target.id, task.projectId!, localPath),
              );
              if (!r.ok) {
                setFailure(r.error);
                return;
              }
              invalidateBindings();
              setPrompting(null);
              setCloneQueued(true);
              // Deliberately NOT moved to todo. The clone has been queued,
              // not finished; the binding turns `bound` when the machine
              // says so, and claiming success here would be the same lie
              // the snapshot toggle avoids.
            });
          }}
        />
      ) : (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {reassignTo ? (
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setFailure(null);
                startReassign(async () => {
                  const r = await callAction(() =>
                    updateTaskAction(task.id, {
                      targetRuntimeId: reassignTo.id,
                      status: "todo",
                    }),
                  );
                  if (!r.ok) setFailure(r.error);
                  else void queryClient.invalidateQueries({ queryKey: ["tasks"] });
                });
              }}
            >
              <MonitorUp className="size-3.5" />
              Run on {reassignTo.name}
            </Button>
          ) : null}

          {target ? (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setPrompting("relink")}>
              <FolderSearch className="size-3.5" />
              Relink
            </Button>
          ) : null}

          {target && project?.gitRemote ? (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setPrompting("clone")}>
              <DownloadCloud className="size-3.5" />
              Clone it there
            </Button>
          ) : null}

          {target ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              title={`Stop considering ${target.name} for this project`}
              onClick={() => {
                setFailure(null);
                startUnbind(async () => {
                  const r = await callAction(() =>
                    unbindProjectAction(target.id, task.projectId!),
                  );
                  if (!r.ok) setFailure(r.error);
                  else invalidateBindings();
                });
              }}
            >
              <Link2Off className="size-3.5" />
              Unbind
            </Button>
          ) : null}
        </div>
      )}

      {cloneQueued && !prompting ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Clone queued. It appears here as available once {target?.name ?? "the machine"} reports
          it.
        </p>
      ) : null}

      {failure ? <p className="mt-1 text-xs text-destructive">{failure}</p> : null}
    </div>
  );
}
