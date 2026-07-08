import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ArrowRight, Search, Sparkles, X } from "lucide-react";
import type { Agent, AgentCreate, AgentDraft, AgentMatch, DraftMessage } from "@sparstrow/shared";
import { renderSkillMd } from "@sparstrow/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  AgentFields,
  agentToForm,
  formToPayload,
  type AgentFormValues,
} from "@/components/agent-form";
import { useDraftAgent } from "@/api/hooks";

const STARTERS = [
  "Build a code reviewer for my TypeScript repo",
  "Create a research assistant that can search the web",
  "Make a writing agent scoped to one project",
  "Set up a read-only planning agent",
];

function applyDraft(v: AgentFormValues, d: AgentDraft): AgentFormValues {
  return {
    ...v,
    name: d.name ?? v.name,
    role: d.role ?? v.role,
    systemPrompt: d.systemPrompt ?? v.systemPrompt,
    provider: d.provider ?? v.provider,
    model: d.model ?? v.model,
    cwd: d.cwd !== undefined ? (d.cwd ?? "") : v.cwd,
    addDirs: d.addDirs ? d.addDirs.join("\n") : v.addDirs,
    allowedTools: d.allowedTools ? d.allowedTools.join(", ") : v.allowedTools,
    disallowedTools: d.disallowedTools ? d.disallowedTools.join(", ") : v.disallowedTools,
    permissionMode: d.permissionMode ?? v.permissionMode,
    maxTurns: d.maxTurns != null ? String(d.maxTurns) : v.maxTurns,
    memoryReadScopes: d.memoryReadScopes ?? v.memoryReadScopes,
    memoryWriteScopes: d.memoryWriteScopes ?? v.memoryWriteScopes,
    enabled: d.enabled ?? v.enabled,
  };
}

function ThinkingDots() {
  return (
    <div className="flex items-center gap-1 px-1 py-2" aria-label="Thinking">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="spg-dot size-1.5 rounded-full bg-muted-foreground"
          style={{ animationDelay: `${i * 0.18}s` }}
        />
      ))}
    </div>
  );
}

/**
 * F3 — Agent Creator. Deterministic-first: the editable draft pane + Find
 * filter always work; the AI interview is an enhancement over POST
 * /agents/draft and announces when it falls back. Create is gated on the real
 * required fields, not the model's say-so.
 */
export function AgentCreator({
  open,
  onOpenChange,
  agents,
  onCreate,
  creating,
  createError,
  onSwitchToManual,
  onOpenAgent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agents: Agent[];
  onCreate: (payload: AgentCreate) => void;
  creating: boolean;
  createError: string | null;
  onSwitchToManual: (seed: AgentFormValues) => void;
  onOpenAgent: (agent: Agent) => void;
}) {
  const draftTurn = useDraftAgent();
  const [mode, setMode] = React.useState<"build" | "find">("build");
  const [messages, setMessages] = React.useState<DraftMessage[]>([]);
  const [input, setInput] = React.useState("");
  const [values, setValues] = React.useState<AgentFormValues>(() => agentToForm(null));
  const [source, setSource] = React.useState<"ai" | "fallback" | null>(null);
  const [followups, setFollowups] = React.useState<string[]>([]);
  const [matches, setMatches] = React.useState<AgentMatch[]>([]);
  const [turnError, setTurnError] = React.useState<string | null>(null);
  const [findQuery, setFindQuery] = React.useState("");
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (open) {
      setMode("build");
      setMessages([]);
      setInput("");
      setValues(agentToForm(null));
      setSource(null);
      setFollowups([]);
      setMatches([]);
      setTurnError(null);
      setFindQuery("");
    }
  }, [open]);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, draftTurn.isPending]);

  const send = (content: string) => {
    const text = content.trim();
    if (!text || draftTurn.isPending) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    setTurnError(null);
    draftTurn.mutate(
      { messages: next, draft: formToPayload(values) },
      {
        onSuccess: (turn) => {
          setMessages((m) => [...m, { role: "assistant", content: turn.reply }]);
          setValues((v) => applyDraft(v, turn.draft));
          setSource(turn.source);
          setFollowups(turn.followups);
          setMatches(turn.matches);
        },
        onError: (err) => setTurnError(err.message),
      },
    );
  };

  const filtered = React.useMemo(() => {
    const q = findQuery.trim().toLowerCase();
    if (!q) return agents;
    return agents.filter((a) =>
      [a.name, a.role, a.allowedTools.join(" "), a.provider, a.model]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [agents, findQuery]);

  const canCreate = values.name.trim().length > 0 && values.model.trim().length > 0;
  const payload = formToPayload(values);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="spg-overlay fixed inset-0 z-50 bg-black/60" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-50 flex h-[760px] max-h-[92vh] w-[95vw] max-w-[1080px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border bg-background shadow-lg"
        >
          <div className="flex items-center justify-between border-b px-5 py-3">
            <div className="flex items-center gap-3">
              <DialogPrimitive.Title className="flex items-center gap-2 text-base font-semibold">
                <Sparkles className="size-4 text-primary" /> Agent Creator
              </DialogPrimitive.Title>
              <div className="flex rounded-lg bg-muted p-0.5 text-sm">
                <button
                  className={`rounded-md px-3 py-1 ${mode === "build" ? "bg-background shadow" : "text-muted-foreground"}`}
                  onClick={() => setMode("build")}
                >
                  Build
                </button>
                <button
                  className={`rounded-md px-3 py-1 ${mode === "find" ? "bg-background shadow" : "text-muted-foreground"}`}
                  onClick={() => setMode("find")}
                >
                  Find
                </button>
              </div>
            </div>
            <DialogPrimitive.Close
              className="rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Close"
            >
              <X className="size-5" />
            </DialogPrimitive.Close>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-2 divide-x">
            {/* Left: chat (Build) or search (Find) */}
            <div className="flex min-h-0 flex-col">
              {mode === "build" ? (
                <>
                  <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-5">
                    {messages.length === 0 ? (
                      <div className="space-y-3">
                        <p className="text-sm text-muted-foreground">
                          Describe the agent you want. I'll fill in sensible defaults and a SKILL.md —
                          edit anything on the right.
                        </p>
                        <div className="grid gap-2">
                          {STARTERS.map((s) => (
                            <button
                              key={s}
                              onClick={() => send(s)}
                              className="rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      messages.map((m, i) => (
                        <div
                          key={i}
                          className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
                        >
                          <div
                            className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
                              m.role === "user"
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-foreground"
                            }`}
                          >
                            {m.content}
                          </div>
                        </div>
                      ))
                    )}
                    {draftTurn.isPending && <ThinkingDots />}
                    {source === "fallback" && (
                      <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-foreground">
                        AI drafting is unavailable — using basic mode. Edit fields on the right or
                        switch to the manual form.
                      </p>
                    )}
                    {turnError && (
                      <div className="flex items-center justify-between rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs">
                        <span className="text-destructive">Draft request failed: {turnError}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const lastUser = [...messages]
                              .reverse()
                              .find((m) => m.role === "user");
                            if (lastUser) {
                              setMessages((m) => m.slice(0, -1));
                              send(lastUser.content);
                            }
                          }}
                        >
                          Retry
                        </Button>
                      </div>
                    )}
                    {matches.length > 0 && (
                      <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
                        <p className="mb-1 font-medium text-foreground">
                          You may already have {matches.length === 1 ? "an agent" : "agents"} like
                          this — reuse or extend instead of duplicating.
                        </p>
                        <div className="space-y-1">
                          {matches.map((mm) => {
                            const existing = agents.find((a) => a.id === mm.id);
                            return (
                              <div key={mm.id} className="flex items-center justify-between gap-2">
                                <span className="min-w-0 truncate text-foreground">
                                  <span className="font-medium">{mm.name}</span>
                                  {mm.similarity != null && (
                                    <span className="text-muted-foreground">
                                      {" · "}
                                      {Math.round(mm.similarity * 100)}% similar
                                    </span>
                                  )}
                                  {mm.role && (
                                    <span className="text-muted-foreground"> — {mm.role}</span>
                                  )}
                                </span>
                                {existing && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => onOpenAgent(existing)}
                                  >
                                    Open
                                  </Button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {followups.length > 0 && (
                    <div className="flex flex-wrap gap-2 border-t px-5 py-2">
                      {followups.map((f) => (
                        <button
                          key={f}
                          onClick={() => send(f)}
                          className="rounded-full border px-3 py-1 text-xs transition-colors hover:bg-accent"
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="border-t p-3">
                    <Textarea
                      rows={2}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          send(input);
                        }
                      }}
                      placeholder="Describe the agent…  (Enter to send, Shift+Enter for newline)"
                    />
                  </div>
                </>
              ) : (
                <div className="flex min-h-0 flex-col">
                  <div className="border-b p-3">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                      <Input
                        className="pl-8"
                        value={findQuery}
                        onChange={(e) => setFindQuery(e.target.value)}
                        placeholder="Find agents by name, role, or tool…"
                      />
                    </div>
                  </div>
                  <div className="flex-1 space-y-2 overflow-y-auto p-3">
                    {filtered.length === 0 ? (
                      <div className="rounded-lg border py-10 text-center text-sm">
                        <p className="text-muted-foreground">No agents match “{findQuery}”.</p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-3"
                          onClick={() => {
                            setValues((v) => ({ ...v, name: findQuery.trim() }));
                            setMode("build");
                          }}
                        >
                          Build one instead
                        </Button>
                      </div>
                    ) : (
                      filtered.map((a) => (
                        <div key={a.id} className="rounded-lg border p-3">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{a.name}</p>
                              <p className="truncate text-xs text-muted-foreground">
                                {a.role || "—"}
                              </p>
                            </div>
                            <Badge variant="secondary">{a.model}</Badge>
                          </div>
                          <div className="mt-2 flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => onOpenAgent(a)}>
                              Open
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setValues(agentToForm({ ...a, name: `${a.name} copy` }));
                                setMode("build");
                              }}
                            >
                              Use as starting point
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Right: live draft + SKILL.md preview */}
            <div className="flex min-h-0 flex-col">
              <div className="flex-1 space-y-4 overflow-y-auto p-5">
                <AgentFields values={values} set={(k, val) => setValues((v) => ({ ...v, [k]: val }))} />
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    SKILL.md preview
                  </p>
                  <pre className="max-h-64 overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs leading-relaxed">
                    {renderSkillMd(payload)}
                  </pre>
                </div>
                {createError && <p className="text-sm text-destructive">{createError}</p>}
              </div>
              <div className="flex items-center justify-between gap-2 border-t px-5 py-3">
                <Button variant="ghost" size="sm" onClick={() => onSwitchToManual(values)}>
                  Switch to manual form <ArrowRight className="size-4" />
                </Button>
                <Button disabled={!canCreate || creating} onClick={() => onCreate(payload)}>
                  {creating ? "Creating…" : "Create agent"}
                </Button>
              </div>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
