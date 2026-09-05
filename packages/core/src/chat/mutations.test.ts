import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "../query-keys";
import {
  createChatSessionMutationOptions,
  sendChatMessageMutationOptions,
  renameChatSessionMutationOptions,
  deleteChatSessionMutationOptions,
  useCreateChatSession,
  useSendChatMessage,
  useRenameChatSession,
  useDeleteChatSession,
} from "./mutations";
import type { ApiClient } from "../api/client";
import type {
  ChatSession,
  ChatSessionCreate,
  ChatTurnState,
} from "@sparstrow/shared";

function mockApiClient(): ApiClient {
  return {
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    get: vi.fn(),
    put: vi.fn(),
  } as unknown as ApiClient;
}

describe("chat mutations", () => {
  it("exports all required mutation hooks", () => {
    expect(typeof useCreateChatSession).toBe("function");
    expect(typeof useSendChatMessage).toBe("function");
    expect(typeof useRenameChatSession).toBe("function");
    expect(typeof useDeleteChatSession).toBe("function");
  });

  describe("createChatSession", () => {
    it("calls POST /chat/sessions with payload and invalidates query cache", async () => {
      const api = mockApiClient();
      const queryClient = new QueryClient();
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      const session: Partial<ChatSession> = {
        id: "chs_123",
        kind: "agent",
        title: "Test Session",
      };
      (api.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(session);

      const options = createChatSessionMutationOptions(api, queryClient);
      const input: ChatSessionCreate = {
        kind: "agent",
        agentId: "agt_123",
        title: "Test Session",
      };

      const result = await (options.mutationFn as any)(input);
      expect(api.post).toHaveBeenCalledWith("/chat/sessions", input);
      expect(result).toEqual(session);

      (options.onSuccess as any)(session as ChatSession, input, undefined);
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.chat.all });
    });
  });

  describe("sendChatMessage", () => {
    it("calls POST /chat/sessions/:id/messages with payload and invalidates session queries", async () => {
      const api = mockApiClient();
      const queryClient = new QueryClient();
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      const turnState: Partial<ChatTurnState> = {
        id: "turn_1",
        sessionId: "chs_123",
        status: "waiting",
      };
      (api.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(turnState);

      const options = sendChatMessageMutationOptions(api, queryClient);
      const input = {
        sessionId: "chs_123",
        content: "Ping agent",
      };

      const result = await (options.mutationFn as any)(input);
      expect(api.post).toHaveBeenCalledWith("/chat/sessions/chs_123/messages", {
        content: "Ping agent",
      });
      expect(result).toEqual(turnState);

      (options.onSuccess as any)(turnState as ChatTurnState, input, undefined);
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.chat.session("chs_123") });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.chat.all });
    });
  });

  describe("renameChatSession", () => {
    it("calls PATCH /chat/sessions/:id and invalidates session queries", async () => {
      const api = mockApiClient();
      const queryClient = new QueryClient();
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      const session: Partial<ChatSession> = {
        id: "chs_123",
        title: "New Title",
      };
      (api.patch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(session);

      const options = renameChatSessionMutationOptions(api, queryClient);
      const input = {
        sessionId: "chs_123",
        title: "New Title",
      };

      const result = await (options.mutationFn as any)(input);
      expect(api.patch).toHaveBeenCalledWith("/chat/sessions/chs_123", {
        title: "New Title",
      });
      expect(result).toEqual(session);

      (options.onSuccess as any)(session as ChatSession, input, undefined);
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.chat.session("chs_123") });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.chat.all });
    });
  });

  describe("deleteChatSession", () => {
    it("calls DELETE /chat/sessions/:id and removes/invalidates query cache", async () => {
      const api = mockApiClient();
      const queryClient = new QueryClient();
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
      const removeSpy = vi.spyOn(queryClient, "removeQueries");

      (api.delete as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);

      const options = deleteChatSessionMutationOptions(api, queryClient);
      const sessionId = "chs_123";

      await (options.mutationFn as any)(sessionId);
      expect(api.delete).toHaveBeenCalledWith("/chat/sessions/chs_123");

      (options.onSuccess as any)(undefined, sessionId, undefined);
      expect(removeSpy).toHaveBeenCalledWith({ queryKey: queryKeys.chat.session("chs_123") });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.chat.all });
    });
  });
});
