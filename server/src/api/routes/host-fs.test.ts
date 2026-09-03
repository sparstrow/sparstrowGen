import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** buildServer returns a concretely-typed instance; infer it rather than widen. */
type Server = Awaited<ReturnType<(typeof import("../server.js"))["buildServer"]>>;

/**
 * 001 — the containment assertions from contracts/host-fs-api.md.
 *
 * These drive `buildServer` rather than registering `hostFsRoutes` directly,
 * because the registration gate (FR-022a) lives in server.ts. Testing a copy
 * of its condition would prove nothing about the gate that actually ships.
 */

// buildServer pulls in the core's whole module graph; the first one costs a
// few seconds and more under full-suite load. That is boot cost, not a hang.
vi.setConfig({ testTimeout: 30_000 });

const TOKEN = "test-token-0123456789abcdef0123456789abcdef";
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sparstrow-hostfs-routes-"));

const configMock = {
  port: 48750,
  host: "127.0.0.1",
  dataDir: tmpRoot,
  dbPath: ":memory:",
  tmpDir: path.join(tmpRoot, "tmp"),
  logDir: path.join(tmpRoot, "logs"),
  secretsDir: path.join(tmpRoot, "secrets"),
  agentsDir: path.join(tmpRoot, "agents"),
  vaultPath: path.join(tmpRoot, "memory"),
  claudePath: "claude",
  antigravityPath: "agy",
  gitPath: "git",
  anthropicApiBase: "https://api.anthropic.com",
  ollamaHost: "http://127.0.0.1:11434",
  memoryMcpPath: path.join(tmpRoot, "mcp.cjs"),
  memoryCliPath: path.join(tmpRoot, "cli.cjs"),
  modelCacheDir: path.join(tmpRoot, "models"),
  apiToken: TOKEN,
  agentEmail: "agent@sparstrow.com",
  deployment: "local" as "local" | "hosted",
};

vi.mock("../../config.js", () => ({
  config: configMock,
  repoRoot: tmpRoot,
  resolveConfig: () => configMock,
  ensureDirs: () => {},
}));

const auth = { authorization: `Bearer ${TOKEN}` };

async function server(): Promise<Server> {
  const { buildServer } = await import("../server.js");
  const app = await buildServer();
  await app.ready();
  return app;
}

let app: Server | null = null;

beforeEach(() => {
  configMock.deployment = "local";
});

afterEach(async () => {
  await app?.close();
  app = null;
  vi.resetModules();
});

describe("host-fs registration gate — 001 FR-022a", () => {
  it("does not register the routes at all when the core is hosted", async () => {
    configMock.deployment = "hosted";
    app = await server();

    for (const url of ["/api/v1/host-fs/volumes", "/api/v1/host-fs/dirs"]) {
      const res = await app.inject({ method: "GET", url, headers: auth });
      // 404, NOT 403. A refusal would confirm the capability exists; the
      // requirement is that a hosted core has no such route in the first place.
      expect(res.statusCode, `${url} must be absent, not refused`).toBe(404);
    }

    const post = await app.inject({
      method: "POST",
      url: "/api/v1/host-fs/dirs",
      headers: auth,
      payload: { parent: tmpRoot, name: "x" },
    });
    expect(post.statusCode).toBe(404);
  });

  it("registers them when the core is local", async () => {
    app = await server();
    const res = await app.inject({ method: "GET", url: "/api/v1/host-fs/volumes", headers: auth });
    expect(res.statusCode).toBe(200);
    expect(res.json().volumes.length).toBeGreaterThan(0);
  });
});

describe("host-fs authentication — 001 FR-021", () => {
  it("401s every endpoint without a bearer token", async () => {
    app = await server();

    const volumes = await app.inject({ method: "GET", url: "/api/v1/host-fs/volumes" });
    expect(volumes.statusCode).toBe(401);

    const dirs = await app.inject({ method: "GET", url: "/api/v1/host-fs/dirs" });
    expect(dirs.statusCode).toBe(401);

    const post = await app.inject({
      method: "POST",
      url: "/api/v1/host-fs/dirs",
      payload: { parent: tmpRoot, name: "x" },
    });
    expect(post.statusCode).toBe(401);
  });

  it("401s a wrong token", async () => {
    app = await server();
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/host-fs/volumes",
      headers: { authorization: "Bearer wrong-token-but-same-length-aaaaaaaaaaa" },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe("host-fs loopback refusal — 001 FR-022b", () => {
  it("403s an authenticated caller from a non-loopback address", async () => {
    app = await server();
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/host-fs/volumes",
      headers: auth,
      remoteAddress: "10.1.2.3",
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toMatch(/loopback/i);
  });

  it("distinguishes a trust-boundary refusal from a locked directory", async () => {
    app = await server();
    const refused = await app.inject({
      method: "GET",
      url: "/api/v1/host-fs/volumes",
      headers: auth,
      remoteAddress: "10.1.2.3",
    });
    const missing = await app.inject({
      method: "GET",
      url: `/api/v1/host-fs/dirs?path=${encodeURIComponent(path.join(tmpRoot, "nope"))}`,
      headers: auth,
    });
    // Both are failures, but a client must be able to tell "you may not use
    // this at all" from "that one folder is not available".
    expect(refused.json().error).not.toBe(missing.json().error);
  });

  it("allows loopback", async () => {
    app = await server();
    for (const remoteAddress of ["127.0.0.1", "::1", "::ffff:127.0.0.1"]) {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/host-fs/volumes",
        headers: auth,
        remoteAddress,
      });
      expect(res.statusCode, remoteAddress).toBe(200);
    }
  });
});

describe("host-fs create — 001 FR-017, FR-018", () => {
  let parent: string;

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(tmpRoot, "create-"));
  });

  it("creates one directory and returns its listing", async () => {
    app = await server();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/host-fs/dirs",
      headers: auth,
      payload: { parent, name: "my-app" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().path).toBe(path.join(parent, "my-app"));
    expect(fs.statSync(path.join(parent, "my-app")).isDirectory()).toBe(true);
  });

  it("400s a traversing name AND writes nothing", async () => {
    app = await server();
    const before = fs.readdirSync(parent);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/host-fs/dirs",
      headers: auth,
      payload: { parent, name: "../escape" },
    });
    expect(res.statusCode).toBe(400);
    expect(fs.readdirSync(parent)).toEqual(before);
    expect(fs.existsSync(path.join(path.dirname(parent), "escape"))).toBe(false);
  });

  it("409s an existing name and leaves it untouched", async () => {
    app = await server();
    fs.mkdirSync(path.join(parent, "taken"));
    fs.writeFileSync(path.join(parent, "taken", "keep.txt"), "important");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/host-fs/dirs",
      headers: auth,
      payload: { parent, name: "taken" },
    });
    expect(res.statusCode).toBe(409);
    expect(fs.readFileSync(path.join(parent, "taken", "keep.txt"), "utf8")).toBe("important");
  });
});
