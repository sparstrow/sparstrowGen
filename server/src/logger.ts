import { pino } from "pino";

// pino-pretty is a devDependency — it is NOT shipped in the packaged app's
// production deps, so a packaged run must never request the pretty transport
// (it would throw "unable to determine transport target"). Dev keeps pretty.
const pretty = process.env.NODE_ENV !== "production" && process.env.SPARSTROW_PACKAGED !== "1";

export const logger = pino(
  pretty
    ? {
        level: process.env.LOG_LEVEL ?? "info",
        transport: { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss" } },
      }
    : { level: process.env.LOG_LEVEL ?? "info" },
);
