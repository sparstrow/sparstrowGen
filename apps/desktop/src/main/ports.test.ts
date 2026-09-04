import { afterEach, describe, expect, it } from "vitest";
import {
  CHANNEL_PORTS,
  coreBaseUrl,
  corePort,
  portsForChannel,
  serverBaseUrl,
  serverPort,
  setPorts,
} from "./ports";

/**
 * The bug these guard against destroyed an install's data rather than crashing.
 *
 * Two Sparstrowgen installs both listened on 48750 and 8080. The app ADOPTS a
 * server it finds already running, so the second install adopted the first
 * one's and began operating on its data believing it was its own. Nothing
 * failed loudly; it just quietly worked on the wrong machine's state.
 */

afterEach(() => {
  setPorts(CHANNEL_PORTS.stable);
  delete process.env.SPARSTROW_CORE_URL;
  delete process.env.SPARSTROW_SERVER_URL;
});

describe("channel ports", () => {
  it("gives stable and dev completely disjoint ports", () => {
    const used = [
      CHANNEL_PORTS.stable.core,
      CHANNEL_PORTS.stable.server,
      CHANNEL_PORTS.dev.core,
      CHANNEL_PORTS.dev.server,
    ];
    expect(new Set(used).size).toBe(used.length);
  });

  it("keeps stable on the ports an already-installed build is using", () => {
    // Changing these orphans every existing install: it would look for its own
    // daemon on a port nothing is listening to.
    expect(CHANNEL_PORTS.stable).toEqual({ core: 48750, server: 8080 });
  });

  it("falls back to stable for an unknown or missing channel", () => {
    // An install whose channel.json is unreadable must keep the behaviour it
    // had, not move to a new port and lose track of its own daemon.
    expect(portsForChannel(undefined)).toEqual(CHANNEL_PORTS.stable);
    expect(portsForChannel("something-else")).toEqual(CHANNEL_PORTS.stable);
    expect(portsForChannel("dev")).toEqual(CHANNEL_PORTS.dev);
  });
});

describe("lazy resolution", () => {
  it("reflects a setPorts that happens after import", () => {
    // The whole reason this module exists as functions. main.ts imports
    // core-client and service-manager on lines 3 and 6 but does not apply the
    // channel config until line 52, so anything captured at import time is
    // always the default and never the configured value.
    expect(corePort()).toBe(48750);
    setPorts(CHANNEL_PORTS.dev);
    expect(corePort()).toBe(48850);
    expect(serverPort()).toBe(8180);
    expect(coreBaseUrl()).toBe("http://127.0.0.1:48850");
    expect(serverBaseUrl()).toBe("http://127.0.0.1:8180");
  });

  it("lets an explicit env override win, and reads it per call", () => {
    setPorts(CHANNEL_PORTS.dev);
    process.env.SPARSTROW_CORE_URL = "http://127.0.0.1:9999";
    expect(coreBaseUrl()).toBe("http://127.0.0.1:9999");
    delete process.env.SPARSTROW_CORE_URL;
    // Read per call, not captured: clearing it goes back to the channel port.
    expect(coreBaseUrl()).toBe("http://127.0.0.1:48850");
  });
});
