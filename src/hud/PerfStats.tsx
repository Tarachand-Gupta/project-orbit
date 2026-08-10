import { Activity } from "lucide-react";
import { Tooltip } from "./Tooltip";
import { usePerfStore } from "@/state/perfStore";

/**
 * Resource-usage monitor (top-left, next to the dev gear). A compact FPS chip that expands to a
 * full breakdown of the current tab's render cost — main-thread frame time, draw calls,
 * triangles, GPU resources (geometries/textures/shader programs) and JS heap usage — so the game
 * can be profiled and optimized. (Physics runs on the main thread via Rapier-WASM; there is no
 * separate worker thread in this build.)
 */
export function PerfStats() {
  const s = usePerfStore();
  const fps = Math.round(s.fps);
  const fpsColor = fps >= 50 ? "text-green-300" : fps >= 30 ? "text-amber-300" : "text-red-300";

  return (
    <div className="flex flex-col items-start gap-2">
      <Tooltip label="Resource usage" side="bottom-start">
        <button
          onClick={() => s.toggle()}
          className="glass glass-btn rounded-full h-11 px-3 flex items-center gap-2"
          data-testid="perf-toggle"
        >
          {/* Health shows on the icon; the number stays white so it's legible over a bright sky. */}
          <Activity size={14} className={fpsColor} />
          <span className="font-mono text-sm tabular-nums text-white" data-testid="perf-fps">{fps}</span>
          <span className="text-[10px] text-white/50">fps</span>
        </button>
      </Tooltip>

      {s.open && (
        <div className="glass glass-strong rounded-2xl p-3 w-[230px] text-xs font-mono" data-testid="perf-panel">
          <div className="text-[11px] uppercase tracking-wide text-white/45 mb-2 font-sans">Resource usage</div>
          <Row label="FPS" value={`${fps}`} accent={fpsColor} />
          <Row label="Frame (main)" value={`${s.ms.toFixed(1)} ms`} />
          <Row label="Draw calls" value={`${s.calls}`} />
          <Row label="Triangles" value={fmt(s.triangles)} />
          <Row label="Geometries" value={`${s.geometries}`} />
          <Row label="Textures" value={`${s.textures}`} />
          <Row label="Shader programs" value={`${s.programs}`} />
          {s.heapMB !== null ? (
            <Row label="JS heap" value={`${Math.round(s.heapMB)} / ${Math.round(s.heapLimitMB ?? 0)} MB`} />
          ) : (
            <Row label="JS heap" value="n/a" />
          )}
          <div className="text-[10px] text-white/35 mt-2 font-sans leading-snug">
            Physics + render are on the main thread (Rapier-WASM). No worker thread in this build.
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-white/55 font-sans">{label}</span>
      <span className={accent ?? "text-white/90"}>{value}</span>
    </div>
  );
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${n}`;
}
