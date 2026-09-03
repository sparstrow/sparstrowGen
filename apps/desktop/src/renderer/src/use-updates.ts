import * as React from "react";

/**
 * The update status, kept live.
 *
 * The main process both answers a one-off `getStatus()` and pushes every
 * subsequent change over `onStatus`, so this subscribes FIRST and asks second:
 * the other order drops any change that lands between the two calls, which is
 * exactly the window a download's first progress event falls into.
 *
 * `supported` is decided by asking, not by feature-detecting the bridge. The
 * bridge object exists in every build; the IPC handlers behind it are
 * registered only when `app.isPackaged` (main.ts), because an unpackaged build
 * has no release feed to compare itself against. Detecting the bridge alone
 * therefore reports "updates work" in exactly the builds where they do not —
 * found by running it, as an unhandled `No handler registered for
 * 'sparstrow:update-status-get'` behind a Settings screen that looked fine.
 */
export function useUpdates() {
  const bridge = window.sparstrowDesktop?.updates;
  const [status, setStatus] = React.useState<DesktopUpdateStatus>({ state: "idle" });
  /** `null` while the answer is still outstanding — not the same as `false`. */
  const [supported, setSupported] = React.useState<boolean | null>(bridge ? null : false);

  React.useEffect(() => {
    if (!bridge) return;
    const off = bridge.onStatus(setStatus);
    bridge
      .getStatus()
      .then((s) => {
        setSupported(true);
        // A pushed status is newer than the one we asked for. Only accept the
        // reply if nothing has arrived in the meantime.
        setStatus((current) => (current.state === "idle" ? s : current));
      })
      .catch(() => setSupported(false));
    return off;
  }, [bridge]);

  const call = (fn: (() => Promise<unknown>) | undefined) => {
    // Every one of these is a fire-and-forget IPC whose real result arrives as a
    // status push. A rejection here means the handler is missing, which
    // `supported` already covers — swallowing it keeps an unpackaged build from
    // logging an unhandled rejection on every click.
    fn?.().catch(() => setSupported(false));
  };

  return {
    status,
    supported,
    check: () => call(() => bridge!.check()),
    download: () => call(() => bridge!.download()),
    install: (force = false) => call(() => bridge!.install({ force })),
    cancel: () => call(() => bridge!.cancel()),
  };
}

export { isNewsworthy, updateStatusLine } from "./update-copy";
