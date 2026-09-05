/**
 * `@sparstrow/core` — the CLIENT data layer.
 *
 * Everything an app needs to talk to `server/`, and nothing about how any of it
 * looks. UI lives in `@sparstrow/views`; the API itself lives in `server/`.
 *
 * Exports **source**, not a build (`AGENTS.md` §1 rule 3), so there is no
 * `dist/`, no watch mode, and no step between editing a file here and seeing it
 * in an app.
 *
 * Mirrors `server/`'s domains one-to-one on purpose: `machines/`, `agents/`,
 * `chat/`, `runs/`. When a new domain appears on one side, the matching folder
 * on the other is the obvious place to look.
 */

export { ApiClient, qs, type ApiClientOptions, type RequestInitLite } from "./api/client";
export { ApiError } from "./api/errors";

export {
  CoreProvider,
  useApi,
  useCore,
  type CoreContextValue,
  type CoreProviderProps,
} from "./platform/core-provider";
export { memoryStorage, type ClientIdentity, type Storage } from "./platform/types";

export { queryKeys } from "./query-keys";

export { useMachines, useMachineProjects } from "./machines/queries";
export { useAgent, useAgents } from "./agents/queries";
export { useChatSession, useChatSessions } from "./chat/queries";
export {
  useCreateChatSession,
  useSendChatMessage,
  useRenameChatSession,
  useDeleteChatSession,
  type SendChatMessageInput,
  type RenameChatSessionInput,
} from "./chat/mutations";
export { useRun, useRunEvents, useRuns, type RunFilters } from "./runs/queries";

