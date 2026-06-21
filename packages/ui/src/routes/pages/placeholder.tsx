import { Construction } from "lucide-react";

export function PlaceholderPage({ title, phase }: { title: string; phase: number }) {
  return (
    <div className="flex h-full min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
      <Construction className="size-10 text-muted-foreground/50" />
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">
          This area arrives in phase {phase}. The backend and UI for it are on the roadmap.
        </p>
      </div>
    </div>
  );
}
