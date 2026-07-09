import { useState } from "react";
import { X } from "lucide-react";
import { IS_NATIVE } from "@/config/native";

/** Small dismissible controls legend (bottom-left) so players know how to move. */
export function ControlsHint() {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  const mouseHint = IS_NATIVE
    ? "move to look around" // native capture: hover-look, no click needed
    : "drag (or click to lock) to look around";
  return (
    <div className="absolute bottom-6 left-6 glass rounded-xl px-3 py-2 text-xs text-white/80 max-w-[220px]" data-testid="controls-hint">
      <div className="flex items-center justify-between mb-1">
        <span className="font-semibold">Controls</span>
        <button onClick={() => setOpen(false)} className="text-white/50 hover:text-white" aria-label="Hide controls"><X size={13} /></button>
      </div>
      <div className="space-y-0.5 text-white/70">
        <div><b>WASD</b> / arrows — walk · <b>Shift</b> run · <b>Space</b> jump · <b>Shift+Space</b> super-jump</div>
        <div><b>Mouse</b> — {mouseHint} · <b>Esc</b> free cursor</div>
        <div><Key>E</Key> enter / exit · <Key>F</Key> fire · <Key>Z</Key> kick · <Key>X</Key> punch</div>
        <div><Key>C</Key> create · <Key>O</Key> objects · <Key>T</Key> time · <Key>L</Key> log · <Key>⌘C</Key> shot</div>
      </div>
    </div>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded bg-white/20 border border-white/25 text-[10px] font-semibold">
      {children}
    </kbd>
  );
}
