"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { Run, RunEvent } from "@sparstrow/shared";
import { useApi } from "../platform/core-provider";
import { qs } from "../api/client";
import type { ApiError } from "../api/errors";
import { queryKeys } from "../query-keys";

export type RunFilters = {
  status?: string;
  agentId?: string;
  projectId?: string;
  limit?: number;
};

export function useRuns(filters: RunFilters = {}): UseQueryResult<Run[], ApiError> {
  const api = useApi();
  return useQuery<Run[], ApiError>({
    queryKey: queryKeys.runs.list(filters),
    queryFn: ({ signal }) => api.get<Run[]>(`/runs${qs(filters)}`, signal),
  });
}

export function useRun(id: string | null): UseQueryResult<Run, ApiError> {
  const api = useApi();
  return useQuery<Run, ApiError>({
    queryKey: queryKeys.runs.detail(id ?? ""),
    queryFn: ({ signal }) => api.get<Run>(`/runs/${id}`, signal),
    enabled: Boolean(id),
  });
}

/**
 * A run's transcript.
 *
 * Deliberately NOT polled here. Run events are pushed — they arrive over the
 * server-owned WebSocket as the agent produces them, and a poll on top would
 * both duplicate that and make a finished run keep asking forever. Until the
 * WS lands (Phase 2's second half), a caller that needs live output refetches
 * on its own terms.
 */
export function useRunEvents(id: string | null): UseQueryResult<RunEvent[], ApiError> {
  const api = useApi();
  return useQuery<RunEvent[], ApiError>({
    queryKey: queryKeys.runs.events(id ?? ""),
    queryFn: ({ signal }) => api.get<RunEvent[]>(`/runs/${id}/events`, signal),
    enabled: Boolean(id),
  });
}
