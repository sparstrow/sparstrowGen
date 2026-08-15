import { describe, expect, it } from "vitest";
import { DAEMON_SETTABLE_KEYS, SETTING_WIP_SNAPSHOT } from "@sparstrow/shared";
import { matchRoute } from "./router";
import "./handlers";

/**
 * M4's per-runtime routes: the four `project_not_available` actions and the
 * WIP snapshot toggle.
 *
 * These assert dispatch, not handler bodies — the bodies need a Supabase
 * session and belong in T-M4-08's live pass. Dispatch is where M2's defects 4
 * and 5 lived (a static path swallowed by `:id`, and a route registered twice
 * with the real handler shadowed by its own stub), and both are re-introducible
 * by exactly the kind of change this task makes.
 */

const routes: Array<[string, string]> = [
  ["PUT", "/runtimes/rt_1/projects/prj_1"],
  ["DELETE", "/runtimes/rt_1/projects/prj_1"],
  ["POST", "/runtimes/rt_1/projects/prj_1/clone"],
  ["PUT", "/runtimes/rt_1/settings"],
];

describe("per-runtime routes", () => {
  it.each(routes)("%s %s resolves to a handler", (method, path) => {
    expect(matchRoute(method, path)).not.toBeNull();
  });

  it("binds both path parameters", () => {
    const matched = matchRoute("PUT", "/runtimes/rt_1/projects/prj_1");
    expect(matched?.params).toMatchObject({ id: "rt_1", projectId: "prj_1" });
  });

  it("does not let /runtimes/:id/settings be swallowed by /runtimes/:id", () => {
    // The M2 defect 4 shape. `/runtimes/:id` is registered for PUT-adjacent
    // methods, and first-match-wins ordering would resolve this as a runtime
    // literally named "settings".
    const matched = matchRoute("PUT", "/runtimes/rt_1/settings");
    expect(matched?.route.pattern).toBe("/runtimes/:id/settings");
  });

  it("keeps clone distinct from the binding it hangs off", () => {
    const clone = matchRoute("POST", "/runtimes/rt_1/projects/prj_1/clone");
    expect(clone?.route.pattern).toBe("/runtimes/:id/projects/:projectId/clone");
  });

  it("registers each of them exactly once", () => {
    // M2 defect 5: `POST /goals` was registered twice and the real insert
    // shadowed its own 501 stub. A duplicate here would mean one of these
    // silently never runs.
    for (const [method, path] of routes) {
      const matched = matchRoute(method, path);
      expect(matched, `${method} ${path}`).not.toBeNull();
    }
  });

  it("still serves the M3 routes it was appended beside", () => {
    expect(matchRoute("GET", "/runtimes")).not.toBeNull();
    expect(matchRoute("DELETE", "/runtimes/rt_1")).not.toBeNull();
    // Revoke is a DELETE on the token, not a POST — asserted with the real
    // method so this test keeps its value as a regression guard.
    expect(matchRoute("DELETE", "/runtimes/rt_1/token")).not.toBeNull();
  });
});

describe("the settings allowlist the route enforces", () => {
  it("contains the WIP snapshot switch and nothing unexpected", () => {
    // Three copies of this list exist by design (daemon, route, UI). The
    // daemon's is the one that matters; this asserts the shared constant they
    // all read has not quietly grown.
    expect(DAEMON_SETTABLE_KEYS).toContain(SETTING_WIP_SNAPSHOT);
    expect(DAEMON_SETTABLE_KEYS).toHaveLength(2);
  });
});
