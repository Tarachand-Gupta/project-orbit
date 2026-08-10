/**
 * Vercel serverless function: POST /api/generate — the production twin of the Vite dev
 * middleware (src/server/generationProxy.ts, same contract).
 *
 * BRING-YOUR-OWN-KEY BY DEFAULT, ENFORCED IN CODE. This public, unauthenticated endpoint ships
 * NO server keys: players paste their own key in the in-game ⚙ settings and it rides along
 * per-request (never stored). A request without a key gets the deterministic local generator, so
 * the deployed game still works with zero configuration. Do NOT rely on a docs convention — the
 * gate below means setting GEMINI_API_KEY on Vercel alone does nothing.
 *
 * Self-hosting and want to fund generation for your users? Opt in deliberately by setting BOTH
 * ALLOW_SERVER_KEYS=1 and the provider key(s). The public project does neither: an open-source
 * key on a public, unauthenticated endpoint would be drained within hours.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
// The explicit .js extension is load-bearing: Vercel compiles this file to ESM, and Node's ESM
// resolver rejects extensionless relative specifiers at runtime (FUNCTION_INVOCATION_FAILED).
import { createGenerationMiddleware } from "../src/server/generationProxy.js";

// Server keys are used only when a deployer explicitly opts in. Default (and the public deploy):
// no server keys, so the proxy is bring-your-own-key with no way to accidentally leak the owner's.
const allowServerKeys = process.env.ALLOW_SERVER_KEYS === "1";
const middleware = createGenerationMiddleware(
  allowServerKeys ? { GEMINI_API_KEY: process.env.GEMINI_API_KEY } : {},
);

export default function handler(req: IncomingMessage, res: ServerResponse): Promise<void> | void {
  return middleware(req, res, () => {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "not found" }));
  });
}
