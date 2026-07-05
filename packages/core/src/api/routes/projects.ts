import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import {
  projectCreateSchema,
  projectDirectiveCreateSchema,
  projectDirectiveUpdateSchema,
  projectProvisionSchema,
  projectUpdateSchema,
  slugify,
  type Project,
} from "@sparstrow/shared";
import { getDb } from "../../db/connection.js";
import { projects } from "../../db/schema.js";
import { HttpError } from "../../orchestrator/run-manager.js";
import { getProjectGitState } from "../../projects/git-status.js";
import {
  createDirective,
  deleteDirective,
  listDirectives,
  updateDirective,
} from "../../projects/directives.js";
import { provisionProject, runProjectIndex } from "../../projects/provision.js";
import { createClientVariant, syncFromBase } from "../../projects/variants.js";

const nowIso = () => new Date().toISOString();

function rowToProject(row: typeof projects.$inferSelect): Project {
  return { ...row } as unknown as Project;
}

export async function projectRoutes(app: FastifyInstance): Promise<void> {
  app.get("/projects", async () => {
    return getDb().select().from(projects).orderBy(projects.name).all().map(rowToProject);
  });

  app.post("/projects", async (request, reply) => {
    const body = projectCreateSchema.parse(request.body);
    const id = `prj_${nanoid(10)}`;
    const ts = nowIso();
    const slug = body.slug ?? slugify(body.name);
    if (!slug) throw new HttpError(400, "project name must contain at least one alphanumeric character");
    getDb()
      .insert(projects)
      .values({ ...body, id, slug, createdAt: ts, updatedAt: ts })
      .run();
    reply.code(201);
    return rowToProject(getDb().select().from(projects).where(eq(projects.id, id)).get()!);
  });

  /**
   * P4 §4 provisioning modal: create a project via scratch (mkdir + optional git
   * init), bind (existing folder), or clone (public git URL). Performs the
   * filesystem action, inserts the row, and kicks off a best-effort auto-index.
   */
  app.post("/projects/provision", async (request, reply) => {
    const body = projectProvisionSchema.parse(request.body);
    const project = await provisionProject(body);
    reply.code(201);
    return project;
  });

  app.get("/projects/:id", async (request) => {
    const { id } = request.params as { id: string };
    const row = getDb().select().from(projects).where(eq(projects.id, id)).get();
    if (!row) throw new HttpError(404, `project not found: ${id}`);
    return rowToProject(row);
  });

  /** P4 §1: read-only git state for the project's rootDir (branch/dirty/commits). */
  app.get("/projects/:id/git", async (request) => {
    const { id } = request.params as { id: string };
    const row = getDb().select().from(projects).where(eq(projects.id, id)).get();
    if (!row) throw new HttpError(404, `project not found: ${id}`);
    return getProjectGitState(row.rootDir);
  });

  /** P4 §2: re-run the auto-index over the project's rootDir (background, debounced). */
  app.post("/projects/:id/reindex", async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = getDb().select().from(projects).where(eq(projects.id, id)).get();
    if (!row) throw new HttpError(404, `project not found: ${id}`);
    const run = runProjectIndex(id);
    reply.code(202);
    return { started: run !== null, runId: run?.id ?? null };
  });

  /** P4 §7: fork a client variant — clone the base repo + copy its project notes. */
  app.post("/projects/:id/variants", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = z
      .object({ name: z.string().min(1).max(80), rootDir: z.string().min(1) })
      .parse(request.body);
    const variant = await createClientVariant(id, body);
    reply.code(201);
    return variant;
  });

  /** P4 §7: task-based downstream sync — never auto-merges. */
  app.post("/projects/:id/sync-from-base", async (request) => {
    const { id } = request.params as { id: string };
    const body = z.object({ assignedAgentId: z.string().nullable().optional() }).parse(request.body ?? {});
    return syncFromBase(id, { assignedAgentId: body.assignedAgentId ?? null });
  });

  /** P4 §7: the client variants of a base project (for the nested Variants tab). */
  app.get("/projects/:id/variants", async (request) => {
    const { id } = request.params as { id: string };
    return getDb()
      .select()
      .from(projects)
      .where(eq(projects.parentProjectId, id))
      .orderBy(projects.name)
      .all()
      .map(rowToProject);
  });

  app.put("/projects/:id", async (request) => {
    const { id } = request.params as { id: string };
    const body = projectUpdateSchema.parse(request.body);
    const db = getDb();
    const existing = db.select().from(projects).where(eq(projects.id, id)).get();
    if (!existing) throw new HttpError(404, `project not found: ${id}`);
    db.update(projects)
      .set({ ...body, updatedAt: nowIso() })
      .where(eq(projects.id, id))
      .run();
    return rowToProject(db.select().from(projects).where(eq(projects.id, id)).get()!);
  });

  app.delete("/projects/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = getDb().select().from(projects).where(eq(projects.id, id)).get();
    if (!existing) throw new HttpError(404, `project not found: ${id}`);
    getDb().delete(projects).where(eq(projects.id, id)).run();
    reply.code(204);
  });

  // ── Project directives (§2/P4-Q2): ordered, toggleable, guaranteed-injected ──
  const requireProject = (id: string) => {
    const row = getDb().select().from(projects).where(eq(projects.id, id)).get();
    if (!row) throw new HttpError(404, `project not found: ${id}`);
    return row;
  };

  app.get("/projects/:id/directives", async (request) => {
    const { id } = request.params as { id: string };
    requireProject(id);
    return listDirectives(id);
  });

  app.post("/projects/:id/directives", async (request, reply) => {
    const { id } = request.params as { id: string };
    requireProject(id);
    const body = projectDirectiveCreateSchema.parse(request.body);
    reply.code(201);
    return createDirective(id, body);
  });

  app.put("/projects/:id/directives/:directiveId", async (request) => {
    const { id, directiveId } = request.params as { id: string; directiveId: string };
    requireProject(id);
    const body = projectDirectiveUpdateSchema.parse(request.body);
    const updated = updateDirective(id, directiveId, body);
    if (!updated) throw new HttpError(404, `directive not found: ${directiveId}`);
    return updated;
  });

  app.delete("/projects/:id/directives/:directiveId", async (request, reply) => {
    const { id, directiveId } = request.params as { id: string; directiveId: string };
    requireProject(id);
    if (!deleteDirective(id, directiveId)) throw new HttpError(404, `directive not found: ${directiveId}`);
    reply.code(204);
  });
}
