import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { mainLogPath, startFileLogging } from "./log-file";

/**
 * `currentPath` is module-level state with a one-shot guard
 * (`if (currentPath) return;`), so this file gets exactly one meaningful call
 * to `startFileLogging` for its whole lifetime — matching the real app, which
 * only ever calls it once per process.
 */
describe("startFileLogging", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sparstrow-log-file-test-"));
  const originalLog = console.log;

  afterAll(() => {
    console.log = originalLog;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("does not crash the process when the log stream fails to open, and console still works", async () => {
    // `main.log` is pre-created as a DIRECTORY, not a file: `createWriteStream`
    // returns synchronously (no throw the surrounding try/catch could see) and
    // then emits an async 'error' (EISDIR) once it actually tries to open it —
    // the exact shape BUG-2026-09-03-update-restart-leaves-broken-install-and-
    // silences-main-log.md describes for why main.log went silent for an
    // entire incident. An unhandled 'error' event on a stream is fatal to the
    // process, so simply reaching the assertions below (rather than the test
    // process dying) is most of what this test is checking.
    fs.mkdirSync(path.join(dir, "main.log"));

    startFileLogging(dir);
    expect(mainLogPath()).toBe(path.join(dir, "main.log"));

    // Let the async 'error' event fire.
    await new Promise((r) => setTimeout(r, 50));

    // `console.log` is now `startFileLogging`'s own patched wrapper (it
    // replaced the global). Calling it must not throw even though its stream
    // is gone — main.log can't be read back to prove content here, since it's
    // a directory in this test, but a broken stream silently going dark
    // instead of taking the process down with it is exactly the point.
    expect(() => console.log("still callable after a broken stream")).not.toThrow();
  });
});
