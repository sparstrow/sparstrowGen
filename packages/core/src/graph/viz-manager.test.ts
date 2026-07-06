import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { launchViz, stopAllViz, stopViz, vizStatus } from "./viz-manager.js";

const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), "fake-viz.fixture.mjs");
// Same DI idiom as the pool tests: spawn node directly (spike note — never bare "node").
const UI_CMD = { command: process.execPath, args: [FIXTURE] };

/**
 * T11 (UC2) viz lifecycle against a fixture with the engine UI's observable
 * contract (spike ⑥): binds --port on 127.0.0.1, serves 200, exits on stdin
 * EOF. The real binary's behavior is covered by the opt-in e2e suite.
 */
describe("viz-manager (P5 T11, UC2)", () => {
  let base: string;

  beforeEach(() => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), "sparstrow-viz-"));
  });
  afterEach(async () => {
    await stopAllViz(base);
    fs.rmSync(base, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  it("refuses to launch when the ui variant is not installed (no override, empty layout)", async () => {
    const res = await launchViz("proj-none", base);
    expect(res).toMatchObject({ ok: false, reason: "ui-not-installed" });
    expect(vizStatus("proj-none").running).toBe(false);
  });

  it("launch → 200 on a 127.0.0.1 URL; relaunch reuses the child; stop → server gone (stdin EOF)", async () => {
    const res = await launchViz("proj-a", base, UI_CMD);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    const page = await fetch(res.url);
    expect(page.status).toBe(200);
    expect(vizStatus("proj-a")).toMatchObject({ running: true, url: res.url });

    const again = await launchViz("proj-a", base, UI_CMD);
    expect(again).toMatchObject({ ok: true, url: res.url }); // same child, idle window refreshed

    await stopViz("proj-a", base);
    expect(vizStatus("proj-a").running).toBe(false);
    await vi.waitFor(async () => {
      await expect(fetch(res.url, { signal: AbortSignal.timeout(300) })).rejects.toThrow();
    });
  });

  it("two projects run two independent viz children on distinct ports", async () => {
    const a = await launchViz("proj-a", base, UI_CMD);
    const b = await launchViz("proj-b", base, UI_CMD);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.url).not.toBe(b.url);
    await stopAllViz(base);
    expect(vizStatus("proj-a").running).toBe(false);
    expect(vizStatus("proj-b").running).toBe(false);
  });
});
