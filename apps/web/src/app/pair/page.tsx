import { redirect } from "next/navigation";
import { AlertCircle, Monitor } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@web/utils/supabase/server";
import { getActiveWorkspaceId } from "@web/lib/workspace";
import { ConfirmPairingButton } from "./confirm-button";

/**
 * Browser-loopback pairing's confirm screen — the whole of US1's "populated"
 * state. `sparstrow pair` opens a browser straight here; this page's only
 * job is showing what's about to be authorized and getting one click.
 *
 * No workspace picker, no other fields: `getActiveWorkspaceId` resolves the
 * same "current workspace" every other page and action already uses, and
 * `approvePairingAttemptAction`'s RLS check is what actually enforces that
 * choice server-side — this page only needs the name to show it.
 */

type PairingAttemptRow = {
  id: string;
  name: string;
  os: string;
  hostname: string;
};

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertCircle className="size-5" strokeWidth={1.8} />
          </div>
          <CardTitle className="text-base">This pairing attempt isn&apos;t valid</CardTitle>
          <CardDescription>{message}</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}

export default async function PairPage({
  searchParams,
}: {
  searchParams: Promise<{ attempt?: string }>;
}) {
  const { attempt: attemptId } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/pair?attempt=${attemptId ?? ""}`)}`);

  if (!attemptId) {
    return (
      <ErrorState message="No pairing attempt was named. Run `sparstrow pair` on the machine you want to connect — it opens this page itself." />
    );
  }

  // Scoped entirely by RLS (pairing_attempts_pending_read, policies/031):
  // visible only while status is 'pending' and unexpired. A missing,
  // already-approved, consumed, or expired row all read as "not found" here
  // — the same attempt-id-as-credential shape 008's pairing code had, where
  // filtering must not distinguish "wrong id" from "right id, wrong state"
  // in a way that leaks which is which.
  const { data: attempt } = await supabase
    .from("pairing_attempts")
    .select("id, name, os, hostname")
    .eq("id", attemptId)
    .maybeSingle<PairingAttemptRow>();

  if (!attempt) {
    return (
      <ErrorState message="It's expired, was already used, or never existed. Run `sparstrow pair` again on that machine to get a fresh one." />
    );
  }

  const ws = await getActiveWorkspaceId(supabase);
  if (ws.error || !ws.workspaceId) redirect("/login");

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("name")
    .eq("id", ws.workspaceId)
    .maybeSingle<{ name: string | null }>();
  const workspaceName = workspace?.name?.trim() || "your workspace";

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div
            className="relative mx-auto flex size-10 items-center justify-center rounded-md bg-accent"
            aria-hidden="true"
          >
            <Monitor className="size-4" strokeWidth={1.8} />
          </div>
          <CardTitle className="text-base">Pair this machine?</CardTitle>
          <CardDescription>
            Connecting <span className="font-medium text-foreground">{attempt.name}</span> (
            {attempt.os} · {attempt.hostname}) to{" "}
            <span className="font-medium text-foreground">{workspaceName}</span>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ConfirmPairingButton attemptId={attempt.id} />
        </CardContent>
      </Card>
    </div>
  );
}
