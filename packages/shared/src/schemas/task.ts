import { z } from "zod";
import { idSchema, isoDateSchema } from "./common.js";

export const taskStatusSchema = z.enum([
  "inbox",
  "todo",
  "in_progress",
  "review",
  "done",
  "failed",
]);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

export const actorTypeSchema = z.enum(["user", "agent"]);
export type ActorType = z.infer<typeof actorTypeSchema>;

export const taskSchema = z.object({
  id: idSchema,
  title: z.string().min(1).max(200),
  description: z.string().default(""),
  projectId: idSchema.nullable().default(null),
  status: taskStatusSchema.default("inbox"),
  createdByType: actorTypeSchema.default("user"),
  createdByAgentId: idSchema.nullable().default(null),
  assignedAgentId: idSchema.nullable().default(null),
  priority: z.number().int().min(0).max(3).default(1),
  runId: idSchema.nullable().default(null),
  result: z.string().nullable().default(null),
  dueAt: isoDateSchema.nullable().default(null),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});
export type Task = z.infer<typeof taskSchema>;

export const taskCreateSchema = taskSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  runId: true,
  result: true,
});
export type TaskCreate = z.infer<typeof taskCreateSchema>;

export const taskUpdateSchema = taskCreateSchema.partial().extend({
  result: z.string().nullable().optional(),
});
export type TaskUpdate = z.infer<typeof taskUpdateSchema>;

export const messageStatusSchema = z.enum(["unread", "read", "processed"]);
export type MessageStatus = z.infer<typeof messageStatusSchema>;

export const messageSchema = z.object({
  id: idSchema,
  fromType: actorTypeSchema,
  fromAgentId: idSchema.nullable().default(null),
  /** null = the user's inbox */
  toAgentId: idSchema.nullable().default(null),
  projectId: idSchema.nullable().default(null),
  taskId: idSchema.nullable().default(null),
  subject: z.string().max(200).default(""),
  body: z.string(),
  status: messageStatusSchema.default("unread"),
  spawnedRunId: idSchema.nullable().default(null),
  createdAt: isoDateSchema,
});
export type Message = z.infer<typeof messageSchema>;

export const messageCreateSchema = messageSchema.omit({
  id: true,
  createdAt: true,
  status: true,
  spawnedRunId: true,
});
export type MessageCreate = z.infer<typeof messageCreateSchema>;
