import { afterEach, describe, expect, it } from "vitest";
import { closeDb, isDbOpen, openDb } from "./connection.js";

/**
 * A spawned agent's `close` handler can fire after core has shut the database —
 * closing a laptop mid-run, or a test tearing down while a child is still
 * exiting. `getDb()` throws in that window, which surfaced as six uncaught
 * exceptions the first time CI ran the suite on Linux, where spawn failures
 * return fast enough to lose the race. Callers on async child-process paths
 * check this first instead.
 */
describe("isDbOpen", () => {
  afterEach(() => {
    closeDb();
  });

  it("is false before the database is opened", () => {
    closeDb();
    expect(isDbOpen()).toBe(false);
  });

  it("is true once the database is open", () => {
    openDb(":memory:");
    expect(isDbOpen()).toBe(true);
  });

  it("is false again after close, so late child handlers can bail out", () => {
    openDb(":memory:");
    closeDb();
    expect(isDbOpen()).toBe(false);
  });
});
