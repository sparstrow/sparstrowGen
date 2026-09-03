// Generates a channel-specific electron-builder config.
//
// Stable and dev share every field EXCEPT app identity and version — one
// electron-builder `build` block (package.json) plus a small per-channel
// override, merged here in Node, rather than two config files that can
// quietly drift out of sync (extraResources, the win/nsis block, the GitHub
// publish target). `--config <generated file>` fully REPLACES package.json's
// `build` for electron-builder, so the merge has to be complete — this reads
// package.json's `build` itself rather than relying on electron-builder's own
// merge/extends behavior.
//
// Usage: node scripts/build-channel-config.mjs <stable|dev>
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.join(here, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(desktopDir, "package.json"), "utf8"));

const channel = process.argv[2];

// Distinct appId + productName is what lets the two installers coexist on
// one machine at the install-directory / Start Menu / GitHub-release level.
// It does NOT, on its own, separate userData: Electron derives
// `app.getPath("userData")` from `app.name`, which resolves from the
// packaged app's own `package.json` `name` field (`@sparstrow/desktop` for
// both channels here). `productName` is an electron-builder installer/build
// concept, not something Electron's app module reads at runtime. Verified
// 2026-08-30 (T-DR-04) against the since-retired Staging channel: a real
// second install launched with
// `--user-data-dir=...\Roaming\@sparstrow/desktop`, the same default stable
// would use, so the two channels shared a userData dir until `name` below was
// added to the non-stable `extraMetadata`. `extraMetadata` is merged into the
// packaged app's `package.json`, so overriding `name` there is what actually
// changes `app.name`, and with it every userData-derived path.
//
// Identity is necessary and not sufficient. Two installs also have to stop
// fighting over a port: both channels hardcoded 48750 and 8080, so the second
// app found the first one's server listening and ADOPTED it, then operated on
// the other install's data. `src/main/ports.ts` holds the per-channel table
// that closes that, and `prepare-resources.mjs` bakes the numbers into each
// install's own channel.json.
const OVERRIDES = {
  stable: {},
  dev: {
    appId: "com.sparstrow.sparstrowgen.dev",
    productName: "Sparstrowgen Dev",
    // NEVER published. A dev build exists so an agent can install and drive a
    // real packaged app without touching the one the owner uses; putting it on
    // a GitHub release feed would defeat that twice over — the owner's app
    // could find it, and it could find the owner's.
    publish: null,
  },
};
// Stable deliberately keeps `pkg.name` (`@sparstrow/desktop`) unchanged —
// that's the userData path any already-installed stable build is already
// using, and this fix must not orphan it. Dev gets its own distinct name so
// its userData dir (and anything else Electron keys off `app.name`) never
// overlaps with stable's.
const APP_NAME = { stable: pkg.name, dev: "sparstrow-desktop-dev" };

if (!OVERRIDES[channel]) {
  console.error(
    `[build-channel-config] unknown channel "${channel}" — expected one of: ${Object.keys(OVERRIDES).join(", ")}`,
  );
  process.exit(1);
}

// A dev build is never published, so its version only has to be distinct from
// the last one an agent built on this machine — a timestamp is enough, and the
// `-dev.N` suffix makes it obvious in the title bar which build is running.
const buildNumber = process.env.SPARSTROW_BUILD_NUMBER || String(Date.now());
const version = channel === "dev" ? `${pkg.version}-dev.${buildNumber}` : pkg.version;

const merged = {
  ...pkg.build,
  ...OVERRIDES[channel],
  extraMetadata: { name: APP_NAME[channel], version },
};

const outPath = path.join(desktopDir, `electron-builder.${channel}.generated.json`);
fs.writeFileSync(outPath, JSON.stringify(merged, null, 2));
console.log(`[build-channel-config] ${channel} -> ${path.basename(outPath)} (version ${version}, appId ${merged.appId})`);
