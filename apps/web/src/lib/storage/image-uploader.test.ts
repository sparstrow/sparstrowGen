import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { keyFromPublicUrl } from "./image-uploader";

describe("keyFromPublicUrl", () => {
  const original = { ...process.env };

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abcxyz.supabase.co";
  });

  afterEach(() => {
    process.env = { ...original };
  });

  it("recovers the object key from a real public-images URL", () => {
    expect(
      keyFromPublicUrl(
        "https://abcxyz.supabase.co/storage/v1/object/public/public-images/avatars/user-1/pic.png",
      ),
    ).toBe("avatars/user-1/pic.png");
  });

  it("returns null for a URL under a different bucket", () => {
    expect(
      keyFromPublicUrl(
        "https://abcxyz.supabase.co/storage/v1/object/public/some-other-bucket/x.png",
      ),
    ).toBeNull();
  });

  it("returns null for a foreign origin, even with the right path shape", () => {
    // Never a real attack surface — this key only ever names a file for
    // best-effort cleanup, never authorizes a write — but a wrong-origin URL
    // should not be reported as "ours" all the same.
    expect(
      keyFromPublicUrl("https://evil.example/storage/v1/object/public/public-images/x.png"),
    ).toBeNull();
  });

  it("returns null for something that is not a URL at all", () => {
    expect(keyFromPublicUrl("not a url")).toBeNull();
    expect(keyFromPublicUrl("")).toBeNull();
  });
});
