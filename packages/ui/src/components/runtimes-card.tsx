import * as React from "react";
import { Check, Copy, Loader2, MonitorSmartphone, Pencil, Trash2, Unplug } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useCreatePairingCode,
  useRemoveRuntime,
  useRenameRuntime,
  useRevokeRuntimeToken,
  useRuntimes,
  type Runtime,
} from "@/api/hooks";
import { cn } from "@/lib/utils";

/**
 * M3 — pair a machine, see the machines, revoke one.
 *
 * Without this M3 is invisible: a paired machine that appears nowhere is
 * indistinguishable from a pairing that failed.
 */

function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return "unknown";
  if (ms < 60_000) return "just now";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * The code, with a live countdown.
 *
 * The countdown is not decoration. The code lives in component state and
 * nothing invalidates it when it expires, so without this someone reads a dead
 * code into a terminal on another machine and blames the CLI.
 */
function PairingCodePanel({
  code,
  expiresAt,
  onExpired,
}: {
  code: string;
  expiresAt: string;
  onExpired: () => void;
}) {
  const [remaining, setRemaining] = React.useState(() =>
    Math.max(0, new Date(expiresAt).getTime() - Date.now()),
  );
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    const tick = setInterval(() => {
      const left = Math.max(0, new Date(expiresAt).getTime() - Date.now());
      setRemaining(left);
      if (left === 0) onExpired();
    }, 1000);
    return () => clearInterval(tick);
  }, [expiresAt, onExpired]);

  React.useEffect(() => {
    if (!copied) return;
    const reset = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(reset);
  }, [copied]);

  const minutes = Math.floor(remaining / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);

  return (
    <div className="space-y-3 rounded-lg border bg-muted/40 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-2xl font-semibold tracking-[0.2em]">{code}</span>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            void navigator.clipboard?.writeText(code).then(() => setCopied(true));
          }}
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        On the machine you want to pair, run:
      </p>
      <code className="block rounded-md border bg-background px-3 py-2 font-mono text-sm">
        sparstrow pair {code}
      </code>

      <p className={cn("text-xs", remaining < 60_000 ? "text-destructive" : "text-muted-foreground")}>
        {remaining === 0
          ? "This code has expired — generate another."
          : `Expires in ${minutes}:${String(seconds).padStart(2, "0")} · works once`}
      </p>
    </div>
  );
}

function RuntimeRow({ runtime }: { runtime: Runtime }) {
  const rename = useRenameRuntime();
  const revoke = useRevokeRuntimeToken();
  const remove = useRemoveRuntime();

  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(runtime.name);
  const [confirming, setConfirming] = React.useState<null | "revoke" | "remove">(null);

  function commit() {
    const next = draft.trim();
    if (next && next !== runtime.name) rename.mutate({ id: runtime.id, name: next });
    setEditing(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-3 border-b py-3 last:border-b-0">
      <span
        className={cn(
          "size-2 shrink-0 rounded-full",
          runtime.online ? "bg-emerald-500" : "bg-muted-foreground/40",
        )}
        aria-hidden="true"
      />

      <div className="min-w-0 flex-1">
        {editing ? (
          <Input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") {
                setDraft(runtime.name);
                setEditing(false);
              }
            }}
            className="h-8 max-w-56"
            aria-label="Machine name"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="group flex items-center gap-1.5 text-sm font-medium"
            title="Rename this machine"
          >
            {runtime.name}
            <Pencil className="size-3 opacity-0 transition-opacity group-hover:opacity-60" />
          </button>
        )}
        <p className="truncate text-xs text-muted-foreground">
          {runtime.os} · {runtime.hostname}
          {runtime.coreVersion ? ` · core ${runtime.coreVersion}` : ""} ·{" "}
          {runtime.online ? "online" : `last seen ${relativeTime(runtime.lastHeartbeat)}`}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {runtime.status === "draining" && <Badge variant="secondary">shutting down</Badge>}
        {runtime.capabilities.length === 0 ? (
          <Badge variant="outline" title="This machine reported no usable providers">
            no providers
          </Badge>
        ) : (
          runtime.capabilities.map((capability) => (
            <Badge key={capability} variant="secondary">
              {capability}
            </Badge>
          ))
        )}
      </div>

      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="ghost"
          title="Revoke this machine's pairing"
          onClick={() => setConfirming("revoke")}
        >
          <Unplug className="size-4" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          title="Remove this machine from the workspace"
          onClick={() => setConfirming("remove")}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      <ConfirmDialog
        open={confirming === "revoke"}
        onOpenChange={(open) => setConfirming(open ? "revoke" : null)}
        title={`Revoke ${runtime.name}?`}
        description={
          <>
            This machine stops reaching the workspace on its very next request. It stays in
            the list, and pairing it again with a fresh code restores access.
          </>
        }
        confirmLabel="Revoke pairing"
        pendingLabel="Revoking…"
        pending={revoke.isPending}
        onConfirm={() =>
          revoke.mutate(runtime.id, { onSettled: () => setConfirming(null) })
        }
      />

      <ConfirmDialog
        open={confirming === "remove"}
        onOpenChange={(open) => setConfirming(open ? "remove" : null)}
        title={`Remove ${runtime.name}?`}
        description={
          <>
            Deletes this machine and its pairing from the workspace. Anything recorded
            against it goes too. The machine itself keeps its local data — pair it again to
            reconnect.
          </>
        }
        confirmLabel="Remove machine"
        pendingLabel="Removing…"
        pending={remove.isPending}
        onConfirm={() =>
          remove.mutate(runtime.id, { onSettled: () => setConfirming(null) })
        }
      />
    </div>
  );
}

export function RuntimesCard() {
  const runtimes = useRuntimes();
  const createCode = useCreatePairingCode();
  const [issued, setIssued] = React.useState<{
    code: string;
    expiresAt: string;
    machinesAtIssue: number;
  } | null>(null);
  const [justPaired, setJustPaired] = React.useState<string | null>(null);

  const machines = runtimes.data ?? [];

  /**
   * Retire the code once it has actually been used.
   *
   * Expiry alone is not enough: a code dies the moment a machine redeems it,
   * and the panel would otherwise keep counting down over a code that no
   * longer works. Someone reads it onto a third machine and blames the CLI for
   * saying "already used".
   *
   * A new machine appearing is the observable signal — the list already polls,
   * so this costs no extra request and ties the panel's lifetime to the exact
   * event it exists for.
   */
  React.useEffect(() => {
    if (!issued) return;
    if (machines.length <= issued.machinesAtIssue) return;
    setJustPaired(machines[machines.length - 1]?.name ?? "A new machine");
    setIssued(null);
  }, [machines, issued]);

  React.useEffect(() => {
    if (!justPaired) return;
    const clear = setTimeout(() => setJustPaired(null), 8000);
    return () => clearTimeout(clear);
  }, [justPaired]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Machines</CardTitle>
        <CardDescription>
          Machines running Sparstrow core that this workspace can reach. Agents run on these,
          not in the browser.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {runtimes.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : machines.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center">
            <MonitorSmartphone className="mx-auto size-6 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium">No machines paired yet</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              Pairing links a computer running Sparstrow core to this workspace, so agents
              have somewhere to run. Generate a code, then run{" "}
              <code className="font-mono">sparstrow pair</code> on that machine.
            </p>
          </div>
        ) : (
          <div>
            {machines.map((runtime) => (
              <RuntimeRow key={runtime.id} runtime={runtime} />
            ))}
          </div>
        )}

        {justPaired ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Check className="size-4 text-emerald-500" />
            {justPaired} is paired. Restart core on that machine if it is already running.
          </p>
        ) : null}

        {issued ? (
          <PairingCodePanel
            code={issued.code}
            expiresAt={issued.expiresAt}
            onExpired={() => setIssued(null)}
          />
        ) : (
          <Button
            variant="outline"
            disabled={createCode.isPending}
            onClick={() =>
              createCode.mutate(undefined, {
                onSuccess: (result) =>
                  setIssued({ ...result, machinesAtIssue: machines.length }),
              })
            }
          >
            {createCode.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Pair a machine
          </Button>
        )}

        {createCode.isError ? (
          <p className="text-sm text-destructive">
            Could not create a pairing code: {createCode.error.message}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
