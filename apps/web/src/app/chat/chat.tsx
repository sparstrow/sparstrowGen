import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import {
  ArrowUp,
  Bot,
  FolderKanban,
  MessageSquare,
  MonitorPlay,
  MoreHorizontal,
  Paperclip,
  PanelRight,
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  CHAT_ATTACHMENT_BUCKET,
  checkChatAttachmentFile,
  KNOWN_MODELS,
  PROVIDER_KINDS,
  type ChatAttachmentUpload,
  type ChatMessage,
  type ChatSession,
  type ChatSessionKind,
  type ChatSessionUpdate,
  type ChatTurnError,
  type ChatTurnState,
  type ProviderId,
} from "@sparstrow/shared";
import { Button } from "@/components/ui/button";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ChatTurnView, ThinkingDots, TurnErrorBanner } from "@web/components/chat/chat-bits";
import { createChatAttachmentUploader } from "@web/lib/storage/attachment-uploader";
import { createClient } from "@web/utils/supabase/client";
import {
  useAgents,
  useChatSession,
  useChatSessions,
  useProjects,
  useProviderModelCache,
  useWorkspace,
} from "@web/api/hooks";
import { useLiveEvents } from "@web/lib/live-events";
import { callAction } from "@web/lib/call-action";
import {
  createChatSessionAction,
  deleteChatSessionAction,
  postChatTurnAction,
  requestModelDiscoveryAction,
  retryChatTurnAction,
  updateChatSessionAction,
} from "./actions";
import {
  applyChatTurnBroadcast,
  applyChatTurnState,
  isBroadcastForHeldTurn,
  isTurnBusy,
} from "@web/lib/chat-turn-state";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const CLI_PROVIDERS = (Object.keys(PROVIDER_KINDS) as ProviderId[]).filter(
  (p) => PROVIDER_KINDS[p] === "cli",
);

const KIND_LABELS: Record<ChatSessionKind, string> = {
  free: "Free chat",
  project: "Project",
  agent: "Agent",
  "agent-creator": "Agent Creator",
};

const KIND_ICONS: Record<ChatSessionKind, typeof MessageSquare> = {
  free: MessageSquare,
  project: FolderKanban,
  agent: Bot,
  "agent-creator": Sparkles,
};

/**
 * Per-session actions (rail row + conversation header). Rename is wired here
 * directly (`onRename` toggles the shared inline-edit state in `ChatPage`);
 * Delete calls `onRequestDelete`, which `ChatPage` wires to
 * `ChatSessionDeleteDialog` below.
 */
function ChatSessionMenu({
  onRename,
  onRequestDelete,
  triggerClassName,
}: {
  onRename: () => void;
  onRequestDelete: () => void;
  triggerClassName?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:outline-none",
          triggerClassName,
        )}
      >
        <MoreHorizontal className="size-4" />
        <span className="sr-only">Session actions</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onRename}>
          <Pencil className="size-4" /> Rename
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:bg-destructive/10 focus:text-destructive"
          onClick={onRequestDelete}
        >
          <Trash2 className="size-4" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The Archive / Delete / Cancel confirmation US1 asks for — deliberately
 * three buttons, not `ConfirmDialog`'s shared two (Cancel + one confirm):
 * that component is used elsewhere in the app for plain "are you sure?"
 * gates and adding a third action to its shared API would change what every
 * other caller renders. `pendingAction` (not just a boolean) drives the
 * Archive button's own busy label distinctly from Delete's.
 */
function ChatSessionDeleteDialog({
  open,
  onOpenChange,
  onArchive,
  onDelete,
  pendingAction,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onArchive: () => void;
  onDelete: () => void;
  pendingAction: "archive" | "delete" | null;
  error: string | null;
}) {
  const pending = pendingAction !== null;
  return (
    <Dialog open={open} onOpenChange={(v) => !pending && onOpenChange(v)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Remove this conversation?</DialogTitle>
          <DialogDescription>
            Archive keeps it, out of your active list, and you can bring it back
            later. Delete permanently removes this conversation and its message
            history — that can&apos;t be undone.
          </DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter className="gap-2 sm:justify-end">
          <Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="outline" disabled={pending} onClick={onArchive}>
            {pendingAction === "archive" ? "Archiving…" : "Archive"}
          </Button>
          <Button variant="destructive" disabled={pending} onClick={onDelete}>
            {pendingAction === "delete" ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Borderless select used inside the composer footer and toolbar. */
function GhostSelect({
  value,
  onValueChange,
  placeholder,
  children,
  width = "w-auto",
  title,
}: {
  value: string;
  onValueChange: (v: string) => void;
  placeholder?: string;
  children: React.ReactNode;
  width?: string;
  title?: string;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger
        title={title}
        className={cn(
          "h-7 gap-1 rounded-md border-none bg-transparent px-2 text-xs text-muted-foreground shadow-none hover:bg-muted hover:text-foreground focus:ring-0",
          width,
        )}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>{children}</SelectContent>
    </Select>
  );
}

// A genuinely live discovery result is trusted for a full hour (plan Decision
// 2). Anything else -- no cache yet, or the last attempt fell back to
// antigravity.ts's static list because no runtime was online/capable or the
// CLI failed -- is worth trying again, not treated as fresh just because
// `checked_at` was recently bumped. See BUG-2026-08-28-antigravity-model-
// picker-can-get-stuck-stale.md: the old isStale check only looked at
// checked_at's age, so a failed/fallback report (which still updates
// checked_at) silently pinned the picker for the rest of the hour.
const ANTIGRAVITY_TRUST_WINDOW_MS = 60 * 60 * 1000;
// How long to wait after dispatching before refetching the cache -- matches
// antigravity.ts's own 20s CLI timeout (discoverModels), so a real, slow-but-
// successful discovery has time to land before we give up on this attempt.
const ANTIGRAVITY_DISCOVERY_WAIT_MS = 20_000;
// Gap between an unresolved attempt's refetch and the next one, so an
// offline/never-configured runtime doesn't get hammered every render.
const ANTIGRAVITY_RETRY_GAP_MS = 10_000;

function isTrustedProviderModelRow(row: { live: boolean; checkedAt: string } | null | undefined): boolean {
  if (!row || !row.live) return false;
  return Date.now() - new Date(row.checkedAt).getTime() < ANTIGRAVITY_TRUST_WINDOW_MS;
}

/**
 * T-CS4-01 (US3). `antigravity`'s model list, live from `provider_model_cache`
 * (T-CS3-02) instead of the static `KNOWN_MODELS` every other provider still
 * uses. `relevant` gates both the read and the dispatch on antigravity
 * actually being selected somewhere in the composer — without it, this fired
 * a `requestModelDiscoveryAction` on every `/chat` load regardless of which
 * provider was showing, exactly the "dispatch nobody asked for" the phase's
 * own Traps note warns against (caught live during this task's own browser
 * verification, not assumed).
 *
 * Retries on a bounded timer rather than once per mount (fixed in
 * BUG-2026-08-28-antigravity-model-picker-can-get-stuck-stale.md): the
 * original one-shot `triggeredRef` latch meant that if no online/capable
 * runtime existed at the moment this fired -- the exact case
 * `request_model_discovery`'s "no online, capable runtime right now, no-op"
 * path anticipates -- the picker was stuck on "no models available yet"
 * for the rest of that page load, with nothing left to retry it. Repeated
 * discovery requests are already expected server-side (see
 * `023_provider_model_cache.sql`'s idempotency-key comment), so this now
 * keeps trying on `ANTIGRAVITY_RETRY_GAP_MS` cadence, driven off a ref (not
 * `cache.data`/`cache.isLoading` in the effect deps) since a repeated null
 * result doesn't change reference and would never re-trigger a dependency-
 * driven effect.
 */
function useAntigravityModels(relevant: boolean) {
  const cache = useProviderModelCache(relevant ? "antigravity" : null);
  const [refreshing, setRefreshing] = React.useState(false);
  const cacheRef = React.useRef(cache);
  cacheRef.current = cache;

  React.useEffect(() => {
    if (!relevant) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const cycle = async () => {
      if (cancelled) return;
      const { data, isLoading } = cacheRef.current;
      if (!isLoading && !isTrustedProviderModelRow(data)) {
        setRefreshing(true);
        try {
          await requestModelDiscoveryAction("antigravity");
        } catch {
          // Reported failure is itself informative (a stale/fallback row),
          // not something to retry harder for -- the next scheduled cycle
          // already covers that.
        }
        await new Promise((resolve) => setTimeout(resolve, ANTIGRAVITY_DISCOVERY_WAIT_MS));
        if (cancelled) return;
        await cacheRef.current.refetch();
        setRefreshing(false);
      }
      if (!cancelled) timer = setTimeout(cycle, ANTIGRAVITY_RETRY_GAP_MS);
    };

    void cycle();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [relevant]);

  return {
    models: cache.data?.models ?? [],
    hasCache: Boolean(cache.data),
    stale: cache.data ? !cache.data.live : false,
    refreshing,
  };
}

type AntigravityModelState = ReturnType<typeof useAntigravityModels>;

function modelsForProvider(provider: ProviderId, antigravity: AntigravityModelState): string[] {
  return provider === "antigravity" ? antigravity.models : KNOWN_MODELS[provider] ?? [];
}

/** US3 scenario 3 -- the antigravity list can be missing, mid-refresh, or stale. */
function AntigravityFreshnessNote({ antigravity }: { antigravity: AntigravityModelState }) {
  if (antigravity.refreshing) {
    return <span className="text-[10px] text-muted-foreground">checking for updates…</span>;
  }
  if (antigravity.stale) {
    return <span className="text-[10px] text-muted-foreground">may not be current</span>;
  }
  return null;
}

/**
 * Shared by every model dropdown in this file. `claude-code` (and any future
 * static-list provider) renders exactly as before; `antigravity`'s empty
 * state is the explicit message the phase spec asks for -- "no models
 * available yet" instead of a blank `Select` -- not a silent fallback to the
 * static list, which would defeat the reason this phase exists.
 */
function ModelPicker({
  provider,
  value,
  onValueChange,
  antigravity,
  extraOption,
}: {
  provider: ProviderId;
  value: string;
  onValueChange: (v: string) => void;
  antigravity: AntigravityModelState;
  extraOption?: string | null;
}) {
  const options = modelsForProvider(provider, antigravity);
  const items = [...new Set([extraOption, ...options].filter((m): m is string => Boolean(m)))];
  const itemsKey = items.join("|");

  // Self-heals the race a provider switch's own onValueChange can't avoid:
  // it picks a default model synchronously, but antigravity's list often
  // hasn't loaded yet at that instant (a fresh `relevant` flip, T-CS4-01's
  // own useAntigravityModels), so the synchronous pick is "" or a stale
  // static-list value. Once the real list lands, snap to it -- caught live
  // during this task's own browser verification as a Model select stuck
  // blank after switching to antigravity before the cache resolved.
  React.useEffect(() => {
    if (provider === "antigravity" && antigravity.hasCache && items.length > 0 && !items.includes(value)) {
      onValueChange(items[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- itemsKey stands in for items (a fresh array every render).
  }, [provider, antigravity.hasCache, itemsKey, value]);

  if (provider === "antigravity" && !antigravity.hasCache) {
    return (
      <span className="px-2 text-xs text-muted-foreground">
        no models available yet — checking…
      </span>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <GhostSelect title="Model" value={value} onValueChange={onValueChange}>
        {items.map((m) => (
          <SelectItem key={m} value={m}>
            {m}
          </SelectItem>
        ))}
      </GhostSelect>
      {provider === "antigravity" && <AntigravityFreshnessNote antigravity={antigravity} />}
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * T-CS6-01 (US4). The pre-send chip — a file already uploaded
 * (`createChatAttachmentUploader`, T-CS5-02) and waiting to be attached to
 * the next message. Removable: `onRemove` best-effort-deletes the uploaded
 * object, since no `chat_message_attachments` row references it yet (that
 * row is only created inside `enqueue_chat_turn`, at send time).
 */
function PendingAttachmentChip({
  attachment,
  onRemove,
}: {
  attachment: ChatAttachmentUpload;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-lg border bg-muted/50 px-2.5 py-1.5 text-xs">
      <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="max-w-[200px] truncate">{attachment.filename}</span>
      <span className="text-muted-foreground">{formatFileSize(attachment.sizeBytes)}</span>
      <button
        type="button"
        onClick={onRemove}
        className="ml-0.5 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        aria-label={`Remove ${attachment.filename}`}
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

/** Left rail of the split-pane layout: filters + the saved-session list. */
function ChatThreadList({ children }: { children: React.ReactNode }) {
  return <aside className="flex h-full flex-col bg-sidebar">{children}</aside>;
}

/**
 * The composer is the center of gravity (Claude Code desktop style): a single
 * bordered container holding the textarea, the context/model controls, and
 * the send affordance. Context lives here, not in a modal.
 */
function Composer({
  value,
  onChange,
  onSend,
  disabled,
  placeholder,
  controls,
  pendingAttachment,
  attachmentUploading,
  attachmentError,
  onAttachClick,
  onRemoveAttachment,
  fileInputRef,
  onFileInputChange,
  onDropFile,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled: boolean;
  placeholder: string;
  controls: React.ReactNode;
  pendingAttachment: ChatAttachmentUpload | null;
  attachmentUploading: boolean;
  attachmentError: string | null;
  onAttachClick: () => void;
  onRemoveAttachment: () => void;
  fileInputRef: React.Ref<HTMLInputElement>;
  onFileInputChange: (file: File) => void;
  onDropFile: (file: File) => void;
}) {
  const [dragActive, setDragActive] = React.useState(false);
  // T-CS6-01's own Trap: scope the drop handler to actual file drags, not
  // every drag event, so selecting/copying message text is unaffected —
  // `dataTransfer.types` includes "Files" only for a real file drag, never
  // for a text selection being dragged within the page.
  const isFileDrag = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes("Files");

  return (
    <div
      onDragOver={(e) => {
        if (!isFileDrag(e)) return;
        e.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={(e) => {
        if (!isFileDrag(e)) return;
        setDragActive(false);
      }}
      onDrop={(e) => {
        if (!isFileDrag(e)) return;
        e.preventDefault();
        setDragActive(false);
        const file = e.dataTransfer.files?.[0];
        if (file) onDropFile(file);
      }}
      className={cn(
        "rounded-xl border bg-background shadow-sm transition-shadow focus-within:border-ring/60 focus-within:shadow-md",
        dragActive && "border-primary ring-2 ring-primary/30",
      )}
    >
      {dragActive && (
        <div className="flex items-center justify-center rounded-t-xl border-b border-dashed bg-primary/5 px-4 py-3 text-xs text-primary">
          Drop to attach
        </div>
      )}
      <textarea
        rows={1}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSend();
          }
        }}
        placeholder={placeholder}
        className="max-h-44 min-h-[52px] w-full resize-none bg-transparent px-4 pt-3.5 text-[15px] leading-6 outline-none placeholder:text-muted-foreground/70 disabled:opacity-50 [field-sizing:content]"
      />
      {(pendingAttachment || attachmentUploading) && (
        <div className="px-2.5 pt-1.5">
          {pendingAttachment ? (
            <PendingAttachmentChip attachment={pendingAttachment} onRemove={onRemoveAttachment} />
          ) : (
            <div className="flex items-center gap-1.5 rounded-lg border bg-muted/50 px-2.5 py-1.5 text-xs text-muted-foreground">
              <Paperclip className="size-3.5 shrink-0" />
              Uploading…
            </div>
          )}
        </div>
      )}
      {attachmentError && (
        <p className="px-2.5 pt-1.5 text-xs text-destructive">{attachmentError}</p>
      )}
      <div className="flex items-center justify-between gap-2 px-2.5 pb-2.5 pt-1">
        <div className="flex min-w-0 flex-wrap items-center gap-0.5">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onFileInputChange(file);
              e.target.value = "";
            }}
          />
          <Button
            size="icon"
            variant="ghost"
            className="size-7 shrink-0 rounded-md text-muted-foreground hover:text-foreground"
            onClick={onAttachClick}
            disabled={disabled || attachmentUploading}
            aria-label="Attach a file"
            title="Attach a file"
          >
            <Paperclip className="size-4" />
          </Button>
          {controls}
        </div>
        <Button
          size="icon"
          className="size-8 shrink-0 rounded-full"
          disabled={
            disabled ||
            attachmentUploading ||
            (value.trim().length === 0 && !pendingAttachment)
          }
          onClick={onSend}
          aria-label="Send message"
        >
          <ArrowUp className="size-4" />
        </Button>
      </div>
    </div>
  );
}

/**
 * M14 — the three `waitingReason` values (T-M12-02), each a distinct,
 * actionable card rather than one generic "waiting" notice: scenario 1
 * (never paired anything) and scenario 2 (paired, but off right now) need
 * different next steps from the owner, and scenario 3 (project unavailable)
 * reuses `start_run`'s own SPG13 wording verbatim.
 */
function NoRuntimePairedNotice() {
  return (
    <div className="spg-turn rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
      This workspace has no paired machine yet — your message is saved.{" "}
      <Link href="/machines" className="underline underline-offset-2">
        Pair a machine
      </Link>{" "}
      to get a reply.
    </div>
  );
}

function AllOfflineNotice() {
  return (
    <div className="spg-turn rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
      Waiting for a machine to come online — your message is saved, and the reply arrives
      automatically once one does.{" "}
      <Link href="/machines" className="underline underline-offset-2">
        Check Machines
      </Link>
    </div>
  );
}

function ProjectNotAvailableNotice() {
  return (
    <div className="spg-turn rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
      No online machine has this project on disk. Pair or start the machine that has it, or{" "}
      <Link href="/machines" className="underline underline-offset-2">
        check Machines
      </Link>
      .
    </div>
  );
}

/**
 * A TTL-expired turn (`rescan_waiting_chat_turns`'s sweep) never went
 * through assignment, so `waitingReason` is still non-null on an otherwise
 * `failed` turn — the signal this card keys off, distinct from a real
 * provider failure (`TurnErrorBanner`) so US2's "not lost" promise doesn't
 * read as broken once the wait ends.
 */
function TurnExpiredNotice({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="spg-turn rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-foreground">
      <p className="font-medium">Took too long</p>
      <p className="mt-1 text-muted-foreground">
        No machine picked this up within 24 hours — your message is still here, but the wait
        ended.
      </p>
      <Button size="sm" variant="outline" className="mt-2" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

/** `ChatTurnState.error` is a plain string (DD-7's one shared shape);
 *  `TurnErrorBanner` wants the richer `ChatTurnError` the local host used to
 *  return directly. `fallback: null` is honest here, not a regression — the
 *  cloud path never had a secondary-model suggestion to carry, and see
 *  T-M13-02's Result for the one place this narrowing does cost something. */
function turnErrorFromState(turn: ChatTurnState): ChatTurnError {
  return {
    kind: "unknown",
    reason: turn.error ?? "The model failed.",
    attempts: turn.attempt,
    fallback: null,
  };
}

/**
 * M15 — the retry affordance a succeeded turn didn't have before: re-ask
 * without retyping (T-M12's `retry_chat_turn`), optionally on a different
 * model. `TurnErrorBanner`'s own one-click retry (failed turns) is
 * untouched; this is the new picker US3 scenario 2 needs, since
 * `TurnErrorBanner`'s `fallback` field is always null on the cloud path.
 */
function RetryControls({
  provider,
  model,
  busy,
  onRetry,
  antigravity,
  onSelectAntigravity,
}: {
  provider: ProviderId;
  model: string;
  busy: boolean;
  onRetry: (override: { provider: string; model: string }) => void;
  antigravity: AntigravityModelState;
  /** Latches `ChatPage`'s antigravity relevance flag -- this component's own
   *  provider selection is local state the parent can't otherwise see. */
  onSelectAntigravity: () => void;
}) {
  const [p, setP] = React.useState(provider);
  const [m, setM] = React.useState(model);
  return (
    <div className="spg-turn flex items-center gap-1.5">
      <Button
        size="sm"
        variant="ghost"
        disabled={busy}
        onClick={() => onRetry({ provider: p, model: m })}
        className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <RefreshCw className="size-3.5" /> Retry
      </Button>
      <GhostSelect
        title="Provider"
        value={p}
        onValueChange={(v) => {
          const next = v as ProviderId;
          setP(next);
          if (next === "antigravity") onSelectAntigravity();
          setM(modelsForProvider(next, antigravity)[0] ?? "");
        }}
      >
        {CLI_PROVIDERS.map((cp) => (
          <SelectItem key={cp} value={cp}>
            {cp}
          </SelectItem>
        ))}
      </GhostSelect>
      <ModelPicker provider={p} value={m} onValueChange={setM} antigravity={antigravity} />
    </div>
  );
}

export function ChatPage() {
  const projects = useProjects();
  const agents = useAgents();
  const [sendPending, startSend] = React.useTransition();
  const [retryPending, startRetry] = React.useTransition();
  const [, startUpdate] = React.useTransition();

  // Sidebar filters (intake 0002: group/filter sessions by project, status…).
  const [filterKind, setFilterKind] = React.useState<"all" | ChatSessionKind>("all");
  const [filterProject, setFilterProject] = React.useState<string>("all");
  const [showArchived, setShowArchived] = React.useState(false);

  const sessions = useChatSessions({
    kind: filterKind === "all" ? undefined : filterKind,
    projectId: filterProject === "all" ? undefined : filterProject,
    status: showArchived ? undefined : "active",
  });

  // The active session is URL state (?session=id): linkable, survives reload,
  // and back/forward moves between conversations.
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("session");
  const setSelectedId = React.useCallback(
    (id: string | null) => {
      // Push rather than replace, so back/forward walks the conversation
      // history — the behaviour the comment above promises.
      router.push(id ? `/chat?session=${encodeURIComponent(id)}` : "/chat");
    },
    [router],
  );
  const detail = useChatSession(selectedId);
  const session = detail.data?.session ?? null;

  // Draft context for a conversation that hasn't started yet (no modal:
  // the empty canvas + composer carry the context controls).
  const [draftKind, setDraftKind] = React.useState<ChatSessionKind>("free");
  const [draftProjectId, setDraftProjectId] = React.useState("");
  const [draftAgentId, setDraftAgentId] = React.useState("");
  const [draftProvider, setDraftProvider] = React.useState<ProviderId>("claude-code");
  const [draftModel, setDraftModel] = React.useState("sonnet");

  // T-CS4-01 -- `antigravity` becomes relevant the moment it's selected
  // anywhere in the composer (active session, draft, or RetryControls' own
  // independent picker) and stays relevant for the rest of the page's life.
  // Latched rather than recomputed from `session`/`draftProvider` alone:
  // RetryControls keeps its own local provider state, invisible here, so a
  // one-way flip (set by its own onValueChange below) is what makes its
  // antigravity selection see live data too, not just the main composer's.
  const [antigravityTouched, setAntigravityTouched] = React.useState(false);
  const antigravityActive =
    antigravityTouched || session?.provider === "antigravity" || draftProvider === "antigravity";
  const antigravity = useAntigravityModels(antigravityActive);

  const [input, setInput] = React.useState("");
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const liveEvents = useLiveEvents();
  const queryClient = useQueryClient();

  // M13 — the turn arrives from three sources (the send/retry response, the
  // session read's `activeTurn`, and live broadcasts) and this is the one
  // piece of state they all write into. `turnRef` mirrors it so the
  // broadcast subscription below can read the CURRENT turn without being
  // re-created on every delta (chat-turn-state.ts's own Traps note: the
  // subscription must not be keyed on turn id).
  const [turn, setTurnState] = React.useState<ChatTurnState | null>(null);
  const turnRef = React.useRef<ChatTurnState | null>(null);
  const updateTurn = React.useCallback(
    (updater: (current: ChatTurnState | null) => ChatTurnState | null) => {
      setTurnState((current) => {
        const next = updater(current);
        turnRef.current = next;
        return next;
      });
    },
    [],
  );
  // Two DISTINCT notices, not one: a 409 refusal (FR-004, expected and
  // legible) reads very differently from a genuine send failure, and a
  // failed session CREATE has no turn to attach an error to at all (there is
  // no session id yet) -- collapsing either into `turn`'s own failed state
  // would be wrong.
  const [composerNotice, setComposerNotice] = React.useState<
    { kind: "refusal" | "error"; message: string } | null
  >(null);
  const [createError, setCreateError] = React.useState<string | null>(null);

  // T-CS6-01 (US4) -- a single pending attachment on the draft. Uploaded
  // immediately on drop/select (bytes go to Storage independently of
  // sending, per T-CS5-02's design), removable before the message is sent.
  // Multiple attachments per message are deliberately out of scope here —
  // the spec's own Edge Cases section leaves "more than one file" open at
  // the UX level (CS5's T-CS5-02 Result); this UI answers it as "one at a
  // time" rather than guessing at a multi-file design nobody asked for.
  const workspaceQuery = useWorkspace();
  const supabase = React.useMemo(() => createClient(), []);
  const attachmentUploader = React.useMemo(() => createChatAttachmentUploader(supabase), [supabase]);
  const [pendingAttachment, setPendingAttachment] = React.useState<ChatAttachmentUpload | null>(null);
  const [attachmentUploading, setAttachmentUploading] = React.useState(false);
  const [attachmentError, setAttachmentError] = React.useState<string | null>(null);
  const [isDraggingFile, setIsDraggingFile] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const messages = detail.data?.messages ?? [];
  const messageIds = React.useMemo(() => new Set(messages.map((m) => m.id)), [messages]);
  // A union, not a branch on whether a turn exists yet (found by actually
  // sending a second local message: the LOCAL host's POST doesn't resolve
  // until the turn is fully terminal -- there is no intermediate `waiting`/
  // `in_progress` row to derive from mid-flight, so `isTurnBusy(turn)` alone
  // stays false for the whole duration once `turn` already holds a stale
  // SUCCEEDED turn from a previous send). `isTurnBusy(turn)` still covers the
  // reload case on its own (decision 3's original point): after a reload,
  // `isPending` resets to false, but a still-non-terminal server turn keeps
  // disabling the composer via `activeTurn`.
  const busy = isTurnBusy(turn) || sendPending || retryPending;

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length, turn?.replyText, selectedId]);

  // A turn from the PREVIOUS session must never bleed into this one.
  React.useEffect(() => {
    updateTurn(() => null);
    setComposerNotice(null);
  }, [selectedId, updateTurn]);

  // FR-007 — recover a turn on mount, on any refetch, and when the owner
  // navigates away mid-turn and comes back. The session read is the only
  // source once the mutation response that started it is gone.
  React.useEffect(() => {
    const active = detail.data?.activeTurn;
    if (active) updateTurn((current) => applyChatTurnState(current, active));
  }, [detail.data?.activeTurn, updateTurn]);

  // Subscribe to this session's broadcast topic (per SESSION, not per turn —
  // chatTurnTopic's own doc comment) while it's open. A delta for a turn
  // OTHER than the one held has no userMessage to build a turn from, so it
  // triggers a refetch instead, which lands back through the effect above;
  // a terminal delta for OUR turn also refetches, once, so the canonical
  // persisted message (with its real id and model attribution) replaces the
  // in-memory reply text rather than leaving it permanently synthetic.
  React.useEffect(() => {
    if (!selectedId) return;
    return liveEvents.subscribeChat(selectedId, (delta) => {
      if (isBroadcastForHeldTurn(turnRef.current, delta)) {
        updateTurn((current) => applyChatTurnBroadcast(current, delta));
        if (delta.status !== "running") {
          void queryClient.invalidateQueries({ queryKey: ["chat-session", selectedId] });
        }
      } else {
        void queryClient.invalidateQueries({ queryKey: ["chat-session", selectedId] });
      }
    });
  }, [selectedId, liveEvents, queryClient, updateTurn]);

  const notifyFailure = (sessionId: string, err: { field?: string; error: string }) => {
    if (err.field === "turn_in_progress") {
      // Another tab (or a race in this one) already has a turn in flight.
      // The server is the source of truth here — refetch rather than guess
      // at what that turn's state is.
      setComposerNotice({
        kind: "refusal",
        message: "Wait for the current reply, or send after it finishes.",
      });
      void queryClient.invalidateQueries({ queryKey: ["chat-session", sessionId] });
    } else {
      setComposerNotice({ kind: "error", message: err.error });
    }
  };

  // T-CS6-01 -- attaching a file before any message exists yet needs a real
  // session id to upload under (`<workspace_id>/<session_id>/…`, T-CS5-01's
  // path shape), so this is the SAME lazy-creation step `send()` already
  // did inline, pulled out so the attach flow can trigger it too, not just
  // Send.
  const ensureSessionId = async (): Promise<string | null> => {
    if (selectedId) return selectedId;
    const r = await callAction(() =>
      createChatSessionAction({
        kind: draftKind,
        ...(draftKind === "project" ? { projectId: draftProjectId } : {}),
        ...(draftKind === "agent" ? { agentId: draftAgentId } : {}),
        ...(draftKind === "free" ? { provider: draftProvider, model: draftModel } : {}),
      }),
    );
    if (!r.ok) {
      setCreateError(r.error);
      return null;
    }
    void queryClient.invalidateQueries({ queryKey: ["chat-sessions"] });
    setSelectedId(r.data.id);
    return r.data.id;
  };

  const postTo = async (
    sessionId: string,
    content: string,
    attachment: ChatAttachmentUpload | null,
  ) => {
    // Null the held turn BEFORE the request starts, not after it resolves.
    // Found by actually sending a second message in the browser: without
    // this, `turn` keeps pointing at the PREVIOUS (terminal) turn for the
    // whole duration of a new local-host send -- which never emits an
    // intermediate `waiting`/`in_progress` row to replace it with, since the
    // local POST doesn't resolve until the turn is fully done. Every render
    // branch below keys off `turn` alone, so this one line is what keeps
    // them honest instead of each needing its own "is this turn actually
    // CURRENT" guard.
    updateTurn(() => null);
    const r = await callAction(() =>
      postChatTurnAction(sessionId, {
        content,
        attachments: attachment ? [attachment] : undefined,
      }),
    );
    if (!r.ok) {
      setInput(content);
      if (attachment) setPendingAttachment(attachment);
      notifyFailure(sessionId, r);
      return;
    }
    updateTurn((current) => applyChatTurnState(current, r.data));
    void queryClient.invalidateQueries({ queryKey: ["chat-sessions"] });
    void queryClient.invalidateQueries({ queryKey: ["chat-session", sessionId] });
  };

  const send = () => {
    const content = input.trim();
    // T-CS6-01's own Trap: an attachment with no text is still sendable.
    if (busy || (!content && !pendingAttachment)) return;
    const attachment = pendingAttachment;
    setInput("");
    setPendingAttachment(null);
    setAttachmentError(null);
    setComposerNotice(null);
    setCreateError(null);
    startSend(async () => {
      const sessionId = await ensureSessionId();
      if (!sessionId) {
        setInput(content);
        setPendingAttachment(attachment);
        return;
      }
      await postTo(sessionId, content, attachment);
    });
  };

  const handleFileSelected = (file: File) => {
    const checkMessage = checkChatAttachmentFile(file);
    if (checkMessage) {
      setAttachmentError(checkMessage);
      return;
    }
    setAttachmentError(null);
    setAttachmentUploading(true);
    void (async () => {
      try {
        const sessionId = await ensureSessionId();
        const workspaceId = workspaceQuery.data?.id;
        if (!sessionId || !workspaceId) {
          setAttachmentError("Could not start a conversation to attach this file to.");
          return;
        }
        const uploaded = await attachmentUploader.upload(file, `${workspaceId}/${sessionId}`);
        setPendingAttachment(uploaded);
      } catch (err) {
        setAttachmentError(err instanceof Error ? err.message : "Upload failed.");
      } finally {
        setAttachmentUploading(false);
      }
    })();
  };

  const removePendingAttachment = () => {
    if (pendingAttachment) void attachmentUploader.remove(pendingAttachment.storagePath);
    setPendingAttachment(null);
    setAttachmentError(null);
  };

  const retry = (override?: { provider: string; model: string }) => {
    if (!selectedId || busy) return;
    setComposerNotice(null);
    updateTurn(() => null); // same reason as postTo above
    startRetry(async () => {
      const r = await callAction(() =>
        retryChatTurnAction(selectedId, {
          provider: override?.provider as ProviderId | undefined,
          model: override?.model,
        }),
      );
      if (!r.ok) {
        notifyFailure(selectedId, r);
        return;
      }
      updateTurn((current) => applyChatTurnState(current, r.data));
      void queryClient.invalidateQueries({ queryKey: ["chat-sessions"] });
      void queryClient.invalidateQueries({ queryKey: ["chat-session", selectedId] });
    });
  };

  const updateSessionField = (id: string, data: ChatSessionUpdate) => {
    startUpdate(async () => {
      const r = await callAction(() => updateChatSessionAction(id, data));
      if (!r.ok) return;
      void queryClient.invalidateQueries({ queryKey: ["chat-sessions"] });
      void queryClient.invalidateQueries({ queryKey: ["chat-session", id] });
    });
  };

  // T-CS1-01 — rename is inline (no modal): the title display swaps for an
  // input while `renamingId` matches the session being edited.
  const [renamingId, setRenamingId] = React.useState<string | null>(null);
  const [renameValue, setRenameValue] = React.useState("");
  const [renameError, setRenameError] = React.useState<string | null>(null);
  const [renamePending, startRenamePending] = React.useTransition();

  const startRename = (s: ChatSession) => {
    setRenamingId(s.id);
    setRenameValue(sessionLabel(s));
    setRenameError(null);
  };
  const cancelRename = () => {
    setRenamingId(null);
    setRenameError(null);
  };
  // Blank/whitespace-only saves keep the previous title rather than
  // persisting "" (US1 scenario 6) — checked before any network call.
  const commitRename = (s: ChatSession) => {
    const trimmed = renameValue.trim();
    if (trimmed.length === 0 || trimmed === sessionLabel(s)) {
      setRenamingId(null);
      setRenameError(null);
      return;
    }
    setRenameError(null);
    startRenamePending(async () => {
      const r = await callAction(() => updateChatSessionAction(s.id, { title: trimmed }));
      if (!r.ok) {
        setRenameError(r.error);
        return; // stay in edit mode so the owner can retry, per the phase's own trap
      }
      setRenamingId(null);
      void queryClient.invalidateQueries({ queryKey: ["chat-sessions"] });
      void queryClient.invalidateQueries({ queryKey: ["chat-session", s.id] });
    });
  };

  // T-CS1-02 — the Archive/Delete/Cancel confirmation. `deleteDialogId` is
  // which session it's open for (null = closed); a single dialog instance
  // serves both the rail row and the header, same as rename above.
  const [deleteDialogId, setDeleteDialogId] = React.useState<string | null>(null);
  const [deletePendingAction, setDeletePendingAction] = React.useState<"archive" | "delete" | null>(
    null,
  );
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  const closeDeleteDialog = () => {
    setDeleteDialogId(null);
    setDeleteError(null);
  };
  const confirmArchive = () => {
    const id = deleteDialogId;
    if (!id) return;
    setDeleteError(null);
    setDeletePendingAction("archive");
    startUpdate(async () => {
      const r = await callAction(() => updateChatSessionAction(id, { status: "archived" }));
      setDeletePendingAction(null);
      if (!r.ok) {
        setDeleteError(r.error);
        return;
      }
      setDeleteDialogId(null);
      void queryClient.invalidateQueries({ queryKey: ["chat-sessions"] });
      void queryClient.invalidateQueries({ queryKey: ["chat-session", id] });
    });
  };
  const confirmDelete = () => {
    const id = deleteDialogId;
    if (!id) return;
    setDeleteError(null);
    setDeletePendingAction("delete");
    startUpdate(async () => {
      const r = await callAction(() => deleteChatSessionAction(id));
      setDeletePendingAction(null);
      if (!r.ok) {
        setDeleteError(r.error);
        return;
      }
      setDeleteDialogId(null);
      // Deleting the open session must not leave the pane pointed at a
      // now-gone id (phase Trap) — send the owner back to the rail root.
      if (selectedId === id) setSelectedId(null);
      void queryClient.invalidateQueries({ queryKey: ["chat-sessions"] });
    });
  };

  const projectName = (id: string | null) =>
    id ? (projects.data?.find((p) => p.id === id)?.name ?? id) : null;
  const agentName = (id: string | null) =>
    id ? (agents.data?.find((a) => a.id === id)?.name ?? id) : null;

  const sessionLabel = (s: ChatSession) =>
    s.title ||
    (s.kind === "project"
      ? `Project chat — ${projectName(s.projectId)}`
      : s.kind === "agent"
        ? `Chat with ${agentName(s.agentId)}`
        : "New conversation");

  const cliAgents = (agents.data ?? []).filter(
    (a) => a.enabled && PROVIDER_KINDS[a.provider] === "cli",
  );

  const draftReady =
    draftKind === "free" ||
    (draftKind === "project" && Boolean(draftProjectId)) ||
    (draftKind === "agent" && Boolean(draftAgentId));

  /** Model controls shown in the composer: session-bound once started, draft-bound before. */
  const modelControls = session ? (
    session.provider && session.status === "active" ? (
      <>
        <GhostSelect
          title="Provider"
          value={session.provider}
          onValueChange={(v) => {
            const provider = v as ProviderId;
            updateSessionField(session.id, {
              provider,
              model: modelsForProvider(provider, antigravity)[0] ?? "sonnet",
            });
          }}
        >
          {CLI_PROVIDERS.map((p) => (
            <SelectItem key={p} value={p}>
              {p}
            </SelectItem>
          ))}
        </GhostSelect>
        <ModelPicker
          provider={session.provider}
          value={session.model ?? ""}
          onValueChange={(model) => updateSessionField(session.id, { model })}
          antigravity={antigravity}
          extraOption={session.model}
        />
      </>
    ) : null
  ) : (
    <>
      <GhostSelect
        title="Context"
        value={draftKind}
        onValueChange={(v) => setDraftKind(v as ChatSessionKind)}
      >
        <SelectItem value="free">Free chat</SelectItem>
        <SelectItem value="project">Project</SelectItem>
        <SelectItem value="agent">Agent</SelectItem>
      </GhostSelect>
      {draftKind === "project" && (
        <GhostSelect
          title="Project"
          value={draftProjectId}
          onValueChange={setDraftProjectId}
          placeholder="Pick a project"
        >
          {(projects.data ?? []).map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </GhostSelect>
      )}
      {draftKind === "agent" && (
        <GhostSelect
          title="Agent"
          value={draftAgentId}
          onValueChange={setDraftAgentId}
          placeholder="Pick an agent"
        >
          {cliAgents.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              {a.name}
            </SelectItem>
          ))}
        </GhostSelect>
      )}
      {draftKind === "free" && (
        <>
          <GhostSelect
            title="Provider"
            value={draftProvider}
            onValueChange={(v) => {
              const provider = v as ProviderId;
              setDraftProvider(provider);
              setDraftModel(modelsForProvider(provider, antigravity)[0] ?? "");
            }}
          >
            {CLI_PROVIDERS.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </GhostSelect>
          <ModelPicker
            provider={draftProvider}
            value={draftModel}
            onValueChange={setDraftModel}
            antigravity={antigravity}
          />
        </>
      )}
    </>
  );

  const startNew = () => {
    setSelectedId(null);
    setInput("");
  };

  return (
    <div className="-m-5 flex h-[calc(100vh-3.5rem)] min-h-0 overflow-hidden">
      <PanelGroup direction="horizontal" autoSaveId="chat-layout" className="min-h-0 flex-1">
        {/* Session rail */}
        <Panel defaultSize={24} minSize={16} maxSize={40} className="hidden md:block">
          <ChatThreadList>
        <div className="space-y-2.5 px-3 pb-2 pt-3">
          <Button variant="outline" className="w-full justify-start bg-background" onClick={startNew}>
            <Plus className="size-4" /> New chat
          </Button>
          <div className="flex items-center gap-1">
            <GhostSelect
              title="Filter by kind"
              value={filterKind}
              onValueChange={(v) => setFilterKind(v as typeof filterKind)}
            >
              <SelectItem value="all">All kinds</SelectItem>
              <SelectItem value="free">Free chat</SelectItem>
              <SelectItem value="project">Project</SelectItem>
              <SelectItem value="agent">Agent</SelectItem>
              <SelectItem value="agent-creator">Agent Creator</SelectItem>
            </GhostSelect>
            <GhostSelect
              title="Filter by project"
              value={filterProject}
              onValueChange={setFilterProject}
            >
              <SelectItem value="all">All projects</SelectItem>
              {(projects.data ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </GhostSelect>
            <button
              className={cn(
                "ml-auto rounded-md px-2 py-1 text-[11px] transition-colors",
                showArchived
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              title="Include archived sessions"
              onClick={() => setShowArchived((v) => !v)}
            >
              Archived
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {sessions.isLoading ? (
            <div className="space-y-2 p-1">
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-11 w-full" />
            </div>
          ) : (sessions.data ?? []).length === 0 ? (
            <p className="px-3 py-10 text-center text-xs leading-relaxed text-muted-foreground">
              Conversations you start live here — free chats, project chats, and agent sessions,
              all saved.
            </p>
          ) : (
            (sessions.data ?? []).map((s) => {
              const Icon = KIND_ICONS[s.kind];
              const renaming = renamingId === s.id;
              return (
                <div
                  key={s.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => !renaming && setSelectedId(s.id)}
                  onKeyDown={(e) => {
                    if (!renaming && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      setSelectedId(s.id);
                    }
                  }}
                  className={cn(
                    "group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                    s.id === selectedId ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60",
                    s.status === "archived" && "opacity-55",
                  )}
                >
                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    {renaming ? (
                      <Input
                        autoFocus
                        value={renameValue}
                        disabled={renamePending}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === "Enter") commitRename(s);
                          if (e.key === "Escape") cancelRename();
                        }}
                        onBlur={() => commitRename(s)}
                        className="h-6 px-1 text-[13px]"
                      />
                    ) : (
                      <span className="block truncate text-[13px] font-medium leading-5">
                        {sessionLabel(s)}
                      </span>
                    )}
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {renaming && renameError
                        ? renameError
                        : `${KIND_LABELS[s.kind]} · ${formatDate(s.lastMessageAt ?? s.createdAt)}`}
                    </span>
                  </span>
                  <span
                    className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ChatSessionMenu
                      onRename={() => startRename(s)}
                      onRequestDelete={() => setDeleteDialogId(s.id)}
                    />
                  </span>
                </div>
              );
            })
          )}
        </div>
          </ChatThreadList>
        </Panel>
        <PanelResizeHandle className="hidden w-px bg-border transition-colors data-[resize-handle-state=drag]:bg-primary data-[resize-handle-state=hover]:bg-primary/50 md:block" />

        {/* Conversation */}
        <Panel defaultSize={76} minSize={40}>
          <section className="flex h-full min-w-0 flex-col bg-background">
        {session ? (
          <>
            <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b px-4">
              <div className="flex min-w-0 items-center gap-2">
                {renamingId === session.id ? (
                  <div className="min-w-0 flex-1">
                    <Input
                      autoFocus
                      value={renameValue}
                      disabled={renamePending}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename(session);
                        if (e.key === "Escape") cancelRename();
                      }}
                      onBlur={() => commitRename(session)}
                      className="h-7 max-w-xs text-sm"
                    />
                    {renameError && <p className="mt-1 text-xs text-destructive">{renameError}</p>}
                  </div>
                ) : (
                  <p className="truncate text-sm font-medium">{sessionLabel(session)}</p>
                )}
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                  {session.kind === "project"
                    ? projectName(session.projectId)
                    : session.kind === "agent"
                      ? agentName(session.agentId)
                      : KIND_LABELS[session.kind]}
                </span>
              </div>
              <div className="flex shrink-0 items-center">
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn("size-8", previewOpen ? "text-foreground" : "text-muted-foreground")}
                  title={previewOpen ? "Hide preview" : "Show preview"}
                  onClick={() => setPreviewOpen((v) => !v)}
                >
                  <PanelRight className="size-4" />
                </Button>
                <ChatSessionMenu
                  triggerClassName="size-8 flex items-center justify-center"
                  onRename={() => startRename(session)}
                  onRequestDelete={() => setDeleteDialogId(session.id)}
                />
              </div>
            </div>

            <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
              <div className="mx-auto w-full max-w-3xl space-y-6 px-6 py-8">
                {detail.isLoading ? (
                  <>
                    <Skeleton className="ml-auto h-10 w-1/2" />
                    <Skeleton className="h-20 w-5/6" />
                  </>
                ) : (
                  <>
                    {messages.map((m) => <ChatTurnView key={m.id} message={m} />)}
                    {/* The turn overlay below renders ONLY what `messages` doesn't
                        have yet, keyed by real message id -- once a refetch lands
                        the canonical row, the matching overlay piece stops
                        rendering on its own rather than needing to be torn down. */}
                    {turn && !messageIds.has(turn.userMessage.id) && (
                      <ChatTurnView message={turn.userMessage} />
                    )}
                    {turn?.status === "waiting" && turn.waitingReason === "no_runtime_paired" && (
                      <NoRuntimePairedNotice />
                    )}
                    {turn?.status === "waiting" &&
                      turn.waitingReason === "all_runtimes_offline" && <AllOfflineNotice />}
                    {turn?.status === "waiting" &&
                      turn.waitingReason === "project_not_available" && (
                        <ProjectNotAvailableNotice />
                      )}
                    {turn &&
                      (turn.status === "in_progress" || turn.status === "succeeded") &&
                      !messageIds.has(turn.assistantMessage?.id ?? "") &&
                      (turn.replyText ? (
                        <ChatTurnView
                          message={{
                            role: "assistant",
                            content: turn.replyText,
                            meta: turn.model
                              ? { provider: turn.provider ?? undefined, model: turn.model }
                              : null,
                          }}
                        />
                      ) : turn.status === "in_progress" ? (
                        <ThinkingDots label={turn.model ?? session.model ?? undefined} />
                      ) : null)}
                    {turn?.status === "succeeded" &&
                      (() => {
                        const retryProvider: ProviderId =
                          turn.provider ?? session.provider ?? "claude-code";
                        return (
                          <RetryControls
                            key={turn.id}
                            provider={retryProvider}
                            model={
                              turn.model ??
                              session.model ??
                              modelsForProvider(retryProvider, antigravity)[0] ??
                              ""
                            }
                            busy={busy}
                            onRetry={retry}
                            antigravity={antigravity}
                            onSelectAntigravity={() => setAntigravityTouched(true)}
                          />
                        );
                      })()}
                    {/* TTL-expired must be checked BEFORE the generic failed
                        branch below — both match `status === "failed"`, and
                        only the expired turn's own non-null `waitingReason`
                        (never cleared by the sweep, since it never reached
                        assignment) tells the two apart. */}
                    {turn?.status === "failed" && turn.waitingReason !== null && (
                      <TurnExpiredNotice onRetry={() => retry()} />
                    )}
                    {turn?.status === "failed" && turn.waitingReason === null && (
                      <TurnErrorBanner
                        error={turnErrorFromState(turn)}
                        retrying={busy}
                        onRetryPrimary={() => retry()}
                        onRetrySecondary={(t) => retry(t)}
                      />
                    )}
                    {/* The narrow pre-turn window: a send/retry POST is in
                        flight but no turn exists yet to derive a state from. */}
                    {busy && !turn && <ThinkingDots label={session.model ?? undefined} />}
                  </>
                )}
              </div>
            </div>

            <div className="shrink-0 px-6 pb-5 pt-1">
              <div className="mx-auto w-full max-w-3xl">
                {session.status === "archived" ? (
                  <p className="rounded-lg border border-dashed px-4 py-3 text-center text-xs text-muted-foreground">
                    This session is archived and read-only.
                  </p>
                ) : (
                  <>
                    <Composer
                      value={input}
                      onChange={setInput}
                      onSend={send}
                      disabled={busy}
                      placeholder={`Message ${
                        session.kind === "agent"
                          ? (agentName(session.agentId) ?? "the agent")
                          : (session.model ?? "the model")
                      }…`}
                      controls={modelControls}
                      pendingAttachment={pendingAttachment}
                      attachmentUploading={attachmentUploading}
                      attachmentError={attachmentError}
                      onAttachClick={() => fileInputRef.current?.click()}
                      onRemoveAttachment={removePendingAttachment}
                      fileInputRef={fileInputRef}
                      onFileInputChange={handleFileSelected}
                      onDropFile={handleFileSelected}
                    />
                    {composerNotice && (
                      <p
                        className={cn(
                          "mt-2 px-1 text-xs",
                          composerNotice.kind === "refusal"
                            ? "text-muted-foreground"
                            : "text-destructive",
                        )}
                      >
                        {composerNotice.message}
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          </>
        ) : (
          /* Fresh conversation: greeting + composer, no modal. */
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6">
            <div className="w-full max-w-2xl">
              <h2 className="text-center text-2xl font-semibold tracking-tight">
                What are we working on?
              </h2>
              <p className="mt-2 text-center text-sm text-muted-foreground">
                {draftKind === "project"
                  ? "Project chats can read the repository to answer truthfully."
                  : draftKind === "agent"
                    ? "Talk to one of your agents directly, with its own tools and prompt."
                    : "Free chats aren't written to any memory scope."}
              </p>
              <div className="mt-6">
                <Composer
                  value={input}
                  onChange={setInput}
                  onSend={send}
                  disabled={busy || !draftReady}
                  placeholder={
                    draftReady
                      ? "Start the conversation…"
                      : draftKind === "project"
                        ? "Pick a project below to begin…"
                        : "Pick an agent below to begin…"
                  }
                  controls={modelControls}
                  pendingAttachment={pendingAttachment}
                  attachmentUploading={attachmentUploading}
                  attachmentError={attachmentError}
                  onAttachClick={() => fileInputRef.current?.click()}
                  onRemoveAttachment={removePendingAttachment}
                  fileInputRef={fileInputRef}
                  onFileInputChange={handleFileSelected}
                  onDropFile={handleFileSelected}
                />
              </div>
              {createError && !busy && (
                <p className="mt-4 text-center text-xs text-destructive">{createError}</p>
              )}
              {busy && (
                <div className="mt-4 flex justify-center">
                  <ThinkingDots label="starting session" />
                </div>
              )}
            </div>
          </div>
        )}
          </section>
        </Panel>
      </PanelGroup>

      {/* Preview panel — always available; honest when there's nothing to run. */}
      {previewOpen && (
        <aside className="hidden w-80 shrink-0 flex-col border-l bg-sidebar xl:flex">
          <div className="flex h-12 items-center border-b px-4">
            <p className="text-sm font-medium">Preview</p>
          </div>
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
            {session?.projectId ? (
              <>
                <FolderKanban className="size-7 text-muted-foreground/50" />
                <p className="text-sm font-medium">{projectName(session.projectId)}</p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Running the app from chat lands in a follow-up. For now,{" "}
                  <Link href="/terminals" className="underline underline-offset-2">
                    open a terminal
                  </Link>{" "}
                  to run it manually.
                </p>
              </>
            ) : (
              <>
                <MonitorPlay className="size-7 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">Nothing to preview</p>
              </>
            )}
          </div>
        </aside>
      )}

      <ChatSessionDeleteDialog
        open={deleteDialogId !== null}
        onOpenChange={(v) => !v && closeDeleteDialog()}
        onArchive={confirmArchive}
        onDelete={confirmDelete}
        pendingAction={deletePendingAction}
        error={deleteError}
      />
    </div>
  );
}
