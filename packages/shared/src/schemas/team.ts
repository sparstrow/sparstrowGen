import { z } from "zod";
import { idSchema, isoDateSchema, slugSchema } from "./common.js";

// ── Teams ───────────────────────────────────────────────────────────────

export const teamSchema = z.object({
  id: idSchema,
  name: z.string().min(1).max(80),
  slug: slugSchema,
  description: z.string().default(""),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});
export type Team = z.infer<typeof teamSchema>;

export const teamCreateSchema = teamSchema
  .omit({ id: true, slug: true, createdAt: true, updatedAt: true })
  .extend({ slug: slugSchema.optional() });
export type TeamCreate = z.infer<typeof teamCreateSchema>;

export const teamUpdateSchema = teamCreateSchema.partial();
export type TeamUpdate = z.infer<typeof teamUpdateSchema>;


// ── Team Members ────────────────────────────────────────────────────────

export const teamMemberSchema = z.object({
  id: idSchema,
  teamId: idSchema,
  agentId: idSchema,
  teamRole: z.string().nullable().default(null),
  sort: z.number().int().default(0),
});
export type TeamMember = z.infer<typeof teamMemberSchema>;

export const teamMemberCreateSchema = teamMemberSchema
  .pick({ agentId: true, teamRole: true, sort: true })
  .partial({ teamRole: true, sort: true });
export type TeamMemberCreate = z.infer<typeof teamMemberCreateSchema>;

export const teamMemberUpdateSchema = teamMemberSchema
  .pick({ teamRole: true, sort: true })
  .partial();
export type TeamMemberUpdate = z.infer<typeof teamMemberUpdateSchema>;


// ── Team Projects ───────────────────────────────────────────────────────

export const teamProjectSchema = z.object({
  teamId: idSchema,
  projectId: idSchema,
});
export type TeamProject = z.infer<typeof teamProjectSchema>;


// ── API Responses ───────────────────────────────────────────────────────

export const teamIndexItemSchema = teamSchema.extend({
  memberCount: z.number().int(),
  projectCount: z.number().int(),
  members: z.array(
    z.object({
      agentId: idSchema,
      agentName: z.string(),
    })
  ),
});
export type TeamIndexItem = z.infer<typeof teamIndexItemSchema>;

export const teamDetailSchema = teamSchema.extend({
  members: z.array(
    z.object({
      id: idSchema,
      agentId: idSchema,
      agentName: z.string(),
      agentRole: z.string(),
      teamRole: z.string().nullable(),
      sort: z.number().int(),
    })
  ),
  projects: z.array(
    z.object({
      id: idSchema,
      name: z.string(),
      slug: z.string(),
    })
  ),
});
export type TeamDetail = z.infer<typeof teamDetailSchema>;
