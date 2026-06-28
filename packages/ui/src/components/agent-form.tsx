import * as React from "react";
import type { Agent, AgentCreate, PermissionMode, ProviderId } from "@sparstrow/shared";
import { KNOWN_MODELS } from "@sparstrow/shared";
import { X } from "lucide-react";
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
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

const PERMISSION_MODES: { value: PermissionMode; hint: string }[] = [
  { value: "default", hint: "ask before risky tools (denied in headless runs)" },
  { value: "acceptEdits", hint: "auto-approve file edits" },
  { value: "plan", hint: "read-only planning mode" },
  { value: "bypassPermissions", hint: "approve everything — recommended for headless agents" },
];

const BASE_SCOPES = ["global", "project:*", "agent:self"] as const;

export interface AgentFormValues {
  name: string;
  role: string;
  systemPrompt: string;
  provider: ProviderId;
  model: string;
  cwd: string;
  addDirs: string;
  allowedTools: string;
  disallowedTools: string;
  permissionMode: PermissionMode;
  maxTurns: string;
  memoryReadScopes: string[];
  memoryWriteScopes: string[];
  enabled: boolean;
}

export type SetField = <K extends keyof AgentFormValues>(key: K, value: AgentFormValues[K]) => void;

export function agentToForm(agent: Agent | null): AgentFormValues {
  return {
    name: agent?.name ?? "",
    role: agent?.role ?? "",
    systemPrompt: agent?.systemPrompt ?? "",
    provider: agent?.provider ?? "claude-code",
    model: agent?.model ?? "sonnet",
    cwd: agent?.cwd ?? "",
    addDirs: (agent?.addDirs ?? []).join("\n"),
    allowedTools: (agent?.allowedTools ?? []).join(", "),
    disallowedTools: (agent?.disallowedTools ?? []).join(", "),
    permissionMode: agent?.permissionMode ?? "bypassPermissions",
    maxTurns: agent?.maxTurns != null ? String(agent.maxTurns) : "",
    memoryReadScopes: agent?.memoryReadScopes ?? ["global", "project:*", "agent:self"],
    memoryWriteScopes: agent?.memoryWriteScopes ?? ["agent:self"],
    enabled: agent?.enabled ?? true,
  };
}

export function formToPayload(values: AgentFormValues): AgentCreate {
  const csv = (s: string) =>
    s
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  return {
    name: values.name.trim(),
    role: values.role.trim(),
    systemPrompt: values.systemPrompt,
    provider: values.provider,
    model: values.model.trim(),
    cwd: values.cwd.trim() || null,
    addDirs: values.addDirs
      .split("\n")
      .map((d) => d.trim())
      .filter(Boolean),
    allowedTools: csv(values.allowedTools),
    disallowedTools: csv(values.disallowedTools),
    permissionMode: values.permissionMode,
    mcpServers: {},
    maxTurns: values.maxTurns.trim() ? Number(values.maxTurns) : null,
    memoryReadScopes: values.memoryReadScopes,
    memoryWriteScopes: values.memoryWriteScopes,
    extraArgs: [],
    enabled: values.enabled,
  };
}

/** A partial agent draft (from the Agent Creator) mapped onto form values, so
 *  the same editable fields render an AI-built draft. */
export function draftToForm(draft: Partial<Agent>): AgentFormValues {
  return agentToForm({
    ...(draft as Agent),
    name: draft.name ?? "",
    role: draft.role ?? "",
    systemPrompt: draft.systemPrompt ?? "",
    provider: draft.provider ?? "claude-code",
    model: draft.model ?? "sonnet",
  } as Agent);
}

function ScopeEditor({
  label,
  hint,
  scopes,
  onChange,
}: {
  label: string;
  hint: string;
  scopes: string[];
  onChange: (next: string[]) => void;
}) {
  const [custom, setCustom] = React.useState("");
  const toggle = (scope: string) =>
    onChange(scopes.includes(scope) ? scopes.filter((s) => s !== scope) : [...scopes, scope]);
  const customScopes = scopes.filter((s) => !BASE_SCOPES.includes(s as never));

  const addCustom = () => {
    const v = custom.trim();
    if (!v || scopes.includes(v)) return;
    if (!/^(project|agent):[a-z0-9-]+$/.test(v)) return;
    onChange([...scopes, v]);
    setCustom("");
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <p className="text-xs text-muted-foreground">{hint}</p>
      <div className="flex flex-wrap items-center gap-2">
        {BASE_SCOPES.map((scope) => (
          <button
            key={scope}
            type="button"
            onClick={() => toggle(scope)}
            className="focus:outline-none"
          >
            <Badge variant={scopes.includes(scope) ? "default" : "outline"}>{scope}</Badge>
          </button>
        ))}
        {customScopes.map((scope) => (
          <Badge key={scope} variant="secondary">
            {scope}
            <button type="button" onClick={() => toggle(scope)}>
              <X className="size-3" />
            </button>
          </Badge>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          className="h-8 max-w-56 text-xs"
          placeholder="project:my-app or agent:writer"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCustom())}
        />
        <Button type="button" variant="outline" size="sm" onClick={addCustom}>
          Add
        </Button>
      </div>
    </div>
  );
}

/**
 * The full agent editing surface — the SINGLE source of these inputs. Rendered
 * by the manual-create dialog, the SkillViewer inline edit, and the Agent
 * Creator draft pane, so the three never drift on field names or validation.
 */
export function AgentFields({ values, set }: { values: AgentFormValues; set: SetField }) {
  const models = KNOWN_MODELS[values.provider] ?? [];
  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Identity
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input
              value={values.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Researcher"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Input
              value={values.role}
              onChange={(e) => set("role", e.target.value)}
              placeholder="market research assistant"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>System prompt</Label>
          <Textarea
            rows={5}
            value={values.systemPrompt}
            onChange={(e) => set("systemPrompt", e.target.value)}
            placeholder="Standing instructions appended to every run…"
          />
        </div>
      </section>

      <Separator />

      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Model
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Provider</Label>
            <Select value={values.provider} onValueChange={(v) => set("provider", v as ProviderId)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="claude-code">Claude Code (CLI)</SelectItem>
                <SelectItem value="gemini-cli" disabled>
                  Gemini CLI (phase 3)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Model</Label>
            <Select value={values.model} onValueChange={(v) => set("model", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {models.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      <Separator />

      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Execution &amp; access
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Working directory</Label>
            <Input
              value={values.cwd}
              onChange={(e) => set("cwd", e.target.value)}
              placeholder="(scratch dir per run)"
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Max turns</Label>
            <Input
              type="number"
              min={1}
              value={values.maxTurns}
              onChange={(e) => set("maxTurns", e.target.value)}
              placeholder="unlimited"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Additional directories (one per line)</Label>
          <Textarea
            rows={2}
            value={values.addDirs}
            onChange={(e) => set("addDirs", e.target.value)}
            placeholder={"C:\\Projects\\my-app"}
            className="font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground">The memory vault is always accessible.</p>
        </div>
        <div className="space-y-1.5">
          <Label>Permission mode</Label>
          <Select
            value={values.permissionMode}
            onValueChange={(v) => set("permissionMode", v as PermissionMode)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERMISSION_MODES.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.value} — {m.hint}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Allowed tools</Label>
            <Input
              value={values.allowedTools}
              onChange={(e) => set("allowedTools", e.target.value)}
              placeholder="Read, Edit, Bash(git *)"
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Disallowed tools</Label>
            <Input
              value={values.disallowedTools}
              onChange={(e) => set("disallowedTools", e.target.value)}
              placeholder="WebSearch"
              className="font-mono text-xs"
            />
          </div>
        </div>
      </section>

      <Separator />

      <section className="space-y-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Memory scopes
        </h3>
        <ScopeEditor
          label="Read scopes"
          hint="Which memory is searched and injected into this agent's runs."
          scopes={values.memoryReadScopes}
          onChange={(s) => set("memoryReadScopes", s)}
        />
        <ScopeEditor
          label="Write scopes"
          hint="Where this agent may save new memory notes."
          scopes={values.memoryWriteScopes}
          onChange={(s) => set("memoryWriteScopes", s)}
        />
      </section>

      <Separator />

      <div className="flex items-center justify-between">
        <div>
          <Label>Enabled</Label>
          <p className="text-xs text-muted-foreground">Disabled agents cannot be run.</p>
        </div>
        <Switch checked={values.enabled} onCheckedChange={(v) => set("enabled", v)} />
      </div>
    </div>
  );
}

/**
 * Manual create dialog (F2 "Manually create" path) — CREATE ONLY. Editing an
 * existing agent now happens inline in the SkillViewer (locked decision 6).
 * `seed` prefills the fields for the Agent Creator's "switch to manual, keep
 * draft" handoff; it is never an edit of a persisted agent.
 */
export function AgentFormDialog({
  open,
  onOpenChange,
  seed,
  onSubmit,
  pending,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  seed?: AgentFormValues | null;
  onSubmit: (payload: AgentCreate) => void;
  pending: boolean;
  error: string | null;
}) {
  const [values, setValues] = React.useState<AgentFormValues>(() => seed ?? agentToForm(null));
  React.useEffect(() => {
    if (open) setValues(seed ?? agentToForm(null));
  }, [open, seed]);

  const set: SetField = (key, value) => setValues((v) => ({ ...v, [key]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>New agent</DialogTitle>
          <DialogDescription>
            Configure how this agent spawns its CLI model, what it may touch, and which memory it
            can read and write.
          </DialogDescription>
        </DialogHeader>

        <AgentFields values={values} set={set} />
        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => onSubmit(formToPayload(values))}
            disabled={pending || !values.name.trim() || !values.model.trim()}
          >
            {pending ? "Saving…" : "Create agent"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
