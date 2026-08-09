import * as React from "react";
import { ArrowDownToLine, RefreshCw, X } from "lucide-react";

/**
 * 0004 Phase 2 — self-update banner. Only renders inside the Electron shell
 * (window.sparstrowDesktop.updates from preload); in a plain browser or dev
 * it renders nothing. Notify-only: every step is an explicit click.
 */

interface BlockingRun {
  id: string;
  agentName: string | null;
}

type UpdateStatus =
  | { state: "idle" }
  | { state: "available"; version: string }
  | { state: "downloading"; version: string; percent: number }
  | { state: "downloaded"; version: string }
  | { state: "waiting"; version: string; busy: number; runs: BlockingRun[] }
  | { state: "installing"; version: string }
  | { state: "error"; message: string };

interface DesktopUpdates {
  getStatus: () => Promise<UpdateStatus>;
  download: () => Promise<void>;
  install: (opts?: { force?: boolean }) => Promise<void>;
  cancel: () => Promise<void>;
  onStatus: (cb: (status: UpdateStatus) => void) => () => void;
}

function desktopUpdates(): DesktopUpdates | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { sparstrowDesktop?: { updates?: DesktopUpdates } };
  return w.sparstrowDesktop?.updates ?? null;
}

export function UpdateBanner() {
  const updates = React.useMemo(desktopUpdates, []);
  const [status, setStatus] = React.useState<UpdateStatus>({ state: "idle" });
  const [dismissed, setDismissed] = React.useState(false);

  React.useEffect(() => {
    if (!updates) return;
    void updates.getStatus().then(setStatus);
    return updates.onStatus((s) => {
      setStatus(s);
      setDismissed(false);
    });
  }, [updates]);

  if (!updates || dismissed || status.state === "idle") return null;

  const body = (() => {
    switch (status.state) {
      case "available":
        return (
          <>
            <span>
              Update <strong>v{status.version}</strong> is available.
            </span>
            <button type="button" className="banner-action" onClick={() => void updates.download()}>
              <ArrowDownToLine className="size-3.5" /> Download
            </button>
          </>
        );
      case "downloading":
        return <span>Downloading v{status.version}… {status.percent}%</span>;
      case "downloaded":
        return (
          <>
            <span>
              <strong>v{status.version}</strong> downloaded.
            </span>
            <button type="button" className="banner-action" onClick={() => void updates.install()}>
              <RefreshCw className="size-3.5" /> Install &amp; restart
            </button>
          </>
        );
      case "waiting":
        return (
          <>
            <span>
              Waiting for <strong>{status.busy}</strong> running agent
              {status.busy === 1 ? "" : "s"} to finish
              {status.runs.length > 0
                ? ` (${status.runs.map((r) => r.agentName ?? r.id).join(", ")})`
                : ""}
              …
            </span>
            <button
              type="button"
              className="banner-action"
              onClick={() => void updates.install({ force: true })}
            >
              Interrupt {status.busy} &amp; update now
            </button>
            <button type="button" className="banner-action" onClick={() => void updates.cancel()}>
              Cancel
            </button>
          </>
        );
      case "installing":
        return <span>Installing v{status.version} — restarting…</span>;
      case "error":
        return <span>Update error: {status.message}</span>;
    }
  })();

  return (
    <div
      className="flex shrink-0 items-center gap-3 border-b border-indigo-500/30 bg-indigo-500/10 px-5 py-2 text-xs text-foreground [&_.banner-action]:inline-flex [&_.banner-action]:items-center [&_.banner-action]:gap-1 [&_.banner-action]:rounded-md [&_.banner-action]:border [&_.banner-action]:border-indigo-500/40 [&_.banner-action]:px-2 [&_.banner-action]:py-0.5 [&_.banner-action]:font-medium [&_.banner-action]:hover:bg-indigo-500/20"
      role="status"
    >
      {body}
      <button
        type="button"
        className="ml-auto rounded-md p-0.5 text-muted-foreground hover:text-foreground"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss update notice"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
