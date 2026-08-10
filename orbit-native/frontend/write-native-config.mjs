/**
 * Packaging step: copy the Gemini key from the repo-root .env into dist/native-config.json so
 * the packaged macOS app (which has no dev-server proxy) can call Gemini directly
 * (src/objects/nativeLlm.ts in the game).
 *
 * Security shape: the key travels .env → local .app bundle only. dist/ is gitignored, the
 * browser deployment never runs this script, and a missing key just means the packaged app
 * falls back to local template objects (offline-first) — so this never fails the build.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const envPath = join(here, "../../.env");
const outPath = join(here, "dist/native-config.json");

let key = "";
if (existsSync(envPath)) {
  const match = readFileSync(envPath, "utf8").match(/^GEMINI_API_KEY=(.+)$/m);
  key = match?.[1]?.trim() ?? "";
}

if (key) {
  writeFileSync(outPath, JSON.stringify({ geminiApiKey: key }) + "\n");
  console.log("[native-config] bundled Gemini key into dist/native-config.json");
} else {
  console.warn("[native-config] no GEMINI_API_KEY in repo .env — packaged app will use local objects only");
}
