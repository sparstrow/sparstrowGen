import type { SupabaseClient } from "@supabase/supabase-js";
import type { RealtimeCredential } from "@sparstrow/shared";
import { supabaseAnonKey, supabaseUrl } from "@web/utils/supabase/env";
import { daemonDb } from "./auth";

/**
 * T-M16-02, rewritten by `T-DI-03` — mints the credential a paired daemon
 * presents to Supabase Realtime. One route (`/api/daemon/realtime/token`)
 * calls this; nothing else should.
 *
 * ─── Why this no longer signs anything ───────────────────────────────────────
 *
 * The original implementation signed its own ES256 JWT with the project's
 * private signing key, read from `SUPABASE_JWT_SIGNING_KEY`. **That key does
 * not exist to be read.** Supabase never exposes the private half of an
 * asymmetric signing key — confirmed 2026-08-27 in the dashboard on both the
 * current key and a freshly created standby one, neither offering an export or
 * a one-time reveal. There was never a value to put in that variable.
 *
 * The token was also unusable for a second, independent reason: it deliberately
 * carried no `sub`, and `018_terminal_channels.sql`'s policies resolve the
 * caller through `workspace_members` keyed on `auth.uid()`. No `sub` ⇒ null
 * `auth.uid()` ⇒ refused, however it was signed.
 *
 * So: **Supabase mints the token now, for an identity that owns exactly one
 * machine.** See doc/plans/2026-08-27-the-daemon-gets-a-real-identity.md
 * (DI-1, DI-3, DI-4) and `019_daemon_realtime_identity.sql`.
 *
 * ─── What that identity can reach ────────────────────────────────────────────
 *
 * Nothing, except its own machine's two Realtime topics. It is never inserted
 * into `workspace_members`, so `private.current_workspace_ids()` is empty for
 * it and every table policy denies it exactly as it denies an anonymous
 * caller. `020_bootstrap_refuses_daemon.sql` closes the one function that
 * would otherwise serve a member-less caller.
 */

/**
 * The synthetic address a daemon identity is registered under.
 *
 * Deliberately unmistakable in the Supabase dashboard's Auth → Users list,
 * where these rows DO appear and where someone will eventually wonder what they
 * are. `.invalid` is reserved by RFC 2606 precisely so it can never be a real
 * domain — nothing can be sent here even by accident, which matters because
 * this project's mailer is capped and org-only (`D-14`).
 */
export function daemonIdentityEmail(runtimeId: string): string {
  return `daemon+${runtimeId}@runtime.sparstrow.invalid`;
}

interface DaemonIdentityRow {
  user_id: string;
}

/**
 * Resolve this machine's auth identity, creating it on first use.
 *
 * **Lazily, here, rather than at pairing** (DI-4): every machine paired before
 * this shipped gets an identity the next time it asks for a credential, with no
 * migration and no owner action. It also keeps `redeem_pairing_code`'s
 * single-transaction guarantee untouched, which a pairing-time Auth API call
 * would have straddled.
 */
async function resolveIdentity(
  db: SupabaseClient,
  workspaceId: string,
  runtimeId: string,
): Promise<{ userId: string; email: string }> {
  const email = daemonIdentityEmail(runtimeId);

  const { data: existing, error: readError } = await db
    .from("daemon_identities")
    .select("user_id")
    .eq("runtime_id", runtimeId)
    .maybeSingle<DaemonIdentityRow>();
  if (readError) throw readError;
  if (existing) return { userId: existing.user_id, email };

  // `email_confirm: true` because this project has confirmation ON and a capped,
  // org-only mailer — an unconfirmed identity would be one that can never sign
  // in, waiting on mail that will never arrive.
  //
  // The daemon flag goes in `app_metadata`, never `user_metadata`: the latter is
  // user-editable and unsafe for anything authorization-shaped. Nothing here
  // reads it — authorization goes through `daemon_identities` — but putting it
  // anywhere else would invite a future reader to trust it.
  const { data: created, error: createError } = await db.auth.admin.createUser({
    email,
    email_confirm: true,
    app_metadata: { sparstrow_daemon: true, runtime_id: runtimeId, workspace_id: workspaceId },
  });
  if (createError || !created?.user) {
    throw createError ?? new Error("could not create the daemon identity");
  }

  // `runtime_id` is UNIQUE, so two simultaneous first requests from one machine
  // race here rather than producing two mappings. The loser's insert conflicts,
  // it re-reads, and both callers proceed on the winner's identity — the auth
  // user the loser created is left orphaned and inert (`I-14`), which is the
  // same end state as a machine that was unpaired.
  const { error: insertError } = await db.from("daemon_identities").insert({
    user_id: created.user.id,
    runtime_id: runtimeId,
    workspace_id: workspaceId,
  });

  if (insertError) {
    const { data: raced } = await db
      .from("daemon_identities")
      .select("user_id")
      .eq("runtime_id", runtimeId)
      .maybeSingle<DaemonIdentityRow>();
    if (raced) return { userId: raced.user_id, email: daemonIdentityEmail(runtimeId) };
    throw insertError;
  }

  return { userId: created.user.id, email };
}

/**
 * Mint a real Supabase session for one machine.
 *
 * `generateLink` does NOT send mail — it exists to hand a link to a custom
 * email provider, which is exactly the property relied on here (verified
 * against current docs, 2026-08-27; re-check it if this ever starts generating
 * bounces). `verifyOtp` then turns the returned hash into a session, so no
 * reusable secret is ever stored for this identity.
 *
 * The alternative rejected: storing a generated password on the mapping row and
 * calling `signInWithPassword`. It works, and it leaves a reusable plaintext
 * credential in a table forever — strictly worse than a hash that lives for the
 * duration of one request.
 */
export async function mintRealtimeToken({
  workspaceId,
  runtimeId,
}: {
  workspaceId: string;
  runtimeId: string;
}): Promise<RealtimeCredential> {
  const db = daemonDb();
  const { email } = await resolveIdentity(db, workspaceId, runtimeId);

  const { data: link, error: linkError } = await db.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkError || !link?.properties?.hashed_token) {
    throw linkError ?? new Error("could not generate a sign-in token for the daemon identity");
  }

  const { data: session, error: verifyError } = await db.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: "magiclink",
  });
  if (verifyError || !session?.session) {
    throw verifyError ?? new Error("could not establish a session for the daemon identity");
  }

  const { access_token: token, expires_at: expiresAtSeconds } = session.session;
  if (!expiresAtSeconds) {
    // Without this the daemon has no refresh timer and would hold the
    // credential until Realtime rejected it. Failing here is louder and
    // earlier than a connection that silently dies in an hour.
    throw new Error("Supabase returned a session with no expires_at");
  }

  return {
    token,
    expiresAt: new Date(expiresAtSeconds * 1000).toISOString(),
    supabaseUrl: supabaseUrl(),
    supabaseAnonKey: supabaseAnonKey(),
  };
}
