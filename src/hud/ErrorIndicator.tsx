import { AlertTriangle } from "lucide-react";
import { Tooltip } from "./Tooltip";
import { useDebugStore } from "@/state/debugStore";
import { useGameStore } from "@/state/store";

/**
 * Top-right error indicator (PRD §4.7). Badges the unseen error count; clicking opens the
 * debug log window. Only shows when there is at least one log entry.
 */
export function ErrorIndicator() {
  const unseen = useDebugStore((s) => s.unseen);
  const total = useDebugStore((s) => s.logs.length);
  const markAllSeen = useDebugStore((s) => s.markAllSeen);
  const toggleDebugWindow = useGameStore((s) => s.toggleDebugWindow);
  const open = useGameStore((s) => s.debugWindowOpen);

  if (total === 0) return null;

  return (
    <Tooltip label="Log (L)" side="bottom-end">
      <button
        onClick={() => {
          toggleDebugWindow();
          markAllSeen();
        }}
        className={`glass glass-btn rounded-full w-11 h-11 flex items-center justify-center relative ${
          unseen > 0 ? "error-pulse" : ""
        }`}
        data-testid="error-indicator"
        aria-label={`${unseen} unseen errors`}
      >
        <AlertTriangle size={17} className="text-amber-300" />
        {unseen > 0 && (
          <span
            className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center"
            data-testid="error-badge"
          >
            {unseen > 99 ? "99+" : unseen}
          </span>
        )}
        {open && <span className="sr-only">open</span>}
      </button>
    </Tooltip>
  );
}
