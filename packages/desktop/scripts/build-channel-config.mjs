// Generates a channel-specific electron-builder config.
//
// Stable and staging share every field EXCEPT app identity and version — one
// electron-builder `build` block (package.json) plus a small per-channel
// override, merged here in Node, rather than two config files that can
// quietly drift out of sync (extraResources, the win/nsis block, the GitHub
// publish target). `--config <generated file>` fully REPLACES package.json's
// `build` for electron-builder, so the merge has to be complete — this reads
// package.json's `build` itself rather than relying on electron-builder's own
// merge/extends behavior.
//
// Usage: node scripts/build-channel-config.mjs <stable|staging>
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.join(here, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(desktopDir, "package.json"), "utf8"));

const channel = process.argv[2];

// Distinct appId + productName is what lets the two installers coexist on one
// machine: separate userData dir (Electron derives it from productName by
// default), separate Start Menu entry, separate install directory. Nothing
// else differs — same extraResources, same NSIS behavior, same GitHub repo.
//
// `releaseType: "release"` on staging is the other deliberate difference:
// electron-builder's default leaves a published release as an empty DRAFT
// (see release.yml's comment) — exactly right for stable, where a human click
// is the release gate, and exactly wrong for staging, where the whole point
// is that a push publishes immediately with no manual step.
const OVERRIDES = {
  stable: {},
  staging: {
    appId: "com.sparstrow.sparstrowgen.staging",
    productName: "Sparstrowgen Staging",
    publish: { ...pkg.build.publish, releaseType: "release" },
  },
};

if (!OVERRIDES[channel]) {
  console.error(
    `[build-channel-config] unknown channel "${channel}" — expected one of: ${Object.keys(OVERRIDES).join(", ")}`,
  );
  process.exit(1);
}

// Staging auto-publishes on every push (see .github/workflows/release-staging.yml)
// as a non-draft prerelease. electron-builder infers the update-feed channel
// name from a version's prerelease tag — vX.Y.Z-staging.N publishes staging.yml
// alongside latest.yml, matching the `autoUpdater.channel = "staging"` that
// updater.ts sets from the baked channel.json. The build number keeps every
// staging push's version distinct; GITHUB_RUN_NUMBER in Actions, a timestamp
// for a local test build.
const buildNumber = process.env.SPARSTROW_BUILD_NUMBER || String(Date.now());
const version = channel === "staging" ? `${pkg.version}-staging.${buildNumber}` : pkg.version;

const merged = {
  ...pkg.build,
  ...OVERRIDES[channel],
  extraMetadata: { version },
};

const outPath = path.join(desktopDir, `electron-builder.${channel}.generated.json`);
fs.writeFileSync(outPath, JSON.stringify(merged, null, 2));
console.log(`[build-channel-config] ${channel} -> ${path.basename(outPath)} (version ${version}, appId ${merged.appId})`);
