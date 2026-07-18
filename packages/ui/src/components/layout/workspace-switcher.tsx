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

/**
 * Workspace switcher at the top of the sidebar. Sparstrowgen is a local
 * single-user install, so there is exactly one workspace — the menu carries
 * the profile/invite/logout affordances honestly (disabled where they don't
 * apply locally) plus quick links.
 */
export function WorkspaceSwitcher() {
  const navigate = useNavigate();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-sidebar-accent focus:outline-none">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Bot className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold tracking-tight">
            Sparstrowgen
          </span>
          <span className="block truncate text-[11px] text-muted-foreground">
            Local workspace
          </span>
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span>Sparstrowgen</span>
          <span className="text-xs font-normal text-muted-foreground">
            Single-user agent factory · 127.0.0.1
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
        <DropdownMenuItem disabled title="Sparstrowgen is single-user — invites don't apply to a local workspace.">
          <UserPlus className="size-4" /> Invite members
        </DropdownMenuItem>
        <DropdownMenuItem disabled title="No account to sign out of — everything runs locally.">
          <LogOut className="size-4" /> Log out
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void navigate({ to: "/settings" })}>
          <Settings className="size-4" /> Workspace settings
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
