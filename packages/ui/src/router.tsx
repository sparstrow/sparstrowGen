import {
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { DashboardPage } from "@/routes/pages/dashboard";
import { AgentsPage } from "@/routes/pages/agents";
import { ImportsPage } from "@/routes/pages/imports";
import { TeamsPage } from "@/routes/pages/teams";
import { TeamDetailPage } from "@/routes/pages/team-detail";
import { ProjectsPage } from "@/routes/pages/projects";
import { ProjectWorkspacePage } from "@/routes/pages/project-detail";
import { RunsPage } from "@/routes/pages/runs";
import { RunDetailPage } from "@/routes/pages/run-detail";
import { MemoryPage } from "@/routes/pages/memory";
import { SettingsPage } from "@/routes/pages/settings";
import { TasksPage } from "@/routes/pages/tasks";
import { GoalDetailPage } from "@/routes/pages/goal-detail";
import { MessagesPage } from "@/routes/pages/messages";
import { ChatPage } from "@/routes/pages/chat";
import { AgentCreatePage } from "@/routes/pages/agent-create";
import { PipelinesPage } from "@/routes/pages/pipelines";
import { KnowledgePage } from "@/routes/pages/knowledge";
import { KnowledgeArticlePage } from "@/routes/pages/knowledge-article";
import { SchedulePage } from "@/routes/pages/schedule";
import { TerminalsPage } from "@/routes/pages/terminals";

const rootRoute = createRootRoute({ component: AppShell });

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: DashboardPage,
});

const agentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/agents",
  component: AgentsPage,
});

// Intake 0001: the Agent Creator interview as a dedicated full page (session-backed).
const agentCreateRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/agents/create",
  component: AgentCreatePage,
});

// P9: external agent/skill ingestion + quarantine review.
const importsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/imports",
  component: ImportsPage,
});

const teamsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/teams",
  component: TeamsPage,
});

const teamDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/teams/$teamId",
  component: TeamDetailPage,
});

const projectsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects",
  component: ProjectsPage,
});

const projectDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects/$projectId",
  component: ProjectWorkspacePage,
});

const runsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/runs",
  component: RunsPage,
});

const runDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/runs/$runId",
  component: RunDetailPage,
});

const memoryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/memory",
  component: MemoryPage,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsPage,
});

const tasksRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tasks",
  component: TasksPage,
});

// P6-Q1: goal detail lives under the /tasks surface.
const goalDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tasks/goals/$goalId",
  component: GoalDetailPage,
});

const messagesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/messages",
  component: MessagesPage,
});

// Intake 0002: session-based chat surface (free / project / agent contexts).
// The active session lives in the URL (?session=id) so conversations are linkable.
const chatRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/chat",
  component: ChatPage,
  validateSearch: (search: Record<string, unknown>): { session?: string } =>
    typeof search.session === "string" && search.session
      ? { session: search.session }
      : {},
});

const pipelinesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/pipelines",
  component: PipelinesPage,
});

const scheduleRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/schedule",
  component: SchedulePage,
});

// Intake 0003: in-app tutorial — content bundled from src/content/knowledge/.
const knowledgeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/knowledge",
  component: KnowledgePage,
});

const knowledgeArticleRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/knowledge/$articleId",
  component: KnowledgeArticlePage,
});

const terminalsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/terminals",
  component: TerminalsPage,
});

const routeTree = rootRoute.addChildren([
  dashboardRoute,
  agentsRoute,
  agentCreateRoute,
  chatRoute,
  importsRoute,
  teamsRoute,
  teamDetailRoute,
  projectsRoute,
  projectDetailRoute,
  runsRoute,
  runDetailRoute,
  memoryRoute,
  settingsRoute,
  tasksRoute,
  goalDetailRoute,
  messagesRoute,
  pipelinesRoute,
  scheduleRoute,
  knowledgeRoute,
  knowledgeArticleRoute,
  terminalsRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
