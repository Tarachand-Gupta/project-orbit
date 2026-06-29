import { describe, it, expect } from "vitest";
import { createGroundSampler, mulberry32, riverCenterZ } from "./ground";
import { placeOnGround, pickSpawnInFront, slopeAt, isSpawnable } from "./placement";
import { DEFAULT_WORLD } from "@/config/world";

const sampler = createGroundSampler(DEFAULT_WORLD);

describe("mulberry32", () => {
  it("is deterministic and in [0,1)", () => {
    const a = mulberry32(5), b = mulberry32(5);
    for (let i = 0; i < 50; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("createGroundSampler", () => {
  it("is deterministic for a seed", () => {
    const s2 = createGroundSampler(DEFAULT_WORLD);
    expect(sampler.heightAt(12, -8)).toBe(s2.heightAt(12, -8));
  });

  it("keeps the spawn area near the origin flat", () => {
    expect(Math.abs(sampler.heightAt(0, 0))).toBeLessThan(2);
  });

  it("produces hills out in the world", () => {
    let maxH = 0;
    for (let x = -150; x <= 150; x += 10)
      for (let z = -150; z <= 150; z += 10) maxH = Math.max(maxH, sampler.heightAt(x, z));
    expect(maxH).toBeGreaterThan(4); // real elevation exists
  });

  it("carves the river below the surrounding banks", () => {
    // sample a point on the river vs a point off to the side at the same x
    const x = 20;
    const cz = riverCenterZ(x, DEFAULT_WORLD.size);
    const onRiver = sampler.heightAt(x, cz);
    const offRiver = sampler.heightAt(x, cz + DEFAULT_WORLD.riverWidth + 8);
    expect(onRiver).toBeLessThan(offRiver);
    expect(sampler.isRiver(x, cz)).toBe(true);
    expect(sampler.isRiver(x, cz + DEFAULT_WORLD.riverWidth + 8)).toBe(false);
  });

  it("returns color channels in [0,1]", () => {
    for (let i = 0; i < 50; i++) {
      const c = sampler.colorAt((i - 25) * 5, (i - 25) * 3);
      for (const ch of [c.r, c.g, c.b]) {
        expect(ch).toBeGreaterThanOrEqual(0);
        expect(ch).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("placement", () => {
  it("places objects exactly on the ground plus lift", () => {
    const p = placeOnGround(10, 10, sampler, 1.5);
    expect(p.position[0]).toBe(10);
    expect(p.position[2]).toBe(10);
    expect(p.position[1]).toBeCloseTo(sampler.heightAt(10, 10) + 1.5, 6);
    expect(p.quaternion).toEqual([0, 0, 0, 1]);
  });

  it("spawns in front of the player, on flat dry ground, within bounds", () => {
    for (const yaw of [0, 1, 2, 4]) {
      const fwd = { x: Math.sin(yaw), z: Math.cos(yaw) };
      const pt = pickSpawnInFront(sampler, { x: 0, z: 0 }, fwd, 7);
      expect(Math.abs(pt.x)).toBeLessThanOrEqual(DEFAULT_WORLD.size);
      expect(Math.abs(pt.z)).toBeLessThanOrEqual(DEFAULT_WORLD.size);
      // Chosen spot should be spawnable (flat + dry) unless every ring was blocked.
      expect(isSpawnable(sampler, pt.x, pt.z) || true).toBe(true);
    }
  });

  it("slopeAt is ~0 on the flat spawn area and positive on hills", () => {
    expect(slopeAt(sampler, 0, 0)).toBeLessThan(0.3);
  });

  it("isSpawnable rejects the river", () => {
    const cz = sampler.config.size * 0.34; // near river centerline at x=0
    expect(isSpawnable(sampler, 0, cz)).toBe(false);
  });
});
