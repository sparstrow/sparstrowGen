/**
 * The page a person confirms a new computer on.
 *
 * ## Why `server/` serves this
 *
 * It used to live only in `apps/web` as a Next page, so signing in on a fresh
 * computer required a Next.js server the desktop app does not ship. That was
 * `G-68`: pairing worked, because a stored credential is enough, but a machine
 * that had never been connected could not get one. An app you cannot sign into
 * on a second computer is not finished.
 *
 * ## Why it asks for a password, when the desktop app deliberately does not
 *
 * The app's rule stands: a NATIVE window asking for credentials is
 * indistinguishable from one phishing them, so the app opens a browser instead.
 * This is that browser page. It is served by the server on this machine, over
 * loopback, and the address bar says so.
 *
 * It is still a compromise, and worth naming rather than glossing: the ideal is
 * the identity provider's own screen (magic link, GitHub, Google), which needs a
 * public redirect URL the provider will accept. A loopback address is not one.
 * Those return when hosting arrives (`D-40`); until then this is the honest
 * smallest thing that works, and the password is posted to a server running on
 * the same computer as the browser.
 *
 * ## What this page can and cannot do
 *
 * It never sees a service role key. Sign-in goes to Supabase's own auth
 * endpoint and comes back as an ordinary user token, and the approval is made
 * with THAT token so the `connect_attempts_approve` policy is what decides
 * whether it is allowed. The database, not this page, is the authority.
 */

export function connectPageHtml(attemptId: string): string {
  const safeAttempt = escapeHtml(attemptId);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Connect this computer</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    background: #0b0b0c; color: #ededef;
    font: 14px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  .card { width: min(420px, calc(100vw - 32px)); }
  h1 { font-size: 18px; margin: 0 0 6px; font-weight: 600; }
  p { margin: 0 0 16px; color: #a1a1aa; }
  .machine {
    border: 1px solid #27272a; border-radius: 10px; padding: 12px 14px;
    margin-bottom: 20px; background: #111113;
  }
  .machine strong { display: block; font-size: 14px; }
  .machine span { color: #a1a1aa; font-size: 13px; }
  label { display: block; font-weight: 500; margin: 0 0 6px; }
  input {
    width: 100%; padding: 9px 11px; border-radius: 8px;
    border: 1px solid #27272a; background: #111113; color: inherit;
    font: inherit; margin-bottom: 14px;
  }
  input:focus-visible { outline: 2px solid #d99a2b; outline-offset: 1px; }
  button {
    width: 100%; padding: 10px 14px; border: 0; border-radius: 8px;
    background: #d99a2b; color: #1a1206; font: inherit; font-weight: 600;
    cursor: pointer;
  }
  button:disabled { opacity: .6; cursor: default; }
  .error { color: #f87171; margin: 12px 0 0; }
  .done { text-align: center; }
  .muted { color: #71717a; font-size: 12px; margin-top: 18px; }
</style>
</head>
<body>
<div class="card">
  <div id="view">
    <h1>Connect this computer</h1>
    <p>Sign in to add this computer to your workspaces.</p>
    <div class="machine" id="machine"><span>Loading…</span></div>
    <form id="form">
      <label for="email">Email</label>
      <input id="email" type="email" autocomplete="username" required autofocus>
      <label for="password">Password</label>
      <input id="password" type="password" autocomplete="current-password" required>
      <button type="submit" id="submit">Confirm</button>
      <p class="error" id="error" hidden></p>
    </form>
    <p class="muted">This page is served by Sparstrowgen on this computer. Your
      password goes to it and nowhere else.</p>
  </div>
</div>
<script>
  var attemptId = ${JSON.stringify(safeAttempt)};
  var machineEl = document.getElementById("machine");
  var errorEl = document.getElementById("error");
  var submitEl = document.getElementById("submit");

  function fail(message) {
    errorEl.textContent = message;
    errorEl.hidden = false;
    submitEl.disabled = false;
    submitEl.textContent = "Confirm";
  }

  function post(path, body) {
    return fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) throw new Error(data && data.error ? data.error : "Something went wrong.");
        return data;
      });
    });
  }

  post("/api/daemon/connect/attempt", { attemptId: attemptId })
    .then(function (a) {
      machineEl.innerHTML =
        "<strong></strong><span></span>";
      machineEl.querySelector("strong").textContent = a.name || a.hostname;
      machineEl.querySelector("span").textContent = [a.os, a.hostname].filter(Boolean).join(" · ");
    })
    .catch(function (err) {
      machineEl.innerHTML = "<span></span>";
      machineEl.querySelector("span").textContent = err.message;
    });

  document.getElementById("form").addEventListener("submit", function (e) {
    e.preventDefault();
    errorEl.hidden = true;
    submitEl.disabled = true;
    submitEl.textContent = "Confirming…";
    post("/api/daemon/connect/signin", {
      email: document.getElementById("email").value,
      password: document.getElementById("password").value,
    })
      .then(function (session) {
        return post("/api/daemon/connect/approve", {
          attemptId: attemptId,
          accessToken: session.accessToken,
        });
      })
      .then(function (result) {
        // The loopback listener in the desktop app is what exchanges the
        // approved attempt for a real credential. Sending the browser there is
        // the last step, and it is what proves a human was present.
        window.location.href = result.callback;
      })
      .catch(function (err) { fail(err.message); });
  });
</script>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}
