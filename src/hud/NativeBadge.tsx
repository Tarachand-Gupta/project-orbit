import { Laptop } from "lucide-react";
import { IS_NATIVE } from "@/config/native";

/**
 * Tiny glass pill shown ONLY inside the native macOS shell (top-left, next to the FPS chip).
 * Its purpose is verification: a screenshot of the app that shows this badge proves the
 * `IS_NATIVE` rendering path (retina DPR, 2048 shadows, richer bloom) is active — packaged
 * builds load from zero://app where DOM/JS state is otherwise hard to inspect.
 */
export function NativeBadge() {
  if (!IS_NATIVE) return null;
  return (
    <div
      className="glass rounded-full h-11 px-3 flex items-center gap-2"
      data-testid="native-badge"
      title="Running in the native macOS shell — high-fidelity rendering active"
    >
      <Laptop size={14} className="text-sky-300" />
      <span className="text-[11px] uppercase tracking-wide text-white/70">native</span>
    </div>
  );
}
