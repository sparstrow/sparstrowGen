/**
 * The words a person reads about an update, kept apart from the component that
 * draws them.
 *
 * Separated so it can be tested. Every branch here is a state a real user hits
 * — and reaching most of them for real needs two published releases and a slow
 * download, which is exactly the kind of thing that never gets checked by hand.
 * The copy is the feature: a wrong sentence about an update is worse than no
 * sentence, because it is acted on.
 */

/**
 * `supported === null` means the answer is still outstanding, and it is a
 * genuinely different thing from `false`. See `use-updates.ts`.
 */
export function updateStatusLine(
  status: DesktopUpdateStatus,
  supported: boolean | null,
): string {
  if (supported === null) return "Checking whether this build can update itself…";
  if (!supported) {
    return (
      "This build cannot update itself. Automatic updates are part of the installed " +
      "app — a build run from source has no release to compare itself against."
    );
  }
  switch (status.state) {
    case "idle":
      // Deliberately not "you are up to date": `idle` is also the state before
      // the first check has answered, and an app that claims to be current when
      // it means "I have not looked" is how a broken update feed stays
      // invisible for a month. That failure is not hypothetical here — no
      // stable release existed at all until 0.3.0, and nothing said so.
      return "No new version has been found. Sparstrowgen checks again every 30 minutes.";
    case "checking":
      return "Checking for a new version…";
    case "available":
      return `Version ${status.version} is available.`;
    case "downloading":
      return `Downloading version ${status.version} — ${status.percent}%.`;
    case "downloaded":
      return `Version ${status.version} is downloaded and ready to install.`;
    case "waiting":
      return `Version ${status.version} will install once this computer is finished.`;
    case "installing":
      return `Installing version ${status.version}. Sparstrowgen will restart.`;
    case "error":
      return "The last update check did not succeed.";
  }
}

/**
 * Whether this status is worth interrupting the user about on another screen.
 *
 * "There is a new version" and "your install is staged and waiting" are news.
 * A failed background check is not — Settings shows it, the header does not,
 * because a banner that appears every time a laptop closes its lid trains
 * people to ignore banners.
 */
export function isNewsworthy(status: DesktopUpdateStatus): boolean {
  return status.state === "available" || status.state === "downloaded" || status.state === "waiting";
}
