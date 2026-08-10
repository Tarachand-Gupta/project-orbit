import { Settings } from "lucide-react";
import { Tooltip } from "./Tooltip";
import { useGameStore, getObjectsArray } from "@/state/store";
import { PROVIDERS } from "@/objects/providers";
import { DEFAULT_WORLD } from "@/config/world";
import { saveWorld, clearWorld } from "@/persistence/db";

/**
 * Collapsible developer/scale settings (PRD §4.1, §4.2): tucked behind a gear icon so it
 * doesn't clutter the player view. Tunes glass frostness/transparency and the world scaling
 * factor (locked to a single value at deploy).
 */
export function DevPanel() {
  const open = useGameStore((s) => s.devPanelOpen);
  const toggle = useGameStore((s) => s.toggleDevPanel);
  const glass = useGameStore((s) => s.glass);
  const setGlass = useGameStore((s) => s.setGlass);
  const world = useGameStore((s) => s.world);
  const setWorld = useGameStore((s) => s.setWorld);
  const objectCount = useGameStore((s) => s.order.length);
  const reset = useGameStore((s) => s.reset);
  const provider = useGameStore((s) => s.provider);
  const setProvider = useGameStore((s) => s.setProvider);
  const solidObstacles = useGameStore((s) => s.solidObstacles);
  const setSolidObstacles = useGameStore((s) => s.setSolidObstacles);
  const realisticVehicles = useGameStore((s) => s.realisticVehicles);
  const setRealisticVehicles = useGameStore((s) => s.setRealisticVehicles);

  return (
    <div className="flex flex-col gap-2 items-start">
      <Tooltip label="Settings" side="bottom-start">
        <button
          onClick={() => toggle()}
          className="glass glass-btn rounded-full w-11 h-11 flex items-center justify-center"
          data-testid="dev-toggle"
          aria-label="Developer settings"
        >
          <Settings size={18} />
        </button>
      </Tooltip>

      {open && (
        <div className="glass glass-strong rounded-2xl p-4 w-[300px] space-y-4" data-testid="dev-panel">
          <div className="text-sm font-semibold">Developer settings</div>

          <Section title="Object generation">
            <div className="grid grid-cols-2 gap-1.5" data-testid="provider-select">
              {PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setProvider(p.id)}
                  className={`glass-btn rounded-lg px-2 py-1.5 text-xs ${
                    provider === p.id ? "glass-strong text-white" : "text-white/60"
                  }`}
                  data-testid={`provider-${p.id}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="text-[10px] text-white/40">
              Bring your own key — add it (and pick a model) in the ⚙ on the Create bar. Local needs no key.
            </div>
          </Section>

          <Section title="Glass (HUD)">
            <Range label="Frostness (blur)" value={glass.blur} min={0} max={40} step={1}
              onChange={(v) => setGlass({ blur: v })} suffix="px" />
            <Range label="Transparency" value={glass.opacity} min={0} max={0.6} step={0.01}
              onChange={(v) => setGlass({ opacity: v })} />
          </Section>

          <Section title="Physics & collision">
            <label className="flex items-center justify-between text-xs cursor-pointer">
              <span className="text-white/80">Solid trees & rocks</span>
              <input
                type="checkbox"
                checked={solidObstacles}
                onChange={(e) => setSolidObstacles(e.target.checked)}
                data-testid="solid-obstacles"
                className="w-4 h-4 accent-sky-400"
              />
            </label>
            <div className="text-[10px] text-white/40 mb-2">Turn off to walk/drive through trees and rocks (houses stay solid).</div>
            <label className="flex items-center justify-between text-xs cursor-pointer">
              <span className="text-white/80">Realistic vehicle physics</span>
              <input
                type="checkbox"
                checked={realisticVehicles}
                onChange={(e) => setRealisticVehicles(e.target.checked)}
                data-testid="realistic-vehicles"
                className="w-4 h-4 accent-sky-400"
              />
            </label>
            <div className="text-[10px] text-white/40">Real suspension, momentum, collisions & jumps for cars/bikes. Off = stable terrain-glued vehicles.</div>
          </Section>

          <Section title="World & terrain">
            <Range label="Hill height" value={world.hillAmplitude} min={0} max={30} step={0.5}
              onChange={(v) => setWorld({ hillAmplitude: v })} />
            <Range label="Hill density" value={world.noiseScale} min={0.3} max={2.5} step={0.05}
              onChange={(v) => setWorld({ noiseScale: v })} />
            <Range label="River width" value={world.riverWidth} min={2} max={16} step={0.5}
              onChange={(v) => setWorld({ riverWidth: v })} />
            <div className="flex gap-2">
              <button className="glass-btn glass-strong rounded-lg px-3 py-1.5 text-xs flex-1"
                onClick={() => setWorld({ seed: (world.seed * 7 + 13) % 100000 })}>
                New terrain
              </button>
              <button className="glass-btn rounded-lg px-3 py-1.5 text-xs flex-1"
                onClick={() => setWorld({ ...DEFAULT_WORLD })}>
                Reset
              </button>
            </div>
          </Section>

          <Section title="World">
            <div className="text-xs text-white/60">Objects: {objectCount}</div>
            <div className="flex gap-2 flex-wrap">
              <button className="glass-btn glass-strong rounded-lg px-3 py-1.5 text-xs"
                onClick={() => void saveWorld(getObjectsArray())} data-testid="dev-save">
                Save
              </button>
              <button className="glass-btn rounded-lg px-3 py-1.5 text-xs text-red-200"
                onClick={() => { reset(); void clearWorld(); }} data-testid="dev-clear">
                Clear world
              </button>
            </div>
          </Section>

          <div className="text-[10px] text-white/35 leading-relaxed">
            Settings are dev-only and would be frozen + hidden at deploy. Agents & power-users can
            also drive the game via <span className="font-mono">window.game</span>.
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-xs uppercase tracking-wide text-white/45">{title}</div>
      {children}
    </div>
  );
}

function Range({
  label, value, min, max, step, onChange, suffix,
}: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; suffix?: string;
}) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-white/80">{label}</span>
        <span className="font-mono text-white/60">{Math.round(value * 100) / 100}{suffix ?? ""}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))} className="w-full" />
    </div>
  );
}
