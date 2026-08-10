import { registerRoute, ok, HandlerContext } from "../router";
import { SystemHealth, FactoryHealth, FactoryHealthCheck } from "@sparstrow/shared";

registerRoute({
  method: "GET",
  pattern: "/system/health",
  handler: async ({ supabase, workspaceId }: HandlerContext) => {
    // "GET /system/health derived from runtimes: total count, online count, most recent last_heartbeat, 
    // and per-runtime { id, name, os, status, capabilities }"
    
    const { data: runtimes, error } = await supabase
      .from("runtimes")
      .select("*")
      .eq("workspace_id", workspaceId);
    if (error) throw error;

    const now = Date.now();
    const onlineRuntimes = (runtimes || []).filter(rt => {
      if (!rt.last_heartbeat) return false;
      const hb = new Date(rt.last_heartbeat).getTime();
      return (now - hb) < 60_000 * 2; // say 2 mins online threshold
    });

    // Merge capabilities for providers
    const providers: any[] = [];
    let latestHeartbeat: number | null = null;

    for (const rt of onlineRuntimes) {
      if (rt.last_heartbeat) {
        const hb = new Date(rt.last_heartbeat).getTime();
        if (!latestHeartbeat || hb > latestHeartbeat) {
          latestHeartbeat = hb;
        }
      }
      
      const caps = rt.capabilities || {};
      if (Array.isArray(caps.providers)) {
        for (const p of caps.providers) {
          if (!providers.find(existing => existing.id === p.id)) {
            providers.push(p);
          }
        }
      }
    }

    const health: SystemHealth & { total_count: number; online_count: number; last_heartbeat: string | null; runtimes: any[] } = {
      ok: onlineRuntimes.length > 0,
      version: "cloud-v1",
      uptimeMs: latestHeartbeat ? now - latestHeartbeat : 0,
      db: { ok: true, path: "cloud-postgres" },
      vault: { ok: onlineRuntimes.length > 0, path: "runtime-reported" },
      providers,
      embedder: { ok: onlineRuntimes.length > 0, ready: onlineRuntimes.length > 0, model: "runtime-reported", detail: null },
      search: { vec: false, fts: true },
      
      // additional fields T-M2-07 says to derive
      total_count: runtimes?.length || 0,
      online_count: onlineRuntimes.length,
      last_heartbeat: latestHeartbeat ? new Date(latestHeartbeat).toISOString() : null,
      runtimes: (runtimes || []).map(rt => ({
        id: rt.id,
        name: rt.name,
        os: rt.os,
        status: rt.status,
        capabilities: rt.capabilities
      }))
    };

    return ok(health);
  }
});

registerRoute({
  method: "GET",
  pattern: "/system/factory-health",
  handler: async ({ supabase, workspaceId }: HandlerContext) => {
    // GET /system/factory-health — same source, aggregate shape
    const { data: runtimes, error } = await supabase
      .from("runtimes")
      .select("*")
      .eq("workspace_id", workspaceId);
    if (error) throw error;

    const now = Date.now();
    const onlineRuntimes = (runtimes || []).filter(rt => {
      if (!rt.last_heartbeat) return false;
      const hb = new Date(rt.last_heartbeat).getTime();
      return (now - hb) < 60_000 * 2;
    });

    const isArmed = onlineRuntimes.length > 0;
    const checks: FactoryHealthCheck[] = [
      {
        id: "runtime",
        label: "Daemon Runtime",
        status: isArmed ? "ok" : "degraded",
        detail: isArmed ? `${onlineRuntimes.length} online` : "No paired machines online"
      }
    ];

    const factoryHealth: FactoryHealth = {
      armed: isArmed,
      checks
    };

    return ok(factoryHealth);
  }
});
