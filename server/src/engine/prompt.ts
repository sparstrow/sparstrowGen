export const TRANSCRIPT_WINDOW = 40;
export const TRANSCRIPT_BUDGET_BYTES = 24_000;

export interface ChatHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export interface BuildChatPromptOptions {
  messages: ChatHistoryMessage[];
  attachments?: Array<{ storagePath: string; filename: string; localPath?: string }>;
  outboxDir?: string;
  projectContext?: { name?: string; description?: string; rootDir?: string | null };
}

/**
 * Builds the unified prompt for chat turns across all providers, mirroring Multica's
 * `server/internal/daemon/prompt.go:buildChatPrompt`.
 */
export function buildChatPrompt(opts: BuildChatPromptOptions): string {
  const parts: string[] = [];

  parts.push("You are running as a local coding and chat assistant for a Sparstrowgen workspace.");
  parts.push("A user is chatting with you directly. Respond to their message.\n");

  if (opts.projectContext?.name) {
    parts.push(`Project: ${opts.projectContext.name}`);
    if (opts.projectContext.description) {
      parts.push(`Description: ${opts.projectContext.description}`);
    }
    if (opts.projectContext.rootDir) {
      parts.push(`Working Directory: ${opts.projectContext.rootDir}`);
    }
    parts.push("");
  }

  // Window conversation history
  const history = opts.messages ?? [];
  const lines = history
    .slice(-TRANSCRIPT_WINDOW)
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`);

  const kept: string[] = [];
  let bytes = 0;
  for (let i = lines.length - 1; i >= 0; i--) {
    const size = Buffer.byteLength(lines[i]!, "utf8") + 2;
    if (kept.length > 0 && bytes + size > TRANSCRIPT_BUDGET_BYTES) break;
    kept.unshift(lines[i]!);
    bytes += size;
  }

  if (kept.length > 0) {
    parts.push("Conversation history so far:\n");
    parts.push(kept.join("\n\n"));
    parts.push("");
  }

  // Attachments
  if (opts.attachments && opts.attachments.length > 0) {
    parts.push("Attachments for this turn:");
    for (const a of opts.attachments) {
      if (a.localPath) {
        parts.push(`- File: ${a.filename} (available locally at: ${a.localPath})`);
      } else {
        parts.push(`- File: ${a.filename} (${a.storagePath})`);
      }
    }
    parts.push("");
  }

  // Outbox
  if (opts.outboxDir) {
    parts.push(
      `If you produce any files or artifacts for the user, write them into this turn's outbox directory: ${opts.outboxDir}`,
    );
    parts.push("Files placed in the outbox will be automatically collected and delivered to the user.\n");
  }

  parts.push("Respond directly and concisely to the user's latest message.");
  return parts.join("\n");
}
