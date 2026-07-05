import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  projectCreateSchema,
  projectUpdateSchema,
  slugify,
  type Project,
} from "@sparstrow/shared";
import { getDb } from "../../db/connection.js";
import { projects } from "../../db/schema.js";
import { HttpError } from "../../orchestrator/run-manager.js";
import { getProjectGitState } from "../../projects/git-status.js";

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
}
