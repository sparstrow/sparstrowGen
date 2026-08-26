import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { SkillDetail } from "@sparstrow/shared";
import {
  ArrowLeft,
  Bot,
  FileText,
  Folder,
  FolderOpen,
  HardDrive,
  Link2,
  Pencil,
  Puzzle,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useQueryClient } from "@tanstack/react-query";
import { Markdown } from "@web/components/chat/markdown";
import { useAgents, useSkill, useSkillAssignments } from "@web/api/hooks";
import { callAction } from "@web/lib/call-action";
import { formatDate, shortId } from "@/lib/format";
import { cn } from "@/lib/utils";
import { deleteSkillAction, updateSkillAction } from "../actions";

const SKILL_MD = "SKILL.md";

/** A flat `{path}` list → nested folder tree, SKILL.md pinned first. */
interface TreeNode {
  name: string;
  path: string; // "" for folders
  children: TreeNode[];
}

function buildTree(paths: string[]): TreeNode {
  const root: TreeNode = { name: "", path: "", children: [] };
  for (const full of paths) {
    const parts = full.split("/");
    let node = root;
    parts.forEach((part, i) => {
      const isLeaf = i === parts.length - 1;
      let child = node.children.find((c) => c.name === part && (isLeaf ? c.path !== "" : c.path === ""));
      if (!child) {
        child = { name: part, path: isLeaf ? full : "", children: [] };
        node.children.push(child);
      }
      node = child;
    });
  }
  const sort = (n: TreeNode) => {
    n.children.sort((a, b) => {
      const aDir = a.path === "";
      const bDir = b.path === "";
      if (aDir !== bDir) return aDir ? -1 : 1; // folders first
      return a.name.localeCompare(b.name);
    });
    n.children.forEach(sort);
  };
  sort(root);
  return root;
}

function FileTree({
  node,
  depth,
  selected,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  selected: string;
  onSelect: (path: string) => void;
}) {
  const [open, setOpen] = React.useState(true);
  if (node.path !== "") {
    const isActive = selected === node.path;
    return (
      <button
        type="button"
        onClick={() => onSelect(node.path)}
        style={{ paddingLeft: depth * 12 + 8 }}
        className={cn(
          "flex w-full items-center gap-1.5 rounded py-1 pr-2 text-left text-xs transition-colors",
          isActive ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent/60",
        )}
      >
        <FileText className="size-3.5 shrink-0" />
        <span className="truncate">{node.name}</span>
      </button>
    );
  }
  // Folder (skip the synthetic root wrapper).
  return (
    <>
      {node.name !== "" && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          style={{ paddingLeft: depth * 12 + 8 }}
          className="flex w-full items-center gap-1.5 rounded py-1 pr-2 text-left text-xs font-medium text-foreground/80 hover:bg-accent/60"
        >
          {open ? <FolderOpen className="size-3.5 shrink-0" /> : <Folder className="size-3.5 shrink-0" />}
          <span className="truncate">{node.name}</span>
        </button>
      )}
      {(node.name === "" || open) &&
        node.children.map((c) => (
          <FileTree
            key={c.path || `dir:${c.name}:${depth}`}
            node={c}
            depth={node.name === "" ? depth : depth + 1}
            selected={selected}
            onSelect={onSelect}
          />
        ))}
    </>
  );
}

const ORIGIN_LABEL: Record<SkillDetail["sourceType"], { label: string; icon: typeof Puzzle }> = {
  manual: { label: "Created manually", icon: Pencil },
  url: { label: "Imported from URL", icon: Link2 },
  runtime: { label: "Copied from local runtime", icon: HardDrive },
};

export function SkillDetailPage() {
  const { skillId } = useParams<{ skillId: string }>();
  const router = useRouter();
  const skillQuery = useSkill(skillId);
  const agents = useAgents();
  const assignments = useSkillAssignments();
  const queryClient = useQueryClient();
  const [, startToggle] = React.useTransition();
  const [deletePending, startDelete] = React.useTransition();
  const [deleting, setDeleting] = React.useState(false);
  const [selected, setSelected] = React.useState(SKILL_MD);

  const toggleSkill = (id: string, enabled: boolean) => {
    startToggle(async () => {
      const r = await callAction(() => updateSkillAction(id, { enabled }));
      if (!r.ok) return;
      await queryClient.invalidateQueries({ queryKey: ["skills"] });
    });
  };

  const skill = skillQuery.data;

  const users = React.useMemo(
    () => (assignments.data ?? []).filter((a) => a.skillId === skillId).map((a) => a.agentId),
    [assignments.data, skillId],
  );
  const agentName = (id: string) => agents.data?.find((a) => a.id === id)?.name ?? id;

  const tree = React.useMemo(
    () => (skill ? buildTree([SKILL_MD, ...skill.files.map((f) => f.path)]) : null),
    [skill],
  );

  if (skillQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (skillQuery.isError || !skill) {
    return (
      <div className="space-y-4">
        <Link href="/skills" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Skills
        </Link>
        <div className="rounded-xl border border-dashed py-16 text-center">
          <p className="text-sm font-medium">Skill not found</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {skillQuery.error?.message ?? "It may have been deleted."}
          </p>
        </div>
      </div>
    );
  }

  const origin = ORIGIN_LABEL[skill.sourceType];
  const selectedFile =
    selected === SKILL_MD ? null : skill.files.find((f) => f.path === selected) ?? null;
  const isMarkdown = selected === SKILL_MD || selected.toLowerCase().endsWith(".md");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <Link
            href="/skills"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> Skills
          </Link>
          <div className="mt-2 flex items-center gap-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
              <Puzzle className="size-4 text-muted-foreground" />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold tracking-tight">{skill.name}</h1>
              <p className="truncate text-sm text-muted-foreground">
                {skill.description || "No description"}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch
              checked={skill.enabled}
              onCheckedChange={(enabled) => toggleSkill(skill.id, enabled)}
            />
            {skill.enabled ? "Enabled" : "Disabled"}
          </label>
          <Button variant="outline" size="sm" onClick={() => router.push("/skills")}>
            <Pencil className="size-3.5" /> Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => setDeleting(true)}
          >
            <Trash2 className="size-3.5" /> Delete
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_18rem]">
        {/* File browser + viewer */}
        <Card className="overflow-hidden">
          <div className="grid grid-cols-1 md:grid-cols-[13rem_1fr]">
            <div className="border-b bg-muted/30 p-2 md:border-b-0 md:border-r">
              <p className="px-2 pb-1.5 pt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Files ({skill.files.length + 1})
              </p>
              <div className="space-y-0.5">
                {tree && (
                  <FileTree node={tree} depth={0} selected={selected} onSelect={setSelected} />
                )}
              </div>
            </div>
            <div className="min-w-0 p-4">
              <div className="mb-3 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <FileText className="size-3.5" />
                {selected}
              </div>
              {isMarkdown ? (
                <div className="prose-sm max-w-none">
                  <Markdown content={selected === SKILL_MD ? skill.content || "_Empty SKILL.md_" : selectedFile?.content ?? ""} />
                </div>
              ) : (
                <pre className="overflow-x-auto rounded-lg bg-muted/50 p-3 text-xs leading-relaxed">
                  <code>{selectedFile?.content ?? ""}</code>
                </pre>
              )}
            </div>
          </div>
        </Card>

        {/* Metadata / Origin / Used by */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Metadata</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              <Meta label="Files" value={`${skill.files.length + 1}`} />
              <Meta label="Created" value={formatDate(skill.createdAt)} />
              <Meta label="Updated" value={formatDate(skill.updatedAt)} />
              <Meta label="ID" value={shortId(skill.id)} mono />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Origin</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              <div className="flex items-center gap-1.5 font-medium text-foreground">
                <origin.icon className="size-3.5 text-muted-foreground" />
                {origin.label}
              </div>
              {skill.sourceProvider && (
                <Meta label="Provider" value={skill.sourceProvider} />
              )}
              {skill.sourceRef && (
                <div className="space-y-0.5">
                  <span className="text-muted-foreground">
                    {skill.sourceType === "url" ? "URL" : "Source"}
                  </span>
                  <p className="break-all font-mono text-[11px] text-foreground/80">
                    {skill.sourceRef}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Used by</CardTitle>
            </CardHeader>
            <CardContent className="text-xs">
              {users.length === 0 ? (
                <p className="text-muted-foreground">
                  Unassigned — assign it to agents from the{" "}
                  <Link href="/agents" className="underline underline-offset-2">
                    Agents
                  </Link>{" "}
                  page.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {users.map((id) => (
                    <div key={id} className="flex items-center gap-1.5">
                      <Bot className="size-3.5 text-muted-foreground" />
                      <span className="truncate">{agentName(id)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
            The SKILL.md body is injected into every run of the agents this skill is assigned to.
            {skill.files.length > 0 &&
              " Supporting files are written to disk and the agent is pointed at them on demand."}
          </p>
        </div>
      </div>

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete “${skill.name}”?`}
        description={
          users.length > 0
            ? `It is assigned to ${users.length} agent(s); their future runs will no longer receive it. This can't be undone.`
            : "The skill and its files are removed. This can't be undone."
        }
        pending={deletePending}
        pendingLabel="Deleting…"
        onConfirm={() => {
          const id = skill.id;
          startDelete(async () => {
            const r = await callAction(() => deleteSkillAction(id));
            if (!r.ok) return;
            await queryClient.invalidateQueries({ queryKey: ["skills"] });
            router.push("/skills");
          });
        }}
      />
    </div>
  );
}

function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("truncate text-foreground", mono && "font-mono text-[11px]")}>{value}</span>
    </div>
  );
}
