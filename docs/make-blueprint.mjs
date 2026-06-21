// Generates docs/sparstrowgen-blueprint.excalidraw — a sectioned poster
// explaining the whole app. Re-run after edits: node docs/make-blueprint.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, "sparstrowgen-blueprint.excalidraw");

const elements = [];
const now = Date.now();
let n = 0;
const rid = () => `bp${(n++).toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const seed = () => Math.floor(Math.random() * 2 ** 31);

const COLORS = {
  ui: { bg: "#a5d8ff", stroke: "#1971c2" }, // user-facing
  core: { bg: "#ffec99", stroke: "#f08c00" }, // backend
  data: { bg: "#b2f2bb", stroke: "#2f9e44" }, // storage
  ai: { bg: "#d0bfff", stroke: "#7048e8" }, // agents / models
  shell: { bg: "#e9ecef", stroke: "#495057" }, // desktop shell
  hot: { bg: "#ffc9c9", stroke: "#e03131" }, // outcomes / cleanup
};

const base = (type, x, y, w, h, stroke) => ({
  id: rid(),
  type,
  x,
  y,
  width: w,
  height: h,
  angle: 0,
  strokeColor: stroke,
  backgroundColor: "transparent",
  fillStyle: "solid",
  strokeWidth: 2,
  strokeStyle: "solid",
  roughness: 1,
  opacity: 100,
  groupIds: [],
  frameId: null,
  roundness: type === "rectangle" ? { type: 3 } : type === "arrow" ? { type: 2 } : null,
  seed: seed(),
  version: 1,
  versionNonce: seed(),
  isDeleted: false,
  boundElements: null,
  updated: now,
  link: null,
  locked: false,
});

function box(x, y, w, h, text, color, fontSize = 14, icon = null) {
  const rect = base("rectangle", x, y, w, h, color.stroke);
  rect.backgroundColor = color.bg;
  const t = base("text", x + 10, y + 10, w - 20, h - 20, "#1e1e1e");
  t.strokeWidth = 1;
  Object.assign(t, {
    text,
    fontSize,
    fontFamily: 5,
    textAlign: "center",
    verticalAlign: "middle",
    containerId: rect.id,
    originalText: text,
    autoResize: true,
    lineHeight: 1.25,
  });
  rect.boundElements = [{ id: t.id, type: "text" }];
  elements.push(rect, t);
  const bx = { x, y, w, h, id: rect.id };
  if (icon) iconQueue.push({ bx, name: icon, color: color.stroke });
  return bx;
}

function txt(x, y, text, fontSize, color = "#343a40") {
  const lines = text.split("\n");
  const w = Math.max(...lines.map((l) => l.length)) * fontSize * 0.6;
  const h = lines.length * fontSize * 1.25;
  const t = base("text", x, y, w, h, color);
  t.strokeWidth = 1;
  Object.assign(t, {
    text,
    fontSize,
    fontFamily: 5,
    textAlign: "left",
    verticalAlign: "top",
    containerId: null,
    originalText: text,
    autoResize: true,
    lineHeight: 1.25,
  });
  elements.push(t);
  return t;
}

function arrow(x1, y1, x2, y2, opts = {}) {
  const a = base("arrow", x1, y1, Math.abs(x2 - x1) || 1, Math.abs(y2 - y1) || 1, opts.color ?? "#495057");
  a.strokeStyle = opts.dashed ? "dashed" : "solid";
  a.points = opts.via
    ? [[0, 0], ...opts.via.map(([vx, vy]) => [vx - x1, vy - y1]), [x2 - x1, y2 - y1]]
    : [
        [0, 0],
        [x2 - x1, y2 - y1],
      ];
  a.lastCommittedPoint = null;
  a.startBinding = null;
  a.endBinding = null;
  a.startArrowhead = opts.both ? "arrow" : null;
  a.endArrowhead = "arrow";
  elements.push(a);
  if (opts.label) {
    const mx = opts.labelAt?.[0] ?? (x1 + x2) / 2;
    const my = opts.labelAt?.[1] ?? (y1 + y2) / 2 - 22;
    txt(mx, my, opts.label, 13, opts.color ?? "#868e96");
  }
  return a;
}

const R = (b) => [b.x + b.w, b.y + b.h / 2]; // right edge midpoint
const L = (b) => [b.x, b.y + b.h / 2];
const T = (b) => [b.x + b.w / 2, b.y];
const B = (b) => [b.x + b.w / 2, b.y + b.h];

// ───────────────────────── icons ─────────────────────────
// Hand-drawn glyphs composed from Excalidraw primitives — no external
// library needed. Each icon draws inside a square anchored at (ax, ay)
// with side `s`, coordinates expressed as fractions of s.
function gline(ax, ay, pts, color, sw = 1.6, closed = false) {
  const p = closed ? [...pts, pts[0]] : pts;
  const xs = p.map((q) => q[0]);
  const ys = p.map((q) => q[1]);
  const minx = Math.min(...xs);
  const miny = Math.min(...ys);
  const el = base("line", ax + minx, ay + miny, Math.max(...xs) - minx || 1, Math.max(...ys) - miny || 1, color);
  el.strokeWidth = sw;
  el.points = p.map((q) => [q[0] - minx, q[1] - miny]);
  el.lastCommittedPoint = null;
  el.startBinding = null;
  el.endBinding = null;
  el.startArrowhead = null;
  el.endArrowhead = null;
  elements.push(el);
}
function gell(ax, ay, w, h, color, bg = "transparent", sw = 1.6) {
  const el = base("ellipse", ax, ay, w, h, color);
  el.strokeWidth = sw;
  el.backgroundColor = bg;
  elements.push(el);
}
function grect(ax, ay, w, h, color, bg = "transparent", sw = 1.6) {
  const el = base("rectangle", ax, ay, w, h, color);
  el.strokeWidth = sw;
  el.backgroundColor = bg;
  elements.push(el);
}

const ICONS = {
  person: (x, y, s, c) => {
    gell(x + s * 0.3, y, s * 0.4, s * 0.4, c);
    gline(x, y + s, [[s * 0.05, s], [s * 0.18, s * 0.55], [s * 0.82, s * 0.55], [s * 0.95, s]], c);
  },
  monitor: (x, y, s, c) => {
    grect(x, y, s, s * 0.68, c);
    gline(x, y, [[s * 0.4, s * 0.68], [s * 0.4, s * 0.85], [s * 0.6, s * 0.85], [s * 0.6, s * 0.68]], c);
    gline(x, y, [[s * 0.25, s], [s * 0.75, s]], c);
  },
  browser: (x, y, s, c) => {
    grect(x, y, s, s * 0.82, c);
    gline(x, y, [[0, s * 0.22], [s, s * 0.22]], c);
    gline(x, y, [[s * 0.32, s * 0.22], [s * 0.32, s * 0.82]], c);
  },
  chip: (x, y, s, c) => {
    grect(x + s * 0.22, y + s * 0.22, s * 0.56, s * 0.56, c);
    for (const f of [0.35, 0.65]) {
      gline(x, y, [[f * s, 0], [f * s, s * 0.22]], c);
      gline(x, y, [[f * s, s * 0.78], [f * s, s]], c);
      gline(x, y, [[0, f * s], [s * 0.22, f * s]], c);
      gline(x, y, [[s * 0.78, f * s], [s, f * s]], c);
    }
  },
  database: (x, y, s, c) => {
    gell(x, y, s, s * 0.28, c);
    gell(x, y + s * 0.36, s, s * 0.28, c);
    gell(x, y + s * 0.72, s, s * 0.28, c);
    gline(x, y, [[0, s * 0.14], [0, s * 0.86]], c);
    gline(x, y, [[s, s * 0.14], [s, s * 0.86]], c);
  },
  docs: (x, y, s, c) => {
    grect(x + s * 0.2, y, s * 0.65, s * 0.78, c);
    grect(x, y + s * 0.22, s * 0.65, s * 0.78, c, "#ffffff");
    gline(x, y, [[s * 0.12, s * 0.42], [s * 0.53, s * 0.42]], c);
    gline(x, y, [[s * 0.12, s * 0.6], [s * 0.53, s * 0.6]], c);
    gline(x, y, [[s * 0.12, s * 0.78], [s * 0.4, s * 0.78]], c);
  },
  robot: (x, y, s, c) => {
    grect(x + s * 0.08, y + s * 0.28, s * 0.84, s * 0.62, c);
    gline(x, y, [[s * 0.5, s * 0.05], [s * 0.5, s * 0.28]], c);
    gell(x + s * 0.42, y, s * 0.16, s * 0.16, c, c);
    gell(x + s * 0.26, y + s * 0.45, s * 0.13, s * 0.16, c, c);
    gell(x + s * 0.61, y + s * 0.45, s * 0.13, s * 0.16, c, c);
  },
  gauge: (x, y, s, c) => {
    gell(x, y, s, s, c);
    gline(x, y, [[s * 0.5, s * 0.5], [s * 0.78, s * 0.26]], c);
    gell(x + s * 0.42, y + s * 0.42, s * 0.16, s * 0.16, c, c);
  },
  kanban: (x, y, s, c) => {
    grect(x, y, s * 0.26, s, c);
    grect(x + s * 0.37, y, s * 0.26, s * 0.66, c);
    grect(x + s * 0.74, y, s * 0.26, s * 0.85, c);
  },
  envelope: (x, y, s, c) => {
    grect(x, y + s * 0.12, s, s * 0.72, c);
    gline(x, y, [[0, s * 0.12], [s * 0.5, s * 0.55], [s, s * 0.12]], c);
  },
  play: (x, y, s, c) => {
    gline(x, y, [[s * 0.2, s * 0.08], [s * 0.2, s * 0.92], [s * 0.92, s * 0.5]], c, 1.6, true);
  },
  pipeline: (x, y, s, c) => {
    gell(x, y + s * 0.35, s * 0.28, s * 0.28, c, c);
    gell(x + s * 0.72, y + s * 0.05, s * 0.28, s * 0.28, c, c);
    gell(x + s * 0.72, y + s * 0.66, s * 0.28, s * 0.28, c, c);
    gline(x, y, [[s * 0.26, s * 0.46], [s * 0.74, s * 0.18]], c);
    gline(x, y, [[s * 0.26, s * 0.52], [s * 0.74, s * 0.78]], c);
  },
  clock: (x, y, s, c) => {
    gell(x, y, s, s, c);
    gline(x, y, [[s * 0.5, s * 0.5], [s * 0.5, s * 0.2]], c);
    gline(x, y, [[s * 0.5, s * 0.5], [s * 0.72, s * 0.6]], c);
  },
  search: (x, y, s, c) => {
    gell(x, y, s * 0.68, s * 0.68, c);
    gline(x, y, [[s * 0.6, s * 0.6], [s, s]], c, 2);
  },
  terminal: (x, y, s, c) => {
    grect(x, y, s, s * 0.82, c);
    gline(x, y, [[s * 0.15, s * 0.28], [s * 0.38, s * 0.45], [s * 0.15, s * 0.62]], c);
    gline(x, y, [[s * 0.5, s * 0.62], [s * 0.8, s * 0.62]], c);
  },
  gear: (x, y, s, c) => {
    gell(x + s * 0.18, y + s * 0.18, s * 0.64, s * 0.64, c);
    gell(x + s * 0.38, y + s * 0.38, s * 0.24, s * 0.24, c);
    for (let k = 0; k < 8; k++) {
      const a = (Math.PI * 2 * k) / 8;
      const cx = x + s * 0.5;
      const cy = y + s * 0.5;
      gline(0, 0, [
        [cx + Math.cos(a) * s * 0.34, cy + Math.sin(a) * s * 0.34],
        [cx + Math.cos(a) * s * 0.5, cy + Math.sin(a) * s * 0.5],
      ], c, 2);
    }
  },
  folder: (x, y, s, c) => {
    gline(x, y, [[0, s * 0.2], [s * 0.4, s * 0.2], [s * 0.5, s * 0.05], [s * 0.05, s * 0.05]], c);
    grect(x, y + s * 0.2, s, s * 0.68, c);
  },
};

// Queue icons so they render ON TOP of every box (drawn last).
const iconQueue = [];
function drawBadges() {
  for (const { bx, name, color } of iconQueue) {
    const fn = ICONS[name];
    if (!fn) continue;
    const s = 26;
    // white disc behind the glyph so it reads on the box border
    const pad = 6;
    gell(bx.x + 2 - pad, bx.y - 16 - pad, s + pad * 2, s + pad * 2, color, "#ffffff", 1.4);
    fn(bx.x + 2, bx.y - 16, s, color);
  }
}

// ───────────────────────── title ─────────────────────────
txt(40, -170, "SPARSTROWGEN — THE FULL BLUEPRINT", 34, "#1e1e1e");
txt(
  40,
  -110,
  "Read top to bottom: 1) the running pieces  2) every screen  3) what happens when an agent runs  4) memory  5) a day with the app",
  16,
  "#868e96",
);

// ───────────────────── section 1: pieces ─────────────────
txt(40, -20, "1 · THE PIECES — what's actually running on your PC", 26, "#1971c2");

const you = box(40, 120, 180, 100, "YOU\nclick around, drop\nfiles, review work", COLORS.ui, 15, "person");
const shell = box(
  300,
  105,
  300,
  130,
  "DESKTOP APP (Electron)\nwindow + tray icon.\nstarts & babysits the core —\nrestarts it if it crashes",
  COLORS.shell,
  14,
  "monitor",
);
const ui = box(
  680,
  105,
  300,
  130,
  "WEB UI (React + shadcn)\nall the screens below,\nlive-updating via WebSocket.\nalso works in any browser",
  COLORS.ui,
  14,
  "browser",
);
const core = box(
  1060,
  60,
  380,
  220,
  "CORE SERVICE — THE BRAIN\nFastify on 127.0.0.1:48750\n\n• REST /api/v1 — UI commands\n• WebSocket /ws — live events out\n• MCP /mcp — the agents' toolbox\n\nschedules cron, runs pipelines,\nspawns & supervises every agent run",
  COLORS.core,
  14,
  "chip",
);
const db = box(
  1060,
  340,
  300,
  130,
  "SQLITE DB (data\\sparstrow.db)\nagents · projects · runs · events\ntasks · messages · pipelines · cron\n(backed up on every start)",
  COLORS.data,
  14,
  "database",
);
const vault = box(
  680,
  340,
  300,
  130,
  "MEMORY VAULT\nC:\\Sparstrow\\memory\nplain markdown notes —\nopen it in Obsidian",
  COLORS.data,
  14,
  "docs",
);
const cli = box(
  1520,
  105,
  280,
  130,
  "CLAUDE / GEMINI CLIs\nthe actual AI models,\nspawned headless per run\n(your existing logins)",
  COLORS.ai,
  14,
  "robot",
);

arrow(...R(you), ...L(shell), { label: "open" });
arrow(...R(shell), ...L(ui), { label: "shows" });
arrow(680 + 300, 150, 1060, 150, { label: "REST calls", labelAt: [990, 118] });
arrow(1060, 200, 680 + 300, 200, { dashed: true, label: "live WS events", labelAt: [990, 205] });
arrow(450, 105, 1250, 60, {
  via: [
    [450, 10],
    [1250, 10],
  ],
  label: "starts & restarts",
  labelAt: [770, -18],
  color: "#495057",
});
arrow(...B(core), ...T(db), {});
arrow(1060, 250, 980, 380, { label: ".md notes\nin / out", labelAt: [990, 285] });
arrow(1440, 150, 1520, 150, { label: "spawn per run", labelAt: [1432, 118] });
arrow(1520, 200, 1440, 200, { dashed: true, label: "streams JSON", labelAt: [1435, 205] });

// ───────────────────── section 2: screens ────────────────
txt(40, 560, "2 · THE SCREENS — what each page is for", 26, "#1971c2");

const pages = [
  ["DASHBOARD\nyour morning glance: live runs,\nprovider health, unread messages", COLORS.ui, "gauge"],
  ["AGENTS\ncreate an AI worker: provider, model,\nsystem prompt, allowed tools, and\nwhat memory it may read/write", COLORS.ui, "robot"],
  ["PROJECTS\nfolders for your work (apps, startup,\nmanufacturing) — scope memory\nand runs per project", COLORS.ui, "folder"],
  ["TASK BOARD\nkanban: inbox→todo→in progress→\nreview→done. assign a task to an\nagent ⇒ it RUNS and reports back", COLORS.ai, "kanban"],
  ["MESSAGES\ninbox between you & agents.\nmessage an agent ⇒ it runs & replies.\nagents can also message you", COLORS.ai, "envelope"],
  ["RUNS\nevery execution: live transcript,\n$ cost, which memory was injected,\ncancel button, full history", COLORS.ui, "play"],
  ["PIPELINES\nchain agents: research → draft →\nreview. each step's output feeds\nthe next as {{input}}", COLORS.ai, "pipeline"],
  ["SCHEDULE\ncron jobs: fire an agent or a whole\npipeline on a timer (e.g. weekdays\n9:00) — fully unattended", COLORS.ai, "clock"],
  ["MEMORY\nbrowse & search everything the\nsystem knows. hybrid search =\nmeaning + keywords together", COLORS.data, "search"],
  ["TERMINALS\na full interactive claude session\ninside the app (xterm) —\ndetach & reattach live", COLORS.ai, "terminal"],
  ["SETTINGS\nvault path, service info,\nhealth details", COLORS.ui, "gear"],
];
pages.forEach((p, i) => {
  const col = i % 4;
  const row = Math.floor(i / 4);
  box(40 + col * 360, 620 + row * 146, 330, 120, p[0], p[1], 13.5, p[2]);
});

// ─────────────── section 3: run lifecycle ────────────────
txt(40, 1100, "3 · WHAT HAPPENS WHEN AN AGENT RUNS — the core loop", 26, "#7048e8");

const trigBoxes = [
  ["YOU press ▶\n(Runs / Agents / Task Board)", COLORS.ui, "person"],
  ["a task is assigned\nto an agent", COLORS.core, "kanban"],
  ["a message is sent\nto an agent", COLORS.core, "envelope"],
  ["cron fires /\npipeline step starts", COLORS.core, "clock"],
].map((t, i) => box(40, 1180 + i * 84, 250, 68, t[0], t[1], 13, t[2]));

const stepDefs = [
  ["RUN CREATED (queued)\nrow in the DB, appears in\nthe Runs page instantly.\none run per agent at a time", COLORS.core, "play"],
  ["MEMORY INJECTED\nvault hybrid-searched with\nthe prompt; best notes are\nprepended as a <memory>\nblock (audited on the run)", COLORS.data, "docs"],
  ["CLI SPAWNED\nclaude -p headless,\nprompt via stdin,\nstreams JSON events\nline by line", COLORS.ai, "robot"],
  ["EVERYTHING RECORDED\nevery event → DB + pushed\nover WebSocket = the live\ntranscript you watch", COLORS.core, "gauge"],
  ["RESULT EXTRACTED\nfinal text, $ cost, turns,\nsession id (lets you resume\nthe conversation later)", COLORS.core, "chip"],
  ["POST-RUN CLEANUP\napply handoff directives,\nclose the task (done/review/\nfailed), rescan the vault", COLORS.hot, "gear"],
];
const steps = stepDefs.map((s, i) => box(360 + i * 305, 1180, 270, 145, s[0], s[1], 13, s[2]));

trigBoxes.forEach((t) => arrow(...R(t), ...L(steps[0])));
for (let i = 0; i < steps.length - 1; i++) arrow(...R(steps[i]), ...L(steps[i + 1]));

const toolbox = box(
  820,
  1430,
  580,
  130,
  "WHILE RUNNING, THE AGENT HAS TOOLS (MCP over HTTP):\nmemory_search / memory_save → use & grow the vault\ntask_create / task_update → hand off & report work\nmessage_send → message you or another agent",
  COLORS.ai,
  14,
  "robot",
);
arrow(steps[2].x + 135, 1325, 1110, 1430, { both: true, label: "tool calls", labelAt: [1130, 1370], color: "#7048e8" });

const outcomes = [
  ["task shows DONE\n+ result summary", "kanban"],
  ["reply lands in\nyour inbox", "envelope"],
  ["next pipeline\nstep starts", "pipeline"],
].map((t, i) => box(2210, 1180 + i * 92, 240, 72, t[0], COLORS.hot, 13, t[1]));
outcomes.forEach((o) => arrow(...R(steps[5]), ...L(o)));

// ─────────────────── section 4: memory ───────────────────
txt(40, 1640, "4 · MEMORY — how the system remembers (and why Obsidian)", 26, "#2f9e44");

const drop = box(
  40,
  1710,
  290,
  110,
  "YOU drop files\nany .md into the vault\n(Explorer / Obsidian) —\nindexed within seconds",
  COLORS.ui,
  14,
  "docs",
);
const save = box(
  40,
  1860,
  290,
  110,
  "AGENTS save notes\nmemory_save writes clean\n.md with frontmatter\n(scope, tags, source)",
  COLORS.ai,
  14,
  "robot",
);
const vaultD = box(
  410,
  1770,
  310,
  150,
  "VAULT FOLDERS = WHO SEES IT\nglobal\\ → all agents\nprojects\\<slug>\\ → that project\nagents\\<slug>\\ → private\ninbox\\ → your unsorted drops",
  COLORS.data,
  14,
  "folder",
);
const indexer = box(
  800,
  1770,
  290,
  150,
  "WATCHER + INDEXER\nspots changes in seconds,\nsplits notes into chunks,\nskips unchanged files\n(content hash)",
  COLORS.core,
  14,
  "gear",
);
const idx = box(
  1170,
  1770,
  300,
  150,
  "TWO INDEXES, FUSED\n• meaning — vectors from a\n  local model (stays private)\n• keywords — FTS5\nRRF fusion = hybrid search",
  COLORS.data,
  14,
  "database",
);
const cons = box(
  1550,
  1755,
  330,
  180,
  "WHO USES SEARCH\n• every run start (auto-context)\n• agents' memory_search tool\n• YOU on the Memory page\nsame ranked results for all",
  COLORS.ui,
  14,
  "search",
);
arrow(...R(drop), 410, 1810);
arrow(...R(save), 410, 1890);
arrow(...R(vaultD), ...L(indexer));
arrow(...R(indexer), ...L(idx));
arrow(...R(idx), ...L(cons));
txt(
  410,
  1965,
  "Everything is plain markdown on disk — edit freely in Obsidian; nothing is locked inside a database.",
  14,
  "#868e96",
);

// ───────────── section 5: putting it together ────────────
txt(40, 2070, "5 · PUTTING IT TOGETHER — a day with Sparstrowgen", 26, "#f08c00");

const row1 = [
  ["9:00 — CRON FIRES\n'Morning brief' schedule.\nno window open — the\ntray app is enough", COLORS.core, "clock"],
  ["RESEARCHER AGENT\npipeline step 1: pulls\nproject memory,\ngathers findings", COLORS.ai, "robot"],
  ["WRITER AGENT\ngets researcher's output\nas {{input}}, drafts\nthe brief", COLORS.ai, "robot"],
  ["REVIEWER AGENT\npolishes the draft, then\nmessage_send → you", COLORS.ai, "robot"],
  ["YOUR INBOX\n'Morning brief ready' —\nevery step auditable\nin Runs", COLORS.ui, "envelope"],
].map((t, i) => box(40 + i * 350, 2140, 290, 120, t[0], t[1], 13.5, t[2]));
for (let i = 0; i < row1.length - 1; i++) arrow(...R(row1[i]), ...L(row1[i + 1]));

const row2 = [
  ["YOU create a task\n'analyse competitor\npricing', assign it to\nthe Analyst agent", COLORS.ui, "person"],
  ["ANALYST RUNS\nworks the task, saves\nkey findings to project\nmemory (memory_save)", COLORS.ai, "robot"],
  ["HANDS OFF\ntask_create → assigns\nthe calculation to the\nSheet agent", COLORS.ai, "pipeline"],
  ["SHEET AGENT finishes\ntask_update done +\nresult summary", COLORS.ai, "robot"],
  ["TASK BOARD\nshows it in Review →\nyou approve. knowledge\npersists for future runs", COLORS.ui, "kanban"],
].map((t, i) => box(40 + i * 350, 2310, 290, 120, t[0], t[1], 13.5, t[2]));
for (let i = 0; i < row2.length - 1; i++) arrow(...R(row2[i]), ...L(row2[i + 1]));

txt(
  40,
  2490,
  "Run it:  pnpm --filter @sparstrow/desktop start  (window + tray)   ·   or any browser at http://127.0.0.1:48750   ·   vault: C:\\Sparstrow\\memory",
  15,
  "#868e96",
);

// legend
txt(1880, -20, "COLOR + ICON KEY", 18, "#343a40");
[
  ["you / screens", COLORS.ui, "person"],
  ["desktop + core", COLORS.core, "chip"],
  ["stored data", COLORS.data, "database"],
  ["agents & models", COLORS.ai, "robot"],
  ["outcomes", COLORS.hot, "play"],
].forEach((l, i) => box(1880, 30 + i * 64, 230, 44, l[0], l[1], 13, l[2]));

// Render every queued icon last so glyphs sit on top of the boxes.
drawBadges();

// ───────────────────────── write ─────────────────────────
const doc = {
  type: "excalidraw",
  version: 2,
  source: "https://excalidraw.com",
  elements,
  appState: { viewBackgroundColor: "#ffffff", gridSize: 20 },
  files: {},
};
fs.writeFileSync(OUT, JSON.stringify(doc, null, 2));
console.log(`wrote ${OUT} with ${elements.length} elements`);
