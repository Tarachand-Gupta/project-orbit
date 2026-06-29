import { useDebugStore } from "@/state/debugStore";
import { useGameStore } from "@/state/store";

const LEVEL_COLOR: Record<string, string> = {
  error: "text-red-300",
  warn: "text-amber-300",
  info: "text-sky-300",
};

/**
 * Glass-morphic debug log window (PRD §4.7, Tech Doc §5.1). Shows error-boundary logs; the
 * same data is available to agents via window.game.getLogs().
 */
export function DebugWindow() {
  const open = useGameStore((s) => s.debugWindowOpen);
  const toggle = useGameStore((s) => s.toggleDebugWindow);
  const logs = useDebugStore((s) => s.logs);
  const clear = useDebugStore((s) => s.clear);

  if (!open) return null;

  return (
    <div
      className="glass glass-strong absolute top-20 right-6 w-[420px] max-h-[60vh] rounded-2xl flex flex-col overflow-hidden"
      data-testid="debug-window"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="font-semibold text-sm">Debug log <span className="text-white/50">({logs.length})</span></div>
        <div className="flex gap-2">
          <button onClick={() => clear()} className="glass-btn rounded-full px-3 py-1 text-xs text-white/70">
            Clear
          </button>
          <button
            onClick={() => toggle(false)}
            className="glass-btn rounded-full w-7 h-7 flex items-center justify-center text-white/70"
            aria-label="Close debug log"
          >
            ✕
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin px-3 py-2 space-y-2">
        {logs.length === 0 && <div className="text-sm text-white/50 px-1 py-4 text-center">No errors logged.</div>}
        {logs.map((log) => (
          <div key={log.id} className="text-xs bg-black/20 rounded-lg px-3 py-2" data-testid="debug-entry">
            <div className="flex items-center gap-2 mb-0.5">
              <span className={`font-semibold uppercase ${LEVEL_COLOR[log.level] ?? "text-white"}`}>{log.level}</span>
              <span className="text-white/50">{log.phase}</span>
              {log.objectId && <span className="text-white/40 font-mono truncate">{log.objectId}</span>}
            </div>
            <div className="text-white/85 break-words">{log.message}</div>
            {log.prompt && <div className="text-white/45 mt-0.5 italic">“{log.prompt}”</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
