import { describe, expect, it } from "vitest";
import { type SetupInput, isSetupComplete, setupSteps } from "./setup";

const DONE: SetupInput = {
  profile: { name: "Sri" },
  workspace: { name: "Sparstrow Inc" },
  machines: [{ id: "m1" }],
};

const NONE: SetupInput = {
  profile: { name: "" },
  workspace: { name: "" },
  machines: [],
};

function ids(steps: ReturnType<typeof setupSteps>) {
  return Object.fromEntries(steps.map((s) => [s.id, s.state]));
}

describe("setupSteps", () => {
  it("all three done: no current step, and isSetupComplete is true", () => {
    const steps = setupSteps(DONE);
    expect(ids(steps)).toEqual({ profile: "done", workspace: "done", machine: "done" });
    expect(steps.some((s) => s.state === "current")).toBe(false);
    expect(isSetupComplete(steps)).toBe(true);
  });

  it("none done: profile is current, the other two are todo", () => {
    const steps = setupSteps(NONE);
    expect(ids(steps)).toEqual({ profile: "current", workspace: "todo", machine: "todo" });
    expect(isSetupComplete(steps)).toBe(false);
  });

  it("profile done only: workspace becomes current", () => {
    const steps = setupSteps({ ...NONE, profile: { name: "Sri" } });
    expect(ids(steps)).toEqual({ profile: "done", workspace: "current", machine: "todo" });
  });

  it("profile and workspace done: machine becomes current", () => {
    const steps = setupSteps({ ...DONE, machines: [] });
    expect(ids(steps)).toEqual({ profile: "done", workspace: "done", machine: "current" });
  });

  function profileState(input: SetupInput) {
    return setupSteps(input).find((s) => s.id === "profile")?.state;
  }

  it('name: "" is not done', () => {
    expect(profileState({ ...NONE, profile: { name: "" } })).toBe("current");
  });

  it("whitespace-only name is not done", () => {
    expect(profileState({ ...NONE, profile: { name: "   " } })).toBe("current");
  });

  it("a single-character name is done — one character is a name", () => {
    expect(profileState({ ...NONE, profile: { name: "S" } })).toBe("done");
  });

  it("a name that happens to equal the email local part is done — no heuristic here", () => {
    // The rule this replaces would have flagged this as "probably invented".
    // setupSteps() has no email to compare against and must not reject it.
    expect(profileState({ ...NONE, profile: { name: "sriharicoder" } })).toBe("done");
  });

  it("workspace query failed: unknown, and the machine step is still evaluated and can be current", () => {
    const steps = setupSteps({ ...NONE, workspace: null });
    expect(ids(steps)).toEqual({ profile: "current", workspace: "unknown", machine: "todo" });

    // With profile also done, the failed workspace step must not block the
    // machine step from becoming current.
    const steps2 = setupSteps({ profile: { name: "Sri" }, workspace: null, machines: [] });
    expect(ids(steps2)).toEqual({ profile: "done", workspace: "unknown", machine: "current" });
  });

  it("machine query failed: unknown, and isSetupComplete is false", () => {
    const steps = setupSteps({ ...DONE, machines: null });
    expect(ids(steps)).toEqual({ profile: "done", workspace: "done", machine: "unknown" });
    expect(isSetupComplete(steps)).toBe(false);
  });

  it("still loading (undefined): not done, not unknown", () => {
    const steps = setupSteps({ profile: undefined, workspace: undefined, machines: undefined });
    for (const step of steps) {
      expect(step.state).not.toBe("done");
      expect(step.state).not.toBe("unknown");
    }
    // The first is eligible to be current; loading is not treated as a stop sign.
    expect(steps.find((s) => s.id === "profile")?.state).toBe("current");
  });

  it("empty machine array is todo, not done", () => {
    expect(setupSteps({ ...DONE, machines: [] }).find((s) => s.id === "machine")?.state).toBe(
      "current",
    );
  });

  it("a machine that is paired but unreachable is still done — pairing, not reachability", () => {
    // SetupInput only ever sees { id }, so there is no reachability signal to
    // consult in the first place — this is the point being tested.
    const steps = setupSteps({ ...DONE, machines: [{ id: "unreachable-machine" }] });
    expect(steps.find((s) => s.id === "machine")?.state).toBe("done");
  });

  it("returns steps in a fixed order: profile, workspace, machine", () => {
    const steps = setupSteps(NONE);
    expect(steps.map((s) => s.id)).toEqual(["profile", "workspace", "machine"]);
  });
});

describe("isSetupComplete", () => {
  it("is false when any single step is not done", () => {
    expect(isSetupComplete(setupSteps({ ...DONE, workspace: { name: "" } }))).toBe(false);
  });
});
