import { eq } from "drizzle-orm";
import type { Skill } from "@sparstrow/shared";
import { getDb } from "../db/connection.js";
import { agentSkills, skills } from "../db/schema.js";

function rowToSkill(row: typeof skills.$inferSelect): Skill {
  return { ...row };
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
  }
  return lines.join("\n");
}
