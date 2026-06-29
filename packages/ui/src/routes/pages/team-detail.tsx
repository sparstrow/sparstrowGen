import * as React from "react";
import { useParams } from "@tanstack/react-router";

export function TeamDetailPage() {
  const { teamId } = useParams({ strict: false });
  return (
    <div className="flex h-full flex-col p-6">
      <h1 className="text-2xl font-bold">Team Detail</h1>
      <p className="text-muted-foreground mt-2">Detail for {teamId}</p>
    </div>
  );
}
