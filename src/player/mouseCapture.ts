/**
 * Native pointer capture — pointer-lock emulation for the desktop (WKWebView) shell.
 *
 * WKWebView never grants the Pointer Lock API, so in the native app the camera is driven by
 * plain hover mousemove deltas: no button held, exactly like a locked pointer in the browser.
 * Two things real pointer lock provides are recreated here:
 *   1. the cursor never stalls at the window edge — when it strays outside the central deadzone
 *      the shell warps it back to window center (`orbit.warpMouse` over the SDK's JS bridge →
 *      CGWarpMouseCursorPosition, the classic FPS-game capture);
 *   2. the cursor is hidden while captured (CSS `[data-mouse-capture]`, see index.css).
 *
 * Capture suspends automatically while any HUD panel is open, an object is selected, or a text
 * input is focused (those need the real cursor), and resumes when they close. Esc releases it
 * until the next click on the 3D canvas. Browsers never take this path — `installMouseCapture`
 * is a no-op outside the native shell, where real pointer lock keeps working.
 */

import { IS_NATIVE } from "@/config/native";
import { useGameStore } from "@/state/store";
import { logError } from "@/state/debugStore";

/** Fraction of the viewport (from center, per axis) the cursor may roam before recentering. */
export const CAPTURE_DEADZONE = 0.3;
/** A single-event movement above this many px is a warp artifact, not hand motion — drop it. */
export const CAPTURE_SPIKE_PX = 200;

/** Pure: does a cursor at (clientX, clientY) in a w×h viewport need recentering? Tested. */
export function needsRecenter(clientX: number, clientY: number, w: number, h: number): boolean {
  return Math.abs(clientX - w / 2) > w * CAPTURE_DEADZONE || Math.abs(clientY - h / 2) > h * CAPTURE_DEADZONE;
}

/** Pure: should this event's movement delta be ignored as a warp artifact? Tested. */
export function isWarpSpike(movementX: number, movementY: number): boolean {
  return Math.abs(movementX) > CAPTURE_SPIKE_PX || Math.abs(movementY) > CAPTURE_SPIKE_PX;
}

interface ZeroBridge {
  invoke: (command: string, payload?: unknown) => Promise<unknown>;
}

function zeroBridge(): ZeroBridge | null {
  const zero = (window as { zero?: Partial<ZeroBridge> }).zero;
  return typeof zero?.invoke === "function" ? (zero as ZeroBridge) : null;
}

let installed = false;
let available = false; // optimistic while window.zero exists; cleared if the shell rejects the warp command
let captured = false;
let suspended = false; // a HUD panel / selection / text input needs the real cursor
let userReleased = false; // Esc — stay released until the canvas is clicked again
let warpInFlight = false;

function refresh(): void {
  const on = available && !suspended && !userReleased;
  if (on === captured) return;
  captured = on;
  if (captured) document.documentElement.dataset.mouseCapture = "1";
  else delete document.documentElement.dataset.mouseCapture;
}

function needsRealCursor(s: ReturnType<typeof useGameStore.getState>): boolean {
  return (
    s.promptOpen || s.explorerOpen || s.clockOpen || s.debugWindowOpen || s.devPanelOpen || s.welcomeOpen || s.selectedId !== null
  );
}

function isTyping(): boolean {
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable === true);
}

/** Activate hover mouse-look in the native shell. No-op in browsers (they use real pointer lock). */
export function installMouseCapture(): void {
  if (installed || !IS_NATIVE || typeof window === "undefined") return;
  if (!zeroBridge()) return; // not running inside the shell (e.g. ?native=1 in a plain browser tab)
  installed = true;
  available = true;
  const reevaluate = () => {
    suspended = needsRealCursor(useGameStore.getState()) || isTyping();
    refresh();
  };
  // The delayed second pass matters: when a panel closes, its focused input is often still
  // document.activeElement at the moment the store updates — and WebKit fires no focusout when
  // a focused element is simply removed from the DOM. Recheck after focus has settled.
  const reevaluateSoon = () => {
    reevaluate();
    setTimeout(reevaluate, 80);
  };
  useGameStore.subscribe(reevaluateSoon);
  // Text inputs outside the store's panels (e.g. provider key field) also free the cursor.
  window.addEventListener("focusin", reevaluate);
  window.addEventListener("focusout", reevaluateSoon);
  reevaluate();
}

export function isMouseCaptured(): boolean {
  return captured;
}

/** Re-engage after Esc (wired to clicks on the 3D canvas). */
export function acquireMouseCapture(): void {
  if (!installed) return;
  userReleased = false;
  refresh();
}

/** Esc — free the cursor until the canvas is clicked again. */
export function releaseMouseCapture(): void {
  if (!installed) return;
  userReleased = true;
  refresh();
}

/**
 * Feed one mousemove. Returns true when its movement deltas should rotate the camera; also
 * recenters the OS cursor through the shell when it drifts from the middle of the window.
 */
export function captureMouseMove(e: MouseEvent): boolean {
  if (!captured) return false;
  maybeRecenter(e);
  return !isWarpSpike(e.movementX, e.movementY);
}

function maybeRecenter(e: MouseEvent): void {
  if (warpInFlight || !document.hasFocus()) return;
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (!needsRecenter(e.clientX, e.clientY, w, h)) return;
  const zero = zeroBridge();
  if (!zero) return;
  warpInFlight = true;
  // No coordinates: the shell computes its own window center natively. MouseEvent.screenX is
  // NOT trustworthy inside WebKit views (headless WebKit reported -9360,-9680 — the shell would
  // "successfully" warp far off-screen and the cursor would never visibly move).
  zero.invoke("orbit.warpMouse", {}).then(
    () => {
      warpInFlight = false;
    },
    (err: unknown) => {
      // Older shell without the command — degrade to drag-look instead of hiding the cursor.
      warpInFlight = false;
      available = false;
      refresh();
      logError({
        phase: "runtime",
        level: "warn",
        message: `mouse capture unavailable (orbit.warpMouse rejected: ${err instanceof Error ? err.message : String(err)}) — falling back to drag-look`,
      });
    },
  );
}
