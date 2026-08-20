import { describe, expect, it } from "vitest";
import { PUBLIC_IMAGE_ALLOWED_TYPES, PUBLIC_IMAGE_MAX_BYTES, checkImageFile } from "./constants";

/**
 * T-M9-04's client-side half of "enforced twice" — the bucket's own size
 * limit and MIME allowlist are what actually hold, but this is what turns a
 * bad file into an instant, readable message instead of a slow upload
 * followed by an opaque storage error.
 */
describe("checkImageFile", () => {
  it("accepts every type the bucket allows, at exactly the size limit", () => {
    for (const type of Object.keys(PUBLIC_IMAGE_ALLOWED_TYPES)) {
      expect(checkImageFile({ type, size: PUBLIC_IMAGE_MAX_BYTES })).toBeNull();
    }
  });

  it("rejects a type the bucket does not allow, before looking at size", () => {
    expect(checkImageFile({ type: "application/pdf", size: 100 })).toMatch(
      /PNG, JPEG or WebP/,
    );
    // Renaming a .pdf to .png does not change its MIME type — the browser's
    // File object reports what the bytes actually are, and this checks that.
    expect(checkImageFile({ type: "application/pdf", size: 100 })).not.toMatch(/2 MB/);
  });

  it("rejects a file one byte over the limit, and names the actual size", () => {
    const message = checkImageFile({
      type: "image/png",
      size: PUBLIC_IMAGE_MAX_BYTES + 1,
    });
    expect(message).toMatch(/2 MB or smaller/);
    expect(message).toMatch(/2\.0 MB/);
  });

  it("names a larger actual size accurately", () => {
    const message = checkImageFile({ type: "image/jpeg", size: 5 * 1024 * 1024 });
    expect(message).toMatch(/5\.0 MB/);
  });
});
