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
import { ConfirmConnectButton } from "./confirm-button";

/**
 * The confirm screen for a computer that has no signed-in app of its own —
 * US5's one human moment. `sparstrow setup` opens a browser straight here;
 * this page's only job is showing what is about to be authorized, and getting
 * one click.
 *
 * There is no workspace picker, and unlike the version this replaces there is
 * nothing to pick: a computer is claimed by a PERSON and reaches every
 * workspace that person belongs to. Naming one workspace here would have been
 * a choice with no meaning behind it.
 *
 * `approveConnectAttemptAction`'s RLS check (`connect_attempts_approve`) is
 * what actually records the claim server-side; this page only shows what is
 * about to happen.
 */

type ConnectAttemptRow = {
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
          <CardTitle className="text-base">This connection attempt isn&apos;t valid</CardTitle>
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
  if (!user) redirect(`/login?next=${encodeURIComponent(`/connect?attempt=${attemptId ?? ""}`)}`);

  if (!attemptId) {
    return (
      <ErrorState message="No connection attempt was named. Run `sparstrow setup` on the machine you want to connect — it opens this page itself." />
    );
  }

  // Scoped entirely by RLS (connect_attempts_pending_read, policies/031):
  // visible only while status is 'pending' and unexpired. A missing,
  // already-approved, consumed, or expired row all read as "not found" here
  // — the same attempt-id-as-credential shape 008's pairing code had, where
  // filtering must not distinguish "wrong id" from "right id, wrong state"
  // in a way that leaks which is which.
  const { data: attempt } = await supabase
    .from("connect_attempts")
    .select("id, name, os, hostname")
    .eq("id", attemptId)
    .maybeSingle<ConnectAttemptRow>();

  if (!attempt) {
    return (
      <ErrorState message="It's expired, was already used, or never existed. Run `sparstrow setup` again on that machine to get a fresh one." />
    );
  }

  // How many workspaces this computer is about to be able to serve. Shown
  // rather than a workspace name, because that is the honest description of
  // what confirming does — this is the one screen where "and everything else
  // you're a member of" must not be a surprise discovered later.
  const { count } = await supabase
    .from("workspace_members")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  const workspaceCount = count ?? 0;

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
          <CardTitle className="text-base">Connect this computer?</CardTitle>
          <CardDescription>
            <span className="font-medium text-foreground">{attempt.name}</span> ({attempt.os} ·{" "}
            {attempt.hostname}) will be able to run work in{" "}
            <span className="font-medium text-foreground">
              {/* Zero is a real state and used to read "all 0 of your
                  workspaces", which is nonsense and also misleading — a
                  workspace is created the moment they act, so the machine ends
                  up serving one. Seen live: a fresh account reaches this page
                  before anything has bootstrapped. */}
              {workspaceCount === 0
                ? "every workspace you create"
                : workspaceCount === 1
                  ? "your workspace"
                  : `all ${workspaceCount} of your workspaces`}
            </span>
            . You can disconnect it at any time from Machines.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ConfirmConnectButton attemptId={attempt.id} />
        </CardContent>
      </Card>
    </div>
  );
}
