"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Bot,
  BookOpen,
  Check,
  ChevronsUpDown,
  Loader2,
  LogOut,
  Plus,
  Settings,
  UserPlus,
  User,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useQueryClient } from "@tanstack/react-query";
import { useWorkspace, useWorkspaces } from "@web/api/hooks";
import { useAccount } from "@web/lib/account";
import { callAction } from "@web/lib/call-action";
import { switchWorkspaceAction } from "@web/app/settings/actions";
import { cn } from "@/lib/utils";

/**
 * Workspace switcher at the top of the sidebar, carrying the profile / invite /
 * logout affordances plus quick links.
 *
 * Two hosts, one menu: the web app supplies an account through context and the
 * identity lines and Log out become real, while the local desktop build has no
 * account to sign out of and keeps them disabled with a tooltip explaining
 * why. See `@/lib/account` for why that distinction lives in context.
 *
 * **US3 (2026-09-02): it now actually switches.** Until then this was an
 * account menu wearing a switcher's name — it showed the current workspace and
 * offered no way to leave it, because belonging to two workspaces was a hard
 * 400 and there was nothing to switch between. The owner keeps a personal and
 * a work workspace on one machine, so the list below is the point of the
 * component rather than an addition to it.
 *
 * With exactly one workspace the list is deliberately not rendered: a menu
 * section offering a single choice that is already made is noise, and the spec
 * asks for the switcher to identify the workspace without demanding a decision.
 *
 * **T-M10-04: shows the real workspace name.** Falls back to "Sparstrowgen"
 * in two cases, not one — no data at all (the desktop build, which has no
 * cloud workspace, hence `enabled: Boolean(account)`), and `workspace.name`
 * being `""` (a real workspace nobody has named yet, which after `T-M9-01`
 * is where every fresh account starts). Missing the second case would render
 * an empty string and the line would silently vanish.
 */
export function WorkspaceSwitcher({ collapsed = false }: { collapsed?: boolean }) {
  const router = useRouter();
  const account = useAccount();
  const queryClient = useQueryClient();
  const workspace = useWorkspace(Boolean(account));
  const workspaces = useWorkspaces(Boolean(account));
  const [switching, setSwitching] = React.useState<string | null>(null);

  const otherWorkspaces = (workspaces.data ?? []).filter((ws) => ws.id !== workspace.data?.id);

  async function switchTo(workspaceId: string) {
    setSwitching(workspaceId);
    const result = await callAction(() => switchWorkspaceAction(workspaceId));
    if (!result.ok) {
      setSwitching(null);
      return;
    }
    // Every cached query is workspace-scoped, so there is no narrower
    // invalidation that would be correct. `router.refresh()` alone would
    // re-render server components against the new workspace while React Query
    // kept serving the old one's data underneath them.
    await queryClient.invalidateQueries();
    router.refresh();
    setSwitching(null);
  }

  const workspaceName = workspace.data?.name || "Sparstrowgen";
  // The dropdown label answers "who am I", not "what is this workspace" —
  // account.name is now "" for a fresh account (T-M9-01), so it falls back to
  // the email, which is always present, rather than to the pre-M9 email local
  // part spec decision 6 exists to get rid of.
  const displayName = account ? account.name || account.email : "Sparstrowgen";

  const subtitle = account ? account.email : "Local workspace";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        title={
          account
            ? `${workspaceName} — signed in as ${account.email}`
            : "Sparstrowgen — local workspace"
        }
        className={cn(
          "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-sidebar-accent focus:outline-none",
          collapsed && "justify-center px-0",
        )}
      >
        <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary text-primary-foreground">
          {account?.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={account.avatarUrl} alt="" className="size-full object-cover" />
          ) : (
            <Bot className="size-4" />
          )}
        </span>
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold tracking-tight">
                {workspaceName}
              </span>
              <span className="block truncate text-[11px] text-muted-foreground">{subtitle}</span>
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="truncate">{displayName}</span>
          <span className="truncate text-xs font-normal text-muted-foreground">
            {account ? account.email : "Single-user agent factory · 127.0.0.1"}
          </span>
        </DropdownMenuLabel>
        {otherWorkspaces.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
              Switch workspace
            </DropdownMenuLabel>
            {workspaces.data?.map((ws) => {
              const isCurrent = ws.id === workspace.data?.id;
              return (
                <DropdownMenuItem
                  key={ws.id}
                  disabled={switching !== null}
                  // Current workspace stays in the list rather than being
                  // filtered out: a switcher that hides where you are makes you
                  // work out which of the remaining names is not you.
                  onSelect={(event) => {
                    if (isCurrent) return;
                    // The menu would close and unmount this item mid-await,
                    // cancelling the switch on slower connections.
                    event.preventDefault();
                    void switchTo(ws.id);
                  }}
                >
                  {switching === ws.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : isCurrent ? (
                    <Check className="size-4" />
                  ) : (
                    <span className="size-4" aria-hidden="true" />
                  )}
                  <span className="truncate">{ws.name || "Untitled workspace"}</span>
                </DropdownMenuItem>
              );
            })}
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void router.push("/settings")}>
          <Plus className="size-4" /> New workspace
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void router.push("/settings")}>
          <User className="size-4" /> Profile &amp; settings
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void router.push("/knowledge")}>
          <BookOpen className="size-4" /> Knowledge Center
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled
          title="Invites aren't built yet — workspaces are single-member for now."
        >
          <UserPlus className="size-4" /> Invite members
        </DropdownMenuItem>
        {account ? (
          <DropdownMenuItem onClick={() => void account.signOut()}>
            <LogOut className="size-4" /> Log out
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            disabled
            title="No account to sign out of — everything runs locally."
          >
            <LogOut className="size-4" /> Log out
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void router.push("/settings")}>
          <Settings className="size-4" /> Workspace settings
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
