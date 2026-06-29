import { describe, it, expect, beforeEach } from "vitest";
import { useGameStore, getObjectsArray, type SpawnedObject } from "./store";
import { useDebugStore } from "./debugStore";
import { generateSpec } from "@/objects/generator";

function makeObj(id: string): SpawnedObject {
  return {
    spec: generateSpec("create a crate", id).spec,
    position: [0, 0, 0],
    quaternion: [0, 0, 0, 1],
    createdAt: 0,
  };
}

describe("useGameStore", () => {
  beforeEach(() => {
    useGameStore.getState().reset();
    useGameStore.setState({ glass: { blur: 18, opacity: 0.18 } });
  });

  it("adds and removes objects", () => {
    useGameStore.getState().addObject(makeObj("a"));
    useGameStore.getState().addObject(makeObj("b"));
    expect(getObjectsArray().map((o) => o.spec.id)).toEqual(["a", "b"]);
    useGameStore.getState().removeObject("a");
    expect(getObjectsArray().map((o) => o.spec.id)).toEqual(["b"]);
  });

  it("clears selection when the selected object is removed", () => {
    useGameStore.getState().addObject(makeObj("a"));
    useGameStore.getState().selectObject("a");
    useGameStore.getState().removeObject("a");
    expect(useGameStore.getState().selectedId).toBe(null);
  });

  it("evicts oldest objects beyond the cap", () => {
    for (let i = 0; i < 70; i++) useGameStore.getState().addObject(makeObj(`o${i}`));
    const ids = getObjectsArray().map((o) => o.spec.id);
    expect(ids.length).toBeLessThanOrEqual(60);
    expect(ids).not.toContain("o0"); // oldest evicted
    expect(ids).toContain("o69"); // newest kept
  });

  it("sets and clamps control values", () => {
    const obj = makeObj("a");
    useGameStore.getState().addObject(obj);
    // crate has a "mass" slider min 1 max 500
    useGameStore.getState().setControlValue("a", "mass", 9999);
    expect(useGameStore.getState().objects["a"].spec.config.mass.value).toBe(500);
    useGameStore.getState().setControlValue("a", "mass", -50);
    expect(useGameStore.getState().objects["a"].spec.config.mass.value).toBe(1);
  });

  it("marks objects errored and burning", () => {
    useGameStore.getState().addObject(makeObj("a"));
    useGameStore.getState().markErrored("a");
    expect(useGameStore.getState().objects["a"].errored).toBe(true);
    useGameStore.getState().setBurning("a", true);
    expect(useGameStore.getState().objects["a"].burning).toBe(true);
  });

  it("hydrates from a snapshot", () => {
    useGameStore.getState().hydrate([makeObj("x"), makeObj("y")]);
    expect(getObjectsArray().map((o) => o.spec.id)).toEqual(["x", "y"]);
  });
});

describe("useDebugStore", () => {
  beforeEach(() => useDebugStore.getState().clear());

  it("pushes entries and tracks unseen count", () => {
    useDebugStore.getState().push({ phase: "build", message: "boom", level: "error" });
    useDebugStore.getState().push({ phase: "render", message: "bang", level: "error" });
    expect(useDebugStore.getState().logs.length).toBe(2);
    expect(useDebugStore.getState().unseen).toBe(2);
    expect(useDebugStore.getState().logs[0].message).toBe("bang"); // newest first
  });

  it("marks all seen", () => {
    useDebugStore.getState().push({ phase: "build", message: "x", level: "error" });
    useDebugStore.getState().markAllSeen();
    expect(useDebugStore.getState().unseen).toBe(0);
  });
});
