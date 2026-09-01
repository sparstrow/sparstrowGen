"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { callAction } from "@web/lib/call-action";
import { approvePairingAttemptAction } from "./actions";

/**
 * The one click US1 asks for. Approves the attempt via a real Server Action
 * (never inlined into the page's render — see the plan's "What the spec asks
 * for that isn't obvious"), then navigates the browser itself to the
 * daemon's loopback listener.
 *
 * A plain top-level navigation, not `fetch()` — mirrors multica's own
 * `redirectToCliCallback`
 * (`references/multica/packages/views/auth/login-page.tsx:70-73`): no CORS
 * involved, since a navigation isn't a cross-origin request the way a fetch
 * would be. The daemon's own listener renders whatever the browser shows
 * next; this component's job ends the moment the redirect fires.
 */
export function ConfirmPairingButton({ attemptId }: { attemptId: string }) {
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const onConfirm = () => {
    setError(null);
    startTransition(async () => {
      const result = await callAction(() => approvePairingAttemptAction(attemptId));
      if (!result.ok) {
        setError(result.error);
        return;
      }
      window.location.href = result.data.callback;
    });
  };

  return (
    <div className="space-y-3">
      <Button size="lg" className="w-full" disabled={pending} onClick={onConfirm}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        Authorize this machine
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
