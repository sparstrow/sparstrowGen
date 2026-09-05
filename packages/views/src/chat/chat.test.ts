import { describe, expect, it } from "vitest";
import {
  ChatLayout,
  SessionList,
  Transcript,
  Composer,
  NewSessionDialog,
} from "./index";

describe("chat views", () => {
  it("exports all chat surface components", () => {
    expect(typeof ChatLayout).toBe("function");
    expect(typeof SessionList).toBe("function");
    expect(typeof Transcript).toBe("function");
    expect(typeof Composer).toBe("function");
    expect(typeof NewSessionDialog).toBe("function");
  });
});
