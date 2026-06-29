import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { installGameApi } from "./api/gameApi";
import { installTestHooks } from "./api/testHooks";

// Expose the typed game API on window for users & agents (Tech Doc §5.1, §7).
installGameApi();
installTestHooks();

// NOTE: StrictMode is intentionally NOT used. Its dev-only double-mounting makes
// @react-three/rapier create duplicate/stale physics bodies (a spawned vehicle's registered
// body could be the dead one, so setLinvel had no effect). Rendering once keeps physics correct.
ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
void React;
