import * as React from "react";
import Link from "next/link";
import { ArrowRight, AtSign, Bell, Bot, Inbox, MailOpen, Send, User } from "lucide-react";
import type { Message } from "@sparstrow/shared";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useQueryClient } from "@tanstack/react-query";
import { useAgents, useMessages } from "@web/api/hooks";
import { callAction } from "@web/lib/call-action";
import { formatDate, shortId } from "@/lib/format";
import { cn } from "@/lib/utils";
import { markMessageReadAction, sendMessageAction } from "./actions";

type Filter = "all" | "user-inbox" | "unread";

function FeedSection({
  icon: Icon,
  title,
  hint,
  unread,
  messages,
  emptyText,
  onOpen,
  fromLabel,
  toLabel,
}: {
  icon: typeof Bell;
  title: string;
  hint: string;
  unread: number;
  messages: Message[];
  emptyText: string;
  onOpen: (m: Message) => void;
  fromLabel: (m: Message) => string;
  toLabel: (m: Message) => string;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <Icon className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">{title}</h3>
        {unread > 0 && (
          <Badge className="h-4 rounded-full px-1.5 text-[10px]">{unread} unread</Badge>
        )}
        <span className="text-xs text-muted-foreground">· {hint}</span>
      </div>
      {messages.length === 0 ? (
        <p className="rounded-xl border border-dashed px-4 py-6 text-center text-xs text-muted-foreground">
          {emptyText}
        </p>
      ) : (
        <div className="divide-y rounded-xl border">
          {messages.map((m) => (
            <button
              key={m.id}
              onClick={() => onOpen(m)}
              className={cn(
                "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 first:rounded-t-xl last:rounded-b-xl",
                m.status === "unread" && "bg-primary/5",
              )}
            >
              <span className="mt-0.5 shrink-0 rounded-full border bg-muted p-1.5">
                {m.fromType === "user" ? (
                  <User className="size-3.5" />
                ) : (
                  <Bot className="size-3.5" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "text-sm",
                      m.status === "unread" ? "font-semibold" : "font-medium",
                    )}
                  >
                    {fromLabel(m)}
                  </span>
                  <ArrowRight className="size-3 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">{toLabel(m)}</span>
                  {m.status === "unread" && <Badge className="h-4 px-1.5 text-[10px]">new</Badge>}
                  {m.spawnedRunId && (
                    <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
                      spawned run
                    </Badge>
                  )}
                </span>
                <span className="mt-0.5 block truncate text-sm">
                  {m.subject || <span className="text-muted-foreground">(no subject)</span>}
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {m.body}
                </span>
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatDate(m.createdAt)}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

export function MessagesPage() {
  const agents = useAgents();
  const messages = useMessages();
  const queryClient = useQueryClient();
  const [sendPending, startSendMessage] = React.useTransition();
  const [, startMarkRead] = React.useTransition();
  const [sendError, setSendError] = React.useState<string | null>(null);

  const [filter, setFilter] = React.useState<Filter>("all");
  const [composeOpen, setComposeOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<Message | null>(null);

  const [newToAgentId, setNewToAgentId] = React.useState("");
  const [newSubject, setNewSubject] = React.useState("");
  const [newBody, setNewBody] = React.useState("");

  const agentName = (id: string | null) =>
    id ? (agents.data?.find((a) => a.id === id)?.name ?? shortId(id)) : null;

  const fromLabel = (m: Message) =>
    m.fromType === "user" ? "You" : (agentName(m.fromAgentId) ?? "agent");
  const toLabel = (m: Message) =>
    m.toAgentId ? (agentName(m.toAgentId) ?? "agent") : "Your inbox";

  const filtered = (messages.data ?? []).filter((m) => {
    if (filter === "user-inbox") return m.toAgentId === null;
    if (filter === "unread") return m.status === "unread";
    return true;
  });

  const openMessage = (m: Message) => {
    setSelected(m);
    if (m.status === "unread") {
      startMarkRead(async () => {
        const r = await callAction(() => markMessageReadAction(m.id));
        if (!r.ok) return;
        void queryClient.invalidateQueries({ queryKey: ["messages"] });
      });
    }
  };

  const submitMessage = () => {
    if (!newBody.trim()) return;
    setSendError(null);
    startSendMessage(async () => {
      const r = await callAction(() =>
        sendMessageAction({
          toAgentId: newToAgentId || null,
          subject: newSubject.trim(),
          body: newBody,
        }),
      );
      if (!r.ok) {
        setSendError(r.error);
        return;
      }
      void queryClient.invalidateQueries({ queryKey: ["messages"] });
      setComposeOpen(false);
      setNewSubject("");
      setNewBody("");
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All messages</SelectItem>
            <SelectItem value="user-inbox">Your inbox</SelectItem>
            <SelectItem value="unread">Unread</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button onClick={() => setComposeOpen(true)}>
          <Send className="size-4" /> New message
        </Button>
      </div>

      {messages.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border py-16 text-center">
          <Inbox className="mx-auto size-8 text-muted-foreground/40" />
          <p className="mt-3 text-sm font-medium">No messages</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Messages between you and agents — and agent-to-agent traffic — land here.
          </p>
        </div>
      ) : (
        (() => {
          // Structured feed: direct agent→you messages are the mentions that
          // demand attention; everything else (your sent mail, agent↔agent
          // traffic) is system notifications. Unread float to the top of each.
          const byUnreadThenDate = (a: Message, b: Message) =>
            a.status === b.status
              ? b.createdAt.localeCompare(a.createdAt)
              : a.status === "unread"
                ? -1
                : 1;
          const mentions = filtered
            .filter((m) => m.fromType === "agent" && m.toAgentId === null)
            .sort(byUnreadThenDate);
          const system = filtered
            .filter((m) => !(m.fromType === "agent" && m.toAgentId === null))
            .sort(byUnreadThenDate);
          const unreadIn = (list: Message[]) =>
            list.filter((m) => m.status === "unread").length;
          return (
            <div className="space-y-5">
              <FeedSection
                icon={AtSign}
                title="Agent mentions"
                hint="Agents writing directly to you"
                unread={unreadIn(mentions)}
                messages={mentions}
                emptyText="No agent has written to you yet — message one and it replies here."
                onOpen={openMessage}
                fromLabel={fromLabel}
                toLabel={toLabel}
              />
              <FeedSection
                icon={Bell}
                title="System notifications"
                hint="Your sent messages and agent-to-agent traffic"
                unread={unreadIn(system)}
                messages={system}
                emptyText="No system traffic yet."
                onOpen={openMessage}
                fromLabel={fromLabel}
                toLabel={toLabel}
              />
            </div>
          );
        })()
      )}

      {/* Compose dialog */}
      <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>New message</DialogTitle>
            <DialogDescription>
              Messaging an agent runs them with your message; they reply back to your inbox.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>To</Label>
              <Select value={newToAgentId} onValueChange={setNewToAgentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick an agent" />
                </SelectTrigger>
                <SelectContent>
                  {(agents.data ?? [])
                    .filter((a) => a.enabled)
                    .map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Subject</Label>
              <Input
                value={newSubject}
                onChange={(e) => setNewSubject(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Message</Label>
              <Textarea
                rows={6}
                value={newBody}
                onChange={(e) => setNewBody(e.target.value)}
                placeholder="The agent receives exactly this text."
              />
            </div>
            {sendError && <p className="text-sm text-destructive">{sendError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setComposeOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={submitMessage}
              disabled={!newToAgentId || !newBody.trim() || sendPending}
            >
              {sendPending ? "Sending…" : "Send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Read dialog */}
      <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-2xl">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="pr-8">
                  {selected.subject || "(no subject)"}
                </DialogTitle>
                <DialogDescription className="flex flex-wrap items-center gap-2">
                  <span>
                    {fromLabel(selected)} <ArrowRight className="inline size-3" />{" "}
                    {toLabel(selected)}
                  </span>
                  <span>·</span>
                  <span>{formatDate(selected.createdAt)}</span>
                  <MailOpen className="size-3" />
                </DialogDescription>
              </DialogHeader>
              <p className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded-lg border bg-muted/40 p-3 text-sm">
                {selected.body}
              </p>
              <DialogFooter className="gap-2 sm:justify-between">
                <span className="text-xs text-muted-foreground">
                  {selected.taskId && <>task {shortId(selected.taskId)} · </>}
                  {selected.id}
                </span>
                <div className="flex gap-2">
                  {selected.spawnedRunId && (
                    <Button asChild variant="outline" size="sm">
                      <Link
                        href={`/runs/${selected.spawnedRunId}`}
                        onClick={() => setSelected(null)}
                      >
                        View spawned run <ArrowRight className="size-3.5" />
                      </Link>
                    </Button>
                  )}
                  {selected.fromType === "agent" && selected.fromAgentId && (
                    <Button
                      size="sm"
                      onClick={() => {
                        setNewToAgentId(selected.fromAgentId!);
                        setNewSubject(
                          selected.subject.startsWith("Re:")
                            ? selected.subject
                            : `Re: ${selected.subject}`,
                        );
                        setSelected(null);
                        setComposeOpen(true);
                      }}
                    >
                      Reply
                    </Button>
                  )}
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
