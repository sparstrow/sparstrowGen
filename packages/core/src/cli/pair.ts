#!/usr/bin/env node
import type { DaemonIdentity } from "@sparstrow/shared";
import { config } from "../config.js";
import {
  CloudAuthError,
  cloudFetch,
  clearPairing,
  getRuntimeId,
  getWorkspaceId,
  isPaired,
} from "../cloud/client.js";
import { PairError, pairWithCode } from "../cloud/pairing.js";

/**
 * `sparstrow pair <code>` — the one human step in connecting a machine.
 *
 * This is the first command anyone runs on a new machine, and often the only
 * one they run by hand, so every failure gets a specific message and a distinct
 * exit code. "Something went wrong" here means someone stares at a terminal
 * with no idea whether to retype the code, generate a new one, or check the
 * network.
 *
 * Exit codes:
 *   0  paired (or already paired, for --status)
 *   1  the code was rejected — wrong, used, or expired
 *   2  the control plane could not be reached
 */

const EXIT_OK = 0;
const EXIT_REJECTED = 1;
const EXIT_UNREACHABLE = 2;

const HELP = `sparstrow pair — connect this machine to a Sparstrow workspace

USAGE
  sparstrow pair <code>          Redeem a pairing code from Settings → Workspace
  sparstrow pair --status        Show whether this machine is paired, and to what
  sparstrow pair --unpair        Forget the stored token (does not revoke it)
  sparstrow pair --help

OPTIONS
  --name <name>   Label for this machine. Defaults to its hostname; you can
                  rename it later in the web UI without re-pairing.
  --force         Replace an existing pairing. Refused by default so a second
                  run cannot silently move a machine between workspaces.

GETTING A CODE
  In the web app, open Settings → Workspace → Runtimes and choose "Pair a
  machine". Codes last 10 minutes and work exactly once.

NOTES
  The token is stored encrypted in ${config.secretsDir}, never in the project
  directory, and is never printed. Revoking a machine in the web UI stops it
  connecting on its next request.

  Control plane: ${config.cloudUrl}
  Override with SPARSTROW_CLOUD_URL.
`;

function fail(code: number, message: string): never {
  console.error(message);
  process.exit(code);
}

async function showStatus(): Promise<never> {
  if (!isPaired()) {
    console.log("This machine is not paired.");
    console.log("Run `sparstrow pair <code>` with a code from Settings → Workspace → Runtimes.");
    process.exit(EXIT_OK);
  }

  console.log(`Paired to workspace ${getWorkspaceId()}`);
  console.log(`Runtime id          ${getRuntimeId()}`);
  console.log(`Control plane       ${config.cloudUrl}`);

  // Confirm the pairing is still good rather than only that a token exists on
  // disk — a revoked machine looks identical locally until it tries to talk.
  try {
    const me = await cloudFetch<DaemonIdentity>("/me", { method: "GET", retries: 0 });
    console.log(`Name                ${me.name}`);
    console.log(`Status              ${me.online ? "online" : "offline"} (${me.status})`);
    process.exit(EXIT_OK);
  } catch (err) {
    if (err instanceof CloudAuthError) {
      console.error(
        err.revoked
          ? "\nThis pairing has been REVOKED. Run `sparstrow pair <code> --force` to reconnect."
          : "\nThe stored token was rejected. Run `sparstrow pair <code> --force` to re-pair.",
      );
      process.exit(EXIT_REJECTED);
    }
    console.error(`\nCould not reach the control plane at ${config.cloudUrl}.`);
    process.exit(EXIT_UNREACHABLE);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  // Tolerate `sparstrow pair pair <code>`: npm bin naming means people reach
  // this either as `sparstrow pair` or, once more subcommands exist, as
  // `sparstrow pair …`. Swallowing a leading "pair" costs nothing.
  if (args[0] === "pair") args.shift();

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log(HELP);
    process.exit(args.length === 0 ? EXIT_REJECTED : EXIT_OK);
  }

  if (args.includes("--status")) await showStatus();

  if (args.includes("--unpair")) {
    if (!isPaired()) {
      console.log("This machine was not paired. Nothing to do.");
      process.exit(EXIT_OK);
    }
    clearPairing();
    console.log("Forgot the stored pairing.");
    console.log(
      "Note: this does NOT revoke the token in the cloud. Revoke it in Settings → Workspace → Runtimes if the machine is no longer trusted.",
    );
    process.exit(EXIT_OK);
  }

  const force = args.includes("--force");
  const nameIndex = args.indexOf("--name");
  const name = nameIndex !== -1 ? args[nameIndex + 1] : undefined;
  const code = args.find((arg) => !arg.startsWith("--") && arg !== name);

  if (!code) fail(EXIT_REJECTED, "No pairing code given.\n\n" + HELP);

  if (isPaired() && !force) {
    fail(
      EXIT_REJECTED,
      `This machine is already paired to workspace ${getWorkspaceId()}.\n` +
        "Re-run with --force to replace that pairing, or --status to inspect it.",
    );
  }

  try {
    const result = await pairWithCode(code, name);
    console.log("Paired.");
    console.log(`  Workspace   ${result.workspaceId}`);
    console.log(`  Runtime id  ${result.runtimeId}`);
    console.log("");
    // The token is deliberately absent from this output. It is written to the
    // encrypted store and shown to nobody, including the person who just
    // paired the machine -- there is nothing they would do with it.
    console.log("Restart sparstrow core so it picks up the new pairing.");
    process.exit(EXIT_OK);
  } catch (err) {
    if (err instanceof PairError) {
      fail(err.failure === "unreachable" ? EXIT_UNREACHABLE : EXIT_REJECTED, err.message);
    }
    fail(EXIT_UNREACHABLE, err instanceof Error ? err.message : String(err));
  }
}

void main();
