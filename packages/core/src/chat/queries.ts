"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type {
  ChatSession,
  ChatSessionDetail,
  ChatSessionListQuery,
} from "@sparstrow/shared";
import { useApi } from "../platform/core-provider";
import { qs } from "../api/client";
import type { ApiError } from "../api/errors";
import { queryKeys } from "../query-keys";

export function useChatSessions(
  filters: ChatSessionListQuery = {},
): UseQueryResult<ChatSession[], ApiError> {
  const api = useApi();
  return useQuery<ChatSession[], ApiError>({
    queryKey: queryKeys.chat.sessions(filters as Record<string, unknown>),
    queryFn: ({ signal }) =>
      api.get<ChatSession[]>(
        `/chat/sessions${qs({
          kind: filters.kind,
          projectId: filters.projectId,
          agentId: filters.agentId,
          status: filters.status,
        })}`,
        signal,
      ),
  });
}

export function useChatSession(id: string | null): UseQueryResult<ChatSessionDetail, ApiError> {
  const api = useApi();
  return useQuery<ChatSessionDetail, ApiError>({
    queryKey: queryKeys.chat.session(id ?? ""),
    queryFn: ({ signal }) => api.get<ChatSessionDetail>(`/chat/sessions/${id}`, signal),
    enabled: Boolean(id),
  });
}
