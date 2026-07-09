import { afterEach, beforeEach, describe, expect, it } from "vitest";
import path from "node:path";
import { repoRoot, resolveConfig } from "./config.js";

// The vault-path fallback was a hardcoded `C:\Sparstrow\memory` constant; it now
// derives from repoRoot so the install is drive-portable. These lock in that the
// derived path is unchanged in shape and that a set-but-empty env var falls back
// rather than resolving to "".
describe("resolveConfig vaultPath", () => {
  const saved = {
    vault: process.env.SPARSTROW_VAULT,
    token: process.env.SPARSTROW_TOKEN,
  };
  const fallback = path.join(path.dirname(repoRoot), "memory");

  beforeEach(() => {
    // Short-circuit token creation so resolveConfig() writes nothing to disk.
    process.env.SPARSTROW_TOKEN = "x".repeat(32);
  });

  afterEach(() => {
    for (const [key, val] of [
      ["SPARSTROW_VAULT", saved.vault],
      ["SPARSTROW_TOKEN", saved.token],
    ] as const) {
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    }
  });

  it("falls back to <repo-parent>/memory when SPARSTROW_VAULT is unset", () => {
    delete process.env.SPARSTROW_VAULT;
    expect(resolveConfig().vaultPath).toBe(fallback);
  });

  it("falls back when SPARSTROW_VAULT is set but empty/whitespace", () => {
    process.env.SPARSTROW_VAULT = "   ";
    expect(resolveConfig().vaultPath).toBe(fallback);
  });

  it("uses SPARSTROW_VAULT verbatim (trimmed) when set", () => {
    process.env.SPARSTROW_VAULT = "  D:\\elsewhere\\vault  ";
    expect(resolveConfig().vaultPath).toBe("D:\\elsewhere\\vault");
  });
});
