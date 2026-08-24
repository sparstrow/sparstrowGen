import * as React from "react";
import {
  MEMORY_NOTE_TYPES,
  type MemoryNoteType,
  type MemoryScopeKind,
  type MemorySynthesis,
} from "@sparstrow/shared";
import { Archive, FileText, Link2, Pencil, Plus, RefreshCw, Search, ShieldAlert, Sparkles, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  useAgents,
  useApproveNote,
  useArchiveNote,
  useBulkDeleteNotes,
  useCreateMemoryNote,
  useDeleteMemoryNote,
  useHealth,
  useMemoryNotes,
  useMemoryRescan,
  useMemorySearch,
  useNoteLinks,
  useNoteRaw,
  useProjects,
  useUpdateNoteRaw,
  type MemorySearchResult,
} from "@web/api/hooks";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type ScopeTab = "all" | MemoryScopeKind;
/** "quarantined" is the EH6 review facet; "signal" filters by machine source. */
type TypeFacet = "all" | MemoryNoteType | "quarantined" | "signal";

export function MemoryPage() {
  const [scopeTab, setScopeTab] = React.useState<ScopeTab>("all");
  const [typeFacet, setTypeFacet] = React.useState<TypeFacet>("all");
  const [query, setQuery] = React.useState("");
  const [debouncedQuery, setDebouncedQuery] = React.useState("");
  const [synthesize, setSynthesize] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [bulkSignalOpen, setBulkSignalOpen] = React.useState(false);
  const [editMode, setEditMode] = React.useState(false);
  const [editContent, setEditContent] = React.useState("");
  const [searchResult, setSearchResult] = React.useState<MemorySearchResult | null>(null);

  const typeFilter = typeFacet !== "all" && typeFacet !== "quarantined" && typeFacet !== "signal"
    ? typeFacet
    : undefined;

  const health = useHealth();
  const notes = useMemoryNotes({
    ...(scopeTab === "all" ? {} : { scope: scopeTab }),
    ...(typeFilter ? { type: typeFilter } : {}),
    ...(typeFacet === "quarantined" ? { quarantined: true } : {}),
    ...(typeFacet === "signal" ? { source: "signal" } : {}),
  });
  const noteRaw = useNoteRaw(selectedId ?? "");
  const rescan = useMemoryRescan();
  const search = useMemorySearch();
  const updateRaw = useUpdateNoteRaw();
  const deleteNote = useDeleteMemoryNote();
  const bulkDelete = useBulkDeleteNotes();

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  React.useEffect(() => {
    if (debouncedQuery.length >= 2) {
      search.mutate(
        { query: debouncedQuery, k: 20, type: typeFilter, synthesize },
        { onSuccess: (result) => setSearchResult(result) },
      );
    } else {
      setSearchResult(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery, typeFilter, synthesize]);

  const selected = notes.data?.find((n) => n.id === selectedId) ?? null;
  const searching = searchResult !== null;
  const searchHits = searchResult?.hits ?? [];

  const selectNote = (id: string) => {
    setSelectedId(id);
    setEditMode(false);
  };

  return (
    <div className="grid h-full gap-4 lg:grid-cols-[24rem_1fr]">
      {/* Left pane */}
      <div className="flex min-h-0 flex-col gap-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search memory…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <Button
            variant={synthesize ? "default" : "outline"}
            size="icon"
            title="Synthesize: one cited answer + what memory doesn't know"
            onClick={() => setSynthesize((v) => !v)}
          >
            <Sparkles className="size-4" />
          </Button>
          <Button variant="outline" size="icon" title="Rescan vault" onClick={() => rescan.mutate()}>
            <RefreshCw className={cn("size-4", rescan.isPending && "animate-spin")} />
          </Button>
          <Button size="icon" title="New note" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
          </Button>
        </div>

        {rescan.data && (
          <p className="text-xs text-muted-foreground">
            Rescan: +{rescan.data.added} added, {rescan.data.updated} updated,{" "}
            {rescan.data.removed} removed
          </p>
        )}

        {!searching && (
          <Tabs value={scopeTab} onValueChange={(v) => setScopeTab(v as ScopeTab)}>
            <TabsList className="w-full">
              <TabsTrigger value="all" className="flex-1">
                All
              </TabsTrigger>
              <TabsTrigger value="global" className="flex-1">
                Global
              </TabsTrigger>
              <TabsTrigger value="project" className="flex-1">
                Projects
              </TabsTrigger>
              <TabsTrigger value="agent" className="flex-1">
                Agents
              </TabsTrigger>
            </TabsList>
          </Tabs>
        )}

        {/* P5 type facets — outside the searching conditional on purpose: the
            type filter feeds the search body too. */}
        <div className="flex flex-wrap items-center gap-1">
          {(["all", ...MEMORY_NOTE_TYPES, "signal", "quarantined"] as TypeFacet[]).map((facet) => (
            <button
              key={facet}
              type="button"
              onClick={() => setTypeFacet(facet)}
              className={cn(
                "rounded-full border px-2 py-0.5 text-[11px] transition-colors hover:bg-accent",
                typeFacet === facet && "border-primary bg-accent font-medium",
                facet === "quarantined" && "text-warning",
              )}
            >
              {facet}
            </button>
          ))}
          {typeFacet === "signal" && (notes.data?.length ?? 0) > 0 && !searching && (
            <button
              type="button"
              className="ml-auto rounded-full border border-destructive/40 px-2 py-0.5 text-[11px] text-destructive transition-colors hover:bg-destructive/10"
              disabled={bulkDelete.isPending}
              onClick={() => setBulkSignalOpen(true)}
              title="Delete every extracted signal note (the nightly pass can re-learn)"
            >
              delete all signals
            </button>
          )}
        </div>
        {typeFacet === "quarantined" && (
          <p className="text-xs text-warning">
            Quarantined notes came from runs that consumed untrusted content. They are never
            injected or searchable by agents until you approve them.
          </p>
        )}

        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto rounded-xl border p-2">
          {searching ? (
            search.isPending ? (
              <Skeleton className="h-16 w-full" />
            ) : searchHits.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No matches.</p>
            ) : (
              searchHits.map((hit) => (
                <button
                  key={`${hit.noteId}-${hit.heading ?? ""}`}
                  type="button"
                  onClick={() => selectNote(hit.noteId)}
                  className={cn(
                    "w-full rounded-md border px-3 py-2 text-left transition-colors hover:bg-accent",
                    selectedId === hit.noteId && "border-primary bg-accent",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{hit.title}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      {hit.type !== "note" && (
                        <Badge variant="secondary" className="text-[10px]">
                          {hit.type}
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-[10px]">
                        {hit.score.toFixed(3)}
                      </Badge>
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{hit.excerpt}</p>
                  <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
                    {hit.path}
                  </p>
                </button>
              ))
            )
          ) : notes.isLoading ? (
            <>
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </>
          ) : (notes.data ?? []).length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              {typeFacet === "quarantined"
                ? "Nothing awaiting review."
                : "No notes in this scope yet. Drop .md files into the vault or create one here."}
            </p>
          ) : (
            (notes.data ?? []).map((note) => (
              <button
                key={note.id}
                type="button"
                onClick={() => selectNote(note.id)}
                className={cn(
                  "w-full rounded-md px-3 py-2 text-left transition-colors hover:bg-accent",
                  selectedId === note.id && "bg-accent",
                )}
              >
                <div className="flex items-center gap-2">
                  <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate text-sm font-medium">{note.title}</span>
                  {note.quarantined && (
                    <ShieldAlert className="size-3.5 shrink-0 text-warning" />
                  )}
                </div>
                <div className="mt-1 flex items-center gap-1.5">
                  <Badge variant="outline" className="text-[10px]">
                    {note.scope}
                    {note.projectSlug ? `:${note.projectSlug}` : ""}
                    {note.agentSlug ? `:${note.agentSlug}` : ""}
                  </Badge>
                  {note.type !== "note" && (
                    <Badge variant="secondary" className="text-[10px]">
                      {note.type}
                    </Badge>
                  )}
                  {note.tags.slice(0, 2).map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-[10px]">
                      {tag}
                    </Badge>
                  ))}
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    {formatDate(note.updatedAt)}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right pane */}
      <div className="flex min-h-0 flex-col gap-3">
        {searching && searchResult?.synthesis && (
          <SynthesisCard synthesis={searchResult.synthesis} onOpenNote={selectNote} />
        )}
        {searching && synthesize && !search.isPending && !searchResult?.synthesis && (
          <p className="rounded-md border px-3 py-2 text-xs text-muted-foreground">
            Synthesis unavailable (utility model failed) — raw hits only.
          </p>
        )}
        {selected || selectedId ? (
          <Card className="flex min-h-0 flex-1 flex-col">
            <CardContent className="flex min-h-0 flex-1 flex-col gap-3 p-5">
              {selected && (
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold">{selected.title}</h2>
                  <Badge variant="outline">{selected.scope}</Badge>
                  {selected.type !== "note" && <Badge variant="secondary">{selected.type}</Badge>}
                  <Badge variant="secondary" className="font-mono text-[10px]">
                    {selected.source}
                  </Badge>
                  {selected.quarantined && (
                    <Badge className="bg-warning/15 text-warning">
                      quarantined
                    </Badge>
                  )}
                  {selected.archivedAt && <Badge variant="outline">archived</Badge>}
                  <span className="font-mono text-xs text-muted-foreground">{selected.path}</span>
                  <div className="flex-1" />
                  {!editMode && selected.quarantined && (
                    <QuarantineActions noteId={selected.id} onRejected={() => setSelectedId(null)} />
                  )}
                  {!editMode && (
                    <>
                      {!selected.archivedAt && !selected.quarantined && (
                        <ArchiveAction noteId={selected.id} />
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditContent(noteRaw.data?.content ?? "");
                          setEditMode(true);
                        }}
                        disabled={!noteRaw.data}
                      >
                        <Pencil className="size-3.5" /> Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive"
                        onClick={() => setDeleteOpen(true)}
                      >
                        <Trash2 className="size-3.5" /> Delete
                      </Button>
                    </>
                  )}
                </div>
              )}

              {editMode ? (
                <>
                  <Textarea
                    className="min-h-0 flex-1 resize-none font-mono text-xs"
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => setEditMode(false)}>
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      disabled={updateRaw.isPending}
                      onClick={() =>
                        selectedId &&
                        updateRaw.mutate(
                          { id: selectedId, content: editContent },
                          { onSuccess: () => setEditMode(false) },
                        )
                      }
                    >
                      Save
                    </Button>
                  </div>
                </>
              ) : noteRaw.isLoading ? (
                <Skeleton className="h-48 w-full" />
              ) : (
                <>
                  <pre className="min-h-0 flex-1 overflow-auto rounded-md bg-muted/30 p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap">
                    {noteRaw.data?.content ?? ""}
                  </pre>
                  {selectedId && <NoteLinksStrip noteId={selectedId} onOpenNote={selectNote} />}
                </>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="flex h-full min-h-[50vh] flex-col items-center justify-center gap-3 rounded-xl border text-center">
            <FileText className="size-10 text-muted-foreground/40" />
            <div>
              <p className="text-sm font-medium">Select a note to view it</p>
              <p className="mt-1 text-sm text-muted-foreground">
                This vault is a normal Obsidian vault — open{" "}
                <span className="font-mono text-xs">{health.data?.vault.path ?? "…"}</span> in
                Obsidian to browse the same notes.
              </p>
            </div>
          </div>
        )}
      </div>

      <CreateNoteDialog open={createOpen} onOpenChange={setCreateOpen} />

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this note?</DialogTitle>
            <DialogDescription>
              The markdown file is deleted from the vault. This cannot be undone. (For dream-cycle
              merges the factory archives instead — consider Archive.)
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteNote.isPending}
              onClick={() =>
                selectedId &&
                deleteNote.mutate(selectedId, {
                  onSuccess: () => {
                    setDeleteOpen(false);
                    setSelectedId(null);
                  },
                })
              }
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={bulkSignalOpen}
        onOpenChange={setBulkSignalOpen}
        title="Delete all signal notes?"
        description="Every extracted signal note is removed from the vault. The nightly pass can re-learn them, but this can't be undone directly."
        confirmLabel="Delete all signals"
        pending={bulkDelete.isPending}
        pendingLabel="Deleting…"
        onConfirm={() =>
          bulkDelete.mutate(
            { source: "signal" },
            { onSuccess: () => setBulkSignalOpen(false) },
          )
        }
      />
    </div>
  );
}

/** P5 synthesis-over-search: the cited answer + explicit gaps, above the hits. */
function SynthesisCard({
  synthesis,
  onOpenNote,
}: {
  synthesis: MemorySynthesis;
  onOpenNote: (id: string) => void;
}) {
  return (
    <div className="rounded-xl border p-3">
      <div className="mb-2 flex items-center gap-2">
        <Sparkles className="size-4 text-muted-foreground" />
        <p className="text-sm font-medium">Synthesis</p>
        <span className="text-[11px] text-muted-foreground">
          from {synthesis.citations.length} cited note{synthesis.citations.length === 1 ? "" : "s"}
        </span>
      </div>
      <p className="whitespace-pre-wrap text-sm leading-relaxed">{synthesis.answer}</p>
      {synthesis.citations.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {synthesis.citations.map((c) => (
            <button
              key={c.index}
              type="button"
              onClick={() => onOpenNote(c.noteId)}
              className="rounded-full border px-2 py-0.5 text-[11px] transition-colors hover:bg-accent"
              title={c.path}
            >
              [{c.index}] {c.title}
            </button>
          ))}
        </div>
      )}
      {synthesis.gaps.length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          <span className="font-medium">Gaps — memory doesn&apos;t know:</span>{" "}
          {synthesis.gaps.join(" · ")}
        </p>
      )}
    </div>
  );
}

/** EH6 review actions: approve makes it injectable; reject deletes it. */
function QuarantineActions({ noteId, onRejected }: { noteId: string; onRejected: () => void }) {
  const approve = useApproveNote();
  const reject = useDeleteMemoryNote();
  return (
    <>
      <Button
        size="sm"
        disabled={approve.isPending}
        onClick={() => approve.mutate(noteId)}
        title="Mark this signal safe — it becomes searchable and injectable"
      >
        Approve
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="text-destructive"
        disabled={reject.isPending}
        onClick={() => reject.mutate(noteId, { onSuccess: onRejected })}
      >
        Reject
      </Button>
      {approve.isError && <span className="text-xs text-destructive">{approve.error.message}</span>}
    </>
  );
}

function ArchiveAction({ noteId }: { noteId: string }) {
  const archive = useArchiveNote();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={archive.isPending}
      onClick={() => archive.mutate(noteId)}
      title="Hide from search and injection; the file stays in the vault"
    >
      <Archive className="size-3.5" /> Archive
    </Button>
  );
}

/** P5 wikilinks: outgoing links + backlinks under the note body. */
function NoteLinksStrip({
  noteId,
  onOpenNote,
}: {
  noteId: string;
  onOpenNote: (id: string) => void;
}) {
  const links = useNoteLinks(noteId);
  const outgoing = links.data?.outgoing ?? [];
  const backlinks = links.data?.backlinks ?? [];
  if (outgoing.length === 0 && backlinks.length === 0) return null;
  return (
    <div className="space-y-1.5 rounded-md border px-3 py-2">
      {outgoing.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <Link2 className="size-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">Links:</span>
          {outgoing.map((l) => (
            <button
              key={l.id}
              type="button"
              disabled={!l.toNoteId}
              onClick={() => l.toNoteId && onOpenNote(l.toNoteId)}
              className={cn(
                "rounded-full border px-2 py-0.5 text-[11px]",
                l.toNoteId ? "transition-colors hover:bg-accent" : "opacity-60",
              )}
              title={l.toNoteId ? (l.toPath ?? "") : "no note with this title yet"}
            >
              [[{l.unresolvedTitle}]]{!l.toNoteId && " ?"}
            </button>
          ))}
        </div>
      )}
      {backlinks.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">Backlinks:</span>
          {backlinks.map((b) => (
            <button
              key={b.fromNoteId}
              type="button"
              onClick={() => onOpenNote(b.fromNoteId)}
              className="rounded-full border px-2 py-0.5 text-[11px] transition-colors hover:bg-accent"
              title={b.fromPath}
            >
              {b.fromTitle}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateNoteDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const projects = useProjects();
  const agents = useAgents();
  const createNote = useCreateMemoryNote();

  const [title, setTitle] = React.useState("");
  const [scope, setScope] = React.useState<MemoryScopeKind>("global");
  const [noteType, setNoteType] = React.useState<MemoryNoteType>("note");
  const [projectSlug, setProjectSlug] = React.useState("");
  const [agentSlug, setAgentSlug] = React.useState("");
  const [tags, setTags] = React.useState("");
  const [content, setContent] = React.useState("");

  const submit = () => {
    createNote.mutate(
      {
        title: title.trim(),
        content,
        scope,
        projectSlug: scope === "project" ? projectSlug || null : null,
        agentSlug: scope === "agent" ? agentSlug || null : null,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        source: "user",
        type: noteType,
        refs: [],
        quarantined: false,
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          setTitle("");
          setContent("");
          setTags("");
          setNoteType("note");
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>New memory note</DialogTitle>
          <DialogDescription>
            Drop knowledge into the vault — agents with matching read scopes will find it.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Scope</Label>
              <Select value={scope} onValueChange={(v) => setScope(v as MemoryScopeKind)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">Global (overall knowledge)</SelectItem>
                  <SelectItem value="project">Project</SelectItem>
                  <SelectItem value="agent">Agent (private)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={noteType} onValueChange={(v) => setNoteType(v as MemoryNoteType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MEMORY_NOTE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {scope === "project" && (
              <div className="space-y-1.5">
                <Label>Project</Label>
                <Select value={projectSlug} onValueChange={setProjectSlug}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pick project" />
                  </SelectTrigger>
                  <SelectContent>
                    {(projects.data ?? []).map((p) => (
                      <SelectItem key={p.slug} value={p.slug}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {scope === "agent" && (
              <div className="space-y-1.5">
                <Label>Agent</Label>
                <Select value={agentSlug} onValueChange={setAgentSlug}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pick agent" />
                  </SelectTrigger>
                  <SelectContent>
                    {(agents.data ?? []).map((a) => (
                      <SelectItem key={a.slug} value={a.slug}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Tags (comma separated)</Label>
            <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="pricing, research" />
          </div>
          <div className="space-y-1.5">
            <Label>Content (markdown)</Label>
            <Textarea rows={10} value={content} onChange={(e) => setContent(e.target.value)} />
          </div>
          {createNote.isError && (
            <p className="text-sm text-destructive">{createNote.error.message}</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={
              !title.trim() ||
              createNote.isPending ||
              (scope === "project" && !projectSlug) ||
              (scope === "agent" && !agentSlug)
            }
          >
            Save note
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
