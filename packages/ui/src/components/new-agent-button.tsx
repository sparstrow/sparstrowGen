import { ChevronDown, PenLine, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * F2 — split "New agent" control. The primary action opens the Agent Creator
 * (the guided path); the dropdown also exposes the manual form. Both paths
 * author the same agent schema.
 */
export function NewAgentButton({
  onManual,
  onCreator,
}: {
  onManual: () => void;
  onCreator: () => void;
}) {
  return (
    <div className="flex items-center">
      <Button className="rounded-r-none" onClick={onCreator}>
        <Plus className="size-4" /> New agent
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="rounded-l-none border-l border-l-primary-foreground/20 px-2" aria-label="More create options">
            <ChevronDown className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onCreator}>
            <Sparkles /> Create with Agent Creator
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onManual}>
            <PenLine /> Manually create
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
