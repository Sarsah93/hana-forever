import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

/**
 * `publicDir` ships the sprite folder verbatim, which would also drag the raw
 * reference photos and the authoring notes into the installer. Drop them after
 * the copy so shipped builds only carry runtime sprites.
 */
function stripAuthoringAssets(): Plugin {
  return {
    name: "hana-strip-authoring-assets",
    apply: "build",
    async closeBundle() {
      const outDir = resolve(import.meta.dirname, "dist");
      for (const entry of ["_review", "README.md"]) {
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
  build: { target: ["es2021", "chrome105", "safari13"] }
});
