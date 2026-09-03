/**
 * `server/` — the API every client talks to.
 *
 * One of two entry points over the same `src/` tree. This one serves the cloud
 * control plane: web, desktop and (later) mobile all reach the product through
 * it, and it is the only thing that talks to the database.
 *
 * The other is `cmd/daemon.ts`, the per-machine agent runtime.
 *
 *   pnpm --filter @sparstrow/server dev:server
 *   pnpm --filter @sparstrow/server start:server
 */
import { buildServer } from "../src/http/app";
import { loadServerConfig, MissingServerConfigError } from "../src/http/config";

async function main() {
  let config;
  try {
    config = loadServerConfig();
  } catch (err) {
    // A missing variable is a deployment mistake and should read like one, not
    // like a stack trace from inside Fastify three seconds later.
    if (err instanceof MissingServerConfigError) {
      console.error(`\n  ✖ ${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }

  const app = await buildServer({ config });

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "shutting down");
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  await app.listen({ host: config.host, port: config.port });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
