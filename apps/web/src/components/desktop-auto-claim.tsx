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
import { setClaimStatus } from "@web/lib/claim-status";

/**
 * US1 — the whole of "install, sign in, and your computer is there".
 *
 * Renders nothing. It exists because the two halves of claiming a computer
 * live on opposite sides of the Electron bridge: this renderer holds the
 * signed-in session that can mint a credential, and only the main process can
 * hand that credential to the core running on this machine.
 *
 * Deliberately silent on the happy path. There is no toast and no banner,
 * because the thing being reported would be a step the owner never asked to
 * take. The arrival of the machine row in the Machines list IS the feedback.
 *
 * Failures are silent HERE and reported THERE, through `claim-status`. The
 * first version simply swallowed them, which was wrong in a way that only
 * showed up when one actually failed: no machine appeared, no error appeared,
 * and there was nothing anywhere to explain the absence. Found exactly that way
 * — by running the desktop shell and watching nothing happen, twice, with no
 * clue why.
 *
 * Runs once per session and no-ops everywhere except a desktop shell that has
 * not already claimed this computer.
 *
 * **This effect is deliberately not cancelled on unmount**, which is unusual
 * enough to say why. React StrictMode mounts, unmounts and remounts every
 * effect in development. The first version aborted its in-flight work on that
 * unmount while the once-only ref stayed set, so the remount did nothing and
 * the claim never completed — in dev, every time. Symptom: a desktop app that
 * asks core for its status three times and then silently never connects.
 *
 * Cancelling was wrong in kind, not just in detail. This is not a fetch whose
 * result paints a component; it is a side effect that connects a computer, and
 * it should finish whether or not the component that started it is still on
 * screen. Its outcome goes to a module store precisely so it can outlive the
 * mount that began it.
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

    void (async () => {
      try {
        const status = await desktopCloudStatus();
        // Already connected. Core re-claims on every boot anyway, which is what
        // keeps its workspace list current — there is nothing to do from here.
        if (status.connected) {
          setClaimStatus({ state: "claimed" });
          return;
        }
        // The shell could not reach core at all — a distinct failure from a
        // rejected claim, and the one most likely to mean "the runtime is not
        // running", which the Daemon card can actually help with.
        if (status.error) {
          setClaimStatus({ state: "failed", reason: status.error });
          return;
        }

        setClaimStatus({ state: "claiming" });

        const created = await callAction(() =>
          createAccessTokenAction("Sparstrow Desktop", null),
        );
        if (!created.ok) {
          setClaimStatus({ state: "failed", reason: created.error });
          return;
        }

        const result = await desktopClaimMachine(created.data.token);
        if (!result.ok) {
          setClaimStatus({ state: "failed", reason: result.error });
          return;
        }
        setClaimStatus({ state: "claimed" });

        // The machine now exists in every workspace this person belongs to, so
        // anything showing runtimes is stale. Invalidating rather than
        // refetching a specific key: the machine's arrival changes the Machines
        // list, the runtime pickers, and the setup flow's completion state.
        void queryClient.invalidateQueries();
      } catch (err) {
        // Caught, not swallowed. This runs on every page in the desktop app and
        // must never break the page someone was actually trying to use — but it
        // must also not vanish. The Machines page renders what lands here.
        setClaimStatus({
          state: "failed",
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    })();
  }, [queryClient]);

  return null;
}
