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

  const workspaces = memberships
    .map((m) => m.workspaces)
    .filter(Boolean) as unknown as { id: string; name: string }[];

  if (memberships.length === 1) {
    return { workspaceId: memberships[0].workspace_id, workspaces };
  }

  // Belonging to more than one workspace used to be a hard 400 that locked the
  // account out of every page, because there was no way to choose between them
  // anywhere in the interface. There is now: the switcher writes a cookie, and
  // this resolves it.
  //
  // Order of precedence, most explicit first:
  //   1. `?workspaceId=` — someone followed a link to a specific workspace
  //   2. the cookie — what they last switched to
  //   3. the first membership — a sane landing place, never an error
  //
  // Every one of them is validated against actual membership before it is
  // believed. The cookie in particular is client-supplied and must never be
  // trusted on its own: RLS would deny the queries anyway, but a page that
  // renders half-empty because the cookie named a workspace they left is a
  // worse answer than quietly landing them somewhere real.
  const requestedWorkspaceId = searchParams?.get("workspaceId");
  if (requestedWorkspaceId && memberships.some((m) => m.workspace_id === requestedWorkspaceId)) {
    return { workspaceId: requestedWorkspaceId, workspaces };
  }

  const cookieWorkspaceId = await readWorkspaceCookie();
  if (cookieWorkspaceId && memberships.some((m) => m.workspace_id === cookieWorkspaceId)) {
    return { workspaceId: cookieWorkspaceId, workspaces };
  }

  return { workspaceId: memberships[0].workspace_id, workspaces };
}

/** Name of the cookie the switcher writes. Read here, written by its action. */
export const WORKSPACE_COOKIE = "sparstrow.workspace";

async function readWorkspaceCookie(): Promise<string | null> {
  try {
    // Imported lazily so this module stays importable from a plain unit test
    // that has no Next request context — `cookies()` throws outside one.
    const { cookies } = await import("next/headers");
    const store = await cookies();
    return store.get(WORKSPACE_COOKIE)?.value ?? null;
  } catch {
    return null;
  }
}
