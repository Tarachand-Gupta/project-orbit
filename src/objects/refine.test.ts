import { describe, it, expect, beforeEach } from "vitest";
import { refineObject, refinePrompt } from "./refine";
import { generateSpec } from "./generator";
import { useGameStore } from "@/state/store";
import { usePlayerStore } from "@/state/playerStore";

const ID = "obj_refine_test";

function seedObject() {
  const spec = generateSpec("a red car", ID).spec;
  useGameStore.setState({
    objects: { [ID]: { spec, position: [0, 0, 0], quaternion: [0, 0, 0, 1], createdAt: 0 } },
    order: [ID],
    pendingGen: {},
    selectedId: ID,
    provider: "gemini",
  });
  usePlayerStore.setState({ drivingId: null });
  return spec;
}

describe("refinePrompt", () => {
  it("embeds the instruction, the label, and the object's parts", () => {
    const spec = generateSpec("a red car", ID).spec;
    const p = refinePrompt(spec, "make it blue");
    expect(p).toContain("make it blue");
    expect(p).toContain(spec.label);
    expect(p).toContain('"parts"');
    // Identity fields must NOT be handed to the model (they're forced back on the result).
    expect(p).not.toContain('"prompt"');
  });
});

describe("refineObject guards", () => {
  beforeEach(() => seedObject());

  it("rejects an empty instruction", () => {
    expect(refineObject(ID, "   ").error).toBe("empty");
  });

  it("rejects an unknown object", () => {
    expect(refineObject("does-not-exist", "make it red").error).toBe("no-object");
  });

  it("refuses to rebuild a vehicle that is being driven", () => {
    usePlayerStore.setState({ drivingId: ID });
    expect(refineObject(ID, "make it red")).toEqual({ ok: false, error: "driving" });
  });

  it("requires an AI provider — the offline engine can't do semantic edits", () => {
    useGameStore.setState({ provider: "local" });
    expect(refineObject(ID, "make it red").error).toBe("needs-provider");
  });

  it("rejects a second refine while one is already in flight", () => {
    useGameStore.setState({ pendingGen: { [ID]: "Car" } });
    expect(refineObject(ID, "make it red").error).toBe("already-refining");
  });
});
