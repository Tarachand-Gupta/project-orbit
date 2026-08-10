import { useEffect, useState } from "react";

/**
 * A small, unobtrusive hint shown ONLY while mouse-look capture is engaged — native
 * pointer-capture (the shell hides the OS cursor, flagged by `data-mouse-capture` on <html>,
 * see mouseCapture.ts) or real browser pointer lock — telling the player that Esc frees the
 * cursor. Hidden the rest of the time so it never clutters the view.
 */
export function MouseCaptureHint() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const compute = () => setActive(root.hasAttribute("data-mouse-capture") || document.pointerLockElement != null);
    compute();
    const obs = new MutationObserver(compute);
    obs.observe(root, { attributes: true, attributeFilter: ["data-mouse-capture"] });
    document.addEventListener("pointerlockchange", compute);
    return () => {
      obs.disconnect();
      document.removeEventListener("pointerlockchange", compute);
    };
  }, []);

  if (!active) return null;

  return (
    <div
      className="absolute top-[4.75rem] left-1/2 -translate-x-1/2 glass rounded-full px-3 py-1 flex items-center gap-1.5 text-[11px] text-white/85"
      role="status"
      data-testid="capture-hint"
    >
      Press
      <kbd className="inline-flex items-center justify-center h-4 px-1 rounded bg-white/20 border border-white/25 text-[10px] font-semibold">
        Esc
      </kbd>
      for cursor
    </div>
  );
}
