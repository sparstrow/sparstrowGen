"use client";

import * as React from "react";
import { Check, ChevronRight, Copy, KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * US5 — adding a computer that is not the one you are sitting at.
 *
 * **This is a waiting room, not a scanner.** It does not look for machines and
 * it cannot: a computer with no credential has nothing to authenticate with,
 * so any list of "machines waiting to connect" would be a list anyone on the
 * internet could write to — and pairing the wrong row would hand your
 * workspace's work to a stranger's computer. The reference implementation does
 * not scan either; its dialog says "we'll detect it as soon as the daemon
 * starts", which is exactly this.
 *
 * Detection is therefore arrival: the machine signs in on its own end, and the
 * runtime list gains a row. `onDetected` fires when the count goes up while
 * this dialog is open, which is the only moment it can honestly claim to have
 * found something.
 *
 * Closing the dialog cancels nothing (`FR-017`) — the machine is connecting on
 * its own end and will appear whether or not anyone is watching.
 */

const INSTALL_COMMAND = "npm install -g @sparstrow/server";
const SETUP_COMMAND = "sparstrow setup";

function CommandBlock({ command }: { command: string }) {
  const [copied, setCopied] = React.useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Refused clipboard access (permissions, insecure origin). The command is
      // on screen and selectable — a degraded copy button, not a dead end.
    }
  }

  return (
    <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
      <code className="min-w-0 flex-1 overflow-x-auto font-mono text-xs">{command}</code>
      <Button
        size="icon"
        variant="ghost"
        className="size-7 shrink-0"
        aria-label={`Copy: ${command}`}
        onClick={() => void copy()}
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </Button>
    </div>
  );
}

export function AddComputerDialog({
  open,
  onOpenChange,
  runtimeCount,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Current number of machines. A rise while open means one just arrived. */
  runtimeCount: number;
}) {
  const [baseline, setBaseline] = React.useState(runtimeCount);
  const [showHeadless, setShowHeadless] = React.useState(false);

  // Re-baseline every time the dialog opens, not once on mount. Without this,
  // reopening the dialog after a successful connection would immediately claim
  // to have detected the machine that arrived last time.
  React.useEffect(() => {
    if (open) {
      setBaseline(runtimeCount);
      setShowHeadless(false);
    }
    // `runtimeCount` is deliberately absent: this must capture the count AT
    // open, and re-running on every count change would move the goalposts and
    // make detection impossible.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const detected = open && runtimeCount > baseline;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a computer</DialogTitle>
          <DialogDescription>
            Run these two commands on the computer you want to add. We&apos;ll detect it the moment
            it comes online.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium">1. Install the Sparstrow CLI</p>
            <CommandBlock command={INSTALL_COMMAND} />
            {/* Honest about distribution rather than printing a command that
                fails (FR from US5 scenario 5, and D-10). */}
            <p className="text-xs text-muted-foreground">
              Not published yet — for now that machine needs a checkout of this repository to run
              the CLI. Packaged installers are coming.
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">2. Connect it</p>
            <CommandBlock command={SETUP_COMMAND} />
            <p className="text-xs text-muted-foreground">
              Opens a browser to sign in, then keeps the runtime running in the background.
            </p>
          </div>

          <div
            className="flex items-start gap-3 rounded-lg border bg-muted/40 p-3"
            role="status"
            aria-live="polite"
          >
            {detected ? (
              <>
                <span
                  className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-success/15 text-success"
                  aria-hidden="true"
                >
                  <Check className="size-3" />
                </span>
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm font-medium">Found your computer</p>
                  <p className="text-sm text-muted-foreground">
                    It&apos;s in the list now. You can close this.
                  </p>
                </div>
              </>
            ) : (
              <>
                {/* A spinner, not a progress bar: nothing here has a duration
                    this end can know. §7 — motion explains, and what it
                    explains is "still waiting". */}
                <Loader2
                  className="mt-0.5 size-4 shrink-0 animate-spin text-muted-foreground"
                  aria-hidden="true"
                />
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm font-medium">Waiting for your computer</p>
                  <p className="text-sm text-muted-foreground">
                    We&apos;ll detect it as soon as it connects — usually under a minute. Closing
                    this won&apos;t cancel anything.
                  </p>
                </div>
              </>
            )}
          </div>

          {/* The dead end this dialog would otherwise have: a machine with no
              browser it can open. Signposted here rather than left to be
              discovered (US5 scenario 3). */}
          <div className="rounded-lg border border-dashed">
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-muted-foreground hover:text-foreground"
              onClick={() => setShowHeadless((v) => !v)}
              aria-expanded={showHeadless}
            >
              <ChevronRight
                className={`size-3.5 shrink-0 transition-transform ${showHeadless ? "rotate-90" : ""}`}
                aria-hidden="true"
              />
              Can&apos;t open a browser on that computer?
            </button>
            {showHeadless && (
              <div className="space-y-2 border-t px-3 py-3">
                <p className="text-sm text-muted-foreground">
                  Create a token under Settings → API Tokens, then give it to that machine:
                </p>
                <CommandBlock command="sparstrow setup --token=" />
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <KeyRound className="size-3" aria-hidden="true" />
                  Leaving the value empty prompts for it, so the token stays out of your shell
                  history.
                </p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant={detected ? "default" : "outline"} onClick={() => onOpenChange(false)}>
            {detected ? "Done" : "Close"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
