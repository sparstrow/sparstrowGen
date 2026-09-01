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

// Distinct appId + productName is what lets the two installers coexist on
// one machine at the install-directory / Start Menu / GitHub-release level.
// It does NOT, on its own, separate userData: Electron derives
// `app.getPath("userData")` from `app.name`, which resolves from the
// packaged app's own `package.json` `name` field (`@sparstrow/desktop` for
// both channels here) — `productName` is an electron-builder installer/build
// concept, not something Electron's app module reads at runtime. Verified
// 2026-08-30 (T-DR-04): a real staging install launched with
// `--user-data-dir=...\Roaming\@sparstrow/desktop`, the same default stable
// would use — the two channels shared a userData dir until `name` below was
// added to staging's `extraMetadata`. `extraMetadata` is merged into the
// packaged app's `package.json`, so overriding `name` there is what actually
// changes `app.name`, and with it every userData-derived path.
//
// Staging used to force `releaseType: "release"` here so electron-builder
// would create the GitHub Release already published, skipping the human
// click stable leaves in place. That broke 2026-08-30 (T-DR-05): GitHub's
// release-creation endpoint now rejects a `draft: false` create call outright
// with "Published releases must have a valid tag" when the tag doesn't exist
// yet — and it never does, since electron-builder creates the tag AS PART OF
// the release, not before it. Draft creation is unaffected (the whole point
// of a draft is that GitHub defers creating the tag until it's published), so
// staging now creates a draft exactly like stable, and
// release-staging.yml publishes it immediately afterward via a follow-up API
// call — same "no human click" outcome, different mechanism.
const OVERRIDES = {
  stable: {},
  staging: {
    appId: "com.sparstrow.sparstrowgen.staging",
    productName: "Sparstrowgen Staging",
    // `publish.channel` — NOT inferred from the version's `-staging.N`
    // prerelease suffix, despite what this file used to claim (never
    // actually verified until T-DR-05). app-builder-lib's
    // `computeChannelNames` reads `publishConfig.channel` directly,
    // defaulting to "latest" when absent — so without this, staging was
    // silently publishing `latest.yml` (confirmed live, T-DR-05), which
    // `updater.ts`'s `autoUpdater.channel = "staging"` would never find.
    publish: { ...pkg.build.publish, channel: "staging" },
  },
};
// Stable deliberately keeps `pkg.name` (`@sparstrow/desktop`) unchanged —
// that's the userData path any already-installed stable build is already
// using, and this fix must not orphan it. Staging gets its own distinct name
// so its userData dir (and anything else Electron keys off `app.name`) never
// overlaps with stable's.
const APP_NAME = { stable: pkg.name, staging: "sparstrow-desktop-staging" };

if (!OVERRIDES[channel]) {
  console.error(
    `[build-channel-config] unknown channel "${channel}" — expected one of: ${Object.keys(OVERRIDES).join(", ")}`,
  );
  process.exit(1);
}

// Staging auto-publishes on every push (see .github/workflows/release-staging.yml).
// `OVERRIDES.staging.publish.channel` above is what makes electron-builder
// write `staging.yml` instead of `latest.yml`, matching the
// `autoUpdater.channel = "staging"` that updater.ts sets from the baked
// channel.json. The build number keeps every staging push's version
// distinct; GITHUB_RUN_NUMBER in Actions, a timestamp for a local test build.
const buildNumber = process.env.SPARSTROW_BUILD_NUMBER || String(Date.now());
const version = channel === "staging" ? `${pkg.version}-staging.${buildNumber}` : pkg.version;

const merged = {
  ...pkg.build,
  ...OVERRIDES[channel],
  extraMetadata: { name: APP_NAME[channel], version },
};

const outPath = path.join(desktopDir, `electron-builder.${channel}.generated.json`);
fs.writeFileSync(outPath, JSON.stringify(merged, null, 2));
console.log(`[build-channel-config] ${channel} -> ${path.basename(outPath)} (version ${version}, appId ${merged.appId})`);
