import { registerRoute, ok, HandlerContext } from "../router";
import {
  isRuntimeOnline,
  type FactoryHealth,
  type FactoryHealthCheck,
  type ProviderHealth,
  type SystemHealth,
} from "@sparstrow/shared";

/**
 * Health, derived from `runtimes`.
 *
 * Liveness comes from `last_heartbeat` age via the shared `isRuntimeOnline`,
 * never from `runtimes.status`. A machine that crashes writes nothing, so a
 * stored status stays whatever it was when the machine was last healthy —
 * `status` carries only what a daemon deliberately declares about itself
 * (`draining` at shutdown). See doc/tasks/M3/README.md decision 4.
 */

type RuntimeRow = {
  id: string;
  name: string;
  os: string;
  status: string;
  capabilities: unknown;
  last_heartbeat: string | null;
};

async function loadRuntimes(
  supabase: HandlerContext["supabase"],
  workspaceId: string,
): Promise<RuntimeRow[]> {
  const { data, error } = await supabase
    .from("runtimes")
    .select("id, name, os, status, capabilities, last_heartbeat")
    .eq("workspace_id", workspaceId);
  if (error) throw error;
  return (data ?? []) as RuntimeRow[];
}

/**
 * `runtimes.capabilities` is a jsonb array of provider ids — what M3's probe
 * writes (`["claude-code", "ollama"]`). It is read defensively because a row
 * written before M3, or by a future daemon, may not match; an unexpected shape
 * should show as "no capabilities", not throw inside a health endpoint.
 */
function capabilityIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

registerRoute({
  method: "GET",
  pattern: "/system/health",
  handler: async ({ supabase, workspaceId }: HandlerContext) => {
    const runtimes = await loadRuntimes(supabase, workspaceId);
    const now = Date.now();
    const online = runtimes.filter((rt) => isRuntimeOnline(rt.last_heartbeat, now));

    // Union of what every online machine can run. A provider is available to
    // this workspace if any live machine offers it.
    const providerIds = [...new Set(online.flatMap((rt) => capabilityIds(rt.capabilities)))];
    // A capability list is all the cloud has: the daemon reports which
    // providers passed its own healthCheck, not their versions or auth state.
    // `version`/`authenticated` are null rather than invented — a machine-local
    // detail the control plane genuinely does not know.
    const providers = providerIds.map(
      (id): ProviderHealth => ({
        id,
        ok: true,
        version: null,
        authenticated: null,
        detail: "reported by a paired machine",
      }),
    );

    const latestHeartbeat = online.reduce<number | null>((latest, rt) => {
      if (!rt.last_heartbeat) return latest;
      const beat = new Date(rt.last_heartbeat).getTime();
      if (Number.isNaN(beat)) return latest;
      return latest === null || beat > latest ? beat : latest;
    }, null);

    const anyOnline = online.length > 0;
    const health: SystemHealth & {
      totalCount: number;
      onlineCount: number;
      lastHeartbeat: string | null;
      runtimes: Array<{
        id: string;
        name: string;
        os: string;
        status: string;
        capabilities: string[];
        online: boolean;
        lastHeartbeat: string | null;
      }>;
    } = {
      ok: anyOnline,
      version: "cloud-v1",
      // Time since the most recent beat — "how fresh is this picture", which is
      // the only uptime the cloud can honestly report. It does not know how
      // long any machine has been up.
      uptimeMs: latestHeartbeat ? now - latestHeartbeat : 0,
      db: { ok: true, path: "cloud-postgres" },
      vault: { ok: anyOnline, path: "runtime-reported" },
      providers,
      embedder: {
        ok: anyOnline,
        ready: anyOnline,
        model: "runtime-reported",
        detail: null,
      },
      search: { vec: false, fts: true },

      totalCount: runtimes.length,
      onlineCount: online.length,
      lastHeartbeat: latestHeartbeat ? new Date(latestHeartbeat).toISOString() : null,
      runtimes: runtimes.map((rt) => ({
        id: rt.id,
        name: rt.name,
        os: rt.os,
        status: rt.status,
        capabilities: capabilityIds(rt.capabilities),
        online: isRuntimeOnline(rt.last_heartbeat, now),
        lastHeartbeat: rt.last_heartbeat,
      })),
    };

    return ok(health);
  },
});

registerRoute({
  method: "GET",
  pattern: "/system/factory-health",
  handler: async ({ supabase, workspaceId }: HandlerContext) => {
    const runtimes = await loadRuntimes(supabase, workspaceId);
    const now = Date.now();
    const online = runtimes.filter((rt) => isRuntimeOnline(rt.last_heartbeat, now));
    const armed = online.length > 0;

    const checks: FactoryHealthCheck[] = [
      {
        id: "runtime",
        label: "Daemon Runtime",
        status: armed ? "ok" : "degraded",
        detail: armed
          ? `${online.length} of ${runtimes.length} machine(s) online`
          : runtimes.length === 0
            ? "No machines paired yet"
            : "No paired machines are online",
      },
    ];

    const factoryHealth: FactoryHealth = { armed, checks };
    return ok(factoryHealth);
  },
});
