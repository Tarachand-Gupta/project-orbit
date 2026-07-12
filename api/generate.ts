/**
 * Vercel serverless function: POST /api/generate — the production twin of the Vite dev
 * middleware (src/server/generationProxy.ts, same contract). Holds the provider keys
 * server-side; without them every request falls back to the client's deterministic local
 * generator, so the deployed game still works with zero configuration.
 *
 * Configure on Vercel: GEMINI_API_KEY (and optionally DIGITALOCEAN_API_KEY for Kimi/DeepSeek).
 */
import type { IncomingMessage, ServerResponse } from "node:http";
// The explicit .js extension is load-bearing: Vercel compiles this file to ESM, and Node's ESM
// resolver rejects extensionless relative specifiers at runtime (FUNCTION_INVOCATION_FAILED).
import { createGenerationMiddleware } from "../src/server/generationProxy.js";

const middleware = createGenerationMiddleware({
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  DIGITALOCEAN_API_KEY: process.env.DIGITALOCEAN_API_KEY,
});

export default function handler(req: IncomingMessage, res: ServerResponse): Promise<void> | void {
  return middleware(req, res, () => {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "not found" }));
  });
}
