import fs from "node:fs";
import path from "node:path";
import { renderSkillMd, type Agent } from "@sparstrow/shared";
import { config } from "../config.js";
import { logger } from "../logger.js";

/** Directory holding a single agent's generated SKILL.md, keyed by immutable id
 *  (not slug — slug can change on rename and would orphan the old dir). */
export function agentSkillDir(agentId: string): string {
  return path.join(config.agentsDir, agentId);
}

/**
 * Regenerate the agent's SKILL.md projection on disk. Best-effort: the DB row
 * is the source of truth and the file is fully derivable, so a write failure is
 * logged and swallowed — it must never fail the API call that triggered it.
 */
export function writeAgentSkillMd(agent: Agent): void {
  try {
    const dir = agentSkillDir(agent.id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "SKILL.md"), renderSkillMd(agent), "utf8");
  } catch (err) {
    logger.warn({ err, agentId: agent.id }, "failed to write agent SKILL.md (non-fatal)");
  }
}

/** Remove an agent's SKILL.md directory on delete so files don't orphan. */
export function removeAgentSkillDir(agentId: string): void {
  try {
    fs.rmSync(agentSkillDir(agentId), { recursive: true, force: true });
  } catch (err) {
    logger.warn({ err, agentId }, "failed to remove agent SKILL.md dir (non-fatal)");
  }
}
