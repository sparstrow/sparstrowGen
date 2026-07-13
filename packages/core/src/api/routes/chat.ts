import type { FastifyInstance } from "fastify";
import {
  chatRetryRequestSchema,
  chatSessionCreateSchema,
  chatSessionListQuerySchema,
  chatSessionUpdateSchema,
  chatTurnRequestSchema,
} from "@sparstrow/shared";
import {
  createChatSession,
  getChatSession,
  listChatMessages,
  listChatSessions,
  postChatTurn,
  retryChatTurn,
  updateChatSession,
} from "../../chat/service.js";

/** Unified session-chat API (intake 0001+0002): persistent sessions backing
 *  the Chat surface and the Agent Creator page. */
export async function chatRoutes(app: FastifyInstance): Promise<void> {
  app.get("/chat/sessions", async (request) =>
    listChatSessions(chatSessionListQuerySchema.parse(request.query)),
  );

  app.post("/chat/sessions", async (request, reply) => {
    const session = createChatSession(chatSessionCreateSchema.parse(request.body));
    reply.code(201);
    return session;
  });

  app.get("/chat/sessions/:id", async (request) => {
    const { id } = request.params as { id: string };
    return { session: getChatSession(id), messages: listChatMessages(id) };
  });

  app.patch("/chat/sessions/:id", async (request) => {
    const { id } = request.params as { id: string };
    return updateChatSession(id, chatSessionUpdateSchema.parse(request.body));
  });

  app.post("/chat/sessions/:id/messages", async (request) => {
    const { id } = request.params as { id: string };
    const body = chatTurnRequestSchema.parse(request.body);
    return postChatTurn(id, body.content, body.draft);
  });

  // Re-run the last failed turn; provider/model override = the user-approved
  // secondary-model failover (never applied silently).
  app.post("/chat/sessions/:id/retry", async (request) => {
    const { id } = request.params as { id: string };
    const body = chatRetryRequestSchema.parse(request.body ?? {});
    return retryChatTurn(id, { provider: body.provider, model: body.model }, body.draft);
  });
}
