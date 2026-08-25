import type { RunStatus } from "@sparstrow/shared";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const VARIANTS: Record<RunStatus, { variant: React.ComponentProps<typeof Badge>["variant"]; pulse?: boolean }> = {
  queued: { variant: "secondary" },
  running: { variant: "info", pulse: true },
  succeeded: { variant: "success" },
  failed: { variant: "destructive" },
  cancelled: { variant: "outline" },
  timeout: { variant: "warning" },
};

export function RunStatusBadge({ status }: { status: RunStatus }) {
  const config = VARIANTS[status] ?? { variant: "outline" as const };
  return (
    <Badge variant={config.variant} className={cn(config.pulse && "animate-pulse")}>
      {status}
    </Badge>
  );
}
