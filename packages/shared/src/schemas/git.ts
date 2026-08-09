import { z } from "zod";
import { executionProfileSchema } from "./project";

/**
 * P7 git-automation API shapes, shared by core (producer) and the UI (consumer).
 * These are response/DTO types — the DB truth lives in the projects table + the
 * encrypted secret store; nothing here carries a raw token.
 */

/** One open pull request, normalized from the GitHub API. */
export interface PullRequestSummary {
  number: number;
  title: string;
  url: string;
  state: string;
  head: string;
  base: string;
  draft: boolean;
  createdAt: string;
  author: string | null;
}

/** A project's slice of the aggregate PR queue. `error` is set when the fetch degraded. */
export interface ProjectPrGroup {
  projectId: string;
  projectName: string;
  profile: "factory" | "production_app";
  remote: string | null;
  repo: string | null; // "owner/repo" when the remote parsed as GitHub
  pullRequests: PullRequestSummary[];
  error: string | null;
}

/** The Dashboard's aggregate PR queue — the founder's #2 morning surface. */
export interface PrQueue {
  patConfigured: boolean;
  projects: ProjectPrGroup[];
  totalOpen: number;
}

/** Presence + masked hint for a stored secret — NEVER the raw value. */
export interface SecretMeta {
  present: boolean;
  hint: string | null;
  length: number | null;
}

/** Body for setting the GitHub PAT. Empty string clears it. */
export const githubPatUpdateSchema = z.object({ token: z.string() });
export type GithubPatUpdate = z.infer<typeof githubPatUpdateSchema>;

/** Body for opening a PR from a project's current agent branch. */
export const openPrRequestSchema = z.object({
  head: z.string().min(1),
  title: z.string().min(1),
  body: z.string().default(""),
  base: z.string().optional(), // defaults to the profile's PR target
});
export type OpenPrRequest = z.infer<typeof openPrRequestSchema>;

/**
 * Rule 23 — the factory-health self-check ("is my factory armed?"). One row per
 * degrade-by-design dependency: green when ready, degraded with a reason when
 * not. The operator-side mirror of the agent's resolved-toolset preamble.
 */
export interface FactoryHealthCheck {
  id: string;
  label: string;
  status: "ok" | "degraded" | "off";
  detail: string | null;
}
export interface FactoryHealth {
  armed: boolean; // every REQUIRED check is ok
  checks: FactoryHealthCheck[];
}

/** Execution-profile enum re-exported here for git surfaces that import from git.js. */
export const gitExecutionProfileSchema = executionProfileSchema;
