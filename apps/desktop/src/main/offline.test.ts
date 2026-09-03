import { describe, expect, it } from "vitest";
import { buildOfflineHtml, offlineScreenUrl } from "./offline";

/**
 * M7 — the screen a desktop window shows when it cannot reach the app.
 *
 * What is worth testing here is not the styling but the CONTENT: which of two
 * very different problems the reader is looking at, and whether their agents
 * are still running. Someone whose window went white has no way to know the
 * second, and the wrong guess is "my work stopped".
 */

const input = {
  intendedUrl: "https://app.example.com",
  errorDescription: "ERR_CONNECTION_REFUSED",
};

describe("buildOfflineHtml", () => {
  it("names the URL it could not reach", () => {
    // A screen that says only "you're offline" sends someone to check their
    // wifi for what may be a typo in an environment variable.
    expect(buildOfflineHtml(input)).toContain("https://app.example.com");
  });

  it("shows the real error rather than a friendly paraphrase", () => {
    expect(buildOfflineHtml(input)).toContain("ERR_CONNECTION_REFUSED");
  });

  it("says the daemon keeps running, because nothing else tells the user that", () => {
    const html = buildOfflineHtml(input);
    expect(html).toMatch(/agents are still running/i);
  });

  it("offers retry as a link back to the intended URL", () => {
    // Not an IPC call: a link either succeeds, or fails and re-fires
    // did-fail-load, which rebuilds this screen with the current error.
    expect(buildOfflineHtml(input)).toContain('href="https://app.example.com"');
  });

  it("falls back to a readable message when the error description is empty", () => {
    const html = buildOfflineHtml({ ...input, errorDescription: "" });
    expect(html).toContain("The connection failed.");
  });

  it("escapes the error description rather than injecting it", () => {
    const html = buildOfflineHtml({
      ...input,
      errorDescription: '<img src=x onerror="alert(1)">',
    });
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  it("escapes the URL too", () => {
    const html = buildOfflineHtml({
      ...input,
      intendedUrl: 'https://x.test/"><script>alert(1)</script>',
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("shows a non-http URL but refuses to link it", () => {
    // Operator-controlled, not attacker-controlled — but a javascript: value
    // reaching an href has no upside, and a malformed URL is exactly what the
    // reader needs to see, so it is still displayed.
    const html = buildOfflineHtml({
      ...input,
      intendedUrl: "javascript:alert(1)",
    });
    expect(html).not.toContain('class="retry"');
    expect(html).toContain("SPARSTROW_APP_URL");
    expect(html).toContain("javascript:alert(1)");
  });

  it("refuses to link a URL that does not parse at all", () => {
    const html = buildOfflineHtml({ ...input, intendedUrl: "not a url" });
    expect(html).not.toContain('class="retry"');
  });

  it("is self-contained — no external stylesheet, script or image", () => {
    // It has to render with no network. An external asset would make the
    // offline screen depend on being online.
    const html = buildOfflineHtml(input);
    expect(html).not.toMatch(/<link[^>]+href=["']http/i);
    expect(html).not.toMatch(/<script[^>]+src=/i);
    expect(html).not.toMatch(/<img[^>]+src=["']http/i);
  });
});

describe("offlineScreenUrl", () => {
  it("produces a data URL that decodes back to the screen", () => {
    const url = offlineScreenUrl(input);
    expect(url.startsWith("data:text/html;charset=utf-8,")).toBe(true);
    const decoded = decodeURIComponent(url.slice("data:text/html;charset=utf-8,".length));
    expect(decoded).toBe(buildOfflineHtml(input));
  });

  it("encodes characters that would otherwise truncate the URL", () => {
    // A raw '#' would make everything after it a fragment, silently cutting the
    // document off at that point.
    const url = offlineScreenUrl({ ...input, errorDescription: "a#b c&d" });
    expect(url).not.toContain("#");
    expect(url).toContain("%23");
  });
});
