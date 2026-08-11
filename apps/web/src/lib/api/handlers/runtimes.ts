import { randomBytes } from "node:crypto";
import { isRuntimeOnline } from "@sparstrow/shared";
import { registerRoute, ok, fail, HandlerContext } from "../router";

/**
 * M3 — the browser's side of pairing.
 *
 * Ordinary session-cookie handlers, unlike `/api/daemon/*`: these run as the
 * signed-in user, so RLS does the work. `pairing_codes_own_insert` already
 * requires `created_by_user_id = auth.uid()` plus workspace membership, and
 * `runtimes_member_all` scopes the machine list.
 */

/**
 * Code alphabet, chosen for being read aloud and retyped on another machine.
 *
 * No 0/O, no 1/I/L — the confusable pairs someone will get wrong when copying
 * a code from a laptop screen to a desktop terminal. Excluding them costs
 * entropy per character, so length makes it back: 10 characters of this
 * 30-symbol alphabet is ~49 bits, and codes die after 10 minutes and one use.
 */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 10;
const CODE_TTL_MS = 10 * 60 * 1000;

function generateCode(): string {
  // rejection-free: 31 symbols does not divide 256 evenly, so a naive modulo
  // biases toward early characters. Draw a byte per character and reject the
  // tail rather than skewing the distribution of a credential.
  const limit = Math.floor(256 / ALPHABET.length) * ALPHABET.length;
  let out = "";
  while (out.length < CODE_LENGTH) {
    for (const byte of randomBytes(CODE_LENGTH)) {
      if (byte >= limit) continue;
      out += ALPHABET[byte % ALPHABET.length];
      if (out.length === CODE_LENGTH) break;
    }
  }
  return `${out.slice(0, 5)}-${out.slice(5)}`;
}

registerRoute({
  method: "POST",
  pattern: "/pairing-codes",
  handler: async ({ supabase, workspaceId }: HandlerContext) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return fail(401, "not authenticated");

    const code = generateCode();
    const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();

    const { error } = await supabase.from("pairing_codes").insert({
      code,
      workspace_id: workspaceId,
      created_by_user_id: user.id,
      expires_at: expiresAt,
    });
    if (error) throw error;

    // Returned once, to the person who asked for it. Nothing reads a pairing
    // code back out afterwards — the list endpoint below deliberately has no
    // way to recover one.
    return ok({ code, expiresAt });
  },
});

registerRoute({
  method: "GET",
  pattern: "/runtimes",
  handler: async ({ supabase, workspaceId }: HandlerContext) => {
    const { data, error } = await supabase
      .from("runtimes")
      .select("id, name, os, hostname, is_electron, capabilities, status, core_version, last_heartbeat, created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true });
    if (error) throw error;

    const now = Date.now();
    // `online` is computed here, not read from `status`. A machine that
    // crashes writes nothing, so its stored status stays whatever it was when
    // it was last healthy. See doc/tasks/M3/README.md decision 4.
    return ok(
      (data ?? []).map((rt) => ({
        ...rt,
        online: isRuntimeOnline(rt.last_heartbeat as string | null, now),
      })),
    );
  },
});

registerRoute({
  method: "PATCH",
  pattern: "/runtimes/:id",
  handler: async ({ supabase, workspaceId, params, body }: HandlerContext) => {
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name) return fail(400, "name is required");

    // Only `name`. Everything else on a runtime is self-reported by the daemon
    // on every boot, so a value written here would be silently overwritten the
    // next time that machine restarts — which looks like the edit not saving.
    const { data, error } = await supabase
      .from("runtimes")
      .update({ name })
      .eq("id", params.id)
      .eq("workspace_id", workspaceId)
      .select()
      .single();
    if (error) throw error;
    if (!data) return fail(404, "Not Found");
    return ok(data);
  },
});

registerRoute({
  method: "DELETE",
  pattern: "/runtimes/:id/token",
  handler: async ({ supabase, workspaceId, params }: HandlerContext) => {
    // Revoke, not delete: the history of which machine was paired when is
    // worth keeping, the daemon API checks `revoked_at` on every request so
    // this takes effect immediately, and deleting the row would orphan the
    // runtime it points at.
    const { data, error } = await supabase
      .from("daemon_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("runtime_id", params.id)
      .eq("workspace_id", workspaceId)
      .is("revoked_at", null)
      .select("id");
    if (error) throw error;

    // `.select()` after the update is what makes a no-op distinguishable. A
    // filtered update against another workspace's runtime affects zero rows
    // and would otherwise report success -- the same false-204 bug M2 found
    // across eleven DELETE handlers.
    if (!data || data.length === 0) {
      return fail(404, "No active pairing found for that machine.");
    }
    return ok({ revoked: data.length });
  },
});

registerRoute({
  method: "DELETE",
  pattern: "/runtimes/:id",
  handler: async ({ supabase, workspaceId, params }: HandlerContext) => {
    const { data, error } = await supabase
      .from("runtimes")
      .delete()
      .eq("id", params.id)
      .eq("workspace_id", workspaceId)
      .select("id");
    if (error) throw error;
    if (!data || data.length === 0) return fail(404, "Not Found");
    return ok({ deleted: data.length });
  },
});
