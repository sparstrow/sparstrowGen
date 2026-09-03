import * as React from "react";
import { createRoot } from "react-dom/client";
import { CoreProvider } from "@sparstrow/core";
import { App } from "./app";
import { desktopStorage } from "./desktop-storage";
import "./styles.css";

/**
 * The renderer's entry point — a plain Vite React SPA.
 *
 * What is NOT here is the point of the phase: no Next.js, no bundled server,
 * no second Node runtime. `main.ts` supervises one child process (the daemon)
 * and opens a window on these files.
 *
 * `apiBaseUrl` differs from the web app's, and that difference is the whole
 * reason `packages/core` takes it as an argument. The web app passes `""` and
 * relies on its own same-origin proxy, because its session is an httpOnly
 * cookie the browser must send itself. This window has no cookie and no
 * same-origin server, so it names `server/` directly and will authenticate
 * with a bearer token.
 */
const SERVER_URL =
  (window as unknown as { __SPARSTROW_SERVER_URL__?: string }).__SPARSTROW_SERVER_URL__ ??
  "http://127.0.0.1:8080";

const root = document.getElementById("root");
if (!root) throw new Error("index.html is missing #root");

createRoot(root).render(
  <React.StrictMode>
    <CoreProvider
      apiBaseUrl={SERVER_URL}
      storage={desktopStorage()}
      identity={{
        platform: "desktop",
        version: window.sparstrowDesktop?.version ?? "dev",
        os: navigator.platform || null,
      }}
      /**
       * Asked on EVERY request, never captured once.
       *
       * The token lives in the main process behind the OS keychain; this call
       * crosses the bridge to fetch it. Reading it once at startup would keep
       * authenticating after a sign-out, and would miss a sign-in that happened
       * while the window was open.
       */
      getToken={() => window.sparstrowDesktop?.session.token() ?? null}
    >
      <App />
    </CoreProvider>
  </React.StrictMode>,
);
