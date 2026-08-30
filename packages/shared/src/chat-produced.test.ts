import { describe, expect, it } from "vitest";
import {
  CHAT_ATTACHMENT_ALLOWED_TYPES,
  CHAT_PRODUCED_ALLOWED_TYPES,
  CHAT_PRODUCED_MAX_BYTES,
  producedStoragePath,
  sanitizeProducedFilename,
} from "./constants";

/**
 * T-AM1-01. `producedStoragePath` MUST keep `storage.foldername(name)` at
 * exactly length 2 — `025_chat_attachments_storage.sql` enforces
 * `array_length(storage.foldername(name), 1) = 2` on both select and insert,
 * and a third folder segment is silently denied to the workspace member who
 * owns the file. `storage.foldername` returns every segment EXCEPT the
 * filename itself (Postgres storage's own definition), so this helper
 * mirrors that — not a naive split of the whole path. This is the test that
 * catches a well-meaning `produced/` prefix being added later — see the AM1
 * phase README, finding 3.
 */
function folderSegmentCount(storagePath: string): number {
  return storagePath.split("/").length - 1;
}

describe("sanitizeProducedFilename", () => {
  it("strips path separators", () => {
    expect(sanitizeProducedFilename("a/b\\c.png")).toBe("a_b_c.png");
  });

  it("strips .. sequences", () => {
    expect(sanitizeProducedFilename("../../etc/passwd")).not.toContain("..");
  });

  it("collapses whitespace", () => {
    expect(sanitizeProducedFilename("my   chart   final.png")).toBe("my chart final.png");
  });

  it("falls back to a name for a file with no usable characters", () => {
    expect(sanitizeProducedFilename("")).toBe("file");
    expect(sanitizeProducedFilename("   ")).toBe("file");
  });

  it("handles a name with no extension", () => {
    expect(sanitizeProducedFilename("README")).toBe("README");
  });

  it("caps length while preserving the extension", () => {
    const long = "a".repeat(300) + ".png";
    const result = sanitizeProducedFilename(long);
    expect(result.length).toBeLessThanOrEqual(100);
    expect(result.endsWith(".png")).toBe(true);
  });
});

describe("producedStoragePath", () => {
  it("produces exactly two path segments, matching the storage policy's check", () => {
    const path = producedStoragePath("ws_1", "chs_1", "chart.png", "op_1");
    expect(folderSegmentCount(path)).toBe(2);
  });

  it("keeps two segments even for a filename containing a slash before sanitizing", () => {
    const path = producedStoragePath("ws_1", "chs_1", "a/b.png", "op_1");
    expect(folderSegmentCount(path)).toBe(2);
  });

  it("never introduces a produced/ segment", () => {
    const path = producedStoragePath("ws_1", "chs_1", "chart.png", "op_1");
    expect(path).not.toMatch(/\/produced\//);
  });

  it("produces two different paths for two files with the same name", () => {
    const a = producedStoragePath("ws_1", "chs_1", "chart.png", "op_1");
    const b = producedStoragePath("ws_1", "chs_1", "chart.png", "op_2");
    expect(a).not.toBe(b);
  });

  it("the first segment is the workspace id, matching the RLS ownership check", () => {
    const path = producedStoragePath("ws_1", "chs_1", "chart.png", "op_1");
    expect(path.startsWith("ws_1/")).toBe(true);
  });
});

describe("CHAT_PRODUCED_MAX_BYTES", () => {
  it("is larger than the inbound attachment ceiling", () => {
    expect(CHAT_PRODUCED_MAX_BYTES).toBeGreaterThan(2 * 1024 * 1024);
  });
});

describe("CHAT_PRODUCED_ALLOWED_TYPES", () => {
  it("is a distinct object from the inbound attachment map", () => {
    expect(CHAT_PRODUCED_ALLOWED_TYPES).not.toBe(CHAT_ATTACHMENT_ALLOWED_TYPES);
  });

  it("includes image/svg+xml and image/gif on top of the inbound set", () => {
    expect(CHAT_PRODUCED_ALLOWED_TYPES["image/svg+xml"]).toBe("svg");
    expect(CHAT_PRODUCED_ALLOWED_TYPES["image/gif"]).toBe("gif");
  });

  it("includes spreadsheet types (xlsx, xls, csv) in produced and attachment sets", () => {
    expect(CHAT_PRODUCED_ALLOWED_TYPES["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]).toBe("xlsx");
    expect(CHAT_PRODUCED_ALLOWED_TYPES["application/vnd.ms-excel"]).toBe("xls");
    expect(CHAT_PRODUCED_ALLOWED_TYPES["text/csv"]).toBe("csv");
    expect(CHAT_ATTACHMENT_ALLOWED_TYPES["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]).toBe("xlsx");
    expect(CHAT_ATTACHMENT_ALLOWED_TYPES["application/vnd.ms-excel"]).toBe("xls");
  });
});
