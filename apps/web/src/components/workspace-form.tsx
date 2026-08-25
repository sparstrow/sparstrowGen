import { Building2 } from "lucide-react";
import { useUpdateWorkspace, useWorkspace } from "@web/api/hooks";
import { useAccount } from "@web/lib/account";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ImageUploadField } from "@web/components/image-upload-field";
import { LongTextField, SingleLineField } from "@/components/form-field";

/**
 * T-M10-02 — the workspace step, rendered both inside the setup guide
 * (`variant="inline"`) and as its permanent home in Settings → Workspace →
 * General (`variant="card"`). See `profile-form.tsx` for the shared
 * `variant` rationale.
 *
 * **Renders nothing when there is no account.** The local desktop build has
 * no cloud workspace at all — `useWorkspace()` would 404 against a host that
 * never registered `/workspace`, and rendering that as "couldn't load your
 * workspace" would misreport a structural absence as a fixable failure, the
 * same trap `WorkspaceSwitcher` documents (T-M10-04). Settings → Workspace →
 * General simply omits this card there, same as the profile form's
 * account-extras block.
 *
 * **Only `name` gates the step (FR-020).** Logo, description and context are
 * offered, never required.
 *
 * **The slug is read-only.** It is derived from the workspace's first real
 * name and frozen from then on (plan decision 8) — nothing here can edit it,
 * because nothing about the app resolves by it yet, and it may already be in
 * a link someone saved.
 */
export function WorkspaceForm({ variant }: { variant: "card" | "inline" }) {
  const account = useAccount();
  const workspace = useWorkspace();
  const update = useUpdateWorkspace();

  if (!account) return null;

  const body = workspace.isLoading ? (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Skeleton className="size-16 rounded-lg" />
        <Skeleton className="h-9 w-40" />
      </div>
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  ) : workspace.isError || !workspace.data ? (
    <div className="flex items-center justify-between gap-3">
      <p className="text-sm text-destructive">
        Couldn't check this. {workspace.error?.message ?? ""}
      </p>
      <Button variant="outline" size="sm" onClick={() => void workspace.refetch()}>
        Retry
      </Button>
    </div>
  ) : (
    <div className="space-y-4">
      <ImageUploadField
        currentUrl={workspace.data.logoUrl}
        prefix={`workspace-logos/${workspace.data.id}`}
        onSave={(url) => update.mutateAsync({ logoUrl: url })}
        label="logo"
        fallback={
          <span className="flex size-12 items-center justify-center rounded-lg bg-accent text-muted-foreground">
            <Building2 className="size-6" strokeWidth={1.5} />
          </span>
        }
      />

      <SingleLineField
        id="workspace-name"
        label="Workspace name"
        value={workspace.data.name}
        placeholder="e.g. Sparstrow Inc"
        maxLength={60}
        onSave={(name) => update.mutateAsync({ name })}
      />

      <div className="space-y-1.5">
        <Label htmlFor="workspace-slug">Slug</Label>
        <Input
          id="workspace-slug"
          value={workspace.data.slug}
          readOnly
          className="cursor-default bg-muted/40 font-mono text-muted-foreground"
        />
        <p className="text-xs text-muted-foreground">
          Set from the workspace's first name and does not change afterwards.
        </p>
      </div>

      <LongTextField
        id="workspace-description"
        label="Description"
        value={workspace.data.description}
        placeholder="What does this workspace focus on?"
        maxLength={280}
        rows={2}
        onSave={(description) => update.mutateAsync({ description })}
      />

      <LongTextField
        id="workspace-context"
        label="Context"
        helper="Read by agents working in this workspace — background information and context."
        value={workspace.data.context}
        placeholder="Background information and context for AI agents working in this workspace."
        maxLength={4000}
        rows={6}
        onSave={(context) => update.mutateAsync({ context })}
      />
    </div>
  );

  if (variant === "inline") return body;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Workspace</CardTitle>
        <CardDescription>
          Everything — machines, agents, runs, memory — lives inside this workspace.
        </CardDescription>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
