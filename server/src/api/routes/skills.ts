import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  setAgentSkillsSchema,
  skillCreateSchema,
  skillUpdateSchema,
  type Skill,
  type SkillDetail,
} from "@sparstrow/shared";
import { z } from "zod";
import { getDb } from "../../db/connection.js";
import { agents, agentSkills, skillFiles, skills } from "../../db/schema.js";
import { HttpError } from "../../orchestrator/run-manager.js";
import {
  listSkillsForAgent,
  materializeSkillFiles,
  removeSkillFilesDir,
  rowToSkill,
  setSkillsForAgent,
  skillFileCounts,
} from "../../agents/agent-skills.js";
import {
  discoverLocalSkills,
  fetchSkillFromUrl,
  readLocalSkillBundle,
} from "../../agents/local-skills.js";

const nowIso = () => new Date().toISOString();

/** Origin metadata + supporting files an import carries beyond the SKILL.md body. */
interface ImportedSkill {
  name: string;
  description: string;
  content: string;
  sourceType: Skill["sourceType"];
  sourceRef: string | null;
  sourceProvider: string | null;
  files: { path: string; content: string }[];
}

function requireAgent(id: string): void {
  const row = getDb().select({ id: agents.id }).from(agents).where(eq(agents.id, id)).get();
  if (!row) throw new HttpError(404, `agent not found: ${id}`);
}

/** Replace a skill's supporting-file rows, then project the bundle to disk. */
function writeSkillFiles(skillId: string, files: { path: string; content: string }[]): void {
  const db = getDb();
  db.delete(skillFiles).where(eq(skillFiles.skillId, skillId)).run();
  for (const f of files) {
    db.insert(skillFiles).values({ skillId, path: f.path, content: f.content }).run();
  }
  materializeSkillFiles(skillId);
}

export async function skillRoutes(app: FastifyInstance): Promise<void> {
  app.get("/skills", async () => {
    const counts = skillFileCounts();
    return getDb()
      .select()
      .from(skills)
      .orderBy(skills.name)
      .all()
      .map((row) => rowToSkill(row, counts.get(row.id) ?? 0));
  });

  /** Every agent↔skill pair — lets list surfaces show chips without N+1 calls. */
  app.get("/skills/assignments", async () => {
    return getDb().select().from(agentSkills).all();
  });

  app.post("/skills", async (request, reply) => {
    const body = skillCreateSchema.parse(request.body);
    const id = `skl_${nanoid(10)}`;
    const ts = nowIso();
    const db = getDb();
    const duplicate = db.select({ id: skills.id }).from(skills).where(eq(skills.name, body.name)).get();
    if (duplicate) throw new HttpError(409, `a skill named "${body.name}" already exists`);
    db.insert(skills).values({ ...body, id, createdAt: ts, updatedAt: ts }).run();
    materializeSkillFiles(id);
    reply.code(201);
    return rowToSkill(db.select().from(skills).where(eq(skills.id, id)).get()!);
  });

  /** The skill plus its full supporting-file bundle (Multica's detail page). */
  app.get("/skills/:id", async (request): Promise<SkillDetail> => {
    const { id } = request.params as { id: string };
    const db = getDb();
    const row = db.select().from(skills).where(eq(skills.id, id)).get();
    if (!row) throw new HttpError(404, `skill not found: ${id}`);
    const files = db
      .select({ path: skillFiles.path, content: skillFiles.content })
      .from(skillFiles)
      .where(eq(skillFiles.skillId, id))
      .all()
      .sort((a, b) => a.path.localeCompare(b.path));
    return { ...rowToSkill(row, files.length), files };
  });

  app.put("/skills/:id", async (request) => {
    const { id } = request.params as { id: string };
    const body = skillUpdateSchema.parse(request.body);
    const db = getDb();
    const existing = db.select().from(skills).where(eq(skills.id, id)).get();
    if (!existing) throw new HttpError(404, `skill not found: ${id}`);
    if (body.name && body.name !== existing.name) {
      const duplicate = db.select({ id: skills.id }).from(skills).where(eq(skills.name, body.name)).get();
      if (duplicate) throw new HttpError(409, `a skill named "${body.name}" already exists`);
    }
    db.update(skills).set({ ...body, updatedAt: nowIso() }).where(eq(skills.id, id)).run();
    if (body.content !== undefined) materializeSkillFiles(id);
    const counts = skillFileCounts();
    return rowToSkill(db.select().from(skills).where(eq(skills.id, id)).get()!, counts.get(id) ?? 0);
  });

  app.delete("/skills/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = getDb().select({ id: skills.id }).from(skills).where(eq(skills.id, id)).get();
    if (!existing) throw new HttpError(404, `skill not found: ${id}`);
    getDb().delete(skills).where(eq(skills.id, id)).run();
    removeSkillFilesDir(id);
    reply.code(204);
  });

  // ── Runtime + URL import (the Multica three-path "New skill" flow) ──────

  /** Skills already installed on this machine's CLI runtimes. */
  app.get("/skills/local", async () => discoverLocalSkills());

  /**
   * Create-or-overwrite a workspace skill from imported content. A name
   * collision without `overwrite` is a 409 carrying the conflicting skill —
   * the UI turns that into an explicit overwrite prompt (Multica's flow).
   */
  const upsertImported = (
    imported: ImportedSkill,
    overwrite: boolean,
  ): { action: "created" | "updated"; skill: Skill } => {
    const db = getDb();
    const existing = db.select().from(skills).where(eq(skills.name, imported.name)).get();
    const ts = nowIso();
    const origin = {
      sourceType: imported.sourceType,
      sourceRef: imported.sourceRef,
      sourceProvider: imported.sourceProvider,
    };
    if (existing) {
      if (!overwrite) {
        throw new HttpError(
          409,
          `a skill named "${imported.name}" already exists — import again with overwrite to replace it`,
        );
      }
      db.update(skills)
        .set({ description: imported.description, content: imported.content, ...origin, updatedAt: ts })
        .where(eq(skills.id, existing.id))
        .run();
      writeSkillFiles(existing.id, imported.files);
      return {
        action: "updated",
        skill: rowToSkill(
          db.select().from(skills).where(eq(skills.id, existing.id)).get()!,
          imported.files.length,
        ),
      };
    }
    const id = `skl_${nanoid(10)}`;
    db.insert(skills)
      .values({
        id,
        name: imported.name,
        description: imported.description,
        content: imported.content,
        enabled: true,
        ...origin,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    writeSkillFiles(id, imported.files);
    return {
      action: "created",
      skill: rowToSkill(db.select().from(skills).where(eq(skills.id, id)).get()!, imported.files.length),
    };
  };

  app.post("/skills/import-local", async (request, reply) => {
    const body = z
      .object({ sourcePath: z.string().min(1), overwrite: z.boolean().default(false) })
      .parse(request.body);
    let bundle;
    try {
      bundle = readLocalSkillBundle(body.sourcePath);
    } catch (err) {
      throw new HttpError(400, err instanceof Error ? err.message : String(err));
    }
    const provider = discoverLocalSkills().find((s) => s.sourcePath === body.sourcePath)?.provider ?? null;
    const result = upsertImported(
      {
        name: bundle.name,
        description: bundle.description,
        content: bundle.content,
        sourceType: "runtime",
        sourceRef: body.sourcePath,
        sourceProvider: provider,
        files: bundle.files,
      },
      body.overwrite,
    );
    reply.code(result.action === "created" ? 201 : 200);
    return result;
  });

  app.post("/skills/import-url", async (request, reply) => {
    const body = z
      .object({ url: z.string().min(1), overwrite: z.boolean().default(false) })
      .parse(request.body);
    let imported;
    try {
      imported = await fetchSkillFromUrl(body.url);
    } catch (err) {
      throw new HttpError(400, err instanceof Error ? err.message : String(err));
    }
    const result = upsertImported(
      {
        name: imported.name,
        description: imported.description,
        content: imported.content,
        sourceType: "url",
        sourceRef: imported.sourceUrl,
        sourceProvider: null,
        files: [],
      },
      body.overwrite,
    );
    reply.code(result.action === "created" ? 201 : 200);
    return result;
  });

  app.get("/agents/:id/skills", async (request) => {
    const { id } = request.params as { id: string };
    requireAgent(id);
    return listSkillsForAgent(id);
  });

  app.put("/agents/:id/skills", async (request) => {
    const { id } = request.params as { id: string };
    requireAgent(id);
    const body = setAgentSkillsSchema.parse(request.body);
    try {
      return setSkillsForAgent(id, body.skillIds);
    } catch (err) {
      throw new HttpError(400, err instanceof Error ? err.message : String(err));
    }
  });
}
