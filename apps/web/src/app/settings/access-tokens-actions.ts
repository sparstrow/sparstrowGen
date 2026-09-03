"use server";

import { revalidatePath } from "next/cache";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  actionContext,
  actionErrorFrom,
  actionFail,
  actionOk,
  NOT_SIGNED_IN,
  type ActionResult,
} from "@web/lib/action-result";

/**
 * Access tokens — what can act as this person, and the page that says so.
 *
 * These run as the signed-in user, deliberately. Minting a credential for
 * yourself is ordinary member-scoped table access under RLS
 * (`access_tokens_owner_insert`, policies/033), not something needing the
 * service role — and keeping the service role out means a bug here cannot
 * mint a token for somebody else.
 *
 * The raw token is generated here, returned exactly once, and never stored:
 * only its sha256 reaches the database. There is no path that can show it
 * again, which is why `createAccessTokenAction`'s caller has to be written as
 * if this were the only chance — because it is.
 *
 * Why this page is not optional: the owner chose non-expiring tokens
 * (spec Assumption 3), and a credential with no expiry and no visible list is
 * one that can outlive the laptop it was created on. See
 * `doc/security/SEC-2026-09-02-daemon-credential-widened-to-person-scope.md`.
 */

export type AccessTokenRow = {
  id: string;
  name: string;
  machineId: string | null;
  machineName: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

/** 32 bytes of CSPRNG, prefixed so a leaked string is recognisable in a log. */
function mintToken(): string {
  return `spg_${randomBytes(32).toString("base64url")}`;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

type TokenSelectRow = {
  id: string;
  name: string;
  machine_id: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
  machines: { name: string } | { name: string }[] | null;
};

function toRow(row: TokenSelectRow): AccessTokenRow {
  // PostgREST returns an embedded to-one relation as an object, but types it
  // as possibly an array depending on how it infers the relationship. Normalise
  // rather than trusting one shape.
  const machine = Array.isArray(row.machines) ? row.machines[0] : row.machines;
  return {
    id: row.id,
    name: row.name,
    machineId: row.machine_id,
    machineName: machine?.name ?? null,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
  };
}

/**
 * Everything that can act as this person, newest first.
 *
 * Revoked tokens are included, not filtered out. A revoked row is the record
 * that something HAD access and no longer does, which is most of what this
 * page is for — hiding them would erase the audit trail at exactly the moment
 * it becomes interesting.
 */
export async function listAccessTokensAction(): Promise<ActionResult<AccessTokenRow[]>> {
  const ctx = await actionContext();
  if (!ctx) return actionFail(NOT_SIGNED_IN);

  const {
    data: { user },
  } = await ctx.supabase.auth.getUser();
  if (!user) return actionFail(NOT_SIGNED_IN);

  // `token_hash` is deliberately absent: it is granted to no role but the
  // service role (policies/033), so asking for it here would fail the request
  // rather than return a column.
  const { data, error } = await ctx.supabase
    .from("access_tokens")
    .select("id, name, machine_id, last_used_at, revoked_at, created_at, machines(name)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return actionErrorFrom(error);
  return actionOk((data ?? []).map((row) => toRow(row as TokenSelectRow)));
}

export type CreatedAccessToken = {
  id: string;
  name: string;
  /** Shown once and never again. Not stored anywhere in plaintext. */
  token: string;
};

/**
 * Mint a token for the signed-in person.
 *
 * Used by two callers that look different and are the same act: the desktop
 * app claiming the computer it runs on (US1), and someone creating a token by
 * hand for a machine with no browser (US6).
 *
 * `machineId` is accepted but not trusted — `access_tokens_owner_insert`'s
 * WITH CHECK requires it to be one of the caller's own machines, so passing
 * somebody else's is refused by the database rather than by a check here that
 * could be forgotten.
 */
export async function createAccessTokenAction(
  name: string,
  machineId?: string | null,
): Promise<ActionResult<CreatedAccessToken>> {
  const ctx = await actionContext();
  if (!ctx) return actionFail(NOT_SIGNED_IN);

  const {
    data: { user },
  } = await ctx.supabase.auth.getUser();
  if (!user) return actionFail(NOT_SIGNED_IN);

  const label = name.trim() || "Access token";
  if (label.length > 80) {
    return actionFail("That name is too long — 80 characters at most.", "invalid_name");
  }

  const token = mintToken();
  const id = randomUUID();

  const { error } = await ctx.supabase.from("access_tokens").insert({
    id,
    user_id: user.id,
    machine_id: machineId ?? null,
    name: label,
    token_hash: hashToken(token),
  });

  if (error) return actionErrorFrom(error);

  revalidatePath("/settings");
  // The only time this value exists outside the caller's hands. Nothing above
  // logs it, and nothing below may either.
  return actionOk({ id, name: label, token });
}

/**
 * Revoke one token. Effective on that token's next request — the control plane
 * reads `revoked_at` on every authentication rather than caching it.
 *
 * An UPDATE rather than a DELETE, for the audit-trail reason above.
 */
export async function revokeAccessTokenAction(
  id: string,
): Promise<ActionResult<{ revoked: boolean }>> {
  const ctx = await actionContext();
  if (!ctx) return actionFail(NOT_SIGNED_IN);

  const {
    data: { user },
  } = await ctx.supabase.auth.getUser();
  if (!user) return actionFail(NOT_SIGNED_IN);

  const { data, error } = await ctx.supabase
    .from("access_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();

  if (error) return actionErrorFrom(error);
  // Already revoked, or never the caller's. Both read as "nothing to do" here,
  // and both are true.
  if (!data) return actionFail("That token was already revoked.", "already_revoked");

  revalidatePath("/settings");
  revalidatePath("/machines");
  return actionOk({ revoked: true });
}
