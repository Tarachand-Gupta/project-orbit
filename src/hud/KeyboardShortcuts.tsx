import { useEffect } from "react";
import { useGameStore } from "@/state/store";
import { releaseMouseCapture } from "@/player/mouseCapture";

/**
 * Global HUD keyboard shortcuts — mnemonic and chosen NOT to collide with movement/action keys
 * (WASD move · Space jump · Shift run · E enter/exit · F fire · Z kick · X punch):
 *   C  → Create bar (also "/")            O → Objects menu
 *   T  → Time of day                       L → Log (errors / debug console)
 *   Esc → release the pointer + close any open panel
 * E is reserved for enter/exit vehicle, so the errors panel is "L = Log" (label matches key).
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
      // Never hijack browser/OS chords (e.g. ⌘C screenshot, ⌘L, Ctrl+R).
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key) {
        case "/":
        case "c":
        case "C":
          e.preventDefault();
          document.exitPointerLock?.();
          togglePrompt();
          break;
        case "o":
        case "O":
          e.preventDefault();
          toggleExplorer();
          break;
        case "t":
        case "T":
          e.preventDefault();
          toggleClock();
          break;
        case "l":
        case "L":
          e.preventDefault();
          toggleDebugWindow();
          break;
        case "Escape": {
          document.exitPointerLock?.();
          // With panels open, Esc just closes them (native capture resumes by itself). With
          // nothing open it releases the native mouse capture until the canvas is clicked.
          const s = useGameStore.getState();
          if (!s.promptOpen && !s.explorerOpen && !s.clockOpen && !s.debugWindowOpen && !s.welcomeOpen && s.selectedId === null) {
            releaseMouseCapture();
          }
          togglePrompt(false);
          toggleExplorer(false);
          toggleClock(false);
          toggleDebugWindow(false);
          s.toggleWelcome(false);
          s.selectObject(null); // close the object controls panel too
          break;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePrompt, toggleClock, toggleExplorer, toggleDebugWindow]);

  return null;
}
