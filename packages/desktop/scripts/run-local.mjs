// Launches an installed Sparstrowgen desktop channel against a local
// apps/web dev server instead of its real hosted appUrl — workaround for
// G-54 (doc/KnownGaps.md): Vercel's free-plan usage cap has every hosted
// environment (sparstrow.com, staging.sparstrow.com, development.sparstrow.com)
// paused, so a plain launch of the installed app shows Vercel's own
// "Deployment Paused" page instead of the real UI.
//
// Starts apps/web's dev server itself if nothing's already listening on the
// channel's port, waits for it to accept connections, then launches the
// installed app with SPARSTROW_APP_URL pointed at it — a packaged app
// doesn't inherit a terminal session's env the way `npm start` does in dev
// mode, so this has to set it directly on the spawned process, not rely on
// a persistent Windows user env var (confirmed live 2026-08-30: that only
// takes effect for NEW top-level processes launched *after* the registry
// write is broadcast and picked up — unreliable for "right now").
//
// Both the dev server and the app are launched via PowerShell's
// Start-Process, not Node's child_process.spawn(detached). Node's
// `detached: true` on Windows only sets CREATE_NEW_PROCESS_GROUP, not
// CREATE_BREAKAWAY_FROM_JOB — in a job-object-constrained environment (any
// sandboxed/automated shell, confirmed live against this one), the child
// still dies the instant its immediate parent process's job closes, no
// matter that it's "detached" and unref()'d. Start-Process doesn't have
// this problem. If you're changing this script, do NOT switch back to
// spawn(..., {detached: true}) without re-verifying it actually survives —
// this exact regression is why this comment exists.
//
// Each channel gets a fixed, dedicated port from the Supabase-allow-listed
// worktree pool, NOT an arbitrary unused one — a local sign-in/magic-link/
// password-reset redirect silently bounces to the Site URL on any port
// outside that allow-list. Full reasoning and the port table:
// .claude/skills/worktree-orchestration/references/port-registry.md
//
// Usage: node scripts/run-local.mjs <stable|staging>
// Windows only. Retire this whole workaround once G-54 clears.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.join(here, "..");
const repoRoot = path.join(desktopDir, "..", "..");

const PORTS = { stable: 3050, staging: 3060 };
const APP_NAME = { stable: "Sparstrowgen", staging: "Sparstrowgen Staging" };

const channel = process.argv[2];
if (!PORTS[channel]) {
  console.error(`[run-local] usage: node scripts/run-local.mjs <${Object.keys(PORTS).join("|")}>`);
  process.exitCode = 1;
} else if (process.platform !== "win32") {
  console.error(`[run-local] Windows only for now (uses PowerShell Start-Process) — running on ${process.platform}`);
  process.exitCode = 1;
} else {
  await main(channel);
}

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host: "127.0.0.1" });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
    socket.setTimeout(1000, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function waitForPort(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isPortOpen(port)) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

/** Runs a short PowerShell script and waits for it to finish (the script itself only issues Start-Process calls, which return immediately — this is not the same as waiting for the launched process). */
function runPowerShell(script) {
  execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { stdio: "inherit" });
}

async function main(channel) {
  const port = PORTS[channel];
  const appUrl = `http://localhost:${port}`;

  if (await isPortOpen(port)) {
    console.log(`[run-local] dev server already listening on :${port} — reusing it`);
  } else {
    const outLog = path.join(os.tmpdir(), `sparstrowgen-run-local-${channel}-out.log`);
    const errLog = path.join(os.tmpdir(), `sparstrowgen-run-local-${channel}-err.log`);
    console.log(`[run-local] starting apps/web dev server on :${port} (logs: ${outLog} / ${errLog})`);
    // No "--" before --port: pnpm forwards unrecognized flags to the
    // underlying script automatically. Adding "--" here made pnpm forward
    // the literal "--" token through to `next dev`, which then reads it as
    // its own end-of-flags marker and treats "--port" as the positional
    // project-directory argument instead of a flag -- confirmed live.
    runPowerShell(
      `Start-Process -FilePath 'cmd.exe' ` +
        `-ArgumentList @('/c','pnpm','--filter','web','dev','--port','${port}') ` +
        `-WorkingDirectory '${repoRoot}' -WindowStyle Hidden ` +
        `-RedirectStandardOutput '${outLog}' -RedirectStandardError '${errLog}'`,
    );

    const ready = await waitForPort(port, 60_000);
    if (!ready) {
      console.error(`[run-local] dev server didn't come up on :${port} within 60s — check ${errLog} for the actual error`);
      process.exitCode = 1;
      return;
    }
    console.log(`[run-local] dev server ready on :${port}`);
  }

  const exePath = path.join(
    process.env.LOCALAPPDATA ?? "",
    "Programs",
    APP_NAME[channel],
    `${APP_NAME[channel]}.exe`,
  );
  if (!fs.existsSync(exePath)) {
    console.error(`[run-local] ${exePath} doesn't exist — install the ${channel} build first (see the release skill)`);
    process.exitCode = 1;
    return;
  }

  console.log(`[run-local] launching ${APP_NAME[channel]} -> ${appUrl}`);
  // Both vars, not just SPARSTROW_APP_URL: packaged-env.ts only fills
  // SPARSTROW_CLOUD_URL from the channel's baked default when it isn't
  // already set (`??=`), and the bundled core daemon reads THAT one for its
  // own cloud/control-plane connection -- it's a separate process from the
  // renderer and doesn't care what URL the window loads. Missing this made
  // the daemon silently try to reach the real (paused) hosted URL and never
  // come online, confirmed live 2026-08-30 while pairing a machine: `sparstrow
  // pair --status` showed a valid pairing, but the bundled daemon still
  // showed offline in the Machines page because it was never actually
  // talking to this local server at all.
  runPowerShell(
    `$env:SPARSTROW_APP_URL = '${appUrl}'; $env:SPARSTROW_CLOUD_URL = '${appUrl}'; ` +
      `Start-Process -FilePath '${exePath}'`,
  );
}
