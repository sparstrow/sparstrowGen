import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import type {
  Agent,
  AgentCreate,
  AgentUpdate,
  DraftRequest,
  DraftTurn,
  CronJob,
  CronJobCreate,
  CronJobUpdate,
  MemoryNote,
  MemoryNoteCreate,
  MemoryScopeKind,
  MemorySearchHit,
  Message,
  Pipeline,
  PipelineCreate,
  PipelineRun,
  PipelineUpdate,
  Project,
  ProjectCreate,
  ProjectUpdate,
  Run,
  RunEvent,
  RunStatus,
  SystemHealth,
  Task,
  TaskStatus,
} from "@sparstrow/shared";
import { api, type ApiError } from "@/lib/api";

/** Builds a query string from defined params; returns "" when empty. */
function qs(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value));
    }
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
}

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

export function useAgents(): UseQueryResult<Agent[], ApiError> {
  return useQuery({
    queryKey: ["agents"],
    queryFn: () => api<Agent[]>("/agents"),
  });
}

export function useAgent(id: string): UseQueryResult<Agent, ApiError> {
  return useQuery({
    queryKey: ["agent", id],
    queryFn: () => api<Agent>(`/agents/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateAgent(): UseMutationResult<Agent, ApiError, AgentCreate> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: AgentCreate) => api<Agent>("/agents", { method: "POST", body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["agents"] });
    },
  });
}

export function useUpdateAgent(): UseMutationResult<
  Agent,
  ApiError,
  { id: string; data: AgentUpdate }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => api<Agent>(`/agents/${id}`, { method: "PUT", body: data }),
    onSuccess: (_agent, { id }) => {
      void queryClient.invalidateQueries({ queryKey: ["agents"] });
      void queryClient.invalidateQueries({ queryKey: ["agent", id] });
    },
  });
}

export function useDeleteAgent(): UseMutationResult<void, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/agents/${id}`, { method: "DELETE" }),
    onSuccess: (_void, id) => {
      void queryClient.invalidateQueries({ queryKey: ["agents"] });
      void queryClient.invalidateQueries({ queryKey: ["agent", id] });
    },
  });
}

/** POST /agents/draft -> one Agent Creator turn (validated, clamped). */
export function useDraftAgent(): UseMutationResult<DraftTurn, ApiError, DraftRequest> {
  return useMutation({
    mutationFn: (body: DraftRequest) => api<DraftTurn>("/agents/draft", { method: "POST", body }),
  });
}

/** POST /agents/:id/test-spawn -> Run (202). */
export function useTestSpawnAgent(): UseMutationResult<Run, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<Run>(`/agents/${id}/test-spawn`, { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["runs"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export function useProjects(): UseQueryResult<Project[], ApiError> {
  return useQuery({
    queryKey: ["projects"],
    queryFn: () => api<Project[]>("/projects"),
  });
}

export function useProject(id: string): UseQueryResult<Project, ApiError> {
  return useQuery({
    queryKey: ["projects", id],
    queryFn: () => api<Project>(`/projects/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateProject(): UseMutationResult<Project, ApiError, ProjectCreate> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ProjectCreate) => api<Project>("/projects", { method: "POST", body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useUpdateProject(): UseMutationResult<
  Project,
  ApiError,
  { id: string; data: ProjectUpdate }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => api<Project>(`/projects/${id}`, { method: "PUT", body: data }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useDeleteProject(): UseMutationResult<void, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/projects/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

export interface RunFilters {
  agentId?: string;
  projectId?: string;
  status?: RunStatus;
  limit?: number;
}

export function useRuns(filters: RunFilters = {}): UseQueryResult<Run[], ApiError> {
  return useQuery({
    queryKey: ["runs", filters],
    queryFn: () =>
      api<Run[]>(
        `/runs${qs({
          agentId: filters.agentId,
          projectId: filters.projectId,
          status: filters.status,
          limit: filters.limit,
        })}`,
      ),
  });
}

export function useRun(id: string): UseQueryResult<Run, ApiError> {
  return useQuery({
    queryKey: ["run", id],
    queryFn: () => api<Run>(`/runs/${id}`),
    enabled: Boolean(id),
  });
}

export function useRunEvents(
  id: string,
  options: { afterSeq?: number; limit?: number } = {},
): UseQueryResult<RunEvent[], ApiError> {
  const afterSeq = options.afterSeq ?? -1;
  const limit = options.limit ?? 500;
  return useQuery({
    queryKey: ["run-events", id],
    queryFn: () => api<RunEvent[]>(`/runs/${id}/events${qs({ afterSeq, limit })}`),
    enabled: Boolean(id),
  });
}

export interface CreateRunInput {
  agentId: string;
  projectId?: string | null;
  prompt: string;
}

export function useCreateRun(): UseMutationResult<Run, ApiError, CreateRunInput> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateRunInput) => api<Run>("/runs", { method: "POST", body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["runs"] });
    },
  });
}

export function useCancelRun(): UseMutationResult<Run, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<Run>(`/runs/${id}/cancel`, { method: "POST" }),
    onSuccess: (_run, id) => {
      void queryClient.invalidateQueries({ queryKey: ["runs"] });
      void queryClient.invalidateQueries({ queryKey: ["run", id] });
    },
  });
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export interface TaskFilters {
  status?: TaskStatus;
  projectId?: string;
  assignedAgentId?: string;
}

export function useTasks(filters: TaskFilters = {}): UseQueryResult<Task[], ApiError> {
  return useQuery({
    queryKey: ["tasks", filters],
    queryFn: () =>
      api<Task[]>(
        `/tasks${qs({
          status: filters.status,
          projectId: filters.projectId,
          assignedAgentId: filters.assignedAgentId,
        })}`,
      ),
  });
}

export interface TaskCreateInput {
  title: string;
  description?: string;
  projectId?: string | null;
  assignedAgentId?: string | null;
  priority?: number;
}

export function useCreateTask(): UseMutationResult<Task, ApiError, TaskCreateInput> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: TaskCreateInput) => api<Task>("/tasks", { method: "POST", body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

export interface TaskUpdateInput {
  title?: string;
  description?: string;
  status?: TaskStatus;
  assignedAgentId?: string | null;
  priority?: number;
  result?: string | null;
}

export function useUpdateTask(): UseMutationResult<
  Task,
  ApiError,
  { id: string; data: TaskUpdateInput }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => api<Task>(`/tasks/${id}`, { method: "PUT", body: data }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

export function useDeleteTask(): UseMutationResult<void, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/tasks/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

/** POST /tasks/:id/run — (re)spawn the assignee on a stuck or failed task. */
export function useRunTask(): UseMutationResult<Task, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<Task>(`/tasks/${id}/run`, { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      void queryClient.invalidateQueries({ queryKey: ["runs"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export function useMessages(filters: { unreadOnly?: boolean } = {}): UseQueryResult<
  Message[],
  ApiError
> {
  return useQuery({
    queryKey: ["messages", filters],
    queryFn: () => api<Message[]>(`/messages${qs({ unreadOnly: filters.unreadOnly ? "true" : undefined })}`),
  });
}

export interface MessageCreateInput {
  toAgentId?: string | null;
  projectId?: string | null;
  taskId?: string | null;
  subject?: string;
  body: string;
  spawnRun?: boolean;
}

export function useSendMessage(): UseMutationResult<Message, ApiError, MessageCreateInput> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: MessageCreateInput) => api<Message>("/messages", { method: "POST", body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["messages"] });
    },
  });
}

export function useMarkMessageRead(): UseMutationResult<Message, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<Message>(`/messages/${id}/mark-read`, { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["messages"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Memory
// ---------------------------------------------------------------------------

export interface MemoryNoteFilters {
  scope?: MemoryScopeKind;
  projectSlug?: string;
  agentSlug?: string;
}

export function useMemoryNotes(
  filters: MemoryNoteFilters = {},
): UseQueryResult<MemoryNote[], ApiError> {
  return useQuery({
    queryKey: ["memory-notes", filters],
    queryFn: () =>
      api<MemoryNote[]>(
        `/memory/notes${qs({
          scope: filters.scope,
          projectSlug: filters.projectSlug,
          agentSlug: filters.agentSlug,
        })}`,
      ),
  });
}

export function useMemoryNote(id: string): UseQueryResult<MemoryNote, ApiError> {
  return useQuery({
    queryKey: ["memory-notes", id],
    queryFn: () => api<MemoryNote>(`/memory/notes/${id}`),
    enabled: Boolean(id),
  });
}

export interface NoteRaw {
  id: string;
  path: string;
  content: string;
}

export function useNoteRaw(id: string): UseQueryResult<NoteRaw, ApiError> {
  return useQuery({
    queryKey: ["note-raw", id],
    queryFn: () => api<NoteRaw>(`/memory/notes/${id}/raw`),
    enabled: Boolean(id),
  });
}

export function useCreateMemoryNote(): UseMutationResult<MemoryNote, ApiError, MemoryNoteCreate> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: MemoryNoteCreate) =>
      api<MemoryNote>("/memory/notes", { method: "POST", body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["memory-notes"] });
    },
  });
}

export function useUpdateNoteRaw(): UseMutationResult<
  NoteRaw,
  ApiError,
  { id: string; content: string }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, content }) =>
      api<NoteRaw>(`/memory/notes/${id}/raw`, { method: "PUT", body: { content } }),
    onSuccess: (_raw, { id }) => {
      void queryClient.invalidateQueries({ queryKey: ["note-raw", id] });
      void queryClient.invalidateQueries({ queryKey: ["memory-notes"] });
    },
  });
}

export function useDeleteMemoryNote(): UseMutationResult<void, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/memory/notes/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["memory-notes"] });
    },
  });
}

export interface MemoryRescanResult {
  added: number;
  updated: number;
  removed: number;
  dirty: number;
}

export function useMemoryRescan(): UseMutationResult<MemoryRescanResult, ApiError, void> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api<MemoryRescanResult>("/memory/rescan", { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["memory-notes"] });
    },
  });
}

export interface MemorySearchInput {
  query: string;
  k?: number;
}

export function useMemorySearch(): UseMutationResult<
  MemorySearchHit[],
  ApiError,
  MemorySearchInput
> {
  return useMutation({
    mutationFn: (body: MemorySearchInput) =>
      api<MemorySearchHit[]>("/memory/search", { method: "POST", body }),
  });
}

// ---------------------------------------------------------------------------
// Pipelines
// ---------------------------------------------------------------------------

export function usePipelines(): UseQueryResult<Pipeline[], ApiError> {
  return useQuery({ queryKey: ["pipelines"], queryFn: () => api<Pipeline[]>("/pipelines") });
}

export function usePipeline(id: string): UseQueryResult<Pipeline, ApiError> {
  return useQuery({
    queryKey: ["pipeline", id],
    queryFn: () => api<Pipeline>(`/pipelines/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreatePipeline(): UseMutationResult<Pipeline, ApiError, PipelineCreate> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: PipelineCreate) => api<Pipeline>("/pipelines", { method: "POST", body }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["pipelines"] }),
  });
}

export function useUpdatePipeline(): UseMutationResult<
  Pipeline,
  ApiError,
  { id: string; data: PipelineUpdate }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) =>
      api<Pipeline>(`/pipelines/${id}`, { method: "PUT", body: data }),
    onSuccess: (_p, { id }) => {
      void queryClient.invalidateQueries({ queryKey: ["pipelines"] });
      void queryClient.invalidateQueries({ queryKey: ["pipeline", id] });
    },
  });
}

export function useDeletePipeline(): UseMutationResult<void, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/pipelines/${id}`, { method: "DELETE" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["pipelines"] }),
  });
}

export function useRunPipeline(): UseMutationResult<
  PipelineRun,
  ApiError,
  { id: string; prompt: string }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, prompt }) =>
      api<PipelineRun>(`/pipelines/${id}/run`, { method: "POST", body: { prompt } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["runs"] }),
  });
}

export function usePipelineRuns(pipelineId: string): UseQueryResult<PipelineRun[], ApiError> {
  return useQuery({
    queryKey: ["pipeline-runs", pipelineId],
    queryFn: () => api<PipelineRun[]>(`/pipelines/${pipelineId}/runs`),
    enabled: Boolean(pipelineId),
  });
}

// ---------------------------------------------------------------------------
// Cron jobs
// ---------------------------------------------------------------------------

export function useCronJobs(): UseQueryResult<CronJob[], ApiError> {
  return useQuery({ queryKey: ["cron-jobs"], queryFn: () => api<CronJob[]>("/cron-jobs") });
}

export function useCreateCronJob(): UseMutationResult<CronJob, ApiError, CronJobCreate> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CronJobCreate) => api<CronJob>("/cron-jobs", { method: "POST", body }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["cron-jobs"] }),
  });
}

export function useUpdateCronJob(): UseMutationResult<
  CronJob,
  ApiError,
  { id: string; data: CronJobUpdate }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) =>
      api<CronJob>(`/cron-jobs/${id}`, { method: "PUT", body: data }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["cron-jobs"] }),
  });
}

export function useDeleteCronJob(): UseMutationResult<void, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/cron-jobs/${id}`, { method: "DELETE" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["cron-jobs"] }),
  });
}

export function useRunCronJobNow(): UseMutationResult<{ ok: boolean }, ApiError, string> {
  return useMutation({
    mutationFn: (id: string) =>
      api<{ ok: boolean }>(`/cron-jobs/${id}/run-now`, { method: "POST" }),
  });
}

// ---------------------------------------------------------------------------
// Terminals
// ---------------------------------------------------------------------------

export interface TerminalSession {
  id: string;
  agentId: string | null;
  cols: number;
  rows: number;
  createdAt: string;
}

export function useTerminalSessions(): UseQueryResult<TerminalSession[], ApiError> {
  return useQuery({
    queryKey: ["terminal-sessions"],
    queryFn: () => api<TerminalSession[]>("/terminal/sessions"),
  });
}

export function useCreateTerminalSession(): UseMutationResult<
  TerminalSession,
  ApiError,
  { agentId?: string; cols?: number; rows?: number }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body) =>
      api<TerminalSession>("/terminal/sessions", { method: "POST", body }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["terminal-sessions"] }),
  });
}

export function useKillTerminalSession(): UseMutationResult<void, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<void>(`/terminal/sessions/${id}`, { method: "DELETE" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["terminal-sessions"] }),
  });
}

// ---------------------------------------------------------------------------
// System
// ---------------------------------------------------------------------------

export function useHealth(): UseQueryResult<SystemHealth, ApiError> {
  return useQuery({
    queryKey: ["health"],
    queryFn: () => api<SystemHealth>("/system/health"),
  });
}

export function useSettings(): UseQueryResult<Record<string, string>, ApiError> {
  return useQuery({
    queryKey: ["settings"],
    queryFn: () => api<Record<string, string>>("/system/settings"),
  });
}

export function useUpdateSettings(): UseMutationResult<
  Record<string, string>,
  ApiError,
  Record<string, string>
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, string>) =>
      api<Record<string, string>>("/system/settings", { method: "PUT", body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
  });
}
