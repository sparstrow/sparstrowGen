import fs from "node:fs";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import type { Skill } from "@sparstrow/shared";
import { getDb } from "../db/connection.js";
import { agentSkills, skillFiles, skills } from "../db/schema.js";
import { config } from "../config.js";
import { logger } from "../logger.js";

export function rowToSkill(row: typeof skills.$inferSelect, fileCount = 0): Skill {
  return { ...row, sourceType: row.sourceType as Skill["sourceType"], fileCount };
}

export function skillFileCounts(): Map<string, number> {
  const rows = getDb()
    .select({ skillId: skillFiles.skillId, count: sql<number>`count(*)` })
    .from(skillFiles)
    .groupBy(skillFiles.skillId)
    .all();
  return new Map(rows.map((r) => [r.skillId, r.count]));
}

/** On-disk home of a skill's bundle — what agents are pointed at mid-run. */
export function skillFilesDir(skillId: string): string {
  return path.join(config.dataDir, "skills", skillId);
}

/**
 * Project the skill's bundle (SKILL.md + supporting files) to disk. Same
 * contract as writeAgentSkillMd: the DB is the source of truth and the tree is
 * fully derivable, so failures are logged and swallowed — never fatal.
 */
export function materializeSkillFiles(skillId: string): void {
  try {
    const db = getDb();
    const skill = db.select().from(skills).where(eq(skills.id, skillId)).get();
    if (!skill) return;
    const dir = skillFilesDir(skillId);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "SKILL.md"), skill.content, "utf8");
    const files = db.select().from(skillFiles).where(eq(skillFiles.skillId, skillId)).all();
    for (const f of files) {
      // Paths are validated at import time, but re-check containment here so a
      // hand-edited DB row can never write outside the skill dir.
      const target = path.resolve(dir, f.path);
      if (!target.startsWith(path.resolve(dir) + path.sep)) continue;
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, f.content, "utf8");
    }
  } catch (err) {
    logger.warn({ err, skillId }, "failed to materialize skill files (non-fatal)");
  }
}

export function removeSkillFilesDir(skillId: string): void {
  try {
    fs.rmSync(skillFilesDir(skillId), { recursive: true, force: true });
  } catch (err) {
    logger.warn({ err, skillId }, "failed to remove skill files dir (non-fatal)");
  }
}

/** Every skill assigned to the agent, enabled or not (for the management UI). */
export function listSkillsForAgent(agentId: string): Skill[] {
  const db = getDb();
  return db
    .select({ skill: skills })
    .from(agentSkills)
    .innerJoin(skills, eq(agentSkills.skillId, skills.id))
    .where(eq(agentSkills.agentId, agentId))
    .all()
    .map((r) => rowToSkill(r.skill))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Replace the agent's assignment set atomically. Unknown skill ids throw. */
export function setSkillsForAgent(agentId: string, skillIds: string[]): Skill[] {
  const db = getDb();
  const unique = [...new Set(skillIds)];
  const known = new Set(db.select({ id: skills.id }).from(skills).all().map((r) => r.id));
  const unknown = unique.filter((id) => !known.has(id));
  if (unknown.length > 0) throw new Error(`unknown skill id(s): ${unknown.join(", ")}`);
  db.delete(agentSkills).where(eq(agentSkills.agentId, agentId)).run();
  for (const skillId of unique) {
    db.insert(agentSkills).values({ agentId, skillId }).run();
  }
  return listSkillsForAgent(agentId);
}

// A skill body is owner-authored, but a runaway paste shouldn't blow the whole
// prompt budget; beyond this the tail is dropped with an explicit marker.
const MAX_SKILL_CONTENT_CHARS = 20_000;

/**
 * The "## Skills" prompt block for a run: every enabled skill assigned to the
 * agent, name + description + full instructions. Empty string when none apply,
 * so callers can splice it into the prompt unconditionally.
 */
export function buildSkillsBlock(agentId: string): string {
  const assigned = listSkillsForAgent(agentId).filter((s) => s.enabled);
  if (assigned.length === 0) return "";
  const counts = skillFileCounts();
  const lines: string[] = [
    "## Skills",
    "You have been equipped with the following skills. When a task matches a skill's purpose, follow that skill's instructions.",
  ];
  for (const s of assigned) {
    lines.push("", `### Skill: ${s.name}`);
    if (s.description.trim()) lines.push(s.description.trim());
    const body = s.content.trim();
    if (body) {
      lines.push(
        body.length > MAX_SKILL_CONTENT_CHARS
          ? body.slice(0, MAX_SKILL_CONTENT_CHARS) + "\n[skill content truncated]"
          : body,
      );
    }
    const fileCount = counts.get(s.id) ?? 0;
    if (fileCount > 0) {
      lines.push(
        `This skill bundles ${fileCount} supporting file(s) at \`${skillFilesDir(s.id)}\`. Read them from disk when the instructions reference them.`,
      );
    }
  }
  return lines.join("\n");
}
