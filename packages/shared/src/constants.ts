export const DEFAULT_PORT = 48750;
export const API_BASE = "/api/v1";
export const WS_PATH = "/ws";
export const TERMINAL_WS_PATH = "/ws/terminal";

export const EMBEDDING_DIM = 384;
export const EMBEDDING_MODEL = "BGE-small-en-v1.5";

/** Vault subfolders — scope is derived from these paths. */
export const VAULT_DIRS = {
  global: "global",
  projects: "projects",
  agents: "agents",
  inbox: "inbox",
} as const;

export const DEFAULT_RUN_TIMEOUT_MS = 15 * 60 * 1000;
export const DEFAULT_GLOBAL_CONCURRENCY = 4;

/** Known model choices per provider (free-text also allowed). */
export const KNOWN_MODELS: Record<string, string[]> = {
  "claude-code": ["opus", "sonnet", "haiku"],
  // P8.1: exact `agy models` display strings — verified as the tokens `--model`
  // accepts (agy v1.1.0). The parenthetical is the reasoning-effort tier.
  antigravity: [
    "Gemini 3.1 Pro (High)",
    "Gemini 3.1 Pro (Low)",
    "Gemini 3.5 Flash (High)",
    "Gemini 3.5 Flash (Medium)",
    "Gemini 3.5 Flash (Low)",
    "Claude Opus 4.6 (Thinking)",
    "Claude Sonnet 4.6 (Thinking)",
    "GPT-OSS 120B (Medium)",
  ],
  // P8 direct-API defaults; the live list comes from POST /providers/discover-models.
  "anthropic-api": [
    "claude-opus-4-8",
    "claude-sonnet-5",
    "claude-haiku-4-5",
  ],
  ollama: ["llama3.1", "qwen2.5", "mistral"],
};

export const MEMORY_INJECTION_MAX_CHARS = 8000;
export const MEMORY_INJECTION_TOP_K = 8;

/**
 * P3 delegation limits — both are settings-backed with these defaults.
 * Depth bounds runaway recursion + cost (P3-Q4); the cross-team message limit is
 * the C10 circuit breaker (teams-arch's constant, made a setting per the gate).
 */
export const SETTING_DELEGATION_MAX_DEPTH = "delegation.maxDepth";
export const DEFAULT_DELEGATION_MAX_DEPTH = 3;
export const SETTING_CROSS_TEAM_MESSAGE_LIMIT = "delegation.crossTeamMessageLimit";
export const DEFAULT_CROSS_TEAM_MESSAGE_LIMIT = 3;

/**
 * P6 goal engine limits — settings-backed with these defaults.
 * Replan cap bounds adaptive replanning (cap hit → goal `blocked`, P1
 * escalation); planner-retry cap bounds the bounce-back loop within ONE
 * planning round (unusable output after retries → goal `blocked` with the
 * diagnostic); the node cap bounds plan size (assumption: plans ≤ ~20 nodes).
 */
export const SETTING_GOAL_REPLAN_LIMIT = "goal.replanLimit";
export const DEFAULT_GOAL_REPLAN_LIMIT = 3;
export const SETTING_GOAL_PLANNER_RETRY_LIMIT = "goal.plannerRetryLimit";
export const DEFAULT_GOAL_PLANNER_RETRY_LIMIT = 2;
export const GOAL_MAX_PLAN_NODES = 30;

/**
 * OQ-1 — WIP snapshots. When a run ends, core records the project's working
 * tree as a git object under `refs/sparstrow/wip/<runId>` so an agent's
 * uncommitted edits survive a crash, a cancel, or a careless `git checkout`.
 *
 * The snapshot is written with plumbing (write-tree + commit-tree + update-ref)
 * against a THROWAWAY index, so it never moves HEAD, never touches the real
 * index, never creates a branch, and is never pushed. `git status` reads
 * identically before and after.
 *
 * Default ON: the setting only pays out when something has already gone wrong,
 * and the person who most needs it is the one who never thought to enable it.
 * Off is one toggle away, and turning it off leaves existing snapshots intact.
 */
export const SETTING_WIP_SNAPSHOT = "git.wipSnapshot";
export const DEFAULT_WIP_SNAPSHOT = true;
/** Snapshots retained per repository; the oldest refs are pruned past this. */
export const SETTING_WIP_SNAPSHOT_KEEP = "git.wipSnapshotKeep";
export const DEFAULT_WIP_SNAPSHOT_KEEP = 50;
/**
 * Deliberately NOT under `refs/heads/` — a ref there is a branch: it shows in
 * `git branch`, tab-completes, and matches the default `push` refspec. Under a
 * private hierarchy it is inert unless someone goes looking for it.
 */
export const WIP_SNAPSHOT_REF_PREFIX = "refs/sparstrow/wip/";

/**
 * Both readers of the setting live here so they cannot drift. Core decides
 * whether to take a snapshot; the settings UI decides where to draw the switch.
 * If those two disagreed, the toggle would misreport its own state — the single
 * worst failure mode for a control whose whole job is to be trusted.
 */
const WIP_SNAPSHOT_OFF_WORDS = ["off", "false", "0", "no"];

export function isWipSnapshotEnabled(raw: string | null | undefined): boolean {
  if (raw == null) return DEFAULT_WIP_SNAPSHOT;
  // Only an explicit falsey word disables it: a malformed value must not
  // silently switch off a data-protection feature.
  return !WIP_SNAPSHOT_OFF_WORDS.includes(raw.trim().toLowerCase());
}

export function resolveWipSnapshotKeep(raw: string | null | undefined): number {
  const n = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_WIP_SNAPSHOT_KEEP;
}

/**
 * M16 — per-machine on/off switch for the terminal channel (US4). Same
 * true/false-string convention as `SETTING_WIP_SNAPSHOT`; absent means on.
 */
export const SETTING_TERMINAL_ACCESS = "terminal.access";
const DEFAULT_TERMINAL_ACCESS = true;
const TERMINAL_ACCESS_OFF_WORDS = ["off", "false", "0", "no"];

/**
 * `T-M17-02`/`T-M17-04`'s shared reader — same reasoning as
 * `isWipSnapshotEnabled` just above: the Terminals page (deciding which empty
 * state to show) and the Machines toggle (deciding what to render as checked)
 * must not each carry their own copy of what counts as "off".
 *
 * `packages/core/src/cloud/terminal-bridge.ts`'s `terminalAccessEnabled()`
 * — the actual enforcement point, per FR-011 — is NOT this function: it reads
 * the daemon's own local `settings` table, not `reportedSettings` off a
 * `Runtime`, so it has no shared type to read this against. It re-implements
 * the same word list locally. If either list is ever widened, the other must
 * be checked by hand.
 */
export function isTerminalAccessEnabled(raw: string | null | undefined): boolean {
  if (raw == null) return DEFAULT_TERMINAL_ACCESS;
  return !TERMINAL_ACCESS_OFF_WORDS.includes(raw.trim().toLowerCase());
}

/**
 * T-M9-04 — the one Supabase Storage bucket for avatar and workspace-logo
 * images. Named once, here, so the upload component's client-side check, the
 * server's `isOwnStorageUrl` origin check, and the SQL policy comment
 * (`013_storage_images.sql`) do not each carry their own copy to drift out of
 * sync.
 *
 * **Never put anything else in this bucket** — every object in it has a
 * guessable, permanent, unauthenticated URL.
 */
export const PUBLIC_IMAGE_BUCKET = "public-images";

/** Matches the bucket's own `file_size_limit` in `013_storage_images.sql`. */
export const PUBLIC_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

/** Matches the bucket's own `allowed_mime_types`. Value is the file extension to upload under. */
export const PUBLIC_IMAGE_ALLOWED_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/**
 * The client-side half of "enforced twice" (T-M9-04 decision). Only a
 * courtesy — the bucket's own size limit and MIME allowlist are what actually
 * hold, since anyone can call the storage API directly — but it turns an
 * oversized or wrong-type file into an instant, readable message instead of a
 * slow upload followed by an opaque storage error.
 */
export function checkImageFile(file: { type: string; size: number }): string | null {
  if (!(file.type in PUBLIC_IMAGE_ALLOWED_TYPES)) {
    return "Only PNG, JPEG or WebP images are accepted.";
  }
  if (file.size > PUBLIC_IMAGE_MAX_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    return `Image must be 2 MB or smaller (this one is ${mb} MB).`;
  }
  return null;
}

/**
 * CS5 (Band 26, T-CS5-01) — the private `chat-attachments` bucket. A
 * separate bucket from `public-images`, deliberately: that bucket's own
 * header forbids putting anything else in it, and every object there has a
 * permanent public URL, which is exactly wrong for conversation content.
 * Reads here go through a short-lived signed URL (T-CS5-03), never
 * `getPublicUrl` — see `025_chat_attachments_storage.sql`.
 */
export const CHAT_ATTACHMENT_BUCKET = "chat-attachments";

/** Same ceiling as `public-images` (T-M9-04) until a task finds a reason to diverge (phase decision 2). */
export const CHAT_ATTACHMENT_MAX_BYTES = 2 * 1024 * 1024;

/**
 * Widened from `PUBLIC_IMAGE_ALLOWED_TYPES`' image-only floor (phase
 * decision 2's stated reason to diverge): the entire point of this feature
 * is a file an agent's `Read` tool can use, and an image-only allowlist
 * would make it useless for that — a screenshot is the one case a CLI
 * agent's `Read` tool cannot meaningfully act on today (no vision path,
 * per the phase README's "shape of what was found"), while text/code/PDF
 * attachments are exactly what a `Read` grant is for. Kept narrow rather
 * than "any file": each entry is a type this pipeline can plausibly do
 * something useful with, not a blanket allowlist.
 */
export const CHAT_ATTACHMENT_ALLOWED_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "text/plain": "txt",
  "text/markdown": "md",
  "text/csv": "csv",
  "application/json": "json",
  "application/pdf": "pdf",
};

/**
 * The client-side half of "enforced twice" (same T-M9-04 pattern
 * `checkImageFile` uses) — only a courtesy, since the bucket's own size
 * limit and MIME allowlist (`025_chat_attachments_storage.sql`) are what
 * actually holds.
 */
export function checkChatAttachmentFile(file: { type: string; size: number }): string | null {
  if (!(file.type in CHAT_ATTACHMENT_ALLOWED_TYPES)) {
    return "Only images, PDF, plain text, Markdown, CSV, or JSON files are accepted.";
  }
  if (file.size > CHAT_ATTACHMENT_MAX_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    return `File must be 2 MB or smaller (this one is ${mb} MB).`;
  }
  return null;
}

/**
 * AM1 (`T-AM1-01`) — files an AGENT hands back, not what a person uploads.
 * Deliberately 5x `CHAT_ATTACHMENT_MAX_BYTES`: that limit is right for what a
 * person drags into the composer and wrong for what a model emits — a
 * generated PNG routinely exceeds 2 MB. Two names, two honest values; see the
 * plan's Decision 5 for why one shared limit was rejected.
 */
export const CHAT_PRODUCED_MAX_BYTES = 10 * 1024 * 1024;

/**
 * A separate map from `CHAT_ATTACHMENT_ALLOWED_TYPES`, not a reuse of it —
 * the two answer different questions ("what may a person upload" vs "what may
 * we keep from an agent") and are expected to diverge. Adds `image/svg+xml`
 * and `image/gif` over the inbound set: an agent-produced chart or diagram is
 * plausibly either, and neither carries the upload-attack-surface concerns
 * `PUBLIC_IMAGE_ALLOWED_TYPES` was narrowed against (this bucket has no public
 * URL — see `CHAT_ATTACHMENT_BUCKET`'s header).
 */
export const CHAT_PRODUCED_ALLOWED_TYPES: Record<string, string> = {
  ...CHAT_ATTACHMENT_ALLOWED_TYPES,
  "image/gif": "gif",
  "image/svg+xml": "svg",
};

/**
 * Sanitizes an agent-chosen filename to a single, safe path segment: no
 * separators, no `..`, collapsed whitespace, capped length, extension
 * preserved. Never trust a filename an agent wrote as a path component
 * directly — see `producedStoragePath`'s own header for why.
 */
export function sanitizeProducedFilename(rawName: string): string {
  const base = rawName.replace(/[/\\]/g, "_").replace(/\.\./g, "_").trim();
  const collapsed = base.replace(/\s+/g, " ") || "file";
  const extMatch = collapsed.match(/(\.[A-Za-z0-9]{1,10})$/);
  const ext = extMatch ? (extMatch[1] ?? "") : "";
  const stem = ext ? collapsed.slice(0, -ext.length) : collapsed;
  const cappedStem = stem.slice(0, 100 - ext.length) || "file";
  return `${cappedStem}${ext}`;
}

/**
 * `<workspace_id>/<session_id>/<opaque>-<safe filename>` — exactly TWO path
 * segments, because `025_chat_attachments_storage.sql` enforces
 * `array_length(storage.foldername(name), 1) = 2` on both select and insert
 * against this same bucket. A third segment (e.g. a `produced/` prefix) is
 * silently DENIED to the workspace member who owns the file — it fails as an
 * empty image in the browser, not as an error anywhere. Produced files reuse
 * CS5's inbound-attachment path shape rather than inventing a new one; see
 * the AM1 phase README, finding 3.
 *
 * The opaque id is what lets an agent produce two files both named
 * `chart.png` in one conversation without one silently overwriting the
 * other — the spec's own edge case, answered as "both kept".
 */
export function producedStoragePath(
  workspaceId: string,
  sessionId: string,
  filename: string,
  opaqueId: string,
): string {
  const safeName = sanitizeProducedFilename(filename);
  return `${workspaceId}/${sessionId}/${opaqueId}-${safeName}`;
}
