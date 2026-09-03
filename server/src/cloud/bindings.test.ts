import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getDb, openDb } from "../db/connection.js";
import { projects } from "../db/schema.js";
import { config } from "../config.js";
import type { ProjectClonePayload } from "@sparstrow/shared";
import { invalidatePairingCache, saveConnection } from "./client.js";

/**
 * Bindings and `project.clone`.
 *
 * The clone guards are the reason this file exists. `project.clone` is a
 * remote-triggered write to a local path — the security consequence the plan
 * accepted knowingly when it made dispatch cloud-canonical — so every check
 * that bounds it is tested here rather than trusted.
 */

const execFileMock = vi.fn();
vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  // promisify() reads the custom symbol first, so this is what `run(...)`
  // actually calls.
  execFile: Object.assign(
    (...args: unknown[]) => execFileMock(...args),
    { [Symbol.for("nodejs.util.promisify.custom")]: (...args: unknown[]) => execFileMock(...args) },
  ),
}));

const { cloneProject, reportBindings, startBindingReporter, stopBindingReporter } =
  await import("./bindings.js");

/** Bodies posted to /projects/bindings, oldest first. */
function reportedBindings(fetchMock: { mock: { calls: unknown[][] } }) {
  return (fetchMock.mock.calls as unknown as Array<[string, RequestInit]>)
    .filter(([url]) => String(url).includes("/projects/bindings"))
    .flatMap(([, init]) => JSON.parse(String(init.body)).bindings);
}

function okResponse(body: unknown = { recorded: 1, unknownSlugs: [] }): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("project bindings", () => {
  let dir: string;
  let secrets: string;
  let originalSecretsDir: string;
  let originalCloudUrl: string;

  beforeEach(() => {
    vi.clearAllMocks();
    closeDb();
    openDb(":memory:");

    dir = fs.mkdtempSync(path.join(os.tmpdir(), "sparstrow-bind-"));
    secrets = fs.mkdtempSync(path.join(os.tmpdir(), "sparstrow-bind-sec-"));
    originalSecretsDir = config.secretsDir;
    originalCloudUrl = config.cloudUrl;
    config.secretsDir = secrets;
    config.cloudUrl = "http://cloud.test";
    invalidatePairingCache();
    saveConnection({ token: "t", machineId: "mach-test", runtimes: [{ runtimeId: "rt", workspaceId: "ws" }] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    closeDb();
    config.secretsDir = originalSecretsDir;
    config.cloudUrl = originalCloudUrl;
    invalidatePairingCache();
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(secrets, { recursive: true, force: true });
  });

  const addProject = (slug: string, rootDir: string | null) => {
    const now = new Date().toISOString();
    getDb()
      .insert(projects)
      .values({ id: `prj_${slug}`, name: slug, slug, rootDir, createdAt: now, updatedAt: now })
      .run();
  };

  describe("reportBindings", () => {
    it("reports a project whose directory is really there as bound", async () => {
      addProject("app", dir);
      const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(okResponse());

      await reportBindings();

      expect(reportedBindings(fetchMock)).toEqual([
        { projectSlug: "app", localPath: dir, state: "bound", detail: null },
      ]);
    });

    it("reports a project whose directory has gone as missing, not bound", async () => {
      // The cloud picks a runtime by binding state, so a stale `bound` sends
      // work to a machine that will fail preflight on arrival.
      addProject("gone", path.join(dir, "not-here"));
      const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(okResponse());

      await reportBindings();

      expect(reportedBindings(fetchMock)[0]).toMatchObject({ state: "missing" });
    });

    it("says nothing about a project with no directory on this machine", async () => {
      // A board entry with no bytes here. Reporting it would make the cloud
      // choose this runtime and then fail preflight — the round trip the
      // enqueue-side check exists to avoid.
      addProject("elsewhere", null);
      const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(okResponse());

      await reportBindings();

      expect(reportedBindings(fetchMock)).toEqual([]);
    });

    it("does not reach the cloud at all when the machine is unpaired", async () => {
      invalidatePairingCache();
      fs.rmSync(secrets, { recursive: true, force: true });
      fs.mkdirSync(secrets, { recursive: true });
      addProject("app", dir);
      const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(okResponse());

      await reportBindings();

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("survives an unreachable control plane — local work does not depend on it", async () => {
      addProject("app", dir);
      vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));

      await expect(reportBindings()).resolves.toBeUndefined();
    });
  });

  describe("cloneProject", () => {
    const target = () => path.join(dir, "cloned");
    const clonePayload = (over: Partial<ProjectClonePayload> = {}): ProjectClonePayload => ({
      projectId: "prj_cloud_1",
      projectSlug: "app",
      localPath: target(),
      gitRemote: "https://example.com/app.git",
      ...over,
    });

    it("clones, creates the local project row, and reports the binding", async () => {
      execFileMock.mockResolvedValue({ stdout: "", stderr: "" });
      const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(okResponse());

      const result = await cloneProject(clonePayload());

      expect(result.ok).toBe(true);
      const args = execFileMock.mock.calls[0]![1] as string[];
      expect(args).toEqual(["clone", "https://example.com/app.git", target()]);

      const row = getDb().select().from(projects).all()[0];
      expect(row).toMatchObject({ slug: "app", rootDir: target(), gitRemote: "https://example.com/app.git" });

      // `cloning` first so the UI can show progress, `bound` once it lands.
      const states = reportedBindings(fetchMock).map((b: { state: string }) => b.state);
      expect(states[0]).toBe("cloning");
      expect(states.at(-1)).toBe("bound");
    });

    it("refuses a directory that already has something in it", async () => {
      // The guard that matters most: whoever can enqueue a command must not be
      // able to aim a clone at a directory with contents.
      fs.mkdirSync(target(), { recursive: true });
      fs.writeFileSync(path.join(target(), "already-here.txt"), "mine");
      vi.spyOn(globalThis, "fetch").mockResolvedValue(okResponse());

      const result = await cloneProject(clonePayload());

      expect(result.ok).toBe(false);
      expect(execFileMock).not.toHaveBeenCalled();
      expect(fs.readFileSync(path.join(target(), "already-here.txt"), "utf8")).toBe("mine");
    });

    it("refuses a relative path", async () => {
      const result = await cloneProject(clonePayload({ localPath: "../../somewhere" }));

      expect(result.ok).toBe(false);
      expect(execFileMock).not.toHaveBeenCalled();
    });

    it("refuses a project with no remote to clone from", async () => {
      // `gitRemote` is typed as string, but a payload arrives as JSON off the
      // network — the type is a claim about the sender, not a guarantee. The
      // guard is real and so is this test of it.
      const result = await cloneProject(clonePayload({ gitRemote: null as unknown as string }));

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.failure.error).toMatch(/no git remote/i);
      expect(execFileMock).not.toHaveBeenCalled();
    });

    it("reports the binding as error, with git's message, when the clone fails", async () => {
      execFileMock.mockRejectedValue(new Error("fatal: Authentication failed"));
      const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(okResponse());

      const result = await cloneProject(clonePayload());

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.failure.reason).toBe("clone_failed");

      const last = reportedBindings(fetchMock).at(-1) as { state: string; detail: string };
      expect(last.state).toBe("error");
      expect(last.detail).toMatch(/Authentication failed/);

      // A failed clone must not leave a project row claiming bytes that are
      // not there.
      expect(getDb().select().from(projects).all()).toHaveLength(0);
    });

    it("passes the remote as an argument, never through a shell", async () => {
      // execFile, not exec: the remote and the path both come from a command
      // row, so a shell would make them injectable by anyone who can enqueue.
      execFileMock.mockResolvedValue({ stdout: "", stderr: "" });
      vi.spyOn(globalThis, "fetch").mockResolvedValue(okResponse());

      await cloneProject(clonePayload({ gitRemote: "https://example.com/app.git; rm -rf /" }));

      const [file, args] = execFileMock.mock.calls[0]! as [string, string[]];
      expect(file).toBe("git");
      expect(args[1]).toBe("https://example.com/app.git; rm -rf /");
    });
  });
  describe("the re-report timer", () => {
    afterEach(() => stopBindingReporter());

    it("reports once immediately, so a restored directory heals without a restart", async () => {
      // The hole this closes, found in M4 verification: preflight marks a
      // binding `missing`, the developer puts the folder back, and nothing
      // tells the cloud until core restarts.
      addProject("app", dir);
      const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(okResponse());

      startBindingReporter();
      await vi.waitFor(() => expect(reportedBindings(fetchMock).length).toBeGreaterThan(0));
    });

    it("does not hold the process open", () => {
      const unrefs: unknown[] = [];
      const realSetInterval = globalThis.setInterval;
      vi.spyOn(globalThis, "setInterval").mockImplementation(((...args: Parameters<typeof setInterval>) => {
        const timer = realSetInterval(...args);
        unrefs.push(vi.spyOn(timer, "unref"));
        return timer;
      }) as typeof setInterval);
      vi.spyOn(globalThis, "fetch").mockResolvedValue(okResponse());

      startBindingReporter();

      expect(unrefs).toHaveLength(1);
      expect(unrefs[0]).toHaveBeenCalled();
    });

    it("starting twice does not double the rate", () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(okResponse());
      const spy = vi.spyOn(globalThis, "setInterval");
      startBindingReporter();
      startBindingReporter();
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });
});
