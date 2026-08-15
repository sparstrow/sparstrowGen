import { useNavigate } from "@tanstack/react-router";
import { Bot, BookOpen, ChevronsUpDown, LogOut, Settings, UserPlus, User } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAccount } from "@/lib/account";
import { cn } from "@/lib/utils";

/**
 * Workspace switcher at the top of the sidebar, carrying the profile / invite /
 * logout affordances plus quick links.
 *
 * Two hosts, one menu: the web app supplies an account through context and the
 * identity lines and Log out become real, while the local desktop build has no
 * account to sign out of and keeps them disabled with a tooltip explaining
 * why. See `@/lib/account` for why that distinction lives in context.
 */
export function WorkspaceSwitcher({ collapsed = false }: { collapsed?: boolean }) {
  const navigate = useNavigate();
  const account = useAccount();

  const subtitle = account ? account.email : "Local workspace";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        title={account ? `Signed in as ${account.email}` : "Sparstrowgen — local workspace"}
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
                Sparstrowgen
              </span>
              <span className="block truncate text-[11px] text-muted-foreground">{subtitle}</span>
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="truncate">{account ? account.name : "Sparstrowgen"}</span>
          <span className="truncate text-xs font-normal text-muted-foreground">
            {account ? account.email : "Single-user agent factory · 127.0.0.1"}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void navigate({ to: "/settings" })}>
          <User className="size-4" /> Profile &amp; settings
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void navigate({ to: "/knowledge" })}>
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
        <DropdownMenuItem onClick={() => void navigate({ to: "/settings" })}>
          <Settings className="size-4" /> Workspace settings
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
