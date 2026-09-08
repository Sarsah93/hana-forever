import { defineConfig } from "vite";

export default defineConfig({
  clearScreen: false,
  publicDir: "assets/sprites",
  server: { port: 1420, strictPort: true },
  envPrefix: ["VITE_"],
  build: { target: ["es2021", "chrome105", "safari13"] }
});
