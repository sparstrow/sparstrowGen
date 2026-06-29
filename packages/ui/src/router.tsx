import {
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { DashboardPage } from "@/routes/pages/dashboard";
import { AgentsPage } from "@/routes/pages/agents";
import { TeamsPage } from "@/routes/pages/teams";
import { TeamDetailPage } from "@/routes/pages/team-detail";
import { ProjectsPage } from "@/routes/pages/projects";
import { RunsPage } from "@/routes/pages/runs";
import { RunDetailPage } from "@/routes/pages/run-detail";
import { MemoryPage } from "@/routes/pages/memory";
import { SettingsPage } from "@/routes/pages/settings";
import { TasksPage } from "@/routes/pages/tasks";
import { MessagesPage } from "@/routes/pages/messages";
import { PipelinesPage } from "@/routes/pages/pipelines";
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

const messagesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/messages",
  component: MessagesPage,
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

const terminalsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/terminals",
  component: TerminalsPage,
});

const routeTree = rootRoute.addChildren([
  dashboardRoute,
  agentsRoute,
  teamsRoute,
  teamDetailRoute,
  projectsRoute,
  runsRoute,
  runDetailRoute,
  memoryRoute,
  settingsRoute,
  tasksRoute,
  messagesRoute,
  pipelinesRoute,
  scheduleRoute,
  terminalsRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
