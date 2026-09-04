import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import {
  PROVIDER_ENV_GROUPS,
  ambientProviderKeys,
  discoverProviderEnv,
  resetProviderEnvCache,
} from "./provider-env.js";

/**
 * The failure these guard against was invisible and cost a wrong diagnosis
 * published to `main`.
 *
 * A daemon launched from an agent's shell inherited `ANTHROPIC_BASE_URL` and no
 * token, while the user's working `CLAUDE_CODE_OAUTH_TOKEN` sat in the Windows
 * persistent environment. Every `claude` child got an endpoint with no
 * credential, 401'd, retried for ~186 s, and was killed by the 120 s turn
 * ceiling — surfacing as "the provider timed out". Measured on the owner's
 * machine, where multica was running the same CLI successfully the whole time.
 */

afterEach(() => {
  resetProviderEnvCache();
});

describe("provider env groups", () => {
  it("keeps the endpoint switches in the same group as the credential", () => {
    // The point of grouping. If these ever drift into a different group (or
    // back into the OS runtime list) a token from saved settings can be aimed
    // at an endpoint from an ambient shell again.
    for (const key of [
      "ANTHROPIC_BASE_URL",
      "CLAUDE_CODE_OAUTH_TOKEN",
      "CLAUDE_CODE_USE_BEDROCK",
      "CLAUDE_CODE_USE_VERTEX",
    ]) {
      expect(PROVIDER_ENV_GROUPS.anthropic).toContain(key);
    }
  });

  it("never carries the app's own bearer or an arbitrary secret", () => {
    const all: string[] = Object.values(PROVIDER_ENV_GROUPS).flat();
    expect(all).not.toContain("SPARSTROW_TOKEN");
    expect(all).not.toContain("AWS_SECRET_ACCESS_KEY");
    expect(all.some((k) => /^SPARSTROW_/i.test(k))).toBe(false);
  });
});

describe("the registry read itself", () => {
  /**
   * These exist because the whole discovery silently did nothing, and every
   * other test still passed.
   *
   * A stray edit turned the query path into `` `${root}\${path}` `` — in a
   * template literal `\$` escapes the `$`, so the argument became the literal
   * "HKCU${path}" — and the HKLM path lost its separators the same way
   * (`\C`, `\S` are not escapes, so JS just drops the backslash). Both reads
   * threw, both returned `{}`, and everything fell through to the ambient
   * fallback with only a warning nobody was reading.
   *
   * The unit tests passed throughout, because they only ever exercised the
   * fallback path. The manual check passed too, because it used a SEPARATE
   * copy of the parser in a scratch script rather than this module. Two green
   * signals, neither touching the broken line.
   */
  it("builds a real registry path, not one with an escaped dollar sign", () => {
    const source = readFileSync(new URL("./provider-env.ts", import.meta.url), "utf8");
    // The bug is invisible at runtime off Windows, so assert on the source.
    expect(source).toContain("`${root}\\\\${path}`");
    expect(source).not.toContain("`${root}\\${path}`");
  });

  it("keeps the HKLM path's separators", () => {
    const source = readFileSync(new URL("./provider-env.ts", import.meta.url), "utf8");
    expect(source).toContain("SYSTEM\\\\CurrentControlSet\\\\Control\\\\Session Manager\\\\Environment");
  });

  it.runIf(process.platform === "win32")(
    "actually reads the user's persistent environment on Windows",
    () => {
      // The end-to-end guard: if the query path breaks again, no key on this
      // machine resolves to "persistent" and this fails. HKCU\Environment is
      // never empty on a real Windows profile.
      resetProviderEnvCache();
      const raw = execFileSync("reg", ["query", "HKCU\\Environment"], {
        encoding: "utf8",
        windowsHide: true,
        stdio: ["ignore", "pipe", "ignore"],
      });
      const names = raw
        .split(/\r?\n/)
        .map((l) => /^\s{4,}(\S(?:.*?\S)?)\s{4,}REG_(?:EXPAND_)?SZ\s{4,}/.exec(l)?.[1])
        .filter((n): n is string => Boolean(n));
      expect(names.length).toBeGreaterThan(0);

      // Whatever this machine has set, any provider key present in the
      // persistent block must be reported as "persistent", never "process".
      const d = discoverProviderEnv();
      const providerKeys: string[] = Object.values(PROVIDER_ENV_GROUPS).flat();
      for (const name of names) {
        if (providerKeys.includes(name)) expect(d.sources[name]).toBe("persistent");
      }
    },
  );
});

describe("resolution", () => {
  it("reports an inherited value as ambient, not as configuration", () => {
    process.env.OLLAMA_HOST = "http://127.0.0.1:11434";
    resetProviderEnvCache();
    try {
      const d = discoverProviderEnv();
      expect(d.values.OLLAMA_HOST).toBe("http://127.0.0.1:11434");
      expect(d.sources.OLLAMA_HOST).toBe("process");
      expect(ambientProviderKeys(d)).toContain("OLLAMA_HOST");
    } finally {
      delete process.env.OLLAMA_HOST;
    }
  });

  it("marks a key with no value anywhere as none, and omits it", () => {
    delete process.env.GEMINI_API_KEY;
    resetProviderEnvCache();
    const d = discoverProviderEnv();
    if (d.sources.GEMINI_API_KEY === "none") {
      expect(d.values.GEMINI_API_KEY).toBeUndefined();
    }
  });

  it("caches, because a running process cannot see a later persistent change anyway", () => {
    resetProviderEnvCache();
    const first = discoverProviderEnv();
    process.env.OLLAMA_HOST = "http://changed-after-discovery:1";
    try {
      expect(discoverProviderEnv()).toBe(first);
      expect(discoverProviderEnv().values.OLLAMA_HOST).not.toBe(
        "http://changed-after-discovery:1",
      );
    } finally {
      delete process.env.OLLAMA_HOST;
    }
  });
});
