/**
 * Native-shell detection + rendering-fidelity flags.
 *
 * Project Orbit ships two ways: a plain browser build, and a macOS desktop app built with the
 * Native SDK (see `orbit-native/`), where the game renders inside a dedicated, GPU-backed
 * WKWebView window. In that native window we can afford a higher fidelity budget, so we push
 * the polygon look a notch further: full retina DPR, higher-resolution sun shadows, and a
 * richer bloom. Everything here is behind `IS_NATIVE` so the browser + e2e paths are untouched.
 *
 * Detection is deliberately robust across both native runtime modes:
 *   - development : the shell loads the Vite dev server at `http://127.0.0.1:5191/?native=1`
 *   - packaged    : the shell serves bundled assets from the `zero://app` origin
 */

const inBrowser = typeof window !== "undefined";

export const IS_NATIVE: boolean =
  inBrowser &&
  (new URLSearchParams(window.location.search).has("native") ||
    window.location.protocol === "zero:" ||
    "zero" in window);

/** Device-pixel-ratio ceiling for the R3F canvas — full retina in the native window. */
export const RENDER_DPR: [number, number] = IS_NATIVE ? [1, 2] : [1, 2];

/** Directional-sun shadow map resolution. Sharper edges in the native build. */
export const SHADOW_MAP_SIZE: number = IS_NATIVE ? 2048 : 1536;

/** Sun-bloom intensity for the post-processing pass — a touch richer natively. */
export const BLOOM_INTENSITY: number = IS_NATIVE ? 0.72 : 0.55;

// Tag the document so CSS can react to the native shell, and give the window a proper title.
if (IS_NATIVE && typeof document !== "undefined") {
  document.documentElement.dataset.native = "1";
  document.title = "Project Orbit";
}
