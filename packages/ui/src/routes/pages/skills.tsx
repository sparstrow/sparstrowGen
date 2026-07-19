import * as React from "react";
import { Link } from "@tanstack/react-router";
import type { Skill } from "@sparstrow/shared";
import {
  Bot,
  ChevronRight,
  Download,
  FilePlus2,
  Files,
  HardDrive,
  Link2,
  MoreHorizontal,
  Pencil,
  Plus,
  Puzzle,
  Search,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  useCreateSkill,
  useDeleteSkill,
  useImportLocalSkill,
  useImportUrlSkill,
  useLocalSkills,
  useSkillAssignments,
  useSkills,
  useUpdateSkill,
} from "@/api/hooks";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

interface EditorState {
  skill: Skill | null; // null = creating
  name: string;
  description: string;
  content: string;
}

const ORIGIN_META: Record<
  Skill["sourceType"],
  { label: string; icon: typeof Pencil }
> = {
  manual: { label: "Manual", icon: Pencil },
  url: { label: "URL", icon: Link2 },
  runtime: { label: "Runtime", icon: HardDrive },
};

function OriginBadge({ skill }: { skill: Skill }) {
  const meta = ORIGIN_META[skill.sourceType];
  return (
    <Badge variant="secondary" className="gap-1 text-[10px] font-normal" title={skill.sourceRef ?? undefined}>
      <meta.icon className="size-2.5" />
      {skill.sourceProvider ?? meta.label}
    </Badge>
  );
}

export function SkillsPage() {
  const skills = useSkills();
  const agents = useAgents();
  const assignments = useSkillAssignments();
  const createSkill = useCreateSkill();
  const updateSkill = useUpdateSkill();
  const deleteSkill = useDeleteSkill();

  const [query, setQuery] = React.useState("");
  const [segment, setSegment] = React.useState<"all" | "enabled" | "disabled">("all");
  const [editor, setEditor] = React.useState<EditorState | null>(null);
  const [deleting, setDeleting] = React.useState<Skill | null>(null);

  // The Multica three-path "New skill" flow: manual / URL / runtime copy.
  const [chooserOpen, setChooserOpen] = React.useState(false);
  const [urlOpen, setUrlOpen] = React.useState(false);
  const [importUrl, setImportUrl] = React.useState("");
  const [runtimeOpen, setRuntimeOpen] = React.useState(false);
  const importFromUrl = useImportUrlSkill();
  const importLocal = useImportLocalSkill();
  const localSkills = useLocalSkills(runtimeOpen);
  const [lastLocalImport, setLastLocalImport] = React.useState<{
    sourcePath: string;
    status: "created" | "updated" | "conflict";
  } | null>(null);

  const all = skills.data ?? [];
  const enabledCount = all.filter((s) => s.enabled).length;
  const segments = [
    { key: "all" as const, label: "All", count: all.length },
    { key: "enabled" as const, label: "Enabled", count: enabledCount },
    { key: "disabled" as const, label: "Disabled", count: all.length - enabledCount },
  ];

  const usedBy = React.useMemo(() => {
    const map = new Map<string, string[]>();
    for (const a of assignments.data ?? []) {
      const list = map.get(a.skillId) ?? [];
      list.push(a.agentId);
      map.set(a.skillId, list);
    }
    return map;
  }, [assignments.data]);
  const agentName = (id: string) => agents.data?.find((a) => a.id === id)?.name ?? id;

  const q = query.trim().toLowerCase();
  const visible = all
    .filter((s) => (segment === "all" ? true : segment === "enabled" ? s.enabled : !s.enabled))
    .filter(
      (s) =>
        !q || s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q),
    );

  const openCreate = () => {
    createSkill.reset();
    setEditor({ skill: null, name: "", description: "", content: "" });
  };
  const openEdit = (skill: Skill) => {
    updateSkill.reset();
    setEditor({
      skill,
      name: skill.name,
      description: skill.description,
      content: skill.content,
    });
  };

  const saving = createSkill.isPending || updateSkill.isPending;
  const saveError = createSkill.error?.message ?? updateSkill.error?.message ?? null;
  const submit = () => {
    if (!editor || !editor.name.trim()) return;
    const body = {
      name: editor.name.trim(),
      description: editor.description,
      content: editor.content,
    };
    const onSuccess = () => setEditor(null);
    if (editor.skill) {
      updateSkill.mutate({ id: editor.skill.id, data: body }, { onSuccess });
    } else {
      createSkill.mutate({ ...body, enabled: true }, { onSuccess });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search skills…"
            className="h-9 w-52 pl-8"
            aria-label="Search skills"
          />
        </div>
        <div className="flex items-center gap-1 rounded-lg border p-0.5">
          {segments.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setSegment(s.key)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                segment === s.key
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {s.label}
              <span className="tabular-nums text-muted-foreground">{s.count}</span>
            </button>
          ))}
        </div>
        <p className="hidden text-sm text-muted-foreground xl:block">
          Reusable instruction packs — assign them to agents from the Agents page.
        </p>
        <div className="flex-1" />
        <Button onClick={() => setChooserOpen(true)}>
          <Plus className="size-4" /> New skill
        </Button>
      </div>

      {skills.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : all.length === 0 ? (
        <div className="rounded-xl border border-dashed py-16 text-center bg-card">
          <Puzzle className="mx-auto size-8 text-muted-foreground/40" />
          <p className="mt-3 text-sm font-medium">No skills yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            A skill is a reusable set of instructions (Markdown) injected into every run of the
            agents it's assigned to.
          </p>
          <Button className="mt-4" onClick={() => setChooserOpen(true)}>
            <Plus className="size-4" /> New skill
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border">
          <Table className="[&_td]:py-2">
            <TableHeader>
              <TableRow>
                <TableHead>Skill</TableHead>
                <TableHead>Origin</TableHead>
                <TableHead>Used by</TableHead>
                <TableHead>Files</TableHead>
                <TableHead>Enabled</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                    No skills match{q ? ` “${query.trim()}”` : " this filter"}.
                  </TableCell>
                </TableRow>
              ) : (
                visible.map((skill) => {
                  const users = usedBy.get(skill.id) ?? [];
                  return (
                    <TableRow key={skill.id}>
                      <TableCell>
                        <Link
                          to="/skills/$skillId"
                          params={{ skillId: skill.id }}
                          className="flex items-start gap-2.5 rounded text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted">
                            <Puzzle className="size-3.5 text-muted-foreground" />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate font-medium hover:underline">
                              {skill.name}
                            </span>
                            <span className="block max-w-72 truncate text-xs text-muted-foreground">
                              {skill.description || "No description"}
                            </span>
                          </span>
                        </Link>
                      </TableCell>
                      <TableCell>
                        <OriginBadge skill={skill} />
                      </TableCell>
                      <TableCell>
                        {users.length === 0 ? (
                          <span className="text-xs italic text-muted-foreground">Unassigned</span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1.5 text-xs"
                            title={users.map(agentName).join(", ")}
                          >
                            <Bot className="size-3 text-muted-foreground" />
                            {users.length} agent{users.length !== 1 && "s"}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs tabular-nums text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5" title={`${skill.fileCount + 1} files including SKILL.md`}>
                          <Files className="size-3 text-muted-foreground" />
                          {skill.fileCount + 1}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={skill.enabled}
                          onCheckedChange={(enabled) =>
                            updateSkill.mutate({ id: skill.id, data: { enabled } })
                          }
                        />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDate(skill.updatedAt)}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="size-8">
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => openEdit(skill)}>
                              <Pencil /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onSelect={() => setDeleting(skill)}
                            >
                              <Trash2 /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create / edit dialog */}
      <Dialog open={editor !== null} onOpenChange={(open) => !open && setEditor(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editor?.skill ? `Edit ${editor.skill.name}` : "New skill"}</DialogTitle>
            <DialogDescription>
              The instructions are injected verbatim into every run of the agents this skill is
              assigned to — write them like a SKILL.md body.
            </DialogDescription>
          </DialogHeader>
          {editor && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Name</Label>
                  <Input
                    value={editor.name}
                    onChange={(e) => setEditor({ ...editor, name: e.target.value })}
                    placeholder="PDF handling"
                    autoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Description</Label>
                  <Input
                    value={editor.description}
                    onChange={(e) => setEditor({ ...editor, description: e.target.value })}
                    placeholder="When and why an agent should use this skill"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Instructions (Markdown)</Label>
                <Textarea
                  rows={12}
                  value={editor.content}
                  onChange={(e) => setEditor({ ...editor, content: e.target.value })}
                  placeholder={"## How to do the thing\n- Step one…\n- Step two…"}
                  className="font-mono text-xs"
                />
              </div>
              {editor.skill && (
                <p className="text-xs text-muted-foreground">
                  Used by{" "}
                  {(usedBy.get(editor.skill.id) ?? []).length === 0
                    ? "no agents yet — assign it from the Agents page."
                    : (usedBy.get(editor.skill.id) ?? []).map(agentName).join(", ") + "."}
                </p>
              )}
              {saveError && <p className="text-sm text-destructive">{saveError}</p>}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditor(null)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={!editor?.name.trim() || saving}>
              {saving ? "Saving…" : editor?.skill ? "Save changes" : "Create skill"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New-skill chooser (Multica's three paths). */}
      <Dialog open={chooserOpen} onOpenChange={setChooserOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New skill</DialogTitle>
            <DialogDescription>Choose how you want to add a skill to this workspace.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {(
              [
                {
                  icon: FilePlus2,
                  title: "Create manually",
                  hint: "Start from a blank SKILL.md and write your own instructions.",
                  onPick: () => {
                    setChooserOpen(false);
                    openCreate();
                  },
                },
                {
                  icon: Download,
                  title: "Import from URL",
                  hint: "Pull a published SKILL.md — a GitHub file link or any raw Markdown URL.",
                  onPick: () => {
                    setChooserOpen(false);
                    importFromUrl.reset();
                    setImportUrl("");
                    setUrlOpen(true);
                  },
                },
                {
                  icon: HardDrive,
                  title: "Copy from runtime",
                  hint: "Promote a skill already installed on your local runtimes (~/.claude/skills, ~/.agents/skills…).",
                  onPick: () => {
                    setChooserOpen(false);
                    importLocal.reset();
                    setLastLocalImport(null);
                    setRuntimeOpen(true);
                  },
                },
              ] as const
            ).map((opt) => (
              <button
                key={opt.title}
                type="button"
                onClick={opt.onPick}
                className="flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <opt.icon className="size-4 text-muted-foreground" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{opt.title}</span>
                  <span className="block text-xs text-muted-foreground">{opt.hint}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Import from URL */}
      <Dialog open={urlOpen} onOpenChange={setUrlOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import skill from URL</DialogTitle>
            <DialogDescription>
              Link a SKILL.md — GitHub file links are converted to raw automatically. Frontmatter
              (name, description) is read from the file.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>URL</Label>
              <Input
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
                placeholder="https://github.com/anthropics/skills/blob/main/…/SKILL.md"
                className="font-mono text-xs"
                autoFocus
              />
            </div>
            {importFromUrl.isError && (
              <p className="text-sm text-destructive">{importFromUrl.error.message}</p>
            )}
            {importFromUrl.isError && importFromUrl.error.status === 409 && (
              <Button
                variant="outline"
                size="sm"
                disabled={importFromUrl.isPending}
                onClick={() =>
                  importFromUrl.mutate(
                    { url: importUrl.trim(), overwrite: true },
                    { onSuccess: () => setUrlOpen(false) },
                  )
                }
              >
                Overwrite the existing skill
              </Button>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUrlOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!importUrl.trim() || importFromUrl.isPending}
              onClick={() =>
                importFromUrl.mutate(
                  { url: importUrl.trim() },
                  { onSuccess: () => setUrlOpen(false) },
                )
              }
            >
              {importFromUrl.isPending ? "Importing…" : "Import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Copy from runtime */}
      <Dialog open={runtimeOpen} onOpenChange={setRuntimeOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Copy a skill from your runtime</DialogTitle>
            <DialogDescription>
              Skills installed for your local CLI runtimes. Importing copies the SKILL.md into the
              workspace library — the original stays untouched.
            </DialogDescription>
          </DialogHeader>
          {localSkills.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : localSkills.isError ? (
            <p className="text-sm text-destructive">{localSkills.error.message}</p>
          ) : (localSkills.data ?? []).length === 0 ? (
            <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
              No skills found on this machine — nothing in ~/.claude/skills,
              ~/.gemini/antigravity-cli/skills, or ~/.agents/skills.
            </p>
          ) : (
            <div className="max-h-96 divide-y overflow-y-auto rounded-lg border">
              {(localSkills.data ?? []).map((s) => {
                const state = lastLocalImport?.sourcePath === s.sourcePath ? lastLocalImport.status : null;
                return (
                  <div key={s.sourcePath} className="flex items-center gap-3 px-3 py-2.5">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <Puzzle className="size-3.5 text-muted-foreground" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-medium">{s.name}</span>
                        <Badge variant="secondary" className="text-[10px]">
                          {s.provider}
                        </Badge>
                        {s.root === "universal" && (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground">
                            shared
                          </Badge>
                        )}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {s.description || s.key}
                        {s.fileCount > 1 ? ` · ${s.fileCount} files (SKILL.md imported)` : ""}
                      </span>
                    </span>
                    {state === "created" || state === "updated" ? (
                      <Badge variant="success" className="text-[10px]">
                        {state === "created" ? "imported" : "overwritten"}
                      </Badge>
                    ) : state === "conflict" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={importLocal.isPending}
                        onClick={() =>
                          importLocal.mutate(
                            { sourcePath: s.sourcePath, overwrite: true },
                            {
                              onSuccess: (r) =>
                                setLastLocalImport({ sourcePath: s.sourcePath, status: r.action }),
                            },
                          )
                        }
                        title="A workspace skill with this name already exists"
                      >
                        Overwrite
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={importLocal.isPending}
                        onClick={() =>
                          importLocal.mutate(
                            { sourcePath: s.sourcePath },
                            {
                              onSuccess: (r) =>
                                setLastLocalImport({ sourcePath: s.sourcePath, status: r.action }),
                              onError: (err) => {
                                if (err.status === 409)
                                  setLastLocalImport({ sourcePath: s.sourcePath, status: "conflict" });
                              },
                            },
                          )
                        }
                      >
                        <Download className="size-3.5" /> Import
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {importLocal.isError && importLocal.error.status !== 409 && (
            <p className="text-sm text-destructive">{importLocal.error.message}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRuntimeOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleting != null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={deleting ? `Delete “${deleting.name}”?` : "Delete skill?"}
        description={
          deleting && (usedBy.get(deleting.id) ?? []).length > 0
            ? `It is assigned to ${(usedBy.get(deleting.id) ?? []).length} agent(s); their future runs will no longer receive it. This can't be undone.`
            : "The skill and its instructions are removed. This can't be undone."
        }
        pending={deleteSkill.isPending}
        pendingLabel="Deleting…"
        onConfirm={() =>
          deleting && deleteSkill.mutate(deleting.id, { onSuccess: () => setDeleting(null) })
        }
      />

      {/* Chips row: quick visibility of which agents use skills at all. */}
      {(assignments.data ?? []).length > 0 && (
        <p className="text-xs text-muted-foreground">
          {(assignments.data ?? []).length} assignment
          {(assignments.data ?? []).length !== 1 && "s"} across{" "}
          {new Set((assignments.data ?? []).map((a) => a.agentId)).size} agent
          {new Set((assignments.data ?? []).map((a) => a.agentId)).size !== 1 && "s"}.
        </p>
      )}
    </div>
  );
}
