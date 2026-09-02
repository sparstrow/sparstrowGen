"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { callAction } from "@web/lib/call-action";
import {
  desktopCloudStatus,
  desktopClaimMachine,
  desktopMachineAvailable,
} from "@web/lib/desktop-machine";
import { createAccessTokenAction } from "@web/app/settings/access-tokens-actions";

/**
 * US1 — the whole of "install, sign in, and your computer is there".
 *
 * Renders nothing. It exists because the two halves of claiming a computer
 * live on opposite sides of the Electron bridge: this renderer holds the
 * signed-in session that can mint a credential, and only the main process can
 * hand that credential to the core running on this machine.
 *
 * Deliberately silent on the happy path. There is no toast, no banner, and no
 * "connecting..." state, because the thing being reported would be a step the
 * owner never asked to take. The arrival of the machine row in the Machines
 * list IS the feedback, and that is where it belongs. Failures are equally
 * silent HERE and surfaced THERE — the Machines page can say "this computer
 * could not be registered" in the context where someone is actually looking
 * for their computer, which an alert on an unrelated page cannot.
 *
 * Runs once per mount and no-ops everywhere except a desktop shell that has
 * not already claimed this computer.
 */
export function DesktopAutoClaim() {
  const queryClient = useQueryClient();
  // A ref, not state: this must fire once per session, and re-running it on a
  // re-render would mint a second credential each time — which is how a tokens
  // page ends up with fifty rows named "Sparstrow Desktop".
  const attempted = React.useRef(false);

  React.useEffect(() => {
    if (attempted.current) return;
    if (!desktopMachineAvailable()) return;
    attempted.current = true;

    let cancelled = false;

    void (async () => {
      try {
        const status = await desktopCloudStatus();
        // Already connected. Core re-claims on every boot anyway, which is what
        // keeps its workspace list current — there is nothing to do from here.
        if (cancelled || status.connected) return;

        const created = await callAction(() =>
          createAccessTokenAction("Sparstrow Desktop", null),
        );
        if (cancelled || !created.ok) return;

        const result = await desktopClaimMachine(created.data.token);
        if (cancelled || !result.ok) return;

        // The machine now exists in every workspace this person belongs to, so
        // anything showing runtimes is stale. Invalidating rather than
        // refetching a specific key: the machine's arrival changes the Machines
        // list, the runtime pickers, and the setup flow's completion state.
        void queryClient.invalidateQueries();
      } catch {
        // Swallowed on purpose. This runs on every page in the desktop app,
        // and a failure here must never break the page someone was actually
        // trying to use. The unclaimed state is visible and actionable on the
        // Machines page, which is where it belongs.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [queryClient]);

  return null;
}
