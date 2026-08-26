import { z } from "zod";

export const SubjectSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("agent"), id: z.string() }),
  z.object({ kind: z.literal("person"), id: z.string() }),
  z.object({ kind: z.literal("machine"), id: z.string() }),
]);

export const AccessLevelSchema = z.enum(["see", "use", "configure", "administer"]);

export const ScopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("workspace") }),
  z.object({ kind: z.literal("project"), id: z.string() }),
  z.object({ kind: z.literal("machine"), id: z.string() }),
  z.object({ kind: z.literal("agent"), id: z.string() }),
  z.object({ kind: z.literal("run"), id: z.string() }),
]);

export const AccessRuleSchema = z.object({
  subject: SubjectSchema,
  level: AccessLevelSchema,
  scope: ScopeSchema,
});
