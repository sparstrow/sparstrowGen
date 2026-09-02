#!/usr/bin/env node
import type { DaemonIdentity } from "@sparstrow/shared";
import { config } from "../config.js";
import {
  CloudAuthError,
  cloudFetch,
  clearConnection,
  getMachineId,
  getOrCreateMachineId,
  getRuntimes,
  isPaired,
  saveConnection,
} from "../cloud/client.js";
import { claimMachine } from "../cloud/claim.js";
import { PairError, pairViaBrowser } from "../cloud/connect.js";

/**
 * `sparstrow setup` — connecting a computer that has no signed-in app of its
 * own.
 *
 * Most machines never run this. The desktop app connects the computer it runs
 * on the moment someone signs in (US1); this is for the other case — a server,
 * a dev box, a machine you reached over SSH.
 *
 * No code and no argument: this opens a browser to an already signed-in
 * confirm screen and waits. `--token` covers the machine that cannot open a
 * browser at all (US6), using a credential created by hand on the Settings ->
 * API Tokens page.
 *
 * Every failure gets a specific message and a distinct exit code. "Something
 * went wrong" here means someone stares at a terminal with no idea whether to
 * retry, check their browser, or check the network.
 *
 * Exit codes:
 *   0  connected (or already connected, for --status)
 *   1  the attempt was rejected — expired, already used, or refused
 *   2  the control plane could not be reached
 */

const EXIT_OK = 0;
const EXIT_REJECTED = 1;
const EXIT_UNREACHABLE = 2;

const HELP = `sparstrow setup — connect this computer to your Sparstrow account

USAGE
  sparstrow setup                Open a browser to connect this computer
  sparstrow setup --token <tok>  Connect using a token created in the browser
  sparstrow setup --status       Show whether this computer is connected
  sparstrow setup --disconnect   Forget the stored token (does not revoke it)
  sparstrow setup --help

OPTIONS
  --name <name>   Label for this computer. Defaults to its hostname; you can
                  rename it later in the app without reconnecting.
  --token <tok>   For a machine with no browser: create a token on the
                  Settings -> API Tokens page and paste it here. Pass
                  \`--token=\` with an empty value to be prompted instead, so
                  the token never lands in your shell history.
  --force         Replace an existing connection. Refused by default so a
                  second run cannot silently move a computer between accounts.

HOW IT WORKS
  This starts a local listener, opens your default browser to a confirm screen
  on an already signed-in session, and waits up to 5 minutes for you to
  confirm. Nothing is ever shown to copy or type. If a browser can't be opened
  automatically, the URL is printed so you can open it yourself — on another
  device if this one has no display.

  Your computer then serves every workspace you belong to, and picks up new
  ones automatically. There is no workspace to choose here.

NOTES
  The token is stored encrypted in ${config.secretsDir}, never in the project
  directory, and is never printed. Revoking a computer in the app stops it
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
    console.log("This computer is not connected.");
    console.log("Run `sparstrow setup` to connect it.");
    process.exit(EXIT_OK);
  }

  const runtimes = getRuntimes();
  console.log(`Machine id      ${getMachineId()}`);
  console.log(`Workspaces      ${runtimes.length}`);
  for (const binding of runtimes) {
    console.log(`  ${binding.workspaceId}  (runtime ${binding.runtimeId})`);
  }
  console.log(`Control plane   ${config.cloudUrl}`);

  // Confirm the connection is still good rather than only that a token exists
  // on disk — a revoked computer looks identical locally until it tries to
  // talk.
  try {
    const me = await cloudFetch<DaemonIdentity>("/me", { method: "GET", retries: 0 });
    console.log(`Name            ${me.name}`);
    console.log(`Status          ${me.online ? "online" : "offline"} (${me.status})`);
    process.exit(EXIT_OK);
  } catch (err) {
    if (err instanceof CloudAuthError) {
      console.error(
        err.revoked
          ? "\nThis computer's access has been REVOKED. Run `sparstrow setup --force` to reconnect."
          : "\nThe stored token was rejected. Run `sparstrow setup --force` to reconnect.",
      );
      process.exit(EXIT_REJECTED);
    }
    console.error(`\nCould not reach the control plane at ${config.cloudUrl}.`);
    process.exit(EXIT_UNREACHABLE);
  }
}

/**
 * Read a value given as either `--flag value` or `--flag=value`.
 *
 * Returns `undefined` when the flag is absent and `null` when it is present
 * with no value. That distinction is the whole point: `--token=` with nothing
 * after it is a request to be prompted, so the token never reaches shell
 * history — not a malformed argument.
 */
function flagValue(args: string[], flag: string): string | null | undefined {
  const joined = args.find((a) => a.startsWith(`${flag}=`));
  if (joined !== undefined) return joined.slice(flag.length + 1) || null;
  const idx = args.indexOf(flag);
  if (idx === -1) return undefined;
  const next = args[idx + 1];
  return next && !next.startsWith("--") ? next : null;
}

/** Prompt without echoing, so a pasted token is not left on screen. */
function promptSecret(label: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(label);
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw ?? false;
    if (stdin.isTTY) stdin.setRawMode(true);
    stdin.resume();
    let value = "";
    const finish = (result: string) => {
      if (stdin.isTTY) stdin.setRawMode(wasRaw);
      stdin.pause();
      stdin.off("data", onData);
      process.stdout.write("\n");
      resolve(result);
    };
    const onData = (chunk: Buffer) => {
      const char = chunk.toString("utf8");
      if (char === "\n" || char === "\r" || char === "") return finish(value.trim());
      // Ctrl-C inside a raw-mode read does not raise SIGINT for us, so it has
      // to be handled here or the prompt becomes unquittable.
      if (char === "") {
        if (stdin.isTTY) stdin.setRawMode(wasRaw);
        process.stdout.write("\n");
        process.exit(EXIT_REJECTED);
      }
      if (char === "") {
        value = value.slice(0, -1);
        return;
      }
      value += char;
    };
    stdin.on("data", onData);
  });
}

/**
 * US6 — connect a machine that cannot open a browser, using a token created by
 * hand on the Settings -> API Tokens page.
 *
 * This is what closes `D-29`, the headless/remote case knowingly given up when
 * typed pairing codes were removed. It is nearly free now only because the
 * credential became person-scoped: there is no workspace to choose and nothing
 * to redeem, so connecting is just storing a token and claiming with it.
 */
async function connectWithToken(rawToken: string | null, name?: string): Promise<never> {
  const token = rawToken ?? (await promptSecret("Paste your access token: "));
  if (!token) fail(EXIT_REJECTED, "No token was given.");

  // Stored before it is proved, so a claim that fails on a flaky network is
  // retryable without pasting the token again. A genuinely bad token fails the
  // claim below and is cleared there.
  saveConnection({ token, machineId: getOrCreateMachineId(), runtimes: [] });

  try {
    const result = await claimMachine(name);
    console.log("\nConnected.");
    console.log(`  Machine id  ${getMachineId()}`);
    console.log(`  Workspaces  ${result?.runtimes.length ?? 0}`);
    console.log("");
    console.log("Restart sparstrow core so it picks up the new connection.");
    process.exit(EXIT_OK);
  } catch (err) {
    clearConnection();
    if (err instanceof CloudAuthError) {
      fail(
        EXIT_REJECTED,
        "That token was rejected. Create a new one on the Settings -> API Tokens page.",
      );
    }
    fail(EXIT_UNREACHABLE, `Could not reach the control plane at ${config.cloudUrl}.`);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  // Tolerate a repeated subcommand: people reach this either as `sparstrow` or,
  // once more subcommands exist, as `sparstrow setup ...`. "pair" is swallowed
  // too — that is what this command was called until 2026-09-02, and muscle
  // memory outlives a rename.
  if (args[0] === "setup" || args[0] === "pair") args.shift();

  if (args.includes("--help") || args.includes("-h")) {
    console.log(HELP);
    process.exit(EXIT_OK);
  }

  if (args.includes("--status")) await showStatus();

  if (args.includes("--disconnect") || args.includes("--unpair")) {
    if (!isPaired()) {
      console.log("This computer was not connected. Nothing to do.");
      process.exit(EXIT_OK);
    }
    clearConnection();
    console.log("Forgot the stored connection.");
    console.log(
      "Note: this does NOT revoke the token. Revoke it on the Settings -> API Tokens page if this computer is no longer trusted.",
    );
    process.exit(EXIT_OK);
  }

  const force = args.includes("--force");
  const name = flagValue(args, "--name") ?? undefined;

  if (isPaired() && !force) {
    fail(
      EXIT_REJECTED,
      `This computer is already connected (${getRuntimes().length} workspace(s)).\n` +
        "Re-run with --force to replace that connection, or --status to inspect it.",
    );
  }

  const tokenFlag = flagValue(args, "--token");
  if (tokenFlag !== undefined) await connectWithToken(tokenFlag, name);

  try {
    const result = await pairViaBrowser(name, {
      onListening: (confirmUrl) => {
        console.log(`Opening your browser to confirm...\n  ${confirmUrl}`);
      },
      onBrowserOpenFailed: (confirmUrl) => {
        console.log(`\nCould not open a browser automatically. Open this URL to continue:`);
        console.log(`  ${confirmUrl}`);
      },
      onWaiting: () => {
        console.log("\nWaiting for you to confirm in the browser (up to 5 minutes)...");
      },
    });
    console.log("\nConnected.");
    console.log(`  Machine id  ${result.machineId}`);
    console.log(`  Workspaces  ${getRuntimes().length}`);
    console.log("");
    // The token is deliberately absent from this output. It is written to the
    // encrypted store and shown to nobody, including the person who just ran
    // this — there is nothing they would do with it.
    console.log("Restart sparstrow core so it picks up the new connection.");
    process.exit(EXIT_OK);
  } catch (err) {
    if (err instanceof PairError) {
      fail(err.failure === "unreachable" ? EXIT_UNREACHABLE : EXIT_REJECTED, err.message);
    }
    fail(EXIT_UNREACHABLE, err instanceof Error ? err.message : String(err));
  }
}

void main();
