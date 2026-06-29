import { useEffect } from "react";
import { Scene } from "./scene/Scene";
import { Hud } from "./hud/Hud";
import { useGameStore } from "./state/store";
import { getObjectsArray } from "./state/store";
import { saveWorld, loadWorld } from "./persistence/db";
import { installInput } from "./player/input";

/**
 * Root: the WebGL Scene with the glass-morphism HUD layered above it. Loads any persisted
 * world on mount and autosaves periodically (per-user persistence, PRD §4.4).
 */
export default function App() {
  const glass = useGameStore((s) => s.glass);
  const hydrate = useGameStore((s) => s.hydrate);

  // Install keyboard/mouse input immediately on app load — before the WebGL/physics scene
  // finishes loading — so early key presses are never missed.
  useEffect(() => installInput(), []);

  // Sync glass design tokens → CSS variables (dev-tunable frostness/transparency, Tech Doc §8).
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--glass-blur", `${glass.blur}px`);
    root.style.setProperty("--glass-opacity", `${glass.opacity}`);
  }, [glass.blur, glass.opacity]);

  // Load persisted world once on mount.
  useEffect(() => {
    let cancelled = false;
    loadWorld().then((objs) => {
      if (!cancelled && objs.length) hydrate(objs);
    });
    return () => {
      cancelled = true;
    };
  }, [hydrate]);

  // Autosave the world every 15s and on unload.
  useEffect(() => {
    const interval = setInterval(() => void saveWorld(getObjectsArray()), 15_000);
    const onUnload = () => void saveWorld(getObjectsArray());
    window.addEventListener("beforeunload", onUnload);
    return () => {
      clearInterval(interval);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, []);

  return (
    <>
      <Scene />
      <Hud />
    </>
  );
}
