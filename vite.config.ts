import { defineConfig, loadEnv, type PluginOption } from "vite";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
import { fileURLToPath, URL } from "node:url";
import { createGenerationMiddleware } from "./src/server/generationProxy";

// Dev-only generation proxy: holds API keys server-side and exposes POST /api/generate.
function generationProxyPlugin(env: Record<string, string>): PluginOption {
  return {
    name: "orbit-generation-proxy",
    configureServer(server) {
      const mw = createGenerationMiddleware({
        GEMINI_API_KEY: env.GEMINI_API_KEY,
        DIGITALOCEAN_API_KEY: env.DIGITALOCEAN_API_KEY,
      });
      server.middlewares.use((req, res, next) => void mw(req, res, next));
    },
  };
}

// Rapier ships as WASM; wasm + top-level-await plugins load it cleanly (see Tech Doc §2).
export default defineConfig(({ mode }) => {
  // Load ALL env vars (no VITE_ prefix) so the proxy can read secret keys without exposing
  // them to the client bundle.
  const env = loadEnv(mode, process.cwd(), "");
  return {
  plugins: [react(), wasm(), topLevelAwait(), generationProxyPlugin(env)],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  // Pinned, uncommon port with strictPort so the dev server never silently drifts to another
  // port (which would make the e2e suite test the wrong app). Host pinned to IPv4: Node can
  // bind "localhost" as ::1-only, which strands the native shell's dev URL + readiness probe
  // (http://127.0.0.1:5191) in a 60s timeout.
  server: { host: "127.0.0.1", port: 5191, strictPort: true },
  preview: { host: "127.0.0.1", port: 5191, strictPort: true },
  optimizeDeps: {
    // Rapier's wasm-bindgen glue does not play well with esbuild pre-bundling.
    exclude: ["@dimforge/rapier3d-compat"],
  },
  };
});
