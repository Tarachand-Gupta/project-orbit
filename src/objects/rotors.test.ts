import { describe, it, expect } from "vitest";
import type { ObjectSpec, PartSpec } from "./spec";
import { ensureRotors } from "./rotors";

function heli(parts: PartSpec[], type = "aircraft", label = "Helicopter"): ObjectSpec {
  return {
    id: "h",
    type,
    label,
    prompt: "create a helicopter",
    parts,
    physics: { mass: 2000, friction: 0.5, restitution: 0.1, flammable: true },
    config: {},
  };
}

const bladePart: PartSpec = { primitive: "box", size: [9, 0.08, 0.25], material: "paint_black", position: [0, 2.7, 0] };
const cabin: PartSpec = { primitive: "box", size: [1.6, 1.4, 2.6], material: "paint_blue", position: [0, 1.4, 0] };

describe("ensureRotors", () => {
  it("tags a long flat top blade with a Y spin and adds a rotorSpeed control", () => {
    const out = ensureRotors(heli([cabin, bladePart]));
    const blade = out.parts.find((p) => p.size[0] === 9)!;
    expect(blade.spin).toEqual({ axis: "y", speed: 16, config: "rotorSpeed" });
    expect(out.config.rotorSpeed).toBeTruthy();
    expect(out.config.rotorSpeed.value).toBe(1);
  });

  it("does nothing for non-rotorcraft", () => {
    const car = heli([cabin, bladePart], "vehicle", "Car");
    car.prompt = "create a car";
    const out = ensureRotors(car);
    expect(out.parts.some((p) => p.spin)).toBe(false);
  });

  it("leaves a spec that already animates a part untouched", () => {
    const animated = heli([cabin, { ...bladePart, spin: { axis: "y", speed: 30 } }]);
    const out = ensureRotors(animated);
    expect(out.parts.find((p) => p.size[0] === 9)!.spin!.speed).toBe(30);
    expect(out.config.rotorSpeed).toBeUndefined();
  });

  it("does not tag the cabin or low parts as blades", () => {
    const out = ensureRotors(heli([cabin, bladePart]));
    expect(out.parts.find((p) => p.size[1] === 1.4)!.spin).toBeUndefined();
  });

  it("detects rotorcraft from the prompt even when type is generic", () => {
    const generic = heli([cabin, bladePart], "object", "Thing");
    generic.prompt = "make me a chopper";
    const out = ensureRotors(generic);
    expect(out.parts.some((p) => p.spin)).toBe(true);
  });
});
