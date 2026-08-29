import { registerRoute, ok, HandlerContext } from "../router";

/**
 * T-CS4-01. Reads this workspace's cached model list for a provider
 * (`provider_model_cache`, written only by `record_provider_models` —
 * T-CS3-03/`024_provider_model_dispatch.sql`). A real, cloud-side read, not
 * host-local — deliberately its own literal route rather than falling under
 * `/providers/(.*)` in stubs.ts, which covers provider management that
 * genuinely does run on the daemon (`stubs.ts`'s own `hostLocalPatterns`).
 * `router.ts`'s specificity ordering plus this module's earlier import in
 * `handlers/index.ts` (stubs registered last) is what lets this literal
 * path win over that wildcard.
 */
registerRoute({
  method: "GET",
  pattern: "/providers/model-cache",
  handler: async ({ supabase, workspaceId, searchParams }: HandlerContext) => {
    const provider = searchParams.get("provider");
    if (!provider) return ok(null);

    const { data, error } = await supabase
      .from("provider_model_cache")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("provider", provider)
      .maybeSingle();
    if (error) throw error;
    return ok(data);
  },
});
