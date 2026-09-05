"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { ProviderInfo } from "@sparstrow/shared";
import { useApi } from "../platform/core-provider";
import type { ApiError } from "../api/errors";
import { queryKeys } from "../query-keys";

/**
 * Lists all registered AI agent runtimes and providers on this system.
 */
export function useProviders(): UseQueryResult<ProviderInfo[], ApiError> {
  const api = useApi();
  return useQuery<ProviderInfo[], ApiError>({
    queryKey: queryKeys.providers.list(),
    queryFn: ({ signal }) => api.get<ProviderInfo[]>("/providers", signal),
    staleTime: 60_000,
  });
}
