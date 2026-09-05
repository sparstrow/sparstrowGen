"use client";

import {
  useMutation,
  useQueryClient,
  type MutationObserverOptions,
  type QueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import type {
  ChatAttachmentUpload,
  ChatSession,
  ChatSessionCreate,
  ChatTurnState,
} from "@sparstrow/shared";
import { useApi } from "../platform/core-provider";
import type { ApiClient } from "../api/client";
import type { ApiError } from "../api/errors";
import { queryKeys } from "../query-keys";

export interface SendChatMessageInput {
  sessionId: string;
  content: string;
  attachments?: ChatAttachmentUpload[];
  draft?: Record<string, unknown>;
}

export interface RenameChatSessionInput {
  sessionId: string;
  title: string;
}

export function createChatSessionMutationOptions(
  api: ApiClient,
  queryClient: QueryClient,
): MutationObserverOptions<ChatSession, ApiError, ChatSessionCreate> {
  return {
    mutationFn: (input: ChatSessionCreate) => api.post<ChatSession>("/chat/sessions", input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.chat.all });
    },
  };
}

export function sendChatMessageMutationOptions(
  api: ApiClient,
  queryClient: QueryClient,
): MutationObserverOptions<ChatTurnState, ApiError, SendChatMessageInput> {
  return {
    mutationFn: ({ sessionId, ...body }: SendChatMessageInput) =>
      api.post<ChatTurnState>(`/chat/sessions/${sessionId}/messages`, body),
    onSuccess: (_data, { sessionId }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.chat.session(sessionId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.chat.all });
    },
  };
}

export function renameChatSessionMutationOptions(
  api: ApiClient,
  queryClient: QueryClient,
): MutationObserverOptions<ChatSession, ApiError, RenameChatSessionInput> {
  return {
    mutationFn: ({ sessionId, title }: RenameChatSessionInput) =>
      api.patch<ChatSession>(`/chat/sessions/${sessionId}`, { title }),
    onSuccess: (_data, { sessionId }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.chat.session(sessionId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.chat.all });
    },
  };
}

export function deleteChatSessionMutationOptions(
  api: ApiClient,
  queryClient: QueryClient,
): MutationObserverOptions<void, ApiError, string> {
  return {
    mutationFn: (sessionId: string) => api.delete<void>(`/chat/sessions/${sessionId}`),
    onSuccess: (_data, sessionId) => {
      queryClient.removeQueries({ queryKey: queryKeys.chat.session(sessionId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.chat.all });
    },
  };
}

/**
 * Creates a new chat session (free, agent, project, or agent-creator).
 *
 * Invalidates the chat query cache upon creation.
 */
export function useCreateChatSession(): UseMutationResult<
  ChatSession,
  ApiError,
  ChatSessionCreate
> {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation<ChatSession, ApiError, ChatSessionCreate>(
    createChatSessionMutationOptions(api, queryClient),
  );
}

/**
 * Dispatches one user turn to an active chat session.
 *
 * Returns the resulting ChatTurnState (waiting, in_progress, or succeeded).
 * Invalidates the specific session detail query and sessions list on success.
 */
export function useSendChatMessage(): UseMutationResult<
  ChatTurnState,
  ApiError,
  SendChatMessageInput
> {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation<ChatTurnState, ApiError, SendChatMessageInput>(
    sendChatMessageMutationOptions(api, queryClient),
  );
}

/**
 * Renames an existing chat session.
 */
export function useRenameChatSession(): UseMutationResult<
  ChatSession,
  ApiError,
  RenameChatSessionInput
> {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation<ChatSession, ApiError, RenameChatSessionInput>(
    renameChatSessionMutationOptions(api, queryClient),
  );
}

/**
 * Deletes an existing chat session.
 */
export function useDeleteChatSession(): UseMutationResult<void, ApiError, string> {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>(
    deleteChatSessionMutationOptions(api, queryClient),
  );
}
