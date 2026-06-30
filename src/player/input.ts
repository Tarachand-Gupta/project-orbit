/**
 * Keyboard/mouse input for the third-person controller. A single global input state is updated
 * by DOM listeners and polled each frame. The key→action mapping is a pure function so it can be
 * unit-tested.
 */

export interface InputState {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
  run: boolean;
  /** Edge-triggered "interact" (E) — true for one poll after a press. */
  interactPressed: boolean;
  /** Edge-triggered kick (Z) — shove a nearby object with force + lift. */
  kickPressed: boolean;
  /** Edge-triggered punch (X) — shove a nearby object forward. */
  punchPressed: boolean;
  /** Edge-triggered fire (F or left-click) — shoot the equipped weapon. */
  firePressed: boolean;
  /** Accumulated mouse dx since last poll (for camera yaw), in pixels. */
  mouseDX: number;
  /** Accumulated mouse dy since last poll (for camera pitch), in pixels. */
  mouseDY: number;
}

export type Action = "forward" | "back" | "left" | "right" | "jump" | "run" | "interact" | "kick" | "punch" | "fire" | null;

/** Map a KeyboardEvent.code/key to a movement action. Pure + tested. */
export function mapKey(code: string): Action {
  switch (code) {
    case "KeyZ":
      return "kick";
    case "KeyX":
      return "punch";
    case "KeyF":
      return "fire";
    case "KeyW":
    case "ArrowUp":
      return "forward";
    case "KeyS":
    case "ArrowDown":
      return "back";
    case "KeyA":
    case "ArrowLeft":
      return "left";
    case "KeyD":
    case "ArrowRight":
      return "right";
    case "Space":
      return "jump";
    case "ShiftLeft":
    case "ShiftRight":
      return "run";
    case "KeyE":
      return "interact";
    default:
      return null;
  }
}

const state: InputState = {
  forward: false,
  back: false,
  left: false,
  right: false,
  jump: false,
  run: false,
  interactPressed: false,
  kickPressed: false,
  punchPressed: false,
  firePressed: false,
  mouseDX: 0,
  mouseDY: 0,
};

let interactQueued = false;
let kickQueued = false;
let punchQueued = false;
let fireQueued = false;
let installed = false;

/** Set by the game when a weapon is equipped, so a locked-pointer left-click fires instead of nothing. */
let fireOnClick = false;
export function setFireOnClick(on: boolean): void {
  fireOnClick = on;
}

/** True when the user is typing in a text field — movement keys must be ignored then. */
function isTyping(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable === true;
}

function onKeyDown(e: KeyboardEvent) {
  if (isTyping()) return;
  const a = mapKey(e.code);
  if (!a) return;
  if (a === "interact") return void (interactQueued = true);
  if (a === "kick") return void (kickQueued = true);
  if (a === "punch") return void (punchQueued = true);
  if (a === "fire") return void (fireQueued = true);
  state[a] = true;
}

function onKeyUp(e: KeyboardEvent) {
  const a = mapKey(e.code);
  if (!a || a === "interact" || a === "kick" || a === "punch" || a === "fire") return;
  state[a] = false; // always clear on key-up (even if typing started mid-press)
}

function onMouseDown(e: MouseEvent) {
  // Left-click fires only when a weapon is equipped + pointer is locked (so it doesn't hijack the
  // click-to-lock or HUD clicks).
  if (e.button === 0 && fireOnClick && document.pointerLockElement) fireQueued = true;
}

function onMouseMove(e: MouseEvent) {
  // Only rotate when pointer is locked (immersive look) — avoids hijacking HUD clicks.
  if (document.pointerLockElement) {
    state.mouseDX += e.movementX;
    state.mouseDY += e.movementY;
  }
}

export function installInput(): () => void {
  if (installed || typeof window === "undefined") return () => {};
  installed = true;
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mousedown", onMouseDown);
  return () => {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mousedown", onMouseDown);
    installed = false;
  };
}

/**
 * Reset all input to neutral — clears held keys, queued edge events, and mouse deltas. Used by the
 * e2e harness between tests so synthetic key events from one test can't leak into the next.
 */
export function resetInput(): void {
  state.forward = state.back = state.left = state.right = false;
  state.jump = state.run = false;
  state.interactPressed = state.kickPressed = state.punchPressed = state.firePressed = false;
  state.mouseDX = state.mouseDY = 0;
  interactQueued = kickQueued = punchQueued = fireQueued = false;
}

/**
 * Read the continuous movement state WITHOUT consuming edge-triggered events (interact/kick/punch)
 * or the mouse deltas — so a self-driving vehicle can read throttle/steer while the Player keeps
 * ownership of exit/kick/look. Edge fields are reported false here.
 */
export function peekInput(): InputState {
  return { ...state, interactPressed: false, kickPressed: false, punchPressed: false, firePressed: false, mouseDX: 0, mouseDY: 0 };
}

/** Read the current input; clears edge-triggered/accumulated fields. */
export function pollInput(): InputState {
  const snapshot: InputState = {
    ...state,
    interactPressed: interactQueued,
    kickPressed: kickQueued,
    punchPressed: punchQueued,
    firePressed: fireQueued,
    mouseDX: state.mouseDX,
    mouseDY: state.mouseDY,
  };
  interactQueued = false;
  kickQueued = false;
  punchQueued = false;
  fireQueued = false;
  state.mouseDX = 0;
  state.mouseDY = 0;
  return snapshot;
}
