import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, openDb } from "../db/connection.js";
import { cronJobs, projects } from "../db/schema.js";
import { ensureSystemAgents, getSystemAgentId, PROJECT_REPORTER_SLUG } from "../agents/system-agents.js";
import { deleteCronJobsForProject, stopScheduler } from "../scheduler/service.js";
import { DEFAULT_BRIEFING_CRON, getProjectBriefing, setProjectBriefing } from "./briefing.js";

const ts = "2026-01-01T00:00:00Z";

describe("morning briefing (P4 §5, opt-in)", () => {
  let db: ReturnType<typeof openDb>["db"];

  beforeEach(() => {
    closeDb();
    db = openDb(":memory:").db;
    ensureSystemAgents();
    db.insert(projects).values({ id: "prj_1", name: "App", slug: "app", createdAt: ts, updatedAt: ts }).run();
  });
  afterEach(() => {
    stopScheduler(); // clear any croner handles created by scheduleJob
    closeDb();
  });

  it("no briefing exists until opted in", () => {
    expect(getProjectBriefing("prj_1")).toBeNull();
  });

  it("enabling creates a project-scoped cron targeting the Reporter, default 8am", () => {
    const job = setProjectBriefing("prj_1", { enabled: true });
    expect(job).not.toBeNull();
    expect(job!.enabled).toBe(true);
    expect(job!.targetType).toBe("agent");
    expect(job!.targetId).toBe(getSystemAgentId(PROJECT_REPORTER_SLUG));
    expect(job!.projectId).toBe("prj_1");
    expect(job!.cronExpr).toBe(DEFAULT_BRIEFING_CRON);
    expect(getProjectBriefing("prj_1")!.id).toBe(job!.id);
  });

  it("is idempotent — toggling reuses the one row, never duplicates", () => {
    const a = setProjectBriefing("prj_1", { enabled: true });
    const b = setProjectBriefing("prj_1", { enabled: false });
    const c = setProjectBriefing("prj_1", { enabled: true, cronExpr: "30 6 * * *" });
    expect(b!.id).toBe(a!.id);
    expect(c!.id).toBe(a!.id);
    expect(b!.enabled).toBe(false);
    expect(c!.enabled).toBe(true);
    expect(c!.cronExpr).toBe("30 6 * * *"); // reschedule preserved
    expect(db.select().from(cronJobs).where(eq(cronJobs.projectId, "prj_1")).all()).toHaveLength(1);
  });

  it("disabling when none exists is a no-op (null)", () => {
    expect(setProjectBriefing("prj_1", { enabled: false })).toBeNull();
  });

  it("deleteCronJobsForProject removes the briefing (project-delete cleanup)", () => {
    setProjectBriefing("prj_1", { enabled: true });
    expect(deleteCronJobsForProject("prj_1")).toBe(1);
    expect(getProjectBriefing("prj_1")).toBeNull();
  });
});
