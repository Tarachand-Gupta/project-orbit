/**
 * Tiny transient effects channel for weapon fire — a module-level ring of short-lived "tracer"
 * segments (muzzle → impact) that the WeaponFX component renders and fades. Kept outside React so
 * firing never triggers re-renders.
 */

export interface Tracer {
  from: [number, number, number];
  to: [number, number, number];
  /** Remaining life in seconds. */
  ttl: number;
  /** Original life (for fade). */
  max: number;
}

const tracers: Tracer[] = [];
const LIFE = 0.07;

export function emitTracer(from: [number, number, number], to: [number, number, number]): void {
  tracers.push({ from, to, ttl: LIFE, max: LIFE });
  if (tracers.length > 32) tracers.shift();
}

/** Advance lifetimes, drop dead tracers, return the live list. */
export function stepTracers(dt: number): Tracer[] {
  for (const t of tracers) t.ttl -= dt;
  for (let i = tracers.length - 1; i >= 0; i--) if (tracers[i].ttl <= 0) tracers.splice(i, 1);
  return tracers;
}

export function clearTracers(): void {
  tracers.length = 0;
}
