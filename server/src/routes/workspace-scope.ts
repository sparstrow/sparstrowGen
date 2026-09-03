import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Which workspace is this request acting in?
 *
 * Moved from `apps/web/src/lib/workspace.ts` by restructure Phase 1 and
 * de-Nexted on the way: it used to reach for `next/headers` `cookies()` on
 * its own, which made a function every client needs callable only from
 * inside a Next request. The cookie is a *web app* mechanism for remembering
 * a choice; the desktop app will send a header and the CLI a flag. So the
 * caller resolves it and passes the id in, and this decides what to trust.
 */

export type ActiveWorkspace = {
  workspaceId?: string;
  error?: string;
  status?: number;
  workspaces?: { id: string; name: string }[];
};

export async function getActiveWorkspaceId(
  supabase: SupabaseClient,
  searchParams?: URLSearchParams,
  /**
   * The workspace the caller last switched to, however that client remembers
   * it — a cookie in `apps/web`, stored preferences in the desktop app. Always
   * validated against real membership below; never trusted on its own.
   */
  rememberedWorkspaceId?: string | null,
): Promise<ActiveWorkspace> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Unauthorized", status: 401 };
  }

  // Filter by user_id explicitly. RLS scopes this table to workspaces you
  // belong to, but that deliberately includes your CO-MEMBERS' rows -- seeing
  // who else is in your workspace is the point. Without this filter every
  // other member's row counts as one of your own memberships, so the moment a
  // workspace has two people everyone in it trips the "Multiple workspaces
  // found" branch below and is locked out of every endpoint. RLS is the
  // security boundary here; this is the correctness one.
  const { data: memberships, error: memError } = await supabase
    .from("workspace_members")
    .select("workspace_id, workspaces(id, name)")
    .eq("user_id", user.id);

  if (memError) {
    return { error: "Database error", status: 500 };
  }

  if (!memberships || memberships.length === 0) {
    // Bootstrap runs entirely inside Postgres. It has to: the three inserts
    // (users, workspaces, workspace_members) must land in one transaction, and
    // PostgREST cannot span statements. Doing it client-side previously left
    // orphaned workspaces on partial failure and could hand a user two
    // workspaces if two requests raced -- which wedges them behind a permanent
    // 400 below, since there is no picker UI to choose between them.
    // See packages/shared/drizzle/policies/004_bootstrap_rpc.sql.
    const { data: workspaceId, error: rpcError } = await supabase.rpc(
      "bootstrap_workspace"
    );

    if (rpcError || !workspaceId) {
      return { error: "Failed to bootstrap workspace", status: 500 };
    }
    return { workspaceId: workspaceId as string };
  }

  const workspaces = memberships
    .map((m) => m.workspaces)
    .filter(Boolean) as unknown as { id: string; name: string }[];

  // `noUncheckedIndexedAccess` (on in server/, off in the web app's config)
  // is right to ask: the empty case returned above, so this is safe, but say so
  // once rather than asserting at both exits.
  const firstWorkspaceId = memberships[0]?.workspace_id;
  if (!firstWorkspaceId) {
    return { error: "Database error", status: 500 };
  }

  if (memberships.length === 1) {
    return { workspaceId: firstWorkspaceId, workspaces };
  }

  // Belonging to more than one workspace used to be a hard 400 that locked the
  // account out of every page, because there was no way to choose between them
  // anywhere in the interface. There is now: the switcher writes a cookie, and
  // this resolves it.
  //
  // Order of precedence, most explicit first:
  //   1. `?workspaceId=` — someone followed a link to a specific workspace
  //   2. what they last switched to, as remembered by whichever client this is
  //   3. the first membership — a sane landing place, never an error
  //
  // Every one of them is validated against actual membership before it is
  // believed. The remembered id in particular is client-supplied and must never
  // be trusted on its own: RLS would deny the queries anyway, but a page that
  // renders half-empty because a stale value named a workspace they left is a
  // worse answer than quietly landing them somewhere real.
  const requestedWorkspaceId = searchParams?.get("workspaceId");
  if (requestedWorkspaceId && memberships.some((m) => m.workspace_id === requestedWorkspaceId)) {
    return { workspaceId: requestedWorkspaceId, workspaces };
  }

  if (
    rememberedWorkspaceId &&
    memberships.some((m) => m.workspace_id === rememberedWorkspaceId)
  ) {
    return { workspaceId: rememberedWorkspaceId, workspaces };
  }

  return { workspaceId: firstWorkspaceId, workspaces };
}
