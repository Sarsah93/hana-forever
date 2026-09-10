import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

/**
 * `publicDir` ships the sprite folder verbatim, which would also drag the raw
 * reference photos, generated source sheets and the authoring notes into the
 * installer. Drop them after the copy so shipped builds only carry runtime sprites.
 */
function stripAuthoringAssets(): Plugin {
  let outDir = "dist";
  return {
    name: "hana-strip-authoring-assets",
    apply: "build",
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      for (const entry of ["_review", "_source", "README.md"]) {
        await rm(resolve(outDir, entry), { recursive: true, force: true });
      }
    }
  };
}

export default defineConfig({
  clearScreen: false,
  publicDir: "assets/sprites",
  plugins: [stripAuthoringAssets()],
  server: { port: 1420, strictPort: true },
  envPrefix: ["VITE_"],
  build: {
    target: ["es2021", "chrome105", "safari13"],
    // Three pages: the mascot window (index.html), the action panel window (panel.html) and the usage guide (guide.html).
    rollupOptions: { input: { main: "index.html", panel: "panel.html", guide: "guide.html" } }
  }
});
