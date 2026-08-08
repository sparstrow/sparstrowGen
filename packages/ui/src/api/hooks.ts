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
  PromoteAgent,
  SkillImport,
  SkillImportCreate,
  DraftRequest,
  DraftTurn,
  Goal,
  GoalCreate,
  GoalDetail,
  GraphEngineStatus,
  GraphProjectStatus,
  CronJob,
  CronJobCreate,
  CronJobUpdate,
  DiscoverModelsResult,
  ProviderInfo,
  ProviderId,
  FactoryHealth,
  OpenPrRequest,
  PrQueue,
  ProjectPrGroup,
  PullRequestSummary,
  SecretMeta,
  MemoryLink,
  MemoryNote,
  MemoryNoteCreate,
  MemoryNoteType,
  MemoryScopeKind,
  MemorySearchHit,
  MemorySynthesis,
  Message,
  Pipeline,
  PipelineCreate,
  PipelineRun,
  PipelineUpdate,
  CreateDirectoryRequest,
  DirectoryListing,
  VolumeList,
  Project,
  ProjectCreate,
  ProjectUpdate,
  ProjectProvision,
  ProjectGitState,
  ProjectDirective,
  ProjectDirectiveCreate,
  ProjectDirectiveUpdate,
  Team,
  TeamCreate,
  TeamUpdate,
  TeamIndexItem,
  AgentSkillAssignment,
  LocalSkillSummary,
  Skill,
  SkillCreate,
  SkillDetail,
  SkillImportResult,
  SkillUpdate,
  TeamDetail,
  TeamMember,
  TeamMemberCreate,
  TeamMemberUpdate,
  Run,
  RunEvent,
  RunStatus,
  SystemHealth,
  Task,
  TaskQuestion,
  TaskStatus,
  PipelineDraftTurn,
  TeamManagerChatRequest,
  ChatRetryRequest,
  ChatSession,
  ChatSessionCreate,
  ChatSessionDetail,
  ChatSessionListQuery,
  ChatSessionUpdate,
  ChatTurn,
  ChatTurnRequest,
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

/** P4 §4: provision a project via scratch/bind/clone. */
export function useProvisionProject(): UseMutationResult<Project, ApiError, ProjectProvision> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ProjectProvision) => api<Project>("/projects/provision", { method: "POST", body }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["projects"] }),
  });
}

/**
 * 001 — host directory browsing for the New project folder picker. Served only
 * by a local core (FR-022a); in any other deployment these 404 and the picker
 * is not offered. `enabled` is the caller's gate so nothing is fetched until
 * the picker actually opens.
 */
export function useHostVolumes(enabled: boolean): UseQueryResult<VolumeList, ApiError> {
  return useQuery({
    queryKey: ["host-fs", "volumes"],
    queryFn: () => api<VolumeList>("/host-fs/volumes"),
    enabled,
  });
}

/** `path` null means "the volume list is showing"; undefined means "the home directory". */
export function useHostDir(
  path: string | undefined,
  enabled: boolean,
): UseQueryResult<DirectoryListing, ApiError> {
  return useQuery({
    queryKey: ["host-fs", "dir", path ?? null],
    queryFn: () =>
      api<DirectoryListing>(`/host-fs/dirs${path ? `?path=${encodeURIComponent(path)}` : ""}`),
    enabled,
    // A directory the owner is navigating can change under them; don't serve
    // a stale listing from an earlier visit in the same session.
    staleTime: 0,
  });
}

export function useCreateHostDir(): UseMutationResult<
  DirectoryListing,
  ApiError,
  CreateDirectoryRequest
> {
  return useMutation({
    mutationFn: (body: CreateDirectoryRequest) =>
      api<DirectoryListing>("/host-fs/dirs", { method: "POST", body }),
  });
}

/** P4 §1: read-only git state for a project's rootDir. */
export function useProjectGitState(id: string): UseQueryResult<ProjectGitState, ApiError> {
  return useQuery({
    queryKey: ["project-git", id],
    queryFn: () => api<ProjectGitState>(`/projects/${id}/git`),
    enabled: Boolean(id),
    refetchInterval: 30_000,
  });
}

/** P4 §7: the client variants forked from this base project. */
export function useProjectVariants(id: string): UseQueryResult<Project[], ApiError> {
  return useQuery({
    queryKey: ["project-variants", id],
    queryFn: () => api<Project[]>(`/projects/${id}/variants`),
    enabled: Boolean(id),
  });
}

export function useCreateVariant(): UseMutationResult<
  Project,
  ApiError,
  { baseId: string; name: string; rootDir: string }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ baseId, name, rootDir }) =>
      api<Project>(`/projects/${baseId}/variants`, { method: "POST", body: { name, rootDir } }),
    onSuccess: (_r, { baseId }) => {
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      void queryClient.invalidateQueries({ queryKey: ["project-variants", baseId] });
    },
  });
}

export function useSyncFromBase(): UseMutationResult<Task, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<Task>(`/projects/${id}/sync-from-base`, { method: "POST", body: {} }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });
}

/** P4 §2 + P5: ONE Reindex action, two passes — notes indexer run + graph index. */
export function useReindexProject(): UseMutationResult<
  { started: boolean; runId: string | null; graph: string },
  ApiError,
  string
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/projects/${id}/reindex`, { method: "POST" }),
    onSuccess: (_res, id) => {
      void queryClient.invalidateQueries({ queryKey: ["runs"] });
      void queryClient.invalidateQueries({ queryKey: ["project-graph", id] });
    },
  });
}

// ── P5 code graph (engine-level in Settings; per-project panel on the project page) ──

export function useGraphEngine(): UseQueryResult<GraphEngineStatus, ApiError> {
  return useQuery({
    queryKey: ["graph-engine"],
    queryFn: () => api<GraphEngineStatus>("/graph/engine"),
  });
}

/** T-a: explicit owner-initiated install (predictable Defender moment, never silent). */
export function useInstallGraphEngine(): UseMutationResult<
  { started: boolean; status: GraphEngineStatus },
  ApiError,
  "std" | "ui" | undefined
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variant) =>
      api("/graph/engine/install", { method: "POST", body: variant ? { variant } : undefined }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["graph-engine"] }),
  });
}

/** Settings → Retry: clears crash-loop breaker latches (audit #40). */
export function useRetryGraphEngine(): UseMutationResult<{ ok: boolean }, ApiError, void> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api("/graph/engine/retry", { method: "POST" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["graph-engine"] }),
  });
}

/** T10: post-install backfill — serialized by the index semaphore, sandboxes excluded. */
export function useIndexAllProjects(): UseMutationResult<
  { queued: number; skipped: number },
  ApiError,
  void
> {
  return useMutation({
    mutationFn: () => api("/graph/index-all", { method: "POST" }),
  });
}

export function useProjectGraph(id: string): UseQueryResult<GraphProjectStatus, ApiError> {
  return useQuery({
    queryKey: ["project-graph", id],
    queryFn: () => api<GraphProjectStatus>(`/projects/${id}/graph`),
    enabled: Boolean(id),
  });
}

// T11 (UC2): viz lifecycle — new tab, on-demand, idle auto-stop.
export interface VizState {
  running: boolean;
  url: string | null;
  startedAt: string | null;
  idleStopMs: number;
}
export function useProjectViz(id: string, enabled: boolean): UseQueryResult<VizState, ApiError> {
  return useQuery({
    queryKey: ["project-viz", id],
    queryFn: () => api<VizState>(`/projects/${id}/graph/viz`),
    enabled: Boolean(id) && enabled,
    refetchInterval: (q) => (q.state.data?.running ? 30_000 : false),
  });
}
export function useLaunchViz(): UseMutationResult<
  { ok: boolean; url?: string; reason?: string; detail?: string | null },
  ApiError,
  string
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/projects/${id}/graph/viz`, { method: "POST" }),
    onSuccess: (_r, id) => void queryClient.invalidateQueries({ queryKey: ["project-viz", id] }),
  });
}
export function useStopViz(): UseMutationResult<void, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/projects/${id}/graph/viz`, { method: "DELETE" }),
    onSuccess: (_r, id) => void queryClient.invalidateQueries({ queryKey: ["project-viz", id] }),
  });
}

/** T9: the success-criterion denominator — graph tools used in N of M runs. */
export function useProjectGraphUsage(
  id: string,
  enabled: boolean,
): UseQueryResult<{ runsWithGraph: number; totalRuns: number }, ApiError> {
  return useQuery({
    queryKey: ["project-graph-usage", id],
    queryFn: () => api<{ runsWithGraph: number; totalRuns: number }>(`/projects/${id}/graph/usage`),
    enabled: Boolean(id) && enabled,
    staleTime: 60_000,
  });
}

// ── Project directives (§2) ──
export function useProjectDirectives(id: string): UseQueryResult<ProjectDirective[], ApiError> {
  return useQuery({
    queryKey: ["project-directives", id],
    queryFn: () => api<ProjectDirective[]>(`/projects/${id}/directives`),
    enabled: Boolean(id),
  });
}

export function useCreateDirective(): UseMutationResult<
  ProjectDirective,
  ApiError,
  { projectId: string; data: ProjectDirectiveCreate }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, data }) =>
      api<ProjectDirective>(`/projects/${projectId}/directives`, { method: "POST", body: data }),
    onSuccess: (_r, { projectId }) =>
      void queryClient.invalidateQueries({ queryKey: ["project-directives", projectId] }),
  });
}

export function useUpdateDirective(): UseMutationResult<
  ProjectDirective,
  ApiError,
  { projectId: string; id: string; data: ProjectDirectiveUpdate }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, id, data }) =>
      api<ProjectDirective>(`/projects/${projectId}/directives/${id}`, { method: "PUT", body: data }),
    onSuccess: (_r, { projectId }) =>
      void queryClient.invalidateQueries({ queryKey: ["project-directives", projectId] }),
  });
}

export function useDeleteDirective(): UseMutationResult<
  void,
  ApiError,
  { projectId: string; id: string }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, id }) =>
      api<void>(`/projects/${projectId}/directives/${id}`, { method: "DELETE" }),
    onSuccess: (_r, { projectId }) =>
      void queryClient.invalidateQueries({ queryKey: ["project-directives", projectId] }),
  });
}

// ── Morning briefing (§5) ──
export interface BriefingState {
  enabled: boolean;
  cronExpr: string | null;
  job: CronJob | null;
}

export function useProjectBriefing(id: string): UseQueryResult<BriefingState, ApiError> {
  return useQuery({
    queryKey: ["project-briefing", id],
    queryFn: () => api<BriefingState>(`/projects/${id}/briefing`),
    enabled: Boolean(id),
  });
}

export function useSetBriefing(): UseMutationResult<
  BriefingState,
  ApiError,
  { projectId: string; enabled: boolean; cronExpr?: string }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, enabled, cronExpr }) =>
      api<BriefingState>(`/projects/${projectId}/briefing`, { method: "PUT", body: { enabled, cronExpr } }),
    onSuccess: (_r, { projectId }) =>
      void queryClient.invalidateQueries({ queryKey: ["project-briefing", projectId] }),
  });
}

// ── Read-only files tree (§4) ──
export interface DirEntry {
  name: string;
  type: "dir" | "file";
  size: number | null;
}
export interface DirListing {
  path: string;
  entries: DirEntry[];
}

export function useProjectFiles(id: string, subpath: string): UseQueryResult<DirListing, ApiError> {
  return useQuery({
    queryKey: ["project-files", id, subpath],
    queryFn: () => api<DirListing>(`/projects/${id}/files${qs({ path: subpath })}`),
    enabled: Boolean(id),
  });
}

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------

// ── Skills ──────────────────────────────────────────────────────────────

export function useSkills(): UseQueryResult<Skill[], ApiError> {
  return useQuery({
    queryKey: ["skills"],
    queryFn: () => api<Skill[]>("/skills"),
  });
}

export function useSkill(id: string): UseQueryResult<SkillDetail, ApiError> {
  return useQuery({
    queryKey: ["skills", id],
    queryFn: () => api<SkillDetail>(`/skills/${id}`),
    enabled: id.length > 0,
  });
}

export function useSkillAssignments(): UseQueryResult<AgentSkillAssignment[], ApiError> {
  return useQuery({
    queryKey: ["skills", "assignments"],
    queryFn: () => api<AgentSkillAssignment[]>("/skills/assignments"),
  });
}

export function useCreateSkill(): UseMutationResult<Skill, ApiError, SkillCreate> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SkillCreate) => api<Skill>("/skills", { method: "POST", body }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["skills"] }),
  });
}

export function useUpdateSkill(): UseMutationResult<
  Skill,
  ApiError,
  { id: string; data: SkillUpdate }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => api<Skill>(`/skills/${id}`, { method: "PUT", body: data }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["skills"] }),
  });
}

export function useDeleteSkill(): UseMutationResult<void, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/skills/${id}`, { method: "DELETE" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["skills"] }),
  });
}

export function useLocalSkills(enabled: boolean): UseQueryResult<LocalSkillSummary[], ApiError> {
  return useQuery({
    queryKey: ["skills", "local"],
    queryFn: () => api<LocalSkillSummary[]>("/skills/local"),
    enabled,
    staleTime: 30_000,
  });
}

export function useImportLocalSkill(): UseMutationResult<
  SkillImportResult,
  ApiError,
  { sourcePath: string; overwrite?: boolean }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body) => api<SkillImportResult>("/skills/import-local", { method: "POST", body }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["skills"] }),
  });
}

export function useImportUrlSkill(): UseMutationResult<
  SkillImportResult,
  ApiError,
  { url: string; overwrite?: boolean }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body) => api<SkillImportResult>("/skills/import-url", { method: "POST", body }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["skills"] }),
  });
}

export function useSetAgentSkills(): UseMutationResult<
  Skill[],
  ApiError,
  { agentId: string; skillIds: string[] }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, skillIds }) =>
      api<Skill[]>(`/agents/${agentId}/skills`, { method: "PUT", body: { skillIds } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["skills"] }),
  });
}

export function useTeams(): UseQueryResult<TeamIndexItem[], ApiError> {
  return useQuery({
    queryKey: ["teams"],
    queryFn: () => api<TeamIndexItem[]>("/teams"),
  });
}

export function useTeam(id: string): UseQueryResult<TeamDetail, ApiError> {
  return useQuery({
    queryKey: ["team", id],
    queryFn: () => api<TeamDetail>(`/teams/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateTeam(): UseMutationResult<Team, ApiError, TeamCreate> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: TeamCreate) => api<Team>("/teams", { method: "POST", body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["teams"] });
    },
  });
}

export function useUpdateTeam(): UseMutationResult<
  Team,
  ApiError,
  { id: string; data: TeamUpdate }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => api<Team>(`/teams/${id}`, { method: "PUT", body: data }),
    onSuccess: (_team, { id }) => {
      void queryClient.invalidateQueries({ queryKey: ["teams"] });
      void queryClient.invalidateQueries({ queryKey: ["team", id] });
    },
  });
}

export function useDeleteTeam(): UseMutationResult<void, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/teams/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["teams"] });
    },
  });
}

export function useAddTeamMember(): UseMutationResult<
  TeamMember,
  ApiError,
  { teamId: string; data: TeamMemberCreate }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ teamId, data }) =>
      api<TeamMember>(`/teams/${teamId}/members`, { method: "POST", body: data }),
    onSuccess: (_member, { teamId }) => {
      void queryClient.invalidateQueries({ queryKey: ["team", teamId] });
      void queryClient.invalidateQueries({ queryKey: ["teams"] });
    },
  });
}

export function useUpdateTeamMember(): UseMutationResult<
  TeamMember,
  ApiError,
  { teamId: string; memberId: string; data: TeamMemberUpdate }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ teamId, memberId, data }) =>
      api<TeamMember>(`/teams/${teamId}/members/${memberId}`, { method: "PUT", body: data }),
    onSuccess: (_member, { teamId }) => {
      void queryClient.invalidateQueries({ queryKey: ["team", teamId] });
    },
  });
}

export function useRemoveTeamMember(): UseMutationResult<
  void,
  ApiError,
  { teamId: string; memberId: string }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ teamId, memberId }) =>
      api<void>(`/teams/${teamId}/members/${memberId}`, { method: "DELETE" }),
    onSuccess: (_void, { teamId }) => {
      void queryClient.invalidateQueries({ queryKey: ["team", teamId] });
      void queryClient.invalidateQueries({ queryKey: ["teams"] });
    },
  });
}

export function useSetTeamProjects(): UseMutationResult<
  void,
  ApiError,
  { teamId: string; projectIds: string[] }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ teamId, projectIds }) =>
      api<void>(`/teams/${teamId}/projects`, { method: "PUT", body: { projectIds } }),
    onSuccess: (_void, { teamId }) => {
      void queryClient.invalidateQueries({ queryKey: ["team", teamId] });
      void queryClient.invalidateQueries({ queryKey: ["teams"] });
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
  teamId?: string;
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
          teamId: filters.teamId,
        })}`,
      ),
  });
}

export interface TaskCreateInput {
  title: string;
  description?: string;
  projectId?: string | null;
  assignedAgentId?: string | null;
  /** P3: two or more agents ⇒ ephemeral team + one child task per agent. */
  assignedAgentIds?: string[];
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
// Attention queue (P1 — the founder's daily surface)
// ---------------------------------------------------------------------------

export type AttentionRowType = "question" | "ready-for-review" | "approval" | "contradiction";

/** EM3: the verbatim agent-authored description is the primary approval content. */
export interface ApprovalDetails {
  targetAgentName: string | null;
  delegatedByAgentName: string | null;
  parentTaskId: string | null;
  parentTaskTitle: string | null;
  effectiveBound: { allowed: string[]; disallowed: string[] } | null;
  verbatimDescription: string;
}

/** P5: a dream-cycle memory contradiction flag (flag-only, P5-Q3). */
export interface ContradictionDetails {
  id: string;
  projectSlug: string | null;
  axis: string;
  severity: string;
  confidence: number;
  noteAId: string;
  noteATitle: string;
  noteBId: string;
  noteBTitle: string;
}

export interface AttentionRow {
  type: AttentionRowType;
  /** Null for non-task rows (P5 contradiction flags). */
  task: Task | null;
  questions: TaskQuestion[];
  approval?: ApprovalDetails;
  contradiction?: ContradictionDetails;
  ageMs: number;
}

/** The Human Attention Required queue. Polls so answered items clear promptly. */
export function useAttentionQueue(): UseQueryResult<AttentionRow[], ApiError> {
  return useQuery({
    queryKey: ["attention-queue"],
    queryFn: () => api<AttentionRow[]>("/tasks/attention/queue"),
    refetchInterval: 5000,
  });
}

export interface AnswerResult {
  applied: boolean;
  reason?: string;
  task: Task | null;
  questions: TaskQuestion[];
}

export interface AnswerInput {
  taskId: string;
  answers: { questionId: string; answer: string }[];
}

/** PATCH /tasks/:id/answer — fold answers into a blocked task and wake it. */
export function useAnswerTask(): UseMutationResult<AnswerResult, ApiError, AnswerInput> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, answers }) =>
      api<AnswerResult>(`/tasks/${taskId}/answer`, { method: "PATCH", body: { answers } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["attention-queue"] });
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      void queryClient.invalidateQueries({ queryKey: ["runs"] });
    },
  });
}

/** POST /tasks/:id/approve — run a parked cross-team spawn (P3). */
export function useApproveTask(): UseMutationResult<Task, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<Task>(`/tasks/${id}/approve`, { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["attention-queue"] });
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      void queryClient.invalidateQueries({ queryKey: ["runs"] });
    },
  });
}

/** POST /tasks/:id/deny — fail a parked cross-team spawn; the lead wakes with the denial (P3). */
export function useDenyTask(): UseMutationResult<Task, ApiError, { id: string; reason?: string }> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }) => api<Task>(`/tasks/${id}/deny`, { method: "POST", body: { reason } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["attention-queue"] });
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
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
// Chat sessions (unified session-chat architecture, intake 0001+0002)
// ---------------------------------------------------------------------------

export function useChatSessions(
  filters: ChatSessionListQuery = {},
): UseQueryResult<ChatSession[], ApiError> {
  return useQuery({
    queryKey: ["chat-sessions", filters],
    queryFn: () =>
      api<ChatSession[]>(
        `/chat/sessions${qs({
          kind: filters.kind,
          projectId: filters.projectId,
          agentId: filters.agentId,
          status: filters.status,
        })}`,
      ),
  });
}

export function useChatSession(id: string | null): UseQueryResult<ChatSessionDetail, ApiError> {
  return useQuery({
    queryKey: ["chat-session", id],
    queryFn: () => api<ChatSessionDetail>(`/chat/sessions/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateChatSession(): UseMutationResult<
  ChatSession,
  ApiError,
  ChatSessionCreate
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ChatSessionCreate) =>
      api<ChatSession>("/chat/sessions", { method: "POST", body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["chat-sessions"] });
    },
  });
}

export function useUpdateChatSession(): UseMutationResult<
  ChatSession,
  ApiError,
  { id: string; data: ChatSessionUpdate }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) =>
      api<ChatSession>(`/chat/sessions/${id}`, { method: "PATCH", body: data }),
    onSuccess: (_session, { id }) => {
      void queryClient.invalidateQueries({ queryKey: ["chat-sessions"] });
      void queryClient.invalidateQueries({ queryKey: ["chat-session", id] });
    },
  });
}

export function usePostChatTurn(): UseMutationResult<
  ChatTurn,
  ApiError,
  { sessionId: string } & ChatTurnRequest
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, ...body }) =>
      api<ChatTurn>(`/chat/sessions/${sessionId}/messages`, { method: "POST", body }),
    onSuccess: (_turn, { sessionId }) => {
      void queryClient.invalidateQueries({ queryKey: ["chat-sessions"] });
      void queryClient.invalidateQueries({ queryKey: ["chat-session", sessionId] });
    },
  });
}

export function useRetryChatTurn(): UseMutationResult<
  ChatTurn,
  ApiError,
  { sessionId: string } & ChatRetryRequest
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, ...body }) =>
      api<ChatTurn>(`/chat/sessions/${sessionId}/retry`, { method: "POST", body }),
    onSuccess: (_turn, { sessionId }) => {
      void queryClient.invalidateQueries({ queryKey: ["chat-sessions"] });
      void queryClient.invalidateQueries({ queryKey: ["chat-session", sessionId] });
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
  /** P5 typed memory facet. */
  type?: MemoryNoteType;
  /** P5: exact source facet ('signal', 'dream', 'user', 'agent:<slug>'). */
  source?: string;
  /** EH6 review queue: only quarantined notes. */
  quarantined?: boolean;
  /** Archived notes are hidden by default. */
  includeArchived?: boolean;
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
          type: filters.type,
          source: filters.source,
          quarantined: filters.quarantined ? "true" : undefined,
          includeArchived: filters.includeArchived ? "true" : undefined,
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
  /** P5 typed memory facet. */
  type?: MemoryNoteType;
  /** P5 synthesis-over-search: also return a cited answer + gaps. */
  synthesize?: boolean;
}

export interface MemorySearchResult {
  hits: MemorySearchHit[];
  /** Null when synthesize was off or the utility model was unavailable. */
  synthesis: MemorySynthesis | null;
}

export function useMemorySearch(): UseMutationResult<
  MemorySearchResult,
  ApiError,
  MemorySearchInput
> {
  return useMutation({
    mutationFn: (body: MemorySearchInput) =>
      api<MemorySearchResult>("/memory/search", { method: "POST", body }),
  });
}

/** P5 wikilinks: a note's outgoing links + backlinks. */
export interface NoteLinks {
  outgoing: Array<MemoryLink & { toTitle: string | null; toPath: string | null }>;
  backlinks: Array<{ fromNoteId: string; fromTitle: string; fromPath: string }>;
}

export function useNoteLinks(id: string): UseQueryResult<NoteLinks, ApiError> {
  return useQuery({
    queryKey: ["note-links", id],
    queryFn: () => api<NoteLinks>(`/memory/notes/${id}/links`),
    enabled: Boolean(id),
  });
}

/** EH6: approve a quarantined signal note — it becomes injectable. */
export function useApproveNote(): UseMutationResult<MemoryNote, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<MemoryNote>(`/memory/notes/${id}/approve`, { method: "POST" }),
    onSuccess: (_note, id) => {
      void queryClient.invalidateQueries({ queryKey: ["memory-notes"] });
      void queryClient.invalidateQueries({ queryKey: ["note-raw", id] });
    },
  });
}

/** P5 soft-archive: hide from retrieval, never delete. */
export function useArchiveNote(): UseMutationResult<MemoryNote, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<MemoryNote>(`/memory/notes/${id}/archive`, { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["memory-notes"] });
    },
  });
}

/** P5 signal-noise broom: bulk-delete machine-written notes by source. */
export function useBulkDeleteNotes(): UseMutationResult<
  { deleted: number },
  ApiError,
  { source: string; projectSlug?: string; quarantinedOnly?: boolean }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body) => api<{ deleted: number }>("/memory/notes/bulk-delete", { method: "POST", body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["memory-notes"] });
    },
  });
}

/** P5-Q3: dismiss a contradiction flag (resolution is the owner's note-edit). */
export function useResolveContradiction(): UseMutationResult<
  unknown,
  ApiError,
  { id: string; resolution?: string }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, resolution }) =>
      api<unknown>(`/memory/contradictions/${id}/resolve`, { method: "POST", body: { resolution } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["attention-queue"] });
    },
  });
}

// ── P5 dream cycle (per-project, briefing idiom) ──

export interface DreamState {
  enabled: boolean;
  cronExpr: string | null;
  job: CronJob | null;
}

export function useProjectDream(projectId: string): UseQueryResult<DreamState, ApiError> {
  return useQuery({
    queryKey: ["project-dream", projectId],
    queryFn: () => api<DreamState>(`/projects/${projectId}/dream`),
    enabled: Boolean(projectId),
  });
}

export function useSetProjectDream(): UseMutationResult<
  DreamState,
  ApiError,
  { projectId: string; enabled: boolean; cronExpr?: string }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, ...body }) =>
      api<DreamState>(`/projects/${projectId}/dream`, { method: "PUT", body }),
    onSuccess: (_state, { projectId }) => {
      void queryClient.invalidateQueries({ queryKey: ["project-dream", projectId] });
    },
  });
}

export function useRunDreamNow(): UseMutationResult<{ fired: boolean }, ApiError, string> {
  return useMutation({
    mutationFn: (projectId: string) =>
      api<{ fired: boolean }>(`/projects/${projectId}/dream/run`, { method: "POST" }),
  });
}

// ---------------------------------------------------------------------------
// Pipelines
// ---------------------------------------------------------------------------

export function usePipelines(teamId?: string): UseQueryResult<Pipeline[], ApiError> {
  return useQuery({ queryKey: ["pipelines", teamId], queryFn: () => api<Pipeline[]>(`/pipelines${qs({ teamId })}`) });
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

export function useCronJobs(teamId?: string): UseQueryResult<CronJob[], ApiError> {
  return useQuery({ queryKey: ["cron-jobs", teamId], queryFn: () => api<CronJob[]>(`/cron-jobs${qs({ teamId })}`) });
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

/** Rule 23 — the "is my factory armed?" self-check. Polls so the readout stays live. */
export function useFactoryHealth(): UseQueryResult<FactoryHealth, ApiError> {
  return useQuery({
    queryKey: ["factory-health"],
    queryFn: () => api<FactoryHealth>("/system/factory-health"),
    refetchInterval: 30_000,
  });
}

// ---------------------------------------------------------------------------
// Git automation (P7 — PAT secret, PR queue, push/PR)
// ---------------------------------------------------------------------------

/** EC2: presence + masked hint for the GitHub PAT — never the raw token. */
export function useGithubPat(): UseQueryResult<SecretMeta, ApiError> {
  return useQuery({
    queryKey: ["github-pat"],
    queryFn: () => api<SecretMeta>("/system/secrets/github-pat"),
  });
}

export function useSetGithubPat(): UseMutationResult<SecretMeta, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (token: string) =>
      api<SecretMeta>("/system/secrets/github-pat", { method: "PUT", body: { token } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["github-pat"] });
      void queryClient.invalidateQueries({ queryKey: ["factory-health"] });
      void queryClient.invalidateQueries({ queryKey: ["pr-queue"] });
    },
  });
}

export function useClearGithubPat(): UseMutationResult<void, ApiError, void> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>("/system/secrets/github-pat", { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["github-pat"] });
      void queryClient.invalidateQueries({ queryKey: ["factory-health"] });
      void queryClient.invalidateQueries({ queryKey: ["pr-queue"] });
    },
  });
}

/** P7 §6 — the Dashboard aggregate PR queue (all GitHub-remote projects, cached 60s core-side). */
export function usePrQueue(): UseQueryResult<PrQueue, ApiError> {
  return useQuery({
    queryKey: ["pr-queue"],
    queryFn: () => api<PrQueue>("/git/pull-requests"),
    refetchInterval: 60_000,
  });
}

/** Per-project PR list (the filtered view on project detail). */
export function useProjectPrs(id: string): UseQueryResult<ProjectPrGroup, ApiError> {
  return useQuery({
    queryKey: ["project-prs", id],
    queryFn: () => api<ProjectPrGroup>(`/projects/${id}/pull-requests`),
    enabled: Boolean(id),
    refetchInterval: 60_000,
  });
}

/** Push an agent/* branch (core-enforced: protected refs refused). */
export function usePushBranch(): UseMutationResult<
  { pushed: boolean; branch: string },
  ApiError,
  { projectId: string; branch: string; remote?: string }
> {
  return useMutation({
    mutationFn: ({ projectId, branch, remote }) =>
      api<{ pushed: boolean; branch: string }>(`/projects/${projectId}/git/push`, {
        method: "POST",
        body: { branch, remote },
      }),
  });
}

/** Open a PR from an agent branch — graduates the manual compare-URL step. */
export function useOpenPr(): UseMutationResult<
  PullRequestSummary,
  ApiError,
  { projectId: string } & OpenPrRequest
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, ...body }) =>
      api<PullRequestSummary>(`/projects/${projectId}/git/pr`, { method: "POST", body }),
    onSuccess: (_pr, { projectId }) => {
      void queryClient.invalidateQueries({ queryKey: ["pr-queue"] });
      void queryClient.invalidateQueries({ queryKey: ["project-prs", projectId] });
    },
  });
}

// ---------------------------------------------------------------------------
// Providers (P8 — CLI + direct-API runtimes, key vault, live model discovery)
// ---------------------------------------------------------------------------

export function useProviders(): UseQueryResult<ProviderInfo[], ApiError> {
  return useQuery({
    queryKey: ["providers"],
    queryFn: () => api<ProviderInfo[]>("/providers"),
  });
}

/** Live model discovery for a direct-API provider (degrades to the static list). */
export function useDiscoverModels(): UseMutationResult<DiscoverModelsResult, ApiError, ProviderId> {
  return useMutation({
    mutationFn: (provider: ProviderId) =>
      api<DiscoverModelsResult>("/providers/discover-models", { method: "POST", body: { provider } }),
  });
}

export function useProviderKey(providerId: string, enabled: boolean): UseQueryResult<SecretMeta, ApiError> {
  return useQuery({
    queryKey: ["provider-key", providerId],
    queryFn: () => api<SecretMeta>(`/providers/${providerId}/key`),
    enabled,
  });
}

export function useSetProviderKey(): UseMutationResult<
  SecretMeta,
  ApiError,
  { providerId: string; key: string }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ providerId, key }) =>
      api<SecretMeta>(`/providers/${providerId}/key`, { method: "PUT", body: { key } }),
    onSuccess: (_m, { providerId }) => {
      void queryClient.invalidateQueries({ queryKey: ["provider-key", providerId] });
      void queryClient.invalidateQueries({ queryKey: ["providers"] });
      void queryClient.invalidateQueries({ queryKey: ["factory-health"] });
    },
  });
}

export function useClearProviderKey(): UseMutationResult<void, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (providerId: string) => api<void>(`/providers/${providerId}/key`, { method: "DELETE" }),
    onSuccess: (_v, providerId) => {
      void queryClient.invalidateQueries({ queryKey: ["provider-key", providerId] });
      void queryClient.invalidateQueries({ queryKey: ["providers"] });
      void queryClient.invalidateQueries({ queryKey: ["factory-health"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Goals (P6 — the goal engine; detail = graph of the CURRENT plan version)
// ---------------------------------------------------------------------------

export function useGoals(filter: { projectId?: string; status?: string } = {}): UseQueryResult<Goal[], ApiError> {
  return useQuery({
    queryKey: ["goals", filter.projectId ?? "", filter.status ?? ""],
    queryFn: () => api<Goal[]>(`/goals${qs(filter)}`),
  });
}

export function useGoalDetail(id: string): UseQueryResult<GoalDetail, ApiError> {
  return useQuery({
    queryKey: ["goal", id],
    queryFn: () => api<GoalDetail>(`/goals/${id}`),
    enabled: id.length > 0,
  });
}

export function useCreateGoal(): UseMutationResult<Goal, ApiError, GoalCreate> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: GoalCreate) => api<Goal>("/goals", { method: "POST", body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["goals"] });
      void queryClient.invalidateQueries({ queryKey: ["runs"] });
    },
  });
}

function useGoalAction(action: "pause" | "resume" | "cancel" | "replan") {
  const queryClient = useQueryClient();
  return useMutation<Goal, ApiError, { id: string; reason?: string | null }>({
    mutationFn: ({ id, reason }) =>
      api<Goal>(`/goals/${id}/${action}`, {
        method: "POST",
        body: action === "replan" ? { reason: reason ?? null } : undefined,
      }),
    onSuccess: (_g, { id }) => {
      void queryClient.invalidateQueries({ queryKey: ["goals"] });
      void queryClient.invalidateQueries({ queryKey: ["goal", id] });
    },
  });
}

export const usePauseGoal = () => useGoalAction("pause");
export const useResumeGoal = () => useGoalAction("resume");
export const useCancelGoal = () => useGoalAction("cancel");
export const useReplanGoal = () => useGoalAction("replan");

function useNodeAction(action: "retry" | "cancel") {
  const queryClient = useQueryClient();
  return useMutation<Goal, ApiError, { goalId: string; nodeId: string }>({
    mutationFn: ({ goalId, nodeId }) =>
      api<Goal>(`/goals/${goalId}/nodes/${nodeId}/${action}`, { method: "POST" }),
    onSuccess: (_g, { goalId }) => {
      void queryClient.invalidateQueries({ queryKey: ["goals"] });
      void queryClient.invalidateQueries({ queryKey: ["goal", goalId] });
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

export const useRetryNode = () => useNodeAction("retry");
export const useCancelNode = () => useNodeAction("cancel");

export function useDeleteGoal(): UseMutationResult<void, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/goals/${id}`, { method: "DELETE" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["goals"] }),
  });
}

// ---------------------------------------------------------------------------
// Skill imports (P9 — external agent/skill ingestion + quarantine)
// ---------------------------------------------------------------------------

export function useSkillImports(): UseQueryResult<SkillImport[], ApiError> {
  return useQuery({
    queryKey: ["skill-imports"],
    queryFn: () => api<SkillImport[]>("/agents/imports"),
    refetchInterval: 5000,
  });
}

export interface SkillImportDetail {
  import: SkillImport;
  drafts: Agent[];
}

export function useSkillImportDetail(id: string): UseQueryResult<SkillImportDetail, ApiError> {
  return useQuery({
    queryKey: ["skill-import", id],
    queryFn: () => api<SkillImportDetail>(`/agents/imports/${id}`),
    enabled: Boolean(id),
    // Poll while the clone → extract → review pipeline is still running.
    refetchInterval: (q) => {
      const status = q.state.data?.import.status;
      return status && status !== "ready" && status !== "failed" ? 2000 : false;
    },
  });
}

export function useStartSkillImport(): UseMutationResult<SkillImport, ApiError, SkillImportCreate> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SkillImportCreate) =>
      api<SkillImport>("/agents/imports", { method: "POST", body }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["skill-imports"] }),
  });
}

/** Promote a quarantined draft to an active agent (tools re-clamped server-side). */
export function usePromoteAgent(): UseMutationResult<
  Agent,
  ApiError,
  { id: string; data: PromoteAgent }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => api<Agent>(`/agents/${id}/promote`, { method: "POST", body: data }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["skill-imports"] });
      void queryClient.invalidateQueries({ queryKey: ["skill-import"] });
      void queryClient.invalidateQueries({ queryKey: ["agents"] });
    },
  });
}

export function useDiscardAgent(): UseMutationResult<Agent, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<Agent>(`/agents/${id}/discard`, { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["skill-imports"] });
      void queryClient.invalidateQueries({ queryKey: ["skill-import"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Team Manager Advisor (P10)
// ---------------------------------------------------------------------------

export function useTeamManagerChat(teamId: string): UseMutationResult<
  PipelineDraftTurn | { reply: string },
  ApiError,
  TeamManagerChatRequest
> {
  return useMutation({
    mutationFn: (body: TeamManagerChatRequest) =>
      api<PipelineDraftTurn | { reply: string }>(`/teams/${teamId}/manager/chat`, { method: "POST", body }),
  });
}
