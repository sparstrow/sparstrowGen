import { SupabaseClient } from "@supabase/supabase-js";

export type ActiveWorkspace = {
  workspaceId?: string;
  error?: string;
  status?: number;
  workspaces?: { id: string; name: string }[];
};

export async function getActiveWorkspaceId(
  supabase: SupabaseClient,
  searchParams?: URLSearchParams
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

  if (memberships.length === 1) {
    return { workspaceId: memberships[0].workspace_id };
  }

  const requestedWorkspaceId = searchParams?.get("workspaceId");
  if (requestedWorkspaceId) {
    const isMember = memberships.some(
      (m) => m.workspace_id === requestedWorkspaceId
    );
    if (isMember) {
      return { workspaceId: requestedWorkspaceId };
    }
  }

  const workspaces = memberships
    .map((m) => m.workspaces)
    .filter(Boolean) as unknown as { id: string; name: string }[];
  return { error: "Multiple workspaces found", status: 400, workspaces };
}
