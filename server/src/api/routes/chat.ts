import type { FastifyInstance } from "fastify";
import {
  chatRetryRequestSchema,
  chatSessionCreateSchema,
  chatSessionListQuerySchema,
  chatSessionUpdateSchema,
  chatTurnRequestSchema,
  chatSearchQuerySchema,
  type ChatTurn,
  type ChatTurnState,
} from "@sparstrow/shared";
import {
  createChatSession,
  getChatSession,
  listChatMessages,
  listChatSessions,
  postChatTurn,
  retryChatTurn,
  updateChatSession,
  searchChatSessions,
} from "../../chat/service.js";

/**
 * M13 (DD-7, narrowed) -- the local daemon answers in-process, so a local
 * turn is always terminal by the time this runs. There is nothing to
 * subscribe to: `WsHubLiveEventSource.subscribeChat`'s documented no-op in
 * `packages/ui/src/lib/live-events.ts` relies on exactly that.
 *
 * A local turn has no `chat_turns` row, so `id` has nothing natural to hold.
 * The assistant message's id is used, falling back to the user message's on
 * a failed turn (no assistant message exists then) -- both are stable across
 * a refetch, which is what a React key and a retry target both need.
 *
 * `ChatTurnError` is structured (kind, reason, attempts, a `fallback` model
 * suggestion); `ChatTurnState.error` is a plain string. Flattening to the
 * reason text drops the fallback-model offer on this host -- see
 * doc/tasks/M13/T-M13-02-local-host-turn-state.md's Traps for why that is
 * accepted here rather than widening the shared contract.
 */
export function asTurnState(turn: ChatTurn): ChatTurnState {
  // Invariant, not a real failure mode: postChatTurn/retryChatTurn always
  // insert the user message before running (chat/service.ts). Narrows the
  // type rather than guarding against something that can happen.
  const userMessage = turn.userMessage;
  if (!userMessage) throw new Error("local ChatTurn produced no user message");

  return {
    id: turn.assistantMessage?.id ?? userMessage.id,
    sessionId: turn.session.id,
    status: turn.error ? "failed" : "succeeded",
    waitingReason: null,
    replyText: turn.assistantMessage?.content ?? "",
    replySeq: 0,
    provider: turn.session.provider,
    model: turn.session.model,
    attempt: 1,
    retryOfTurnId: null,
    error: turn.error?.reason ?? null,
    userMessage,
    assistantMessage: turn.assistantMessage,
  };
}

/** Agent Creator sessions keep the local, non-dispatched `ChatTurn` shape
 *  (`draftTurn` and all) unchanged -- see this file's `asTurnState` comment
 *  and T-M13-02 decision 1. Every other kind gets the async contract both
 *  hosts now share. */
export function respondWithTurn(turn: ChatTurn): ChatTurn | ChatTurnState {
  return turn.session.kind === "agent-creator" ? turn : asTurnState(turn);
}

/** Unified session-chat API (intake 0001+0002): persistent sessions backing
 *  the Chat surface and the Agent Creator page. */
export async function chatRoutes(app: FastifyInstance): Promise<void> {
  app.get("/chat/sessions", async (request) =>
    listChatSessions(chatSessionListQuerySchema.parse(request.query)),
  );

  app.get("/chat/search", async (request) =>
    searchChatSessions(chatSearchQuerySchema.parse(request.query))
  );

  app.post("/chat/sessions", async (request, reply) => {
    const session = createChatSession(chatSessionCreateSchema.parse(request.body));
    reply.code(201);
    return session;
  });

  app.get("/chat/sessions/:id", async (request) => {
    const { id } = request.params as { id: string };
    // This host answers synchronously and keeps no chat_turns row, so there
    // is never a turn in flight between requests -- null is the honest
    // answer here, not a placeholder for something unbuilt.
    return { session: getChatSession(id), messages: listChatMessages(id), activeTurn: null };
  });

  app.patch("/chat/sessions/:id", async (request) => {
    const { id } = request.params as { id: string };
    return updateChatSession(id, chatSessionUpdateSchema.parse(request.body));
  });

  app.post("/chat/sessions/:id/messages", async (request) => {
    const { id } = request.params as { id: string };
    const body = chatTurnRequestSchema.parse(request.body);
    return respondWithTurn(await postChatTurn(id, body.content, body.draft));
  });

  // Re-run the last failed turn; provider/model override = the user-approved
  // secondary-model failover (never applied silently).
  app.post("/chat/sessions/:id/retry", async (request) => {
    const { id } = request.params as { id: string };
    const body = chatRetryRequestSchema.parse(request.body ?? {});
    return respondWithTurn(
      await retryChatTurn(id, { provider: body.provider, model: body.model }, body.draft),
    );
  });
}
