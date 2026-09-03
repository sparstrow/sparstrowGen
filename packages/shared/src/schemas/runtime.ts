/**
 * What `GET /runtimes` returns — a machine as this workspace sees it.
 *
 * Moved here from `apps/web/src/api/hooks.ts` by restructure Phase 2, where it
 * had been declared inline. It is the response contract for a route in
 * `server/`, so a client was the one place it could not live: `packages/core`
 * needs it, `apps/desktop` will need it, and a second declaration is a second
 * contract.
 */

/**
 * A machine paired to this workspace.
 *
 * `online` is derived server-side from `lastHeartbeat` age — **never read
 * `status` for liveness.** A machine that dies writes nothing, so a stored
 * `online` stays `online` forever; only the heartbeat's age is evidence. See
 * `isRuntimeOnline` in `../cloud.ts`.
 */
export interface Runtime {
  id: string;
  name: string;
  os: string;
  hostname: string;
  isElectron: boolean;
  capabilities: string[];
  status: string;
  coreVersion: string | null;
  lastHeartbeat: string | null;
  createdAt: string;
  online: boolean;
  /**
   * What the machine last CONFIRMED about its remotely-settable settings.
   * Written only by the daemon, so a switch rendered from this is showing an
   * acked value rather than a hopeful one — including when it was flipped in
   * that machine's own local Settings card. M4 / `G-6`.
   */
  reportedSettings: Record<string, string>;
  /**
   * The physical computer this runtime lives on. The same machine appears once
   * per workspace its owner belongs to, so this is what identifies two rows in
   * two workspaces as one piece of hardware — and what the desktop shell
   * matches against to badge a row "This device".
   */
  machineId: string;
}

/** A project as this machine reports having it. */
export interface RuntimeProject {
  runtimeId: string;
  projectId: string;
  localPath: string | null;
  /** bound | missing | cloning | error */
  state: string;
  detail: string | null;
  lastSeen: string | null;
}
