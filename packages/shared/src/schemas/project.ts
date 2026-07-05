import { z } from "zod";
import { idSchema, isoDateSchema, slugSchema } from "./common.js";

export const projectSchema = z.object({
  id: idSchema,
  name: z.string().min(1).max(80),
  slug: slugSchema,
  description: z.string().default(""),
  rootDir: z.string().nullable().default(null),
  /** P2 project-level tool policy (empty allow = inherit; deny always wins). */
  allowedTools: z.array(z.string()).default([]),
  disallowedTools: z.array(z.string()).default([]),
  /** P4: this project is a client variant forked from parentProjectId (§7). */
  parentProjectId: idSchema.nullable().default(null),
  /**
   * P4 sandbox (§6/EH7): a sandboxed project's runs may only WRITE memory scoped
   * to this project — never global, agent:self, or other projects — and its notes
   * are non-global-searchable. Promotion is an explicit un-flag.
   */
  isSandbox: z.boolean().default(false),
  /** P4: the git remote URL this project's rootDir was cloned from (nullable). */
  gitRemote: z.string().nullable().default(null),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});
export type Project = z.infer<typeof projectSchema>;

// Tool policy + gitRemote are set by the server (update / clone flow), not the
// plain create body. isSandbox + parentProjectId ARE creation-time inputs (the
// sandbox toggle and the client-variant fork set them).
export const projectCreateSchema = projectSchema
  .omit({
    id: true,
    slug: true,
    allowedTools: true,
    disallowedTools: true,
    gitRemote: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({ slug: slugSchema.optional() });
export type ProjectCreate = z.infer<typeof projectCreateSchema>;

export const projectUpdateSchema = projectCreateSchema.partial().extend({
  allowedTools: z.array(z.string()).optional(),
  disallowedTools: z.array(z.string()).optional(),
});
export type ProjectUpdate = z.infer<typeof projectUpdateSchema>;

/**
 * P4 creation modes (§4 Cowork modal). Server-side each maps to a filesystem
 * action before the project row is inserted:
 * - scratch: mkdir rootDir (+ optional git init)
 * - bind:    validate an existing local folder
 * - clone:   git clone a public repo into rootDir (sets gitRemote)
 */
export const projectCreateModeSchema = z.enum(["scratch", "bind", "clone"]);
export type ProjectCreateMode = z.infer<typeof projectCreateModeSchema>;

export const projectProvisionSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().default(""),
  mode: projectCreateModeSchema,
  /** Absolute host path for scratch/bind; for clone the dir git creates. */
  rootDir: z.string().min(1),
  /** clone only: public git URL. */
  gitUrl: z.string().url().optional(),
  /** scratch only: run `git init` in the new folder. */
  gitInit: z.boolean().default(false),
  /** §6: open the import in a sandbox (bind/clone). */
  isSandbox: z.boolean().default(false),
});
export type ProjectProvision = z.infer<typeof projectProvisionSchema>;

/** Read-only git state for a project's rootDir (P4 git awareness; writes are P7). */
export const projectGitStateSchema = z.object({
  available: z.boolean(),
  isRepo: z.boolean(),
  branch: z.string().nullable(),
  dirty: z.boolean(),
  ahead: z.number().int(),
  behind: z.number().int(),
  changedFiles: z.number().int(),
  recentCommits: z.array(
    z.object({ hash: z.string(), subject: z.string(), author: z.string(), date: z.string() }),
  ),
  error: z.string().nullable(),
});
export type ProjectGitState = z.infer<typeof projectGitStateSchema>;
