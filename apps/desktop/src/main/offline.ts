/**
 * The screen shown when the window cannot reach the app.
 *
 * Built here, in the shell, and never served as a route. An offline screen
 * served by the thing that is offline is not an offline screen — the whole
 * point is that it renders with no network, no bundler and no app.
 *
 * Retry is an ordinary link back to the intended URL, deliberately. It needs no
 * IPC channel and no preload surface: clicking it navigates the window, which
 * either succeeds (the app is back) or fails and re-fires `did-fail-load`,
 * bringing this screen back with the CURRENT error rather than a stale one.
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Only `http:` and `https:` become a clickable retry.
 *
 * `APP_URL` is operator-controlled rather than attacker-controlled, so this is
 * not guarding against a live threat — but a `javascript:` or `file:` value
 * reaching an `href` this page renders is a footgun with no upside, and the
 * check costs one comparison. A rejected URL is still SHOWN, just not linked:
 * a malformed value is exactly what the reader needs to see.
 */
function isLinkableUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

export interface OfflineScreenInput {
  /** Where the window was trying to go. Named on screen — see below. */
  intendedUrl: string;
  /** Chromium's own description, e.g. ERR_CONNECTION_REFUSED. */
  errorDescription: string;
}

/**
 * Why the URL and the raw error are both on screen.
 *
 * The two failures behind this need completely different actions. The app being
 * down is a wait; a misconfigured `SPARSTROW_APP_URL` is a settings fix. A
 * screen that says only "You're offline" sends someone to check their wifi for
 * what is actually a typo in an environment variable, and they have no way to
 * find that from the message.
 */
export function buildOfflineHtml({ intendedUrl, errorDescription }: OfflineScreenInput): string {
  const url = escapeHtml(intendedUrl);
  const error = escapeHtml(errorDescription || "The connection failed.");
  const retry = isLinkableUrl(intendedUrl)
    ? `<a class="retry" href="${url}">Try again</a>`
    : `<p class="unlinkable">That address can't be opened. Check <code>SPARSTROW_APP_URL</code>.</p>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sparstrowgen — can't reach the app</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: #0a0a0a; color: #e5e5e5; padding: 32px;
    font: 14px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  }
  main { max-width: 30rem; width: 100%; }
  h1 { margin: 0 0 8px; font-size: 18px; font-weight: 600; letter-spacing: -0.01em; }
  p { margin: 0 0 16px; color: #a1a1a1; }
  .detail {
    margin: 0 0 20px; padding: 12px 14px; border: 1px solid #262626; border-radius: 8px;
    background: #121212; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px; color: #a1a1a1; word-break: break-all;
  }
  .detail strong { display: block; color: #e5e5e5; font-weight: 500; margin-bottom: 4px; }
  .detail span { display: block; margin-top: 8px; }
  .reassure {
    margin: 0 0 24px; padding: 12px 14px; border-left: 2px solid #16a34a;
    background: #0f1a12; color: #bbf7d0; border-radius: 0 6px 6px 0;
  }
  a.retry {
    display: inline-block; padding: 8px 16px; border-radius: 8px;
    background: #e5e5e5; color: #0a0a0a; text-decoration: none; font-weight: 500;
  }
  a.retry:hover { background: #fff; }
  .unlinkable { color: #fca5a5; margin: 0; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: #e5e5e5; }
</style>
</head>
<body>
  <main>
    <h1>Can't reach Sparstrowgen</h1>
    <p>The app didn't load. This window needs a connection to it; nothing on this machine has stopped.</p>

    <div class="detail">
      <strong>Tried to load</strong>${url}
      <span><strong>Error</strong>${error}</span>
    </div>

    <p class="reassure">
      Your agents are still running. The daemon on this machine is a separate
      process and is unaffected — scheduled work keeps firing, and anything
      in progress keeps going. Only this window is disconnected.
    </p>

    ${retry}
  </main>
</body>
</html>`;
}

/**
 * The screen as something `loadURL` accepts.
 *
 * `encodeURIComponent` rather than base64: the payload is small, and a URL that
 * stays readable in a log is worth more here than the few bytes.
 */
export function offlineScreenUrl(input: OfflineScreenInput): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(buildOfflineHtml(input))}`;
}
