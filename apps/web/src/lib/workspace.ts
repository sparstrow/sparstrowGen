import { SupabaseClient } from "@supabase/supabase-js";

export async function getActiveWorkspaceId(
  supabase: SupabaseClient,
  searchParams?: URLSearchParams
): Promise<{ workspaceId?: string; error?: string; status?: number; workspaces?: any[] }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Unauthorized", status: 401 };
  }

  const { data: memberships, error: memError } = await supabase
    .from("workspace_members")
    .select("workspace_id, workspaces(id, name)");

  if (memError) {
    return { error: "Database error", status: 500 };
  }

  if (!memberships || memberships.length === 0) {
    try {
      const workspaceId = await bootstrapWorkspace(supabase, user);
      return { workspaceId };
    } catch (err: any) {
      // If it failed due to unique constraint, try to read again
      if (err.code === "23505" || err.message?.includes("duplicate key")) {
        const { data: retryMemberships } = await supabase
          .from("workspace_members")
          .select("workspace_id")
          .limit(1);
        if (retryMemberships && retryMemberships.length > 0) {
          return { workspaceId: retryMemberships[0].workspace_id };
        }
      }
      return { error: "Failed to bootstrap workspace", status: 500 };
    }
  }

  if (memberships.length === 1) {
    return { workspaceId: memberships[0].workspace_id };
  }

  const requestedWorkspaceId = searchParams?.get("workspaceId");
  if (requestedWorkspaceId) {
    const isMember = memberships.some((m) => m.workspace_id === requestedWorkspaceId);
    if (isMember) {
      return { workspaceId: requestedWorkspaceId };
    }
  }

  const workspaces = memberships.map((m) => m.workspaces).filter(Boolean);
  return { error: "Multiple workspaces found", status: 400, workspaces };
}

async function bootstrapWorkspace(supabase: SupabaseClient, user: any): Promise<string> {
  // 1. users
  const { error: userError } = await supabase.from("users").insert({
    id: user.id,
    email: user.email,
  });
  
  if (userError && userError.code !== '23505') {
    throw userError;
  }

  // 2. workspaces
  const { data: workspaceData, error: wsError } = await supabase
    .from("workspaces")
    .insert({
      name: "Personal Workspace",
      owner_id: user.id,
    })
    .select("id")
    .single();

  if (wsError) {
    throw wsError;
  }

  const workspaceId = workspaceData.id;

  // 3. workspace_members
  const { error: wmError } = await supabase
    .from("workspace_members")
    .insert({
      workspace_id: workspaceId,
      user_id: user.id,
      role: "owner",
    });

  if (wmError) {
    throw wmError;
  }

  return workspaceId;
}
