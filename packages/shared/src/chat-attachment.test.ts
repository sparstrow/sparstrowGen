import { describe, expect, it } from "vitest";
import {
  CHAT_ATTACHMENT_ALLOWED_TYPES,
  CHAT_ATTACHMENT_MAX_BYTES,
  checkChatAttachmentFile,
} from "./constants";

/**
 * T-CS5-01's client-side half of "enforced twice" — the bucket's own size
 * limit and MIME allowlist (`025_chat_attachments_storage.sql`) are what
 * actually hold. Mirrors `image-upload.test.ts`'s shape for the same reason
 * that file exists: an instant, readable message beats a slow upload
 * followed by an opaque storage error.
 */
describe("checkChatAttachmentFile", () => {
  it("accepts every type the bucket allows, at exactly the size limit", () => {
    for (const type of Object.keys(CHAT_ATTACHMENT_ALLOWED_TYPES)) {
      expect(checkChatAttachmentFile({ type, size: CHAT_ATTACHMENT_MAX_BYTES })).toBeNull();
    }
  });

  it("rejects a type the bucket does not allow, before looking at size", () => {
    expect(checkChatAttachmentFile({ type: "application/zip", size: 100 })).toMatch(
      /images, PDF, spreadsheets, plain text, Markdown, CSV, or JSON/,
    );
    expect(checkChatAttachmentFile({ type: "application/zip", size: 100 })).not.toMatch(/2 MB/);
  });

  it("rejects a file one byte over the limit, and names the actual size", () => {
    const message = checkChatAttachmentFile({
      type: "application/pdf",
      size: CHAT_ATTACHMENT_MAX_BYTES + 1,
    });
    expect(message).toMatch(/2 MB or smaller/);
    expect(message).toMatch(/2\.0 MB/);
  });

  it("names a larger actual size accurately", () => {
    const message = checkChatAttachmentFile({ type: "text/plain", size: 5 * 1024 * 1024 });
    expect(message).toMatch(/5\.0 MB/);
  });
});
