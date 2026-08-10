/**
 * Iterate on an already-spawned object with a natural-language instruction ("make the wheels
 * bigger", "paint it red"). The current spec + the instruction go to the model, and the result
 * is swapped in place via store.replaceSpec — preserving the object's id, label, and transform,
 * so it's an edit, not a new object.
 *
 * Two safety rules:
 *  - never rebuild the collider of a vehicle that is currently being driven (checked at the start
 *    AND again when the model answers, since a drive can begin mid-request);
 *  - it needs an AI provider — the offline template engine can't do semantic edits. The live
 *    sliders in the controls panel are the always-available offline iteration path.
 */

import { enrichWithLLM } from "./llm";
import { groundSpec } from "./normalize";
import { ensureRotors } from "./rotors";
import { useGameStore } from "@/state/store";
import { usePlayerStore } from "@/state/playerStore";
import { logError } from "@/state/debugStore";
import type { ObjectSpec } from "./spec";

export type RefineError = "empty" | "no-object" | "driving" | "needs-provider" | "already-refining";

export interface RefineResult {
  ok: boolean;
  pending?: boolean;
  error?: RefineError;
}

/** Build a prompt that hands the model the current object and asks for an edited full spec. */
export function refinePrompt(spec: ObjectSpec, instruction: string): string {
  // Only the geometry/physics/controls the model needs to edit — keeps the request small (the
  // proxy caps body size) and the identity fields (id/prompt) out of the model's reach.
  const basis = { label: spec.label, type: spec.type, parts: spec.parts, physics: spec.physics, config: spec.config };
  return (
    `You are editing an EXISTING low-poly object. Here it is as JSON:\n${JSON.stringify(basis)}\n\n` +
    `Apply this change: "${instruction}".\n` +
    `Return the COMPLETE updated spec (ALL parts), keeping everything not mentioned the same, ` +
    `and keep it recognizable as "${spec.label}".`
  );
}

export function refineObject(id: string, instruction: string): RefineResult {
  const text = instruction.trim();
  if (!text) return { ok: false, error: "empty" };

  const store = useGameStore.getState();
  const obj = store.objects[id];
  if (!obj) return { ok: false, error: "no-object" };
  if (usePlayerStore.getState().drivingId === id) return { ok: false, error: "driving" };
  if (id in store.pendingGen) return { ok: false, error: "already-refining" };

  const provider = store.provider;
  if (provider === "local") return { ok: false, error: "needs-provider" };

  const label = obj.spec.label;
  // pendingGen[id] drives the spinner AND doubles as the cancellation token (world reset clears it).
  store.startGenerating(id, label);
  const cancelled = () => !(id in useGameStore.getState().pendingGen);

  void enrichWithLLM(refinePrompt(obj.spec, text), id, provider, label)
    .then((enriched) => {
      if (cancelled()) return;
      if (usePlayerStore.getState().drivingId === id) {
        logError({ objectId: id, phase: "generate", level: "info", message: "refine skipped — object is being driven" });
        return;
      }
      if (enriched) {
        useGameStore.getState().replaceSpec(id, ensureRotors(groundSpec(enriched)));
      } else {
        logError({ objectId: id, prompt: text, phase: "generate", level: "warn", message: "refine failed — kept the object unchanged" });
      }
    })
    .catch(() => {
      /* enrichWithLLM resolves null on failure; never strand the pending entry */
    })
    .finally(() => useGameStore.getState().finishGenerating(id));

  return { ok: true, pending: true };
}
