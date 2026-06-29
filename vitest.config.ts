import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

// Unit tests run in jsdom and deliberately avoid the WebGL/WASM-heavy modules.
// We test pure logic: spec generation, schema validation, clock math, builder geometry, store reducers.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    globals: true,
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: ["tests/e2e/**", "node_modules/**"],
  },
});
