import { useEffect, useRef, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { formatWorldTime, sunState, setTimeOverride, getTimeOverride, timeZoneLabel } from "@/time/clock";
import { useGameStore } from "@/state/store";

/**
 * Globally-synced world clock (top-center) with an interactive time control. Hover (or tap) the
 * pill to expand an hour stepper/slider — pick any hour 0–23 to set the time of day, or "Auto"
 * to follow real US-Eastern time (PRD §4.3).
 */
export function Clock() {
  const [time, setTime] = useState(() => formatWorldTime());
  const [night, setNight] = useState(() => sunState().isNight);
  const open = useGameStore((s) => s.clockOpen);
  const toggleClock = useGameStore((s) => s.toggleClock);
  const setOpen = (v: boolean) => toggleClock(v);
  const [override, setOverrideState] = useState<number | null>(() => getTimeOverride());
  const closeTimer = useRef<number | null>(null);

  useEffect(() => {
    const id = setInterval(() => {
      setTime(formatWorldTime());
      setNight(sunState().isNight);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Current hour shown in the stepper: override hour, else the live wall-clock hour.
  const hour = override !== null ? Math.round(override * 24) % 24 : Number(time.slice(0, 2));

  const setHour = (h: number) => {
    const hh = ((h % 24) + 24) % 24;
    const frac = hh / 24;
    setTimeOverride(frac);
    setOverrideState(frac);
    setTime(formatWorldTime());
    setNight(sunState().isNight);
  };
  const setAuto = () => {
    setTimeOverride(null);
    setOverrideState(null);
    setTime(formatWorldTime());
  };

  const openNow = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const closeSoon = () => {
    closeTimer.current = window.setTimeout(() => setOpen(false), 250);
  };

  return (
    <div className="relative flex flex-col items-center" onMouseEnter={openNow} onMouseLeave={closeSoon}>
      <button
        className="glass rounded-full px-4 py-1.5 flex items-center gap-2 text-sm font-medium glass-btn"
        data-testid="world-clock"
        onClick={() => toggleClock()}
        title="Click or hover (or press T) to change the time of day"
      >
        {night ? <Moon size={15} className="text-sky-200" /> : <Sun size={15} className="text-amber-300" />}
        <span className="font-mono tabular-nums">{time}</span>
        <span className={`text-xs ${override !== null ? "text-sky-300" : "text-white/50"}`} title={timeZoneLabel()}>
          {override !== null ? "SET" : timeZoneLabel()}
        </span>
      </button>

      {open && (
        <div className="glass glass-strong rounded-2xl mt-2 p-3 w-[260px]" data-testid="time-control">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs uppercase tracking-wide text-white/55">Time of day</span>
            <button
              onClick={setAuto}
              className={`glass-btn rounded-full px-2.5 py-0.5 text-[11px] ${override === null ? "glass-strong text-white" : "text-white/60"}`}
              data-testid="time-auto"
            >
              Auto (real)
            </button>
          </div>

          <div className="flex items-center gap-2 mb-2">
            <button onClick={() => setHour(hour - 1)} className="glass-btn glass-strong rounded-md w-7 h-7 text-sm" data-testid="time-dec">–</button>
            <div className="flex-1 text-center font-mono text-lg tabular-nums" data-testid="time-hour">
              {String(hour).padStart(2, "0")}:00
            </div>
            <button onClick={() => setHour(hour + 1)} className="glass-btn glass-strong rounded-md w-7 h-7 text-sm" data-testid="time-inc">+</button>
          </div>

          <input
            type="range"
            min={0}
            max={23}
            step={1}
            value={hour}
            onChange={(e) => setHour(Number(e.target.value))}
            className="w-full"
            data-testid="time-slider"
            aria-label="Hour of day"
          />

          <div className="flex justify-between gap-1 mt-2">
            {[
              { label: "Dawn", h: 6 },
              { label: "Noon", h: 12 },
              { label: "Dusk", h: 19 },
              { label: "Night", h: 0 },
            ].map((p) => (
              <button
                key={p.label}
                onClick={() => setHour(p.h)}
                className="glass-btn rounded-full px-2 py-1 text-[11px] text-white/75 flex-1"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
