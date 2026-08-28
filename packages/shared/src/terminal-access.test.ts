import { describe, expect, it } from "vitest";
import { isTerminalAccessEnabled } from "./constants";

/**
 * Mirrors `wip-snapshot.test.ts`'s coverage shape for the same reason that
 * file exists: `isTerminalAccessEnabled` is the one place the Terminals page
 * and the Machines toggle both read "is this switch off", and a drift here
 * would show a control that misreports its own state.
 */
describe("isTerminalAccessEnabled", () => {
  it("defaults to on when unset", () => {
    expect(isTerminalAccessEnabled(null)).toBe(true);
    expect(isTerminalAccessEnabled(undefined)).toBe(true);
  });

  it("is switched off only by an explicit falsey word, in any casing or padding", () => {
    for (const value of ["off", "OFF", " Off ", "false", "FALSE", "0", "no", "NO"]) {
      expect(isTerminalAccessEnabled(value)).toBe(false);
    }
  });

  it("stays on for anything it does not recognise", () => {
    for (const value of ["on", "true", "yes", "1", "", "   ", "disabled?", "nope"]) {
      expect(isTerminalAccessEnabled(value)).toBe(true);
    }
  });
});
