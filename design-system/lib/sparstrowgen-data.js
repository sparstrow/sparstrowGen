/**
 * Shared seed data for Sparstrowgen prototypes.
 *
 * One fake workspace, reused by every prototype, so a reviewer can follow the
 * same machine/run/agent across screens instead of each prototype inventing
 * its own placeholder rows. Field names mirror the real schema
 * (packages/shared/src/db/schema.ts) deliberately — a prototype that renames
 * `lastHeartbeat` to `lastSeen` "for readability" is a prototype whose handoff
 * lies about the data contract.
 */

// ─── runtimes (packages/shared/src/db/schema.ts `runtimes` table) ────────────
// status is the RAW three-value enum the schema actually stores
// (online | busy | offline). The UI vocabulary in the Machines spec collapses
// this to two states — active / unreachable — via `runtimeIsActive()` below,
// exactly like the real RuntimesCard's `runtime.online` boolean already does.

export const runtimes = [
  {
    id: "rt_9f2c1a4b",
    name: "workshop-desktop",
    os: "win32",
    hostname: "DESKTOP-7QK2R1",
    isElectron: true,
    capabilities: ["claude-code", "antigravity"],
    status: "online",
    coreVersion: "0.14.2",
    lastHeartbeat: minutesAgo(0),
  },
  {
    id: "rt_2d81ffe0",
    name: "office-mac-mini",
    os: "darwin",
    hostname: "sparstrow-mini.local",
    isElectron: false,
    capabilities: ["claude-code", "ollama"],
    status: "busy",
    coreVersion: "0.14.2",
    lastHeartbeat: minutesAgo(0),
  },
  {
    id: "rt_1a77c903",
    name: "build-server",
    os: "linux",
    hostname: "sparstrow-ci-01",
    isElectron: false,
    capabilities: ["claude-code"],
    status: "offline",
    coreVersion: "0.13.9",
    lastHeartbeat: minutesAgo(52),
  },
  {
    id: "rt_5be00a12",
    name: "laptop-francesca",
    os: "darwin",
    hostname: "Francescas-MacBook-Pro.local",
    isElectron: true,
    capabilities: [],
    status: "draining",
    coreVersion: "0.14.1",
    lastHeartbeat: minutesAgo(1),
  },
];

/** Mirrors the real UI's runtime.online boolean — see runtimes-card.tsx. */
export function runtimeIsActive(runtime) {
  return runtime.status === "online" || runtime.status === "busy";
}

// ─── pairing (packages/shared/src/db/schema.ts `pairing_codes` table) ────────

export const examplePairingCode = {
  code: "WBXK-2947",
  expiresAt: new Date(Date.now() + 4 * 60 * 1000 + 12 * 1000).toISOString(),
};

// ─── workspace / profile (US2 — setup guide, referenced but not this prototype's focus) ──

export const workspace = {
  id: "ws_northlight",
  name: "Northlight Robotics",
  slug: "northlight-robotics",
};

function minutesAgo(n) {
  return new Date(Date.now() - n * 60_000).toISOString();
}
