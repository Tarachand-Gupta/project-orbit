import { useGameStore } from "@/state/store";
import { interactionFor } from "@/objects/spec";

/**
 * Object Explorer (PRD: see all spawned objects). A toggleable panel listing every created object
 * with controls to select, hide/unload (keeps it in the registry but stops rendering/simulating),
 * show it again, or remove it entirely.
 */
export function ObjectExplorer() {
  const open = useGameStore((s) => s.explorerOpen);
  const toggle = useGameStore((s) => s.toggleExplorer);
  const objects = useGameStore((s) => s.objects);
  const order = useGameStore((s) => s.order);
  const selectedId = useGameStore((s) => s.selectedId);
  const selectObject = useGameStore((s) => s.selectObject);
  const setHidden = useGameStore((s) => s.setHidden);
  const removeObject = useGameStore((s) => s.removeObject);

  const items = order.map((id) => objects[id]).filter(Boolean);
  const visibleCount = items.filter((o) => !o.hidden).length;

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        onClick={() => toggle()}
        className="glass glass-btn rounded-full w-11 h-11 flex items-center justify-center relative"
        data-testid="explorer-toggle"
        aria-label="Object explorer"
        title="Object explorer"
      >
        <span className="text-lg">🗂️</span>
        {items.length > 0 && (
          <span className="absolute -top-1 -right-1 bg-sky-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center">
            {items.length}
          </span>
        )}
      </button>

      {open && (
        <div className="glass glass-strong rounded-2xl w-[300px] max-h-[60vh] flex flex-col overflow-hidden" data-testid="explorer-panel">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <div className="text-sm font-semibold">
              Objects <span className="text-white/50">({visibleCount}/{items.length})</span>
            </div>
            <button onClick={() => toggle(false)} className="glass-btn rounded-full w-7 h-7 flex items-center justify-center text-white/70" aria-label="Close explorer">✕</button>
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-thin p-2 space-y-1">
            {items.length === 0 && <div className="text-sm text-white/50 text-center py-6">Nothing created yet. Use ✦ to create something.</div>}
            {items.map((o) => {
              const can = interactionFor(o.spec).mode !== "none";
              return (
                <div
                  key={o.spec.id}
                  className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 ${selectedId === o.spec.id ? "bg-white/15" : "hover:bg-white/8"} ${o.hidden ? "opacity-50" : ""}`}
                  data-testid="explorer-item"
                >
                  <button className="flex-1 text-left min-w-0" onClick={() => { selectObject(o.spec.id); }} title="Select / open controls">
                    <div className="text-sm truncate flex items-center gap-1">
                      {can && <span title="drivable/flyable">🎮</span>}
                      <span className="truncate">{o.spec.label}</span>
                    </div>
                    <div className="text-[10px] text-white/45 capitalize">{o.spec.type}{o.hidden ? " · hidden" : ""}</div>
                  </button>
                  <button
                    onClick={() => setHidden(o.spec.id, !o.hidden)}
                    className="glass-btn rounded-md w-7 h-7 flex items-center justify-center text-sm"
                    data-testid="explorer-hide"
                    title={o.hidden ? "Load / show" : "Unload / hide"}
                  >
                    {o.hidden ? "🚫" : "👁️"}
                  </button>
                  <button
                    onClick={() => removeObject(o.spec.id)}
                    className="glass-btn rounded-md w-7 h-7 flex items-center justify-center text-sm text-red-200"
                    data-testid="explorer-remove"
                    title="Remove"
                  >
                    🗑️
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
