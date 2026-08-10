/**
 * Integration tests for the hardened generation proxy. A real http server runs the middleware
 * with an EMPTY env (production posture: no server keys), and we assert each defense fires. No
 * real LLM API is ever reached — every case is rejected before generation, or by the SSRF guard.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import { createGenerationMiddleware } from "./generationProxy";
import { assertPublicHost } from "./ssrfGuard";

let server: Server;
let base: string;

beforeAll(async () => {
  const mw = createGenerationMiddleware({}); // production posture: NO server keys
  server = createServer((req, res) => mw(req, res, () => { res.statusCode = 404; res.end("nf"); }));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  base = `http://127.0.0.1:${port}`;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

/** POST /api/generate with a unique client IP per call so tests don't share the rate-limit bucket. */
async function post(body: unknown, opts: { origin?: string | null; ip?: string; rawBody?: string } = {}) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-forwarded-for": opts.ip ?? Math.random().toString(),
  };
  if (opts.origin !== null) headers.origin = opts.origin ?? base; // default: same-origin
  const res = await fetch(`${base}/api/generate`, {
    method: "POST",
    headers,
    body: opts.rawBody ?? JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as { error?: string; spec?: unknown } };
}

describe("generation proxy — hardening", () => {
  it("BYO-key is code-enforced: gemini with no key never touches a server key, returns a helpful 400", async () => {
    const { status, json } = await post({ prompt: "a red car", provider: "gemini" });
    expect(status).toBe(400);
    expect(json.error).toMatch(/Gemini API key/i);
    expect(json.spec).toBeUndefined();
  });

  it("refuses cross-origin browser requests (Origin present and mismatched)", async () => {
    const { status, json } = await post({ prompt: "a red car" }, { origin: "https://evil.example" });
    expect(status).toBe(403);
    expect(json.error).toMatch(/cross-origin/i);
  });

  it("allows a same-origin request through the origin gate (fails later on missing key, not 403)", async () => {
    const { status } = await post({ prompt: "a red car", provider: "gemini" }, { origin: base });
    expect(status).toBe(400); // reached generation, rejected for no key — not blocked at the gate
  });

  it("allows no-Origin callers (native app / scripts) through the origin gate", async () => {
    const { status } = await post({ prompt: "a red car", provider: "gemini" }, { origin: null });
    expect(status).toBe(400); // not 403
  });

  it("rejects missing prompt", async () => {
    // A key is present so validation reaches the prompt check (the key check comes first).
    const { status, json } = await post({ provider: "gemini", apiKey: "test-key" });
    expect(status).toBe(400);
    expect(json.error).toMatch(/missing prompt/i);
  });

  it("rejects an unknown / local provider on the server", async () => {
    for (const provider of ["local", "not-a-provider"]) {
      const { status, json } = await post({ prompt: "x", provider, apiKey: "k" });
      expect(status, provider).toBe(400);
      expect(json.error, provider).toMatch(/unknown or unsupported provider/i);
    }
  });

  it("rejects a custom base URL that isn't a public https endpoint (string guard)", async () => {
    for (const baseUrl of ["http://openrouter.ai/api/v1", "https://localhost/v1", "https://169.254.169.254/v1"]) {
      const { status, json } = await post({ prompt: "x", provider: "custom", baseUrl, model: "m", apiKey: "k" });
      expect(status, baseUrl).toBe(400);
      expect(json.error, baseUrl).toMatch(/public https endpoint/i);
    }
  });

  it("caps request body size", async () => {
    const huge = JSON.stringify({ prompt: "x".repeat(40_000) });
    const { status, json } = await post(null, { rawBody: huge });
    expect(status).toBe(400);
    expect(json.error).toMatch(/too large/i);
  });

  it("enforces a per-client rate limit", async () => {
    const ip = "203.0.113.77";
    let got429 = false;
    for (let i = 0; i < 45; i++) {
      const { status } = await post({ prompt: "x", provider: "gemini" }, { ip });
      if (status === 429) { got429 = true; break; }
    }
    expect(got429).toBe(true);
  });

  it("SSRF guard: a hostname resolving to a private/loopback address is refused", async () => {
    // localhost resolves to 127.0.0.1 — the DNS layer must reject it even though the string passed.
    await expect(assertPublicHost("localhost")).rejects.toThrow(/non-public|not public/i);
  });
});
