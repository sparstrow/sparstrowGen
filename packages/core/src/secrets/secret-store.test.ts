import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { config } from "../config.js";
import {
  SECRET_GITHUB_PAT,
  deleteSecret,
  getSecret,
  getSecretMeta,
  hasSecret,
  listSecretKeys,
  setSecret,
} from "./secret-store.js";

describe("secret-store (EC2 PAT-out-of-DB)", () => {
  let dir: string;
  let originalSecretsDir: string;

  beforeEach(() => {
    originalSecretsDir = config.secretsDir;
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "sparstrow-secrets-"));
    config.secretsDir = dir;
  });
  afterEach(() => {
    config.secretsDir = originalSecretsDir;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("round-trips a secret through encrypt/decrypt", () => {
    setSecret(SECRET_GITHUB_PAT, "ghp_supersecrettoken1234");
    expect(getSecret(SECRET_GITHUB_PAT)).toBe("ghp_supersecrettoken1234");
    expect(hasSecret(SECRET_GITHUB_PAT)).toBe(true);
    expect(listSecretKeys()).toEqual([SECRET_GITHUB_PAT]);
  });

  it("returns null / false for an absent secret", () => {
    expect(getSecret("nope")).toBeNull();
    expect(hasSecret("nope")).toBe(false);
    expect(getSecretMeta("nope")).toEqual({ present: false, hint: null, length: null });
  });

  it("stores the value ENCRYPTED at rest — plaintext never touches the store file", () => {
    setSecret(SECRET_GITHUB_PAT, "ghp_plaintext_should_not_appear");
    const onDisk = fs.readFileSync(path.join(dir, "secrets.json"), "utf8");
    expect(onDisk).not.toContain("ghp_plaintext_should_not_appear");
    // A separate machine-local key file exists.
    expect(fs.existsSync(path.join(dir, "secret.key"))).toBe(true);
  });

  it("getSecretMeta masks the value (last-4 hint, never the raw token)", () => {
    setSecret(SECRET_GITHUB_PAT, "ghp_abcdefgh9999");
    const meta = getSecretMeta(SECRET_GITHUB_PAT);
    expect(meta.present).toBe(true);
    expect(meta.hint).toBe("…9999");
    expect(meta.length).toBe("ghp_abcdefgh9999".length);
    // Defensive: the hint reveals only the tail.
    expect(meta.hint).not.toContain("abcdef");
  });

  it("setSecret('') and deleteSecret clear the entry", () => {
    setSecret(SECRET_GITHUB_PAT, "x-token-value");
    setSecret(SECRET_GITHUB_PAT, "");
    expect(hasSecret(SECRET_GITHUB_PAT)).toBe(false);

    setSecret("other", "y");
    deleteSecret("other");
    expect(hasSecret("other")).toBe(false);
  });

  it("overwrites an existing secret", () => {
    setSecret(SECRET_GITHUB_PAT, "first");
    setSecret(SECRET_GITHUB_PAT, "second");
    expect(getSecret(SECRET_GITHUB_PAT)).toBe("second");
  });
});
