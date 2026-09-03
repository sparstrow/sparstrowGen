import { describe, expect, it } from "vitest";
import { formatFileSize, getFileCategory } from "./document-sheet-viewer";

describe("getFileCategory", () => {
  it("identifies Excel spreadsheets (.xlsx and .xls)", () => {
    expect(
      getFileCategory(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "financial_report.xlsx",
      ),
    ).toBe("spreadsheet");
    expect(getFileCategory("application/vnd.ms-excel", "data.xls")).toBe("spreadsheet");
    expect(getFileCategory("application/octet-stream", "balance_sheet.xlsx")).toBe("spreadsheet");
  });

  it("identifies CSV files", () => {
    expect(getFileCategory("text/csv", "users.csv")).toBe("spreadsheet");
    expect(getFileCategory("application/octet-stream", "export.csv")).toBe("spreadsheet");
  });

  it("identifies PDF documents", () => {
    expect(getFileCategory("application/pdf", "contract.pdf")).toBe("pdf");
    expect(getFileCategory("application/octet-stream", "whitepaper.pdf")).toBe("pdf");
  });

  it("identifies Markdown documents", () => {
    expect(getFileCategory("text/markdown", "README.md")).toBe("markdown");
    expect(getFileCategory("text/plain", "notes.markdown")).toBe("markdown");
  });

  it("identifies Images", () => {
    expect(getFileCategory("image/png", "chart.png")).toBe("image");
    expect(getFileCategory("image/jpeg", "photo.jpg")).toBe("image");
    expect(getFileCategory("image/webp", "hero.webp")).toBe("image");
    expect(getFileCategory("image/gif", "animation.gif")).toBe("image");
    expect(getFileCategory("image/svg+xml", "diagram.svg")).toBe("image");
  });

  it("identifies text, JSON, and code files", () => {
    expect(getFileCategory("application/json", "config.json")).toBe("text");
    expect(getFileCategory("text/plain", "logs.txt")).toBe("text");
    expect(getFileCategory("text/javascript", "script.js")).toBe("text");
    expect(getFileCategory("text/x-typescript", "main.ts")).toBe("text");
    expect(getFileCategory("text/plain", "query.sql")).toBe("text");
  });

  it("falls back to unknown for unhandled binary types", () => {
    expect(getFileCategory("application/zip", "archive.zip")).toBe("unknown");
    expect(getFileCategory("application/octet-stream", "binary.bin")).toBe("unknown");
  });
});

describe("formatFileSize", () => {
  it("formats bytes accurately", () => {
    expect(formatFileSize(512)).toBe("512 B");
  });

  it("formats kilobytes accurately", () => {
    expect(formatFileSize(2048)).toBe("2.0 KB");
    expect(formatFileSize(15360)).toBe("15.0 KB");
  });

  it("formats megabytes accurately", () => {
    expect(formatFileSize(2 * 1024 * 1024)).toBe("2.0 MB");
    expect(formatFileSize(5.5 * 1024 * 1024)).toBe("5.5 MB");
  });
});
