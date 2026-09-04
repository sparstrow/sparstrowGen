import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readChannelConfig } from "./channel";

const dirs: string[] = [];

function makeResourcesDir(contents: string | null): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sparstrow-channel-test-"));
  dirs.push(dir);
  if (contents !== null) fs.writeFileSync(path.join(dir, "channel.json"), contents);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("readChannelConfig", () => {
  it("is null when unpackaged — no resourcesPath to read", () => {
    expect(readChannelConfig(null)).toBeNull();
  });

  it("is null when the file is missing — a packaged build without a baked resource degrades, not crashes", () => {
    const dir = makeResourcesDir(null);
    expect(readChannelConfig(dir)).toBeNull();
  });

  it("is null on malformed JSON", () => {
    const dir = makeResourcesDir("not json");
    expect(readChannelConfig(dir)).toBeNull();
  });

  it("is null when a required field is missing", () => {
    const dir = makeResourcesDir(JSON.stringify({ channel: "stable", updateChannel: "latest" }));
    expect(readChannelConfig(dir)).toBeNull();
  });

  it("is null when channel is not one of the known values", () => {
    const dir = makeResourcesDir(
      JSON.stringify({
        channel: "nightly",
        updateChannel: "latest",
        appUrl: "https://sparstrow.com",
        cloudUrl: "https://sparstrow.com",
      }),
    );
    expect(readChannelConfig(dir)).toBeNull();
  });

  it("reads a well-formed stable config", () => {
    const dir = makeResourcesDir(
      JSON.stringify({
        channel: "stable",
        updateChannel: "latest",
        appUrl: "https://sparstrow.com",
        cloudUrl: "https://sparstrow.com",
      }),
    );
    expect(readChannelConfig(dir)).toEqual({
      channel: "stable",
      updateChannel: "latest",
      appUrl: "https://sparstrow.com",
      cloudUrl: "https://sparstrow.com",
    });
  });

  it("reads a well-formed dev config, ports and all", () => {
    const dir = makeResourcesDir(
      JSON.stringify({
        channel: "dev",
        updateChannel: "none",
        appUrl: "http://127.0.0.1:8180",
        cloudUrl: "http://127.0.0.1:8180",
        corePort: 48850,
        serverPort: 8180,
      }),
    );
    const config = readChannelConfig(dir);
    expect(config?.channel).toBe("dev");
    expect(config?.corePort).toBe(48850);
    expect(config?.serverPort).toBe(8180);
  });

  it("still accepts a config from before ports existed", () => {
    // An install updated from an older build carries a channel.json with no
    // ports. Rejecting it would make the app fall back to "no channel at all",
    // which is a bigger behaviour change than the missing field.
    const dir = makeResourcesDir(
      JSON.stringify({
        channel: "stable",
        updateChannel: "latest",
        appUrl: "https://sparstrow.com",
        cloudUrl: "https://sparstrow.com",
      }),
    );
    expect(readChannelConfig(dir)?.corePort).toBeUndefined();
  });

  it("rejects a config whose ports are not real ports", () => {
    const dir = makeResourcesDir(
      JSON.stringify({
        channel: "dev",
        updateChannel: "none",
        appUrl: "http://127.0.0.1:8180",
        cloudUrl: "http://127.0.0.1:8180",
        corePort: "48850",
      }),
    );
    expect(readChannelConfig(dir)).toBeNull();
  });

  it("rejects the retired staging channel", () => {
    const dir = makeResourcesDir(
      JSON.stringify({
        channel: "staging",
        updateChannel: "staging",
        appUrl: "https://staging.sparstrow.com",
        cloudUrl: "https://staging.sparstrow.com",
      }),
    );
    expect(readChannelConfig(dir)).toBeNull();
  });
});
