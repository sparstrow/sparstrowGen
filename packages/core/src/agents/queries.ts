"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { Agent } from "@sparstrow/shared";
import { useApi } from "../platform/core-provider";
import type { ApiError } from "../api/errors";
import { queryKeys } from "../query-keys";

/** Every agent in the workspace — what the picker in the chat surface offers. */
export function useAgents(): UseQueryResult<Agent[], ApiError> {
  const api = useApi();
  return useQuery<Agent[], ApiError>({
    queryKey: queryKeys.agents.list(),
    queryFn: ({ signal }) => api.get<Agent[]>("/agents", signal),
  });
}

export function useAgent(id: string | null): UseQueryResult<Agent, ApiError> {
  const api = useApi();
  return useQuery<Agent, ApiError>({
    queryKey: queryKeys.agents.detail(id ?? ""),
    queryFn: ({ signal }) => api.get<Agent>(`/agents/${id}`, signal),
    // `enabled` rather than a non-null assertion: a detail hook is routinely
    // mounted before its id is known (a route param still resolving), and the
    // honest answer then is "no query", not a request for `/agents/undefined`.
    enabled: Boolean(id),
  });
}
