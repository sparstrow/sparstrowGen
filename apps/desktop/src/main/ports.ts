/**
 * Which ports THIS install uses.
 *
 * Two installs of this app on one machine (the one the owner uses, and the
 * `dev` channel an agent builds for testing) must not share a port. They did,
 * and the failure mode is worse than a crash: the second app finds the first
 * one's server already listening, ADOPTS it as its own, and then operates on
 * the other install's data believing it is its own. `service-manager.ts`
 * carried a comment about this hazard against the old Staging channel for
 * weeks without it being closed; this module closes it.
 *
 * ## Why these are functions and not constants
 *
 * `core-client.ts` and `service-manager.ts` used to hold
 * `const CORE_URL = process.env.SPARSTROW_CORE_URL ?? "http://127.0.0.1:48750"`
 * at module scope. `main.ts` imports both of those on lines 3 and 6, and does
 * not call `applyPackagedEnv()` until line 52 — so the constants were always
 * frozen to the default BEFORE any per-install configuration had been read.
 * Setting an env var from the channel config could never have worked; the
 * value was already captured. Anything resolved from per-install config has to
 * be read lazily, which is why every export here is a function.
 */

export interface Ports {
  /** The daemon (agent runtime) on this machine. */
  core: number;
  /** `server/`, the API every client on this machine talks to. */
  server: number;
}

/**
 * The ports a build uses when nothing overrides them.
 *
 * `stable` MUST keep 8080/48750: an already-installed build is using them, and
 * changing these would leave that install talking to nothing. `dev` is offset
 * by 100 rather than picked at random so a stray listener is recognisable from
 * the port number alone.
 */
export const CHANNEL_PORTS = {
  stable: { core: 48750, server: 8080 },
  dev: { core: 48850, server: 8180 },
} as const satisfies Record<string, Ports>;

/**
 * The default ports for a channel name, falling back to stable's.
 *
 * An install whose `channel.json` is missing or unreadable must keep the
 * behaviour it had rather than move to a new port and lose its own daemon, so
 * the unknown case resolves to stable rather than throwing.
 */
export function portsForChannel(name: string | undefined): Ports {
  if (name && name in CHANNEL_PORTS) return CHANNEL_PORTS[name as keyof typeof CHANNEL_PORTS];
  return CHANNEL_PORTS.stable;
}

/**
 * Unpackaged runs keep the stable ports because the repo's own dev tooling
 * (`make up`, `pnpm dev:up`) is wired to them. An agent testing side-by-side
 * installs uses the packaged `dev` channel, not `pnpm dev:desktop`.
 */
const DEFAULT_PORTS: Ports = CHANNEL_PORTS.stable;

let ports: Ports = DEFAULT_PORTS;

/**
 * Called once at startup, from `packaged-env.ts`, with this install's baked
 * channel ports. Must run before anything calls the URL getters below —
 * which, because they are lazy, is achievable, and was not before.
 */
export function setPorts(next: Ports): void {
  ports = next;
}

export function corePort(): number {
  return ports.core;
}

export function serverPort(): number {
  return ports.server;
}

/**
 * The daemon's base URL. An explicit `SPARSTROW_CORE_URL` still wins — that is
 * the override an operator reaches for, and it is read on every call rather
 * than captured, for the same reason the rest of this module is lazy.
 */
export function coreBaseUrl(): string {
  return process.env.SPARSTROW_CORE_URL ?? `http://127.0.0.1:${ports.core}`;
}

/** `server/`'s base URL, with the same override rule. */
export function serverBaseUrl(): string {
  return process.env.SPARSTROW_SERVER_URL ?? `http://127.0.0.1:${ports.server}`;
}
