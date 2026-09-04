import fs from "node:fs";
import path from "node:path";

/**
 * Send the main process's console output to a file as well as the console.
 *
 * ## Why this exists
 *
 * A packaged Electron app has no console. Every `console.log` in the main
 * process — the whole sign-in flow, the runtime supervisor, the claim, the
 * updater — goes nowhere the moment the app is installed rather than run from a
 * terminal. Only the *runtime's* stdout was ever captured, because
 * `ServiceManager` pipes its child to `core-service.log`; the process
 * supervising it wrote to a void.
 *
 * That is why diagnosing "No machines yet" on a real installation meant reading
 * process start times and probing ports by hand: the app had already logged the
 * reason, several times, and thrown it away. Two releases went out without the
 * one line that would have named the cause.
 *
 * Deliberately NOT a logging library. The value here is entirely in the output
 * existing at all; levels, transports and structured fields would be work spent
 * on the part that was never the problem.
 */

const MAX_BYTES = 5 * 1024 * 1024;

/** Where `startFileLogging` last wrote, for the diagnostics UI to point at. */
let currentPath: string | null = null;
export function mainLogPath(): string | null {
  return currentPath;
}

export function startFileLogging(logDir: string): void {
  if (currentPath) return;
  try {
    fs.mkdirSync(logDir, { recursive: true });
    const file = path.join(logDir, "main.log");

    // Rotate by truncation rather than by keeping generations. This log is read
    // when something is wrong *now*; a week of history is not worth the code to
    // manage it, and an unbounded file on someone's machine is a real cost.
    try {
      if (fs.statSync(file).size > MAX_BYTES) fs.renameSync(file, `${file}.1`);
    } catch {
      // No existing file, or a rename that lost a race. Either is fine.
    }

    let stream: fs.WriteStream | null = fs.createWriteStream(file, { flags: "a" });
    currentPath = file;

    // `createWriteStream` returns before the fd is actually open — a transient
    // failure to open (antivirus holding a just-installed directory, e.g.)
    // surfaces as an async 'error' event, not a throw the try/catch below can
    // see. Unhandled, that event is fatal to the process. Handled, logging for
    // this session just goes dark instead of taking the app down with it —
    // `console[level]` below already prints to the real console as a fallback.
    // See BUG-2026-09-03-update-restart-leaves-broken-install-and-silences-
    // main-log.md, where main.log went silent for an entire incident with no
    // trace of why.
    stream.on("error", () => {
      stream = null;
    });

    const write = (level: string, args: unknown[]) => {
      if (!stream) return;
      const line = args
        .map((a) => {
          if (typeof a === "string") return a;
          if (a instanceof Error) return a.stack ?? a.message;
          try {
            return JSON.stringify(a);
          } catch {
            return String(a);
          }
        })
        .join(" ");
      stream.write(`${new Date().toISOString()} ${level} ${line}\n`);
    };

    for (const level of ["log", "warn", "error"] as const) {
      const original = console[level].bind(console);
      console[level] = (...args: unknown[]) => {
        original(...args);
        // A logger that can throw takes the app down with it. Losing a log line
        // is survivable; losing the process because a disk filled is not.
        try {
          write(level.toUpperCase(), args);
        } catch {
          /* ignore */
        }
      };
    }

    console.log(`[log] main-process log: ${file}`);
  } catch (err) {
    // Console-only from here. Not fatal — the app works without a log file, it
    // is just harder to help someone using it.
    console.error("[log] could not open the main-process log:", err);
  }
}
