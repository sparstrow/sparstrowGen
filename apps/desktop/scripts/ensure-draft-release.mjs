// electron-builder creates one GitHubPublisher instance per artifact it
// uploads (installer, blockmap, update-feed yml, ...), and each instance's
// "find or create the release for this tag" check is its own independent
// GET /releases call — there is no shared lock across instances. When the
// release doesn't exist yet, two instances can both see an empty result and
// both POST a create, producing two separate release objects for the same
// tag with the upload split between them. Observed live 2026-08-30
// (T-DR-05): v0.2.0-staging.3 ended up with a draft holding the installer +
// latest.yml, and a SEPARATE already-published release holding only the
// blockmap — neither one complete on its own.
//
// Pre-creating the draft release ourselves, before electron-builder runs,
// closes the race: by the time any GitHubPublisher instance lists releases,
// the tag already has exactly one, and each instance's own find-existing
// check (electron-publish's getOrCreateRelease) converges on reusing it.
//
// Usage: node scripts/ensure-draft-release.mjs <stable>
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.join(here, "..");
const channel = process.argv[2];
if (!channel) {
  console.error("[ensure-draft-release] usage: node scripts/ensure-draft-release.mjs <stable|staging>");
  process.exit(1);
}

const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
if (!token) {
  console.error("[ensure-draft-release] GH_TOKEN/GITHUB_TOKEN not set");
  process.exit(1);
}

// Everything past this point does a fetch() — calling process.exit() after
// an in-flight undici/fetch keep-alive socket exists crashes Node on Windows
// (`Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`, observed live
// testing this script). Setting `process.exitCode` and letting the script
// end naturally instead lets Node drain those handles on its own.
async function main() {
  const configPath = path.join(desktopDir, `electron-builder.${channel}.generated.json`);
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const version = config.extraMetadata.version;
  const { owner, repo } = config.publish;
  // Matches builder-util-runtime's githubTagPrefix default ("v") — confirmed
  // empirically against real releases this pipeline created
  // (v0.2.0-staging.2, v0.2.0-staging.3), not just read from source.
  const tag = `v${version}`;

  const headers = {
    Authorization: `token ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "sparstrowgen-release-script",
  };

  const listRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases`, { headers });
  if (!listRes.ok) {
    console.error(`[ensure-draft-release] failed to list releases: ${listRes.status} ${await listRes.text()}`);
    process.exitCode = 1;
    return;
  }
  const releases = await listRes.json();
  const existing = releases.find((r) => r.tag_name === tag);
  if (existing) {
    console.log(
      `[ensure-draft-release] release already exists for ${tag} (id ${existing.id}, draft=${existing.draft}) — nothing to do`,
    );
    return;
  }

  // A draft release has no tag yet — GitHub creates it only when the draft is
  // published, and it points the new tag at `target_commitish`. Left unset that
  // defaults to the repository's default branch AT PUBLISH TIME, so any commit
  // that lands on `main` between the build and the publish would silently get
  // the tag instead of the commit that was actually built. Pinning the SHA the
  // workflow checked out makes `v<version>` mean the artifact people install.
  const target = process.env.SPARSTROW_RELEASE_SHA || undefined;
  const createRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      tag_name: tag,
      name: version,
      draft: true,
      ...(target ? { target_commitish: target } : {}),
    }),
  });
  if (!createRes.ok) {
    console.error(`[ensure-draft-release] failed to create draft release: ${createRes.status} ${await createRes.text()}`);
    process.exitCode = 1;
    return;
  }
  const created = await createRes.json();
  console.log(`[ensure-draft-release] created draft release for ${tag} (id ${created.id})`);
}

await main();
