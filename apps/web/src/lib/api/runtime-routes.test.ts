import { describe, expect, it } from "vitest";
import { DAEMON_SETTABLE_KEYS, SETTING_TERMINAL_ACCESS, SETTING_WIP_SNAPSHOT } from "@sparstrow/shared";
import { matchRoute } from "./router";
import "./handlers";

/**
 * M4's per-runtime routes used to be tested here for dispatch (path-shadowing
 * regressions: M2 defects 4 and 5). `T-WA-08` moved all of them —
 * relink/unbind/clone and the settings switch, plus pairing-code creation,
 * rename, revoke and remove — to `app/machines/actions.ts`. A Server Action
 * has no path pattern to be shadowed by, so that class of regression no
 * longer applies; their behavioural coverage lives in
 * `app/machines/actions.test.ts` instead. Only the surviving GET routes are
 * dispatch-tested here.
 */

describe("dispatch", () => {
  it("still serves the reads T-WA-08 left in place", () => {
    expect(matchRoute("GET", "/runtimes")).not.toBeNull();
    expect(matchRoute("GET", "/runtime-projects")).not.toBeNull();
  });

  it("no longer serves the writes T-WA-08 moved to Server Actions", () => {
    expect(matchRoute("POST", "/pairing-codes")).toBeNull();
    expect(matchRoute("PATCH", "/runtimes/rt_1")).toBeNull();
    expect(matchRoute("DELETE", "/runtimes/rt_1")).toBeNull();
    expect(matchRoute("DELETE", "/runtimes/rt_1/token")).toBeNull();
    expect(matchRoute("PUT", "/runtimes/rt_1/settings")).toBeNull();
    expect(matchRoute("PUT", "/runtimes/rt_1/projects/prj_1")).toBeNull();
    expect(matchRoute("DELETE", "/runtimes/rt_1/projects/prj_1")).toBeNull();
    expect(matchRoute("POST", "/runtimes/rt_1/projects/prj_1/clone")).toBeNull();
  });
});

describe("the settings allowlist the action enforces", () => {
  it("contains the WIP snapshot switch and nothing unexpected", () => {
    // Three copies of this list exist by design (daemon, action, UI). The
    // daemon's is the one that matters; this asserts the shared constant they
    // all read has not quietly grown. Updated to 3 in M16 (T-M16-01), which
    // added SETTING_TERMINAL_ACCESS for US4's per-machine terminal switch.
    expect(DAEMON_SETTABLE_KEYS).toContain(SETTING_WIP_SNAPSHOT);
    expect(DAEMON_SETTABLE_KEYS).toContain(SETTING_TERMINAL_ACCESS);
    expect(DAEMON_SETTABLE_KEYS).toHaveLength(3);
  });
});
