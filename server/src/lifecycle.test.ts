import { afterEach, describe, expect, it } from "vitest";
import { isDraining, isSchedulerEnabled, setDraining, setSchedulerEnabled } from "./lifecycle.js";

describe("update drain state (0004 Phase 2)", () => {
  afterEach(() => {
    setDraining(false);
    setSchedulerEnabled(true);
  });

  it("defaults to not draining", () => {
    expect(isDraining()).toBe(false);
  });

  it("prepare/resume round-trips", () => {
    setDraining(true);
    expect(isDraining()).toBe(true);
    setDraining(false);
    expect(isDraining()).toBe(false);
  });

  it("draining is independent of the scheduler flag", () => {
    setDraining(true);
    setSchedulerEnabled(false);
    expect(isDraining()).toBe(true);
    expect(isSchedulerEnabled()).toBe(false);
    setSchedulerEnabled(true);
    expect(isDraining()).toBe(true);
  });
});
