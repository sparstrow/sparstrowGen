"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiClient } from "../api/client";
import { ApiError } from "../api/errors";
import { memoryStorage, type ClientIdentity, type Storage } from "./types";

/**
 * The one thing an app mounts to get the whole data layer.
 *
 * Everything a screen in `@sparstrow/views` needs — the API client, the query
 * cache, who we are, where we store things — comes from here, so a screen never
 * has to know which app is rendering it. That is what makes the same chat
 * surface work in a browser tab and in an Electron window.
 */

export type CoreContextValue = {
  api: ApiClient;
  storage: Storage;
  identity: ClientIdentity;
  /** The workspace the UI is acting in, and how to change it. */
  workspaceId: string | null;
  setWorkspaceId: (id: string | null) => void;
};

const CoreContext = React.createContext<CoreContextValue | null>(null);

const WORKSPACE_STORAGE_KEY = "sparstrow.workspace";

export type CoreProviderProps = {
  children: React.ReactNode;
  /** Where `server/` is. `""` for same-origin (the web app's own proxy). */
  apiBaseUrl: string;
  identity: ClientIdentity;
  /** Defaults to in-memory: the app works, it just forgets between restarts. */
  storage?: Storage;
  /** Called per request. `null` means "this host authenticates by cookie". */
  getToken?: () => string | null | Promise<string | null>;
  /**
   * Supply one to share a cache with code outside this provider, or to control
   * it in a test. Otherwise a sensible one is created once.
   */
  queryClient?: QueryClient;
};

function defaultQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // A minute is long enough that moving between screens does not refetch
        // everything, and short enough that a machine's status is not stale in
        // a way anyone would notice.
        staleTime: 60_000,
        retry: (failureCount, error) => {
          // Never retry a 4xx: the request was understood and refused, and
          // asking again produces the same refusal three times more slowly.
          // 401 especially — retrying a dead session just delays the sign-in
          // prompt the person actually needs.
          if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
            return false;
          }
          return failureCount < 2;
        },
      },
    },
  });
}

export function CoreProvider({
  children,
  apiBaseUrl,
  identity,
  storage,
  getToken,
  queryClient,
}: CoreProviderProps) {
  const resolvedStorage = React.useMemo(() => storage ?? memoryStorage(), [storage]);
  const [client] = React.useState(() => queryClient ?? defaultQueryClient());

  const [workspaceId, setWorkspaceIdState] = React.useState<string | null>(null);

  // Read the remembered workspace once on mount. Deliberately not part of the
  // render path: `Storage` is async on two of the three platforms, and a data
  // layer that cannot render until a disk read finishes is one that flashes
  // empty on every cold start.
  React.useEffect(() => {
    let cancelled = false;
    void resolvedStorage.get(WORKSPACE_STORAGE_KEY).then((value) => {
      if (!cancelled && value) setWorkspaceIdState(value);
    });
    return () => {
      cancelled = true;
    };
  }, [resolvedStorage]);

  // A ref so `ApiClient` reads the CURRENT workspace on every request without
  // being rebuilt when it changes — rebuilding the client would change its
  // identity and invalidate every query that closed over it.
  const workspaceRef = React.useRef<string | null>(workspaceId);
  workspaceRef.current = workspaceId;

  const api = React.useMemo(
    () =>
      new ApiClient({
        baseUrl: apiBaseUrl,
        getToken,
        getWorkspaceId: () => workspaceRef.current,
      }),
    [apiBaseUrl, getToken],
  );

  const setWorkspaceId = React.useCallback(
    (id: string | null) => {
      setWorkspaceIdState(id);
      void (id
        ? resolvedStorage.set(WORKSPACE_STORAGE_KEY, id)
        : resolvedStorage.remove(WORKSPACE_STORAGE_KEY));
      // Everything cached was scoped to the previous workspace. Keeping it
      // would show the old workspace's rows under the new one's name until
      // each query happened to refetch.
      client.clear();
    },
    [client, resolvedStorage],
  );

  const value = React.useMemo<CoreContextValue>(
    () => ({ api, storage: resolvedStorage, identity, workspaceId, setWorkspaceId }),
    [api, resolvedStorage, identity, workspaceId, setWorkspaceId],
  );

  return (
    <CoreContext.Provider value={value}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </CoreContext.Provider>
  );
}

export function useCore(): CoreContextValue {
  const value = React.useContext(CoreContext);
  if (!value) {
    throw new Error(
      "useCore() was called outside a <CoreProvider>. Every app mounts one at " +
        "its root — see apps/web/src/app/providers.tsx.",
    );
  }
  return value;
}

/** The API client on its own, which is what most hooks actually want. */
export function useApi(): ApiClient {
  return useCore().api;
}
