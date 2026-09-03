import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { app, safeStorage, shell } from "electron";

/**
 * Signing this window in.
 *
 * ─── Why it works this way ────────────────────────────────────────────────
 *
 * An agent cannot type a password and neither should a desktop app: a native
 * window asking for credentials is indistinguishable from one that is phishing
 * them, and it would have to handle MFA, OAuth providers and password resets
 * itself. So the browser does it, exactly as `sparstrow setup` already does for
 * a headless machine — this is the **same `/connect` flow**, reusing the same
 * routes and the same confirm page rather than growing a second one.
 *
 *   1. this process opens a loopback listener on a random port
 *   2. it registers a connect attempt naming that callback
 *   3. it opens the system browser at the confirm page
 *   4. the person, already signed in there, clicks once
 *   5. the browser redirects to the loopback, which exchanges the attempt id
 *      for a real personal access token
 *
 * The token is minted **only after** the redirect has arrived, which is what
 * closes the race a mint-before-redirect design would have: an attempt that is
 * never confirmed leaves no credential behind.
 *
 * ─── What crosses which boundary ──────────────────────────────────────────
 *
 * The renderer never sees the token. It asks main to sign in, and gets back
 * whether it worked. When it needs to call `server/`, it asks main for a
 * credential — which is the one place the value is handed over, and only to our
 * own renderer over a contextIsolated bridge.
 */

const ATTEMPT_TIMEOUT_MS = 5 * 60_000;

/** Where the encrypted token lives. Under userData, so it survives updates. */
function tokenPath(): string {
  return path.join(app.getPath("userData"), "session.bin");
}

/** A stable id for this computer, so re-connecting does not create a twin. */
function machineIdPath(): string {
  return path.join(app.getPath("userData"), "machine-id");
}

export function getOrCreateMachineId(): string {
  const file = machineIdPath();
  try {
    const existing = fs.readFileSync(file, "utf8").trim();
    if (existing) return existing;
  } catch {
    // Not created yet.
  }
  const id = `m_${randomUUID().replace(/-/g, "")}`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, id, "utf8");
  return id;
}

/**
 * Store the token encrypted by the OS keychain (DPAPI on Windows, Keychain on
 * macOS, libsecret on Linux).
 *
 * **If encryption is unavailable this refuses rather than falling back to
 * plaintext.** A credential that acts as the whole person does not belong in a
 * readable file because a fallback felt more convenient than an error, and the
 * failure would be invisible — everything would work, and the token would just
 * be sitting there.
 */
export function saveToken(token: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error(
      "This system has no secure credential storage available, so the session " +
        "cannot be saved safely. Sparstrowgen will not write it in plain text.",
    );
  }
  const file = tokenPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, safeStorage.encryptString(token));
}

export function readToken(): string | null {
  try {
    if (!safeStorage.isEncryptionAvailable()) return null;
    return safeStorage.decryptString(fs.readFileSync(tokenPath()));
  } catch {
    // Absent, or written by a different OS user / a reinstalled keychain.
    // Either way there is no usable session and signing in again is the answer.
    return null;
  }
}

export function forgetToken(): void {
  try {
    fs.rmSync(tokenPath(), { force: true });
  } catch {
    // Nothing stored, or already gone.
  }
}

export type SignInResult = { ok: true } | { ok: false; error: string };

type ConnectResponse = { attemptId: string; confirmUrl: string };
type ExchangeResponse = { token: string; machineId?: string };

/**
 * `appUrl` is the WEB app, not `server/`.
 *
 * They are genuinely different destinations here: the confirm page is a screen
 * a human looks at while already signed in, and only `apps/web` has one. The
 * API this window then calls is `server/`. Collapsing the two would mean
 * `server/` growing a sign-in UI it has no other reason to have.
 */
export async function signIn(appUrl: string, deviceName?: string): Promise<SignInResult> {
  const base = appUrl.replace(/\/+$/, "");
  const machineId = getOrCreateMachineId();

  let settled = false;
  let onDone: (r: SignInResult) => void = () => {};
  const finished = new Promise<SignInResult>((resolve) => {
    onDone = resolve;
  });

  const server = http.createServer((req, res) => {
    void (async () => {
      // Any request to the loopback means the browser redirected here. The
      // attempt id is not read from the URL: this process created it and
      // already knows it, so nothing a browser sends can redirect the exchange.
      if (settled) {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end("<p>Already connected. You can close this tab.</p>");
        return;
      }
      settled = true;
      try {
        const exchanged = await postJson<ExchangeResponse>(
          `${base}/api/daemon/connect/exchange`,
          { attemptId },
        );
        saveToken(exchanged.token);
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end("<p>Connected. You can close this tab and return to Sparstrowgen.</p>");
        onDone({ ok: true });
      } catch (err) {
        res.writeHead(500, { "content-type": "text/html; charset=utf-8" });
        res.end("<p>Could not complete sign-in. Return to Sparstrowgen and try again.</p>");
        onDone({ ok: false, error: err instanceof Error ? err.message : String(err) });
      } finally {
        server.close();
      }
    })();
  });

  await new Promise<void>((resolve, reject) => {
    // Port 0 = let the OS pick a free one. A fixed port would collide with
    // anything else on the machine and is one more thing to keep in a registry.
    server.listen(0, "127.0.0.1", resolve).on("error", reject);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    return { ok: false, error: "Could not open a local callback listener." };
  }
  const callback = `http://127.0.0.1:${address.port}/callback`;

  let attemptId: string;
  let confirmUrl: string;
  try {
    const created = await postJson<ConnectResponse>(`${base}/api/daemon/connect`, {
      machineId,
      callback,
      name: deviceName ?? os.hostname(),
      hostname: os.hostname(),
      os: process.platform,
      isElectron: true,
      capabilities: [],
      coreVersion: app.getVersion(),
    });
    attemptId = created.attemptId;
    confirmUrl = created.confirmUrl;
  } catch (err) {
    server.close();
    return {
      ok: false,
      error:
        err instanceof Error
          ? `Could not reach ${base}: ${err.message}`
          : `Could not reach ${base}.`,
    };
  }

  await shell.openExternal(confirmUrl);

  const timeout = setTimeout(() => {
    if (settled) return;
    settled = true;
    server.close();
    onDone({ ok: false, error: "Timed out waiting for the browser. Try again." });
  }, ATTEMPT_TIMEOUT_MS);

  const result = await finished;
  clearTimeout(timeout);
  return result;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data?.error) detail = data.error;
    } catch {
      // Non-JSON error body; the status is all we have.
    }
    throw new Error(detail);
  }
  return (await res.json()) as T;
}
