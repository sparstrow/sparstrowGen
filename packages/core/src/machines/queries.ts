"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { HEARTBEAT_INTERVAL_MS, type Runtime, type RuntimeProject } from "@sparstrow/shared";
import { useApi } from "../platform/core-provider";
import type { ApiError } from "../api/errors";
import { queryKeys } from "../query-keys";

/**
 * "My machines are there" — the first thing the app has to get right.
 *
 * The whole product premise is that you open the app and your own computer is
 * listed, so this is the query the vertical slice is built on.
 */
export function useMachines(): UseQueryResult<Runtime[], ApiError> {
  const api = useApi();
  return useQuery<Runtime[], ApiError>({
    queryKey: queryKeys.machines.list(),
    queryFn: ({ signal }) => api.get<Runtime[]>("/runtimes", signal),

    // A machine crossing the staleness threshold changes nothing in the
    // database, so nothing pushes and no WebSocket event will ever arrive.
    // Liveness is derived from the AGE of the last heartbeat, which means the
    // only way a list goes from "online" to "offline" is by being asked again.
    // Polling here is not a placeholder for the WS; the two answer different
    // questions.
    refetchInterval: HEARTBEAT_INTERVAL_MS,
    refetchIntervalInBackground: false,

    // Shorter than the provider's default: a stale machine list is the one
    // piece of data where being a minute out of date is actively misleading —
    // it offers you a machine to run on that is not there.
    staleTime: HEARTBEAT_INTERVAL_MS / 2,
  });
}

/** Which projects each machine reports having on disk. */
export function useMachineProjects(): UseQueryResult<RuntimeProject[], ApiError> {
  const api = useApi();
  return useQuery<RuntimeProject[], ApiError>({
    queryKey: [...queryKeys.machines.all, "projects"],
    queryFn: ({ signal }) => api.get<RuntimeProject[]>("/runtime-projects", signal),
  });
}
