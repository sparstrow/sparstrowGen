import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Check, Copy, Pencil, X } from "lucide-react";
import type { Agent, AgentCreate } from "@sparstrow/shared";
import { renderSkillMd } from "@sparstrow/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AgentFields,
  agentToForm,
  formToPayload,
  type AgentFormValues,
  type SetField,
} from "@web/components/agent-form";
import { formatDate } from "@/lib/format";

function ReadRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </h3>
  );
}

function OverviewRead({ agent }: { agent: Agent }) {
  return (
    <div className="text-sm">
      <SectionHeading>Identity</SectionHeading>
      <ReadRow label="Name">{agent.name}</ReadRow>
      <ReadRow label="Role">{agent.role || <span className="text-muted-foreground">—</span>}</ReadRow>
      <ReadRow label="System prompt">
        {agent.systemPrompt ? (
          <span className="whitespace-pre-wrap">{agent.systemPrompt}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </ReadRow>

      <SectionHeading>Model</SectionHeading>
      <ReadRow label="Provider">
        <Badge variant="secondary">{agent.provider}</Badge>
      </ReadRow>
      <ReadRow label="Model">
        <span className="font-mono text-xs">{agent.model}</span>
      </ReadRow>

      <SectionHeading>Execution &amp; access</SectionHeading>
      <ReadRow label="Working dir">
        <span className="font-mono text-xs">{agent.cwd || "(scratch dir per run)"}</span>
      </ReadRow>
      <ReadRow label="Max turns">{agent.maxTurns ?? "unlimited"}</ReadRow>
      <ReadRow label="Permission">
        <span className="font-mono text-xs">{agent.permissionMode}</span>
      </ReadRow>
      <ReadRow label="Allowed tools">
        {agent.allowedTools.length ? (
          <span className="font-mono text-xs">{agent.allowedTools.join(", ")}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </ReadRow>
      <ReadRow label="Disallowed">
        {agent.disallowedTools.length ? (
          <span className="font-mono text-xs">{agent.disallowedTools.join(", ")}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </ReadRow>

      <SectionHeading>Memory scopes</SectionHeading>
      <ReadRow label="Read">
        <span className="flex flex-wrap gap-1">
          {agent.memoryReadScopes.map((s) => (
            <Badge key={s} variant="outline">
              {s}
            </Badge>
          ))}
        </span>
      </ReadRow>
      <ReadRow label="Write">
        <span className="flex flex-wrap gap-1">
          {agent.memoryWriteScopes.map((s) => (
            <Badge key={s} variant="outline">
              {s}
            </Badge>
          ))}
        </span>
      </ReadRow>

      <SectionHeading>Status</SectionHeading>
      <ReadRow label="Enabled">{agent.enabled ? "Yes" : "No"}</ReadRow>
      <ReadRow label="Updated">{formatDate(agent.updatedAt)}</ReadRow>
    </div>
  );
}

function SkillMdTab({ agent }: { agent: Agent }) {
  const md = React.useMemo(() => renderSkillMd(agent), [agent]);
  const [copied, setCopied] = React.useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(md);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable; no-op */
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Generated from the fields — edit in Overview.
        </p>
        <Button variant="outline" size="sm" onClick={copy}>
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? "Copied" : "Copy"}
        </Button>
        <span aria-live="polite" className="sr-only">
          {copied ? "SKILL.md copied to clipboard" : ""}
        </span>
      </div>
      <pre className="max-h-[70vh] overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs leading-relaxed text-foreground">
        {md}
      </pre>
    </div>
  );
}

/**
 * F1 — right-side slide-over for one agent. Overview (read + inline edit) and a
 * read-only generated SKILL.md tab. Built on the Radix dialog primitive so it
 * gets focus trap + restore + ESC for free. Editing is the single edit surface
 * for existing agents.
 */
export function SkillViewer({
  agent,
  open,
  onOpenChange,
  onSave,
  saving,
  saveError,
  startInEdit = false,
}: {
  agent: Agent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (payload: AgentCreate) => void;
  saving: boolean;
  saveError: string | null;
  startInEdit?: boolean;
}) {
  const [tab, setTab] = React.useState("overview");
  const [editing, setEditing] = React.useState(false);
  const [values, setValues] = React.useState<AgentFormValues>(() => agentToForm(agent));
  const initialRef = React.useRef<string>("");

  // Reset whenever a different agent opens. Honor startInEdit so the row's
  // "Edit" action lands directly in the edit surface.
  React.useEffect(() => {
    if (open) {
      setTab("overview");
      const v = agentToForm(agent);
      setValues(v);
      initialRef.current = JSON.stringify(v);
      setEditing(startInEdit);
    }
  }, [open, agent, startInEdit]);

  // Leave edit mode once a save succeeds (parent flips `saving` false, no error).
  const prevSaving = React.useRef(saving);
  React.useEffect(() => {
    if (prevSaving.current && !saving && !saveError && editing) setEditing(false);
    prevSaving.current = saving;
  }, [saving, saveError, editing]);

  if (!agent) return null;

  const set: SetField = (key, value) => setValues((v) => ({ ...v, [key]: value }));
  const dirty = editing && JSON.stringify(values) !== initialRef.current;

  const startEdit = () => {
    const v = agentToForm(agent);
    setValues(v);
    initialRef.current = JSON.stringify(v);
    setEditing(true);
    setTab("overview");
  };

  const cancelEdit = () => {
    if (dirty && !window.confirm("Discard unsaved changes?")) return;
    setEditing(false);
  };

  const requestClose = (next: boolean) => {
    if (next) return onOpenChange(true);
    if (editing && dirty && !window.confirm("Discard unsaved changes?")) return;
    onOpenChange(false);
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={requestClose}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="spg-overlay fixed inset-0 z-50 bg-black/60" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onInteractOutside={(e) => {
            if (editing) e.preventDefault(); // SPEC: click-outside closes only when not editing
          }}
          onEscapeKeyDown={(e) => {
            if (editing) {
              e.preventDefault(); // ESC cancels the edit instead of closing
              cancelEdit();
            }
          }}
          className="spg-sheet fixed right-0 top-0 z-50 flex h-full w-full flex-col border-l bg-background shadow-lg sm:max-w-[560px]"
        >
          <div className="flex items-center justify-between border-b px-5 py-3">
            <div className="min-w-0">
              <DialogPrimitive.Title className="truncate text-base font-semibold">
                {agent.name}
              </DialogPrimitive.Title>
              <p className="truncate text-xs text-muted-foreground">
                {agent.role || agent.provider} · <span className="font-mono">{agent.model}</span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              {!editing && (
                <Button variant="outline" size="sm" onClick={startEdit}>
                  <Pencil className="size-4" /> Edit
                </Button>
              )}
              <DialogPrimitive.Close
                className="rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Close"
              >
                <X className="size-5" />
              </DialogPrimitive.Close>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {editing ? (
              <div className="space-y-4">
                <AgentFields values={values} set={set} />
                {saveError && <p className="text-sm text-destructive">{saveError}</p>}
              </div>
            ) : (
              <Tabs value={tab} onValueChange={setTab}>
                <TabsList>
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="skill">SKILL.md</TabsTrigger>
                </TabsList>
                <TabsContent value="overview">
                  <OverviewRead agent={agent} />
                </TabsContent>
                <TabsContent value="skill">
                  <SkillMdTab agent={agent} />
                </TabsContent>
              </Tabs>
            )}
          </div>

          {editing && (
            <div className="flex items-center justify-end gap-2 border-t px-5 py-3">
              <Button variant="outline" onClick={cancelEdit} disabled={saving}>
                Cancel
              </Button>
              <Button
                onClick={() => onSave(formToPayload(values))}
                disabled={saving || !values.name.trim() || !values.model.trim()}
              >
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
