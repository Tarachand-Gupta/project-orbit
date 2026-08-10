import type { ReactNode } from "react";

type Side = "bottom" | "bottom-start" | "bottom-end" | "top" | "left" | "right";

const POS: Record<Side, string> = {
  bottom: "top-full mt-2 left-1/2 -translate-x-1/2",
  "bottom-start": "top-full mt-2 left-0",
  "bottom-end": "top-full mt-2 right-0",
  top: "bottom-full mb-2 left-1/2 -translate-x-1/2",
  left: "right-full mr-2 top-1/2 -translate-y-1/2",
  right: "left-full ml-2 top-1/2 -translate-y-1/2",
};

/**
 * Small frosted label pill that floats over an icon-only HUD control on hover/focus, so every
 * button is self-describing (accessibility) without a permanent text label. Wrap a single trigger;
 * `side` is chosen per corner to keep the pill on-screen. Purely CSS-driven (group-hover /
 * group-focus-within) — no state, no timers.
 */
export function Tooltip({ label, side = "bottom", children }: { label: string; side?: Side; children: ReactNode }) {
  return (
    <div className="relative group inline-flex">
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute z-50 whitespace-nowrap glass rounded-full px-2.5 py-1 text-[11px] font-medium text-white opacity-0 scale-95 transition duration-150 ease-out group-hover:opacity-100 group-hover:scale-100 group-focus-within:opacity-100 group-focus-within:scale-100 ${POS[side]}`}
      >
        {label}
      </span>
    </div>
  );
}
