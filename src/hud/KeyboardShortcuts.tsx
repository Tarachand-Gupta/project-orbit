import { useEffect } from "react";
import { useGameStore } from "@/state/store";

/**
 * Global HUD keyboard shortcuts (uses keys not bound to movement):
 *   /  → toggle the create bar (and release the mouse pointer)
 *   T  → toggle the time-of-day control
 *   Y  → toggle the object explorer (top-right)
 *   G  → toggle the debug log
 *   Esc → release the mouse pointer + close any open panel
 * Movement keys (WASD, Space, Shift, E) are handled by the player input system.
 */
export function KeyboardShortcuts() {
  const { togglePrompt, toggleClock, toggleExplorer, toggleDebugWindow } = useGameStore.getState();

  useEffect(() => {
    const isTyping = () => {
      const el = document.activeElement as HTMLElement | null;
      return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
    };

    const onKey = (e: KeyboardEvent) => {
      // While typing in the prompt, only Esc and "/" (handled in the input itself) apply.
      if (isTyping()) return;

      switch (e.key) {
        case "/":
          e.preventDefault();
          document.exitPointerLock?.();
          togglePrompt();
          break;
        case "t":
        case "T":
          e.preventDefault();
          toggleClock();
          break;
        case "y":
        case "Y":
          e.preventDefault();
          toggleExplorer();
          break;
        case "g":
        case "G":
          e.preventDefault();
          toggleDebugWindow();
          break;
        case "Escape":
          document.exitPointerLock?.();
          togglePrompt(false);
          toggleExplorer(false);
          toggleClock(false);
          toggleDebugWindow(false);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePrompt, toggleClock, toggleExplorer, toggleDebugWindow]);

  return null;
}
