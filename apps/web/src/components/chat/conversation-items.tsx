"use client";

import * as React from "react";
import { AlertTriangle, Paperclip, RefreshCw } from "lucide-react";
import type { ChatMessageAttachment } from "@sparstrow/shared";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { relativeTime } from "@/lib/format";
import { ProducedItem, ProducedItemViewer } from "@web/components/chat/produced-item";
import { stripMarkdown } from "@web/components/chat/markdown";
import type { SessionAttachment } from "@web/lib/chat-attachments";

/**
 * T-AM3-01 (US2). First line of the preceding user message, markdown
 * stripped, trimmed to 60 characters at a word boundary with an ellipsis —
 * the same shape `private.chat_auto_title`
 * (`packages/shared/drizzle/policies/022_chat_auto_title.sql`) gives a
 * session's own title, so a group heading and the title bar read the same
 * way if they ever show the same content. Lives here, not in
 * `chat-attachments.ts`'s `sessionAttachments()` — see that function's own
 * comment for why (the "use client" boundary `stripMarkdown` lives behind).
 */
function deriveRequestLabel(content: string): string {
  const MAX = 60;
  const firstLine = stripMarkdown(content).split("\n")[0]?.trim() ?? "";
  if (firstLine.length <= MAX) return firstLine;
  const cut = firstLine.slice(0, MAX);
  const lastSpace = cut.lastIndexOf(" ");
  return `${lastSpace > 0 ? cut.slice(0, lastSpace) : cut}…`;
}

export type ProducedGroup = {
  /** The assistant message id every attachment in this group is bound to —
   *  stable across re-renders, used as the group's React key. */
  messageId: string;
  label: string;
  attachments: ChatMessageAttachment[];
};

/**
 * Groups a session's produced attachments by the assistant message that
 * made them, deriving each group's heading from the preceding user message
 * (or a relative timestamp when there isn't one — AM1's FR-013 path).
 *
 * Filters to `messageRole === "assistant"` explicitly — the phase's own
 * traps note: `sessionAttachments()` deliberately also returns `role:
 * "user"` rows for `T-AM4-01`, and rendering one here would show the
 * owner's own attachment as something the agent made (exactly the mix-up
 * US3 exists to prevent).
 *
 * `rows` is expected pre-sorted newest-message-first
 * (`sessionAttachments()`'s own contract); this only groups, it does not
 * re-sort, so that ordering carries through to the returned groups.
 */
export function groupProducedAttachments(rows: SessionAttachment[]): ProducedGroup[] {
  const groups: ProducedGroup[] = [];
  const indexByMessageId = new Map<string, number>();

  for (const row of rows) {
    if (row.messageRole !== "assistant") continue;

    let index = indexByMessageId.get(row.messageId);
    if (index === undefined) {
      const label = row.precedingUserContent?.trim()
        ? deriveRequestLabel(row.precedingUserContent)
        : relativeTime(row.createdAt);
      index = groups.length;
      groups.push({ messageId: row.messageId, label: label || relativeTime(row.createdAt), attachments: [] });
      indexByMessageId.set(row.messageId, index);
    }

    groups[index]!.attachments.push({
      id: row.id,
      storagePath: row.storagePath,
      filename: row.filename,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
    });
  }

  return groups;
}

/**
 * T-AM4-01 (US3). The owner's own attachments, flat and newest first — no
 * sub-grouping by request, unlike `groupProducedAttachments` above. A sent
 * attachment's "request" is the owner's own message, so labelling it with
 * that message's text would repeat the filename's own context to no benefit
 * (phase decision, this task's own doc). `rows` is expected pre-sorted
 * newest-message-first, same contract `groupProducedAttachments` relies on.
 */
export function filterSentAttachments(rows: SessionAttachment[]): ChatMessageAttachment[] {
  return rows
    .filter((row) => row.messageRole === "user")
    .map((row) => ({
      id: row.id,
      storagePath: row.storagePath,
      filename: row.filename,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
    }));
}

function ConversationItemsSkeleton(): React.JSX.Element {
  return (
    <div className="space-y-5" aria-hidden="true">
      {[0, 1].map((group) => (
        <div key={group} className="space-y-2">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="aspect-[16/10] w-full rounded-lg" />
        </div>
      ))}
    </div>
  );
}

/**
 * The conversation's index of what its agent produced, grouped by the
 * request that produced it — newest group first. Presentational: it takes
 * rows as a prop and does no fetching of its own, so both the desktop
 * `aside` and the below-`xl` Sheet (`chat.tsx`) can mount their own copy
 * against the same query without either knowing about the other.
 *
 * Renders exactly one `ProducedItemViewer` for the whole list, driven by
 * `openAttachment` state here — not one Dialog per row.
 */
/**
 * DESIGN.md §3's "Label" typography role (11px/700/uppercase/0.08em tracking)
 * — "column and nav headings" is exactly what these two section labels are.
 */
function SectionLabel({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
      {children}
    </p>
  );
}

export function ConversationItems({
  attachments,
  isLoading,
  isError,
  onRetry,
  onOpenAttachment,
}: {
  attachments: SessionAttachment[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onOpenAttachment?: (attachment: ChatMessageAttachment) => void;
}): React.JSX.Element {
  const [openAttachment, setOpenAttachment] = React.useState<ChatMessageAttachment | null>(null);

  const handleOpen = React.useCallback(
    (attachment: ChatMessageAttachment) => {
      if (onOpenAttachment) {
        onOpenAttachment(attachment);
      } else {
        setOpenAttachment(attachment);
      }
    },
    [onOpenAttachment],
  );

  const produced = React.useMemo(() => groupProducedAttachments(attachments), [attachments]);
  const sent = React.useMemo(() => filterSentAttachments(attachments), [attachments]);

  if (isLoading) {
    return <ConversationItemsSkeleton />;
  }

  if (isError) {
    return (
      <Empty className="border-0 p-0">
        <EmptyHeader>
          <EmptyMedia variant="icon" className="size-12">
            <AlertTriangle className="size-6 text-destructive" strokeWidth={1.5} />
          </EmptyMedia>
          <EmptyTitle>Couldn&apos;t load this conversation&apos;s files</EmptyTitle>
          <EmptyDescription>Something went wrong reading what this conversation produced.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RefreshCw className="size-3.5" />
            Retry
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  // T-AM4-01 (US3), phase decisions 1 and 2. Both empty falls through to
  // AM3's original whole-panel empty state, unchanged from before this task
  // — the common case for a brand-new conversation, and the one this task's
  // own doc calls out as easiest to shadow with a careless refactor.
  if (produced.length === 0 && sent.length === 0) {
    return (
      <Empty className="border-0 p-0">
        <EmptyHeader>
          <EmptyMedia variant="icon" className="size-12">
            <Paperclip className="size-6" strokeWidth={1.5} />
          </EmptyMedia>
          <EmptyTitle>Nothing produced yet</EmptyTitle>
          <EmptyDescription>
            Files your agent makes — and files you attach — collect here.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <div className="space-y-5">
          <SectionLabel>Made by your agent</SectionLabel>
          {produced.length === 0 ? (
            // US3 scenario 2 -- this is NOT an error state: the agent's side
            // is legitimately empty while the owner's own attachments exist.
            <p className="text-xs text-muted-foreground">Nothing yet.</p>
          ) : (
            produced.map((group) => (
              <div key={group.messageId}>
                <p className="truncate text-xs font-medium text-muted-foreground">{group.label}</p>
                {group.attachments.map((attachment) => (
                  <ProducedItem key={attachment.id} attachment={attachment} onOpen={handleOpen} />
                ))}
              </div>
            ))
          )}
        </div>
        {sent.length > 0 && (
          <div className="space-y-1.5">
            <SectionLabel>Sent by you</SectionLabel>
            {sent.map((attachment) => (
              <ProducedItem key={attachment.id} attachment={attachment} onOpen={handleOpen} />
            ))}
          </div>
        )}
      </div>
      <ProducedItemViewer
        attachment={openAttachment}
        open={openAttachment !== null}
        onOpenChange={(open) => !open && setOpenAttachment(null)}
      />
    </>
  );
}
