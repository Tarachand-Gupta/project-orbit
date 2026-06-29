/**
 * Server-side generation proxy (Tech Doc §9) built on the Vercel AI SDK.
 *
 * Holds the API keys (never shipped to the browser) and turns a prompt into a constrained
 * Object Spec:
 *   - Gemini → `generateObject` with a Zod schema (native structured output, very reliable).
 *   - DigitalOcean (Kimi/DeepSeek, OpenAI-compatible) → `generateText` + tolerant JSON parse,
 *     then the same Zod schema validates it.
 * The result is transformed to the runtime ObjectSpec. The client validates again and falls
 * back to the local deterministic generator on any failure — core mechanics never depend on
 * the model.
 *
 * Runs as Vite dev middleware (POST /api/generate). For production this would move to a
 * serverless function with the same contract.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { generateObject, generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { LlmSpecSchema, toObjectSpec, type LlmSpec } from "../objects/specSchema";

export type Provider = "gemini" | "kimi" | "deepseek";

interface ProxyEnv {
  GEMINI_API_KEY?: string;
  DIGITALOCEAN_API_KEY?: string;
}

const DO_BASE = "https://inference.do-ai.run/v1";
const MODEL_IDS: Record<Provider, string> = {
  gemini: "gemini-3.5-flash",
  kimi: "kimi-k2.6",
  deepseek: "deepseek-v4-pro",
};

const PRIMITIVES =
  "box[w,h,d], sphere[r], cylinder[rTop,rBottom,h], cone[r,h], capsule[r,length], torus[r,tube], tetrahedron[r]";
const MATERIALS =
  "paint_red, paint_blue, paint_yellow, paint_green, paint_white, paint_black, glass, chrome, rubber, wood, bark, leaf, stone, marble, gold, sand, asphalt, fire, ember, brick, steel (or a #hex color)";

const SYSTEM = `You are an expert 3D modeler for a low-poly sandbox game. Convert the user's prompt into ONE high-quality Object Spec built from low-poly primitive parts. Prioritize CORRECTNESS, THOROUGHNESS, and VISUAL QUALITY over brevity — take the parts you need to make it clearly recognizable and well-proportioned.

Primitives & their size arrays: ${PRIMITIVES}
Materials: ${MATERIALS}

Modeling rules — THINK CAREFULLY about real-world structure & physics before emitting parts:
- Build centered at the origin, resting ON the ground: the lowest point at y≈0, +y up, forward +z. Never bury or float it.
- Keep total extent within ~30 units; use realistic proportions and a sensible material per part.
- Be thorough: use enough parts (often 12–40) so it really looks like the thing — e.g. a car has a body, cabin, windows, 4 wheels, lights, bumpers; a plane has fuselage, wings, tail, gear; a building has walls, roof, door, windows.
- Get the STRUCTURE physically correct, especially wheels/supports:
  · Wheels are cylinders, ALL THE SAME radius, mounted with their axle along X (rotation [0,0,1.5708]), placed at the corners/sides so the vehicle actually rests on them. A car has 4 wheels (front+back, left+right); a motorbike/bicycle has exactly 2 wheels inline (one at front +z, one at rear -z) of equal size, connected by a frame.
  · Legs/supports come in matched pairs at the base. Symmetry where appropriate (wheels, wings, legs).
- Use color/material variation for visual interest.

Physics:
- Realistic mass (kg), friction & restitution 0..1. Keep restitution low (≤0.2) so it doesn't bounce.
- Large static structures (buildings, towers, bridges, tracks): physics.fixed = true.

Interaction (IMPORTANT — controls API):
- ALWAYS set "interaction". If the player should be able to control it:
  - cars/trucks/buses/karts → type "vehicle", mode "drive", posture "sit".
  - motorbikes/bicycles → type "vehicle", mode "drive", posture "sit".
  - boats/ships → type "boat", mode "drive", posture "sit" (they float on water).
  - planes/jets/helicopters/drones → type "aircraft", mode "fly", posture "sit".
  - hoverboards/segways/platforms → mode "ride", posture "stand".
  - skateboards/snowboards/surfboards → mode "ride", posture "stand-left".
  - mounts/animals/horses → mode "ride", posture "straddle".
  - hang gliders/luge/sleds → mode "fly" or "ride", posture "lie".
  - everything else → mode "none".
- posture options: "sit", "straddle", "stand", "stand-left", "stand-right", "lie".
- Also set interaction.seatHeight = the height above the object origin where the rider's seat/feet
  should be (e.g. a car seat ~0.7, a board deck ~0.3). Posture "sit" seats the avatar; "stand"
  stands it on top.
- The player enters/exits with E (handled by the engine); just declare mode, verb, posture, seatHeight.
- The object is placed flat ON the ground automatically — model it upright, resting at y≈0.

config is an ARRAY of controls; for a checkbox use value 0 or 1. Provide 3–8 useful, real controls grouped into tabs (e.g. Performance, Body, Lights).`;

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function repairJson(s: string): string {
  return s
    .replace(/```(?:json)?/gi, "")
    .replace(/\bNaN\b|\bInfinity\b|\b-Infinity\b|\bundefined\b/g, "0")
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/(-?\d(?:\.\d+)?)\s+(-?\d)/g, "$1, $2");
}

function extractJson(text: string): unknown {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) t = t.slice(start, end + 1);
  try {
    return JSON.parse(t);
  } catch {
    return JSON.parse(repairJson(t));
  }
}

const GEN_TIMEOUT_MS = 40_000;
function timeoutSignal(ms: number): AbortSignal {
  const c = new AbortController();
  setTimeout(() => c.abort(), ms).unref?.();
  return c.signal;
}

async function generateGemini(prompt: string, key: string): Promise<LlmSpec> {
  const google = createGoogleGenerativeAI({ apiKey: key });
  const { object } = await generateObject({
    model: google(MODEL_IDS.gemini),
    schema: LlmSpecSchema,
    system: SYSTEM,
    prompt,
    temperature: 0.7,
    // Disable the model's extended "thinking" — it was adding ~25s/request for these small specs.
    providerOptions: { google: { thinkingConfig: { thinkingBudget: 0, includeThoughts: false } } },
    abortSignal: timeoutSignal(GEN_TIMEOUT_MS),
  });
  return object;
}

/**
 * Generate with automatic self-correction: retry on timeout/parse/validation failure, feeding the
 * previous error back into the prompt so the model can fix it (PRD §4.7 — agent self-correction).
 */
async function generateWithRetry(
  provider: Provider,
  prompt: string,
  env: ProxyEnv,
  attempts = 2,
): Promise<LlmSpec> {
  let lastErr = "";
  for (let i = 0; i < attempts; i++) {
    const fixHint = i > 0 ? `\n\nYour previous attempt failed with: "${lastErr}". Return a COMPLETE, valid spec this time — fewer parts is fine if it helps you finish quickly.` : "";
    try {
      if (provider === "gemini") {
        if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");
        return await generateGemini(prompt + fixHint, env.GEMINI_API_KEY);
      }
      if (!env.DIGITALOCEAN_API_KEY) throw new Error("DIGITALOCEAN_API_KEY not configured");
      return await generateDigitalOcean(prompt + fixHint, MODEL_IDS[provider], env.DIGITALOCEAN_API_KEY);
    } catch (err) {
      lastErr = (err as Error).name === "AbortError" || /abort/i.test((err as Error).message) ? "timeout" : (err as Error).message;
    }
  }
  throw new Error(lastErr || "generation failed");
}

/** Tolerantly coerce an arbitrary parsed object into a valid LlmSpec (DO models drift). */
function coerceLlmSpec(raw: unknown): LlmSpec {
  const r = (raw ?? {}) as Record<string, unknown>;
  const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || d);
  const partsIn = Array.isArray(r.parts) ? r.parts : [];
  const parts = partsIn
    .map((p) => p as Record<string, unknown>)
    .filter((p) => p && typeof p.primitive === "string" && Array.isArray(p.size))
    .map((p) => ({
      primitive: p.primitive as LlmSpec["parts"][number]["primitive"],
      size: (p.size as unknown[]).map((n) => num(n, 1)).slice(0, 3),
      position: Array.isArray(p.position) ? (p.position as number[]).map((n) => num(n)).slice(0, 3) : undefined,
      rotation: Array.isArray(p.rotation) ? (p.rotation as number[]).map((n) => num(n)).slice(0, 3) : undefined,
      material: typeof p.material === "string" ? p.material : "stone",
    }));
  const ph = (r.physics ?? {}) as Record<string, unknown>;
  const cfgIn = Array.isArray(r.config) ? r.config : [];
  const config = cfgIn
    .map((c) => c as Record<string, unknown>)
    .filter((c) => c && typeof c.key === "string" && ["slider", "checkbox", "stepper"].includes(c.type as string))
    .map((c) => ({
      key: c.key as string,
      type: c.type as "slider" | "checkbox" | "stepper",
      label: typeof c.label === "string" ? c.label : undefined,
      tab: typeof c.tab === "string" ? c.tab : undefined,
      min: c.min !== undefined ? num(c.min) : undefined,
      max: c.max !== undefined ? num(c.max) : undefined,
      step: c.step !== undefined ? num(c.step) : undefined,
      value: typeof c.value === "boolean" ? (c.value ? 1 : 0) : num(c.value),
    }));
  return LlmSpecSchema.parse({
    type: typeof r.type === "string" ? r.type : "object",
    label: typeof r.label === "string" ? r.label : "Object",
    parts: parts.length ? parts : [{ primitive: "box", size: [1, 1, 1], material: "stone" }],
    physics: {
      mass: num(ph.mass, 10),
      friction: num(ph.friction, 0.6),
      restitution: num(ph.restitution, 0.2),
      flammable: Boolean(ph.flammable),
      fire: ph.fire === undefined ? undefined : Boolean(ph.fire),
      fixed: ph.fixed === undefined ? undefined : Boolean(ph.fixed),
    },
    config,
  });
}

async function generateDigitalOcean(prompt: string, model: string, key: string): Promise<LlmSpec> {
  const provider = createOpenAICompatible({ name: "digitalocean", baseURL: DO_BASE, apiKey: key });
  const { text } = await generateText({
    model: provider(model),
    system: `${SYSTEM}\n\nRespond with ONLY raw JSON matching this shape: { type, label, parts:[{primitive,size,position?,rotation?,material}], physics:{mass,friction,restitution,flammable,fire?,fixed?}, config:[{key,type,label,tab,min,max,step,value}] }. No markdown, no prose.`,
    prompt,
    temperature: 0.6,
    abortSignal: timeoutSignal(GEN_TIMEOUT_MS),
  });
  return coerceLlmSpec(extractJson(text));
}

export function createGenerationMiddleware(env: ProxyEnv) {
  return async function generationMiddleware(
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ): Promise<void> {
    if (!req.url?.startsWith("/api/generate") || req.method !== "POST") return next();

    const send = (code: number, body: unknown) => {
      res.statusCode = code;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(body));
    };

    try {
      const raw = await readBody(req);
      const { prompt, provider = "gemini", id = "obj_llm", apiKey } = JSON.parse(raw || "{}") as {
        prompt?: string;
        provider?: Provider;
        id?: string;
        apiKey?: string;
      };
      if (!prompt || typeof prompt !== "string") return send(400, { error: "missing prompt" });

      // A user-supplied key (bring-your-own-key) overrides the server's env keys.
      const effectiveEnv: ProxyEnv = apiKey
        ? provider === "gemini"
          ? { ...env, GEMINI_API_KEY: apiKey }
          : { ...env, DIGITALOCEAN_API_KEY: apiKey }
        : env;

      const t0 = Date.now();
      const llm = await generateWithRetry(provider, prompt, effectiveEnv);
      const spec = toObjectSpec(llm, id, prompt);
      return send(200, { spec, provider, model: MODEL_IDS[provider], ms: Date.now() - t0 });
    } catch (err) {
      return send(502, { error: (err as Error).message });
    }
  };
}

