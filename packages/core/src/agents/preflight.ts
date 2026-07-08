import { and, eq } from "drizzle-orm";
import type { AgentDraft, AgentMatch } from "@sparstrow/shared";
import { getDb } from "../db/connection.js";
import { agents } from "../db/schema.js";
import { logger } from "../logger.js";
import { embedPassages, initEmbedder, isEmbedderReady } from "../memory/embedder.js";
import { searchMemory } from "../memory/search.js";
import type { ScopeFilter } from "../memory/scopes.js";

/**
 * P9 §1 — Agent Creator pre-flight. Before the interview drafts a new agent we
 * (a) scan the existing roster for a near-duplicate by embedding similarity and
 * (b) pull relevant standards from memory, folding both into the interview so
 * the Creator is context-aware. Both scans are ADVISORY (P9-Q1): a create is
 * NEVER blocked, and every failure degrades to empty — /draft must stay fast and
 * always succeed even with no embedder and no memory.
 */

/** Cosine over role+prompt embeddings. Above this we surface the existing agent. */
const DUP_THRESHOLD = 0.82;
const MAX_MATCHES = 4;
const STANDARDS_K = 4;

export interface StandardHit {
  title: string;
  excerpt: string;
  type: string;
}

export interface PreflightResult {
  matches: AgentMatch[];
  standards: StandardHit[];
}

/** Text signature of an agent for similarity: role + head of the system prompt. */
function agentText(a: { role?: string | null; systemPrompt?: string | null }): string {
  return `${(a.role ?? "").trim()}\n${(a.systemPrompt ?? "").trim()}`.slice(0, 1000).trim();
}

/** True cosine (robust to non-unit vectors; BGE vectors are already unit-length). */
export function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dot += ai * bi;
    na += ai * ai;
    nb += bi * bi;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export interface DupCandidate {
  id: string;
  name: string;
  role: string;
  vec: Float32Array;
}

/**
 * Pure ranking: closest candidates to the draft vector above the threshold,
 * highest first. Extracted so the similarity/threshold logic is unit-testable
 * without loading the embedding model.
 */
export function rankDuplicates(
  draftVec: Float32Array,
  candidates: DupCandidate[],
  threshold = DUP_THRESHOLD,
  max = MAX_MATCHES,
): AgentMatch[] {
  return candidates
    .map((c) => ({ c, sim: cosine(draftVec, c.vec) }))
    .filter((s) => s.sim >= threshold)
    .sort((a, b) => b.sim - a.sim)
    .slice(0, max)
    .map((s) => ({
      id: s.c.id,
      name: s.c.name,
      role: s.c.role,
      similarity: Math.round(s.sim * 1000) / 1000,
      reason: `${Math.round(s.sim * 100)}% similar to your existing "${s.c.name}"`,
    }));
}

/**
 * ADVISORY duplicate detection (P9-Q1). Embeds the draft's role+prompt and every
 * active, non-system agent, returning the closest above threshold. Never blocks:
 * returns [] when the draft is too thin, the embedder isn't ready, or anything
 * throws. The embedder is warmed fire-and-forget so a cold first draft doesn't
 * pay the ~100MB download — it simply gets no matches until the model is ready.
 */
export async function scanForDuplicates(draft: AgentDraft): Promise<AgentMatch[]> {
  const query = agentText({ role: draft.role, systemPrompt: draft.systemPrompt });
  if (query.length < 8) return [];
  try {
    // Warm the model for next time, but do not block this turn on a download.
    void initEmbedder();
    if (!isEmbedderReady()) return [];

    const rows = getDb()
      .select({
        id: agents.id,
        name: agents.name,
        role: agents.role,
        systemPrompt: agents.systemPrompt,
      })
      .from(agents)
      .where(and(eq(agents.isSystem, false), eq(agents.status, "active")))
      .all();
    if (rows.length === 0) return [];

    // Embed the draft + the whole (tiny) roster as passages so the comparison is
    // symmetric doc-to-doc (query-side BGE prefixes would skew cosine).
    const vecs = await embedPassages([query, ...rows.map((r) => agentText(r))]);
    const draftVec = vecs[0];
    if (!draftVec) return [];
    const candidates: DupCandidate[] = [];
    rows.forEach((r, i) => {
      const vec = vecs[i + 1];
      if (vec) candidates.push({ id: r.id, name: r.name, role: r.role, vec });
    });
    return rankDuplicates(draftVec, candidates);
  } catch (err) {
    logger.warn({ err }, "preflight duplicate scan failed — skipping (advisory)");
    return [];
  }
}

/**
 * ADVISORY standards scan (P9 §1b): the operator's global standards (and project
 * standards when a project is in scope) relevant to what they're describing, so
 * the Creator drafts prompts that respect house rules. Hits are treated as DATA,
 * not instructions, when folded into the interview.
 */
export async function scanStandards(
  projectSlug: string | null,
  interviewText: string,
): Promise<StandardHit[]> {
  const q = interviewText.slice(0, 800).trim();
  if (q.length < 4) return [];
  try {
    const filters: ScopeFilter[] = [{ scope: "global" }];
    if (projectSlug) filters.push({ scope: "project", projectSlug });
    const hits = await searchMemory(q, filters, STANDARDS_K, {
      callerProjectSlug: projectSlug ?? null,
    });
    return hits.map((h) => ({ title: h.title, excerpt: h.excerpt, type: h.type }));
  } catch (err) {
    logger.warn({ err }, "preflight standards scan failed — skipping (advisory)");
    return [];
  }
}

/** Run both advisory scans concurrently. Never throws. */
export async function runPreflight(
  draft: AgentDraft,
  interviewText: string,
  projectSlug: string | null = null,
): Promise<PreflightResult> {
  const [matches, standards] = await Promise.all([
    scanForDuplicates(draft),
    scanStandards(projectSlug, interviewText),
  ]);
  return { matches, standards };
}
