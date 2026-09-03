import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * Three builds, one command.
 *
 * The layout matches electron-vite's convention (`src/main`, `src/preload`,
 * `src/renderer/index.html`), so most of this file is explicit only where the
 * default would be wrong.
 *
 * The renderer is a **plain Vite React SPA**. That sentence is the phase: what
 * used to happen here was a bundled Next.js standalone server plus a second
 * Node runtime shipped inside the installer, spawned at launch, and served
 * over loopback into a `BrowserWindow`. Every feature had to be a Next.js
 * feature for the desktop app to have it at all.
 */
export default defineConfig({
  main: {
    // The main process runs in Node and must NOT bundle its dependencies —
    // `electron-updater` and friends resolve at runtime from node_modules.
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, "src/main/main.ts") },
      },
    },
  },

  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, "src/preload/index.ts") },
      },
    },
  },

  renderer: {
    root: resolve(__dirname, "src/renderer"),
    plugins: [react(), tailwindcss()],
    resolve: {
      // The shared packages export TypeScript SOURCE (AGENTS.md §1 rule 3), so
      // Vite transpiles them like first-party code. Nothing is pre-built and
      // there is no watch step between editing packages/views and seeing it
      // in the window.
      dedupe: ["react", "react-dom", "@tanstack/react-query"],
    },
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, "src/renderer/index.html") },
      },
    },
  },
});
