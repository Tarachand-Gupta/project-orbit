/**
 * Day/night clock. The world's time of day follows the **player's own local timezone** (from the
 * browser), so the lighting matches where they actually are rather than a fixed GMT/ET anchor.
 * The player can override the time of day; that override is persisted in localStorage and
 * restored on load. A server time-offset can still be injected later via `setServerOffset`.
 */

let serverOffsetMs = 0;

/** Inject an NTP-style offset (serverNow - clientNow). Wires up to a time endpoint later. */
export function setServerOffset(ms: number): void {
  serverOffsetMs = ms;
}

const OVERRIDE_KEY = "orbit.timeOverride";

function loadOverride(): number | null {
  try {
    const raw = localStorage.getItem(OVERRIDE_KEY);
    if (raw === null || raw === "") return null;
    const v = Number(raw);
    return Number.isFinite(v) ? ((v % 1) + 1) % 1 : null;
  } catch {
    return null;
  }
}

/** Optional override of the time-of-day as a 0..1 fraction (null = follow the real local clock). */
let timeOverride: number | null = typeof window !== "undefined" ? loadOverride() : null;

export function setTimeOverride(fraction: number | null): void {
  timeOverride = fraction === null ? null : ((fraction % 1) + 1) % 1;
  try {
    if (timeOverride === null) localStorage.removeItem(OVERRIDE_KEY);
    else localStorage.setItem(OVERRIDE_KEY, String(timeOverride));
  } catch {
    /* localStorage unavailable — keep the in-memory value */
  }
}
export function getTimeOverride(): number | null {
  return timeOverride;
}

/** The player's local IANA timezone (e.g. "Asia/Kolkata"), or "UTC" if unavailable. */
export function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** A short label for the HUD derived from the local timezone, e.g. "Kolkata" or "GMT+5:30". */
export function timeZoneLabel(now: number = Date.now()): string {
  const tz = localTimeZone();
  const city = tz.includes("/") ? tz.split("/").pop()!.replace(/_/g, " ") : tz;
  if (city && city !== "UTC") return city;
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZoneName: "short" }).formatToParts(new Date(now));
    return parts.find((p) => p.type === "timeZoneName")?.value ?? "Local";
  } catch {
    return "Local";
  }
}

/** Current world time in ms since epoch, corrected by any server offset. */
export function worldNow(now: number = Date.now()): number {
  return now + serverOffsetMs;
}

/**
 * Fraction of the day (0..1) in the world timezone, where 0 = midnight, 0.5 = noon.
 * Computed from the timezone's wall-clock hours/minutes/seconds so DST is handled by Intl.
 */
export function dayFraction(now: number = worldNow()): number {
  if (timeOverride !== null) return timeOverride;
  const { h, m, s } = wallClock(now);
  return (h * 3600 + m * 60 + s) / 86400;
}

interface WallClock {
  h: number;
  m: number;
  s: number;
}

// No fixed timeZone → formats in the device's local timezone (the player's locality).
const fmt = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

export function wallClock(now: number = worldNow()): WallClock {
  // Intl gives hour "24" at midnight in some engines; normalize to 0.
  const parts = fmt.formatToParts(new Date(now));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  let h = get("hour");
  if (h === 24) h = 0;
  return { h, m: get("minute"), s: get("second") };
}

export interface SunState {
  /** Sun elevation angle in radians: +PI/2 at zenith (noon), -PI/2 at nadir (midnight). */
  elevation: number;
  /** Normalized sun direction vector (points from world toward the sun). */
  direction: [number, number, number];
  /** 0..1 daylight strength — 1 at noon, 0 below the horizon. */
  daylight: number;
  /** True when the sun is below the horizon. */
  isNight: boolean;
  /** Fraction of day 0..1. */
  fraction: number;
}

/**
 * Compute the sun's position and daylight strength for a given day-fraction.
 * Sunrise ~6:00 (fraction 0.25), noon (0.5), sunset ~18:00 (0.75).
 */
export function sunStateFromFraction(fraction: number): SunState {
  // Map fraction so that 0.25 -> horizon rising, 0.5 -> zenith, 0.75 -> horizon setting.
  const angle = (fraction - 0.25) * Math.PI * 2; // 0 at sunrise
  const elevation = Math.sin(angle); // -1..1, peak at noon
  // Sun travels across the sky: x from east(+) to west(-), y is elevation, slight z tilt.
  // At noon (angle = PI/2): cos = 0 so the sun is directly overhead.
  const direction: [number, number, number] = [
    Math.cos(angle),
    elevation,
    0.25,
  ];
  // normalize
  const len = Math.hypot(...direction) || 1;
  const dir: [number, number, number] = [direction[0] / len, direction[1] / len, direction[2] / len];
  const daylight = Math.max(0, elevation);
  return {
    elevation: elevation * (Math.PI / 2),
    direction: dir,
    daylight,
    isNight: elevation <= 0,
    fraction,
  };
}

export function sunState(now: number = worldNow()): SunState {
  return sunStateFromFraction(dayFraction(now));
}

/** Format the world clock as HH:MM for the HUD (honours the dev time override). */
export function formatWorldTime(now: number = worldNow()): string {
  if (timeOverride !== null) {
    const total = Math.round(timeOverride * 1440);
    const h = Math.floor(total / 60) % 24;
    const m = total % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  const { h, m } = wallClock(now);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
