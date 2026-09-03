import { createRequire } from "node:module";
import type { NextConfig } from "next";

const require = createRequire(import.meta.url);

/**
 * The sidebar footer used to read `v0.1.0 · Next.js 15` as a hardcoded string,
 * while the app was actually running Next.js 16.3. Nothing made it wrong; it
 * was simply never updated, and a version label that lies is worse than no
 * label — it is the first thing anyone reads when diagnosing a version-specific
 * problem.
 *
 * Read from the manifests at build time so it cannot drift again. `env` inlines
 * these into the client bundle at build time, which is what the footer needs
 * (Next.js `next.config.js` `env` reference).
 */
const appVersion = (require("./package.json") as { version: string }).version;
const nextVersion = (require("next/package.json") as { version: string }).version;

const nextConfig: NextConfig = {
  output: "standalone",
  // `@sparstrow/server` is here transitionally: the /api/v1 adapter imports
  // the route registry in-process until server/ runs as its own process.
  // Only the "./routes" subpath is ever imported -- the package root pulls
  // the daemon and its native modules, which Next cannot bundle.
  transpilePackages: ["@sparstrow/ui", "@sparstrow/shared", "@sparstrow/server"],
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
    NEXT_PUBLIC_NEXT_VERSION: nextVersion,
  },
};

export default nextConfig;
