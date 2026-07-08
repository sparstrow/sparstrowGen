import { z } from "zod";
import { idSchema, isoDateSchema, slugSchema } from "./common.js";
import { agentOriginSchema, agentStatusSchema, specterReportSchema } from "./specter.js";

export const providerIdSchema = z.enum([
  "claude-code",
  // P8.1: Antigravity CLI (`agy`) — a headless CLI provider, the sanctioned
  // successor after Gemini CLI was retired.
  "antigravity",
  // P8: direct-API providers run through core's in-process tool-loop (execution
  // mode is derived from the provider, not stored — see PROVIDER_KINDS).
  "anthropic-api",
  "ollama",
]);
export type ProviderId = z.infer<typeof providerIdSchema>;

/**
 * P8: how a provider executes. `cli` spawns a headless CLI child; `direct_api`
 * runs core's own tool-call loop against the provider's HTTP API. Derived from
 * the provider id (one provider → one mode), so there is no `agents.execution_mode`
 * column to keep in sync — the registry is the single source of truth.
 */
export type ExecutionMode = "cli" | "direct_api";
export const PROVIDER_KINDS: Record<ProviderId, ExecutionMode> = {
  "claude-code": "cli",
  antigravity: "cli",
  "anthropic-api": "direct_api",
  ollama: "direct_api",
};
export function executionModeForProvider(provider: string): ExecutionMode {
  return PROVIDER_KINDS[provider as ProviderId] ?? "cli";
}

/** Claude Code permission modes; other CLI providers map these to their own approval flags. */
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
   * P5 signal extraction per-agent toggle: when false, the nightly dream-cycle
   * signal pass skips this agent's transcripts entirely.
   */
  signalExtraction: z.boolean().default(true),
  /**
   * P4: a factory-managed system agent (Project Indexer, Project Reporter) seeded
   * at boot, not user-created. Hidden from the default agent list so it doesn't
   * clutter the roster; still runnable via cron/auto-index.
   */
  isSystem: z.boolean().default(false),
  /**
   * P9 provenance: 'user' (operator/Creator-made) or 'import' (a skill
   * reconstructed from an external repo by the Intelligence Extractor).
   */
  origin: agentOriginSchema.default("user"),
  /**
   * P9 quarantine lifecycle. Imported skills are 'quarantined' (enabled=false,
   * no tool grants) until the operator promotes them; 'discarded' is a soft
   * reject. Enforced server-side — the create/update path can't set it.
   */
  status: agentStatusSchema.default("active"),
  /** P9 Skill Specter security review card (null until reviewed). */
  specterReport: specterReportSchema.nullable().default(null),
  /** P9 code-enforced links: the import batch + sandbox project of origin. */
  importId: z.string().nullable().default(null),
  sandboxProjectId: z.string().nullable().default(null),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});
export type Agent = z.infer<typeof agentSchema>;

export const agentCreateSchema = agentSchema
  .omit({
    id: true,
    slug: true,
    isSystem: true,
    origin: true,
    status: true,
    specterReport: true,
    importId: true,
    sandboxProjectId: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({ slug: slugSchema.optional() });
export type AgentCreate = z.infer<typeof agentCreateSchema>;

export const agentUpdateSchema = agentCreateSchema.partial();
export type AgentUpdate = z.infer<typeof agentUpdateSchema>;
