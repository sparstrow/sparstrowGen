import fs from "node:fs";
import type { FactoryHealth, FactoryHealthCheck } from "@sparstrow/shared";
import { config } from "../config.js";
import { getSqlite } from "../db/connection.js";
import { graphEngineInstalled } from "../graph/graph-tools.js";
import { embedderStatus } from "../memory/embedder.js";
import { listProviders } from "../providers/index.js";
import { SECRET_GITHUB_PAT, getSecretMeta } from "../secrets/secret-store.js";

/**
 * Cross-cutting rule 23 — the factory-health self-check ("is my factory armed?").
 * The operator-side mirror of the agent's resolved-toolset preamble: one row per
 * degrade-by-design dependency, green when ready or degraded/off with a reason.
 * `armed` is true only when every REQUIRED check is ok; the optional ones (graph
 * engine, embedder, PAT) degrade the factory's abilities without disarming it.
 */

interface CheckDef extends FactoryHealthCheck {
  required: boolean;
}

export async function getFactoryHealth(): Promise<FactoryHealth> {
  const checks: CheckDef[] = [];

  // DB (required) — the whole app is dead without it.
  let dbOk = true;
  try {
    getSqlite().prepare("SELECT 1").get();
  } catch {
    dbOk = false;
  }
  checks.push({
    id: "db",
    label: "Database",
    status: dbOk ? "ok" : "off",
    detail: dbOk ? config.dbPath : "SQLite is unreadable",
    required: true,
  });

  // Vault (required) — memory read/write needs it.
  const vaultOk = fs.existsSync(config.vaultPath);
  checks.push({
    id: "vault",
    label: "Memory vault",
    status: vaultOk ? "ok" : "off",
    detail: vaultOk ? config.vaultPath : `missing: ${config.vaultPath}`,
    required: true,
  });

  // Providers (claude-code required; others degrade). One healthCheck each.
  const providers = await Promise.all(listProviders().map((p) => p.healthCheck()));
  for (const ph of providers) {
    const required = ph.id === "claude-code";
    checks.push({
      id: `provider:${ph.id}`,
      label: `Provider — ${ph.id}`,
      status: ph.ok ? "ok" : required ? "off" : "degraded",
      detail: ph.ok ? (ph.version ?? "reachable") : (ph.detail ?? "unreachable"),
      required,
    });
  }

  // Code-graph engine (optional — agents fall back to Grep/Read).
  const graphOk = graphEngineInstalled();
  checks.push({
    id: "graph-engine",
    label: "Code-graph engine",
    status: graphOk ? "ok" : "degraded",
    detail: graphOk ? "installed" : "not installed — agents use file search instead (Settings → install)",
    required: false,
  });

  // Embedder (optional — search degrades to FTS-only).
  const emb = embedderStatus();
  checks.push({
    id: "embedder",
    label: "Embedder",
    status: emb.ready ? "ok" : "degraded",
    detail: emb.ready ? emb.model : (emb.detail ?? "not loaded — semantic search unavailable"),
    required: false,
  });

  // GitHub PAT (optional — needed only to open PRs / show the PR queue).
  const pat = getSecretMeta(SECRET_GITHUB_PAT);
  checks.push({
    id: "github-pat",
    label: "GitHub PAT",
    status: pat.present ? "ok" : "off",
    detail: pat.present ? `configured (${pat.hint ?? "set"})` : "not set — PRs + PR queue disabled (Settings → Git)",
    required: false,
  });

  const armed = checks.filter((c) => c.required).every((c) => c.status === "ok");
  // Drop the internal `required` flag from the wire shape.
  return { armed, checks: checks.map(({ required: _r, ...c }) => c) };
}
