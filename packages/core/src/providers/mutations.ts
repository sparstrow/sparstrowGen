"use client";

import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import type { DiscoverModelsResult, ProviderId } from "@sparstrow/shared";
import { useApi } from "../platform/core-provider";
import type { ApiError } from "../api/errors";
import { queryKeys } from "../query-keys";

export interface DiscoverModelsInput {
  provider: ProviderId;
}

/**
 * Live model discovery for a provider CLI or API (degrades gracefully to static catalogs).
 */
export function useDiscoverModels(): UseMutationResult<
  DiscoverModelsResult,
  ApiError,
  DiscoverModelsInput
> {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation<DiscoverModelsResult, ApiError, DiscoverModelsInput>({
    mutationFn: ({ provider }) =>
      api.post<DiscoverModelsResult>("/providers/discover-models", { provider }),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.providers.models(data.provider), data);
      queryClient.invalidateQueries({ queryKey: queryKeys.providers.list() });
    },
  });
}
