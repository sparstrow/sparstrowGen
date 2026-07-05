import { z } from "zod";
import { idSchema, isoDateSchema, slugSchema } from "./common.js";

export const providerIdSchema = z.enum(["claude-code", "gemini-cli"]);
export type ProviderId = z.infer<typeof providerIdSchema>;

/** Claude Code permission modes; gemini maps these to --approval-mode. */
export const permissionModeSchema = z.enum([
  "default",
  "acceptEdits",
  "plan",
  "bypassPermissions",
]);
export type PermissionMode = z.infer<typeof permissionModeSchema>;

/**
 * Memory scope grammar:
 *   'global' | 'project:*' | 'project:<slug>' | 'agent:self' | 'agent:<slug>'
 */
export const memoryScopeSchema = z
  .string()
  .regex(
    /^(global|project:\*|project:[a-z0-9]+(?:-[a-z0-9]+)*|agent:self|agent:[a-z0-9]+(?:-[a-z0-9]+)*)$/,
    "invalid memory scope",
  );
export type MemoryScope = z.infer<typeof memoryScopeSchema>;

export const mcpServerConfigSchema = z.object({
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  env: z.record(z.string()).default({}),
});
export type McpServerConfig = z.infer<typeof mcpServerConfigSchema>;

export const agentSchema = z.object({
  id: idSchema,
  name: z.string().min(1).max(60),
  slug: slugSchema,
  role: z.string().max(200).default(""),
  systemPrompt: z.string().default(""),
  provider: providerIdSchema,
  model: z.string().min(1),
  cwd: z.string().nullable().default(null),
  addDirs: z.array(z.string()).default([]),
  allowedTools: z.array(z.string()).default([]),
  disallowedTools: z.array(z.string()).default([]),
  permissionMode: permissionModeSchema.default("default"),
  mcpServers: z.record(mcpServerConfigSchema).default({}),
  maxTurns: z.number().int().positive().nullable().default(null),
  memoryReadScopes: z.array(memoryScopeSchema).default(["global", "agent:self", "project:*"]),
  memoryWriteScopes: z.array(memoryScopeSchema).default(["agent:self"]),
  extraArgs: z.array(z.string()).default([]),
  enabled: z.boolean().default(true),
  /**
   * P4: a factory-managed system agent (Project Indexer, Project Reporter) seeded
   * at boot, not user-created. Hidden from the default agent list so it doesn't
   * clutter the roster; still runnable via cron/auto-index.
   */
  isSystem: z.boolean().default(false),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});
export type Agent = z.infer<typeof agentSchema>;

export const agentCreateSchema = agentSchema
  .omit({ id: true, slug: true, isSystem: true, createdAt: true, updatedAt: true })
  .extend({ slug: slugSchema.optional() });
export type AgentCreate = z.infer<typeof agentCreateSchema>;

export const agentUpdateSchema = agentCreateSchema.partial();
export type AgentUpdate = z.infer<typeof agentUpdateSchema>;
