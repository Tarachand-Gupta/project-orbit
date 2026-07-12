import React, { Suspense } from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
// Detect the Native SDK shell and bump rendering fidelity (side-effecting import).
import { IS_NATIVE } from "./config/native";

/**
 * Two routes, no router: "/" is the public landing page, "/play" is the game. The native
 * desktop shell always gets the game (it serves the bundle from its own origin root). The game
 * chunk (three.js + Rapier + R3F) is code-split so landing visitors don't download a physics
 * engine to read a webpage.
 */
const isGame = IS_NATIVE || window.location.pathname.startsWith("/play");

const Game = React.lazy(async () => {
  // window.game / test hooks exist only where the game runs (Tech Doc §5.1, §7).
  const [{ default: App }, { installGameApi }, { installTestHooks }] = await Promise.all([
    import("./App"),
    import("./api/gameApi"),
    import("./api/testHooks"),
  ]);
  installGameApi();
  installTestHooks();
  return { default: App };
});
const Landing = React.lazy(() => import("./site/Landing").then((m) => ({ default: m.Landing })));

// NOTE: StrictMode is intentionally NOT used. Its dev-only double-mounting makes
// @react-three/rapier create duplicate/stale physics bodies (a spawned vehicle's registered
// body could be the dead one, so setLinvel had no effect). Rendering once keeps physics correct.
ReactDOM.createRoot(document.getElementById("root")!).render(
  <Suspense fallback={null}>{isGame ? <Game /> : <Landing />}</Suspense>,
);
