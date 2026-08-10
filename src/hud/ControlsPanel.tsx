import { useMemo, useState } from "react";
import { X, Sparkles } from "lucide-react";
import { useGameStore } from "@/state/store";
import { refineObject } from "@/objects/refine";
import { Tooltip } from "./Tooltip";
import type { ControlSpec } from "@/objects/spec";

/**
 * Bottom-right object controls panel (PRD §4.6). Fixed size, tabbed, auto-rendered from the
 * selected object's `config`: slider → slider, checkbox → toggle, stepper → number stepper
 * with 5×/10×/20× multipliers. Edits apply live to the object spec in the store.
 */
export function ControlsPanel() {
  const selectedId = useGameStore((s) => s.selectedId);
  const object = useGameStore((s) => (selectedId ? s.objects[selectedId] : null));
  const selectObject = useGameStore((s) => s.selectObject);
  const removeObject = useGameStore((s) => s.removeObject);
  const setControlValue = useGameStore((s) => s.setControlValue);

  const entries = useMemo(() => Object.entries(object?.spec.config ?? {}), [object?.spec.config]);
  const tabs = useMemo(() => {
    const set = new Set<string>();
    for (const [, c] of entries) set.add(c.tab ?? "General");
    return Array.from(set);
  }, [entries]);

  const [activeTab, setActiveTab] = useState<string>(tabs[0] ?? "General");
  const tab = tabs.includes(activeTab) ? activeTab : tabs[0] ?? "General";

  if (!object || !selectedId) return null;

  const tabEntries = entries.filter(([, c]) => (c.tab ?? "General") === tab);

  return (
    <div
      className="glass glass-strong absolute bottom-6 right-6 w-[340px] h-[420px] rounded-2xl flex flex-col overflow-hidden"
      data-testid="controls-panel"
    >
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <div className="min-w-0">
          <div className="text-[15px] font-semibold truncate">{object.spec.label}</div>
          <div className="text-xs text-white/55 capitalize">{object.spec.type}</div>
        </div>
        <Tooltip label="Close" side="left">
          <button
            onClick={() => selectObject(null)}
            className="glass-btn rounded-full w-7 h-7 flex items-center justify-center text-white/70 shrink-0"
            aria-label="Close controls"
          >
            <X size={14} />
          </button>
        </Tooltip>
      </div>

      {/* Refine with a prompt — iterate on this exact object */}
      <RefineBar id={selectedId} />

      {/* Tabs */}
      <div className="flex gap-1 px-3 pb-2 overflow-x-auto scrollbar-thin">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-3 py-1 rounded-full text-xs whitespace-nowrap glass-btn ${
              t === tab ? "glass-strong text-white" : "text-white/60"
            }`}
            data-testid={`tab-${t}`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Controls */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-2 space-y-4">
        {tabEntries.map(([key, ctrl]) => (
          <Control
            key={key}
            name={key}
            ctrl={ctrl}
            onChange={(v) => setControlValue(selectedId, key, v)}
          />
        ))}
        {tabEntries.length === 0 && <div className="text-sm text-white/50">No controls in this tab.</div>}
      </div>

      <div className="px-4 py-3 border-t border-white/10 flex items-center justify-between">
        <button
          onClick={() => removeObject(selectedId)}
          className="glass-btn rounded-full px-3 py-1.5 text-xs text-red-200"
          data-testid="delete-object"
        >
          Delete object
        </button>
        <span className="text-[10px] text-white/40 font-mono">{object.spec.id}</span>
      </div>
    </div>
  );
}

/**
 * Prompt-based iteration on the selected object: type a change ("make it red", "bigger wheels")
 * and the model edits THIS object in place. Sliders above are the offline path; this is the
 * words path and needs an AI provider.
 */
function RefineBar({ id }: { id: string }) {
  const [text, setText] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const provider = useGameStore((s) => s.provider);
  const pending = useGameStore((s) => id in s.pendingGen);
  const isLocal = provider === "local";

  const flash = (msg: string) => {
    setNote(msg);
    window.setTimeout(() => setNote((n) => (n === msg ? null : n)), 3200);
  };

  const submit = () => {
    const res = refineObject(id, text);
    if (res.ok) {
      setText("");
      setNote("Refining… it updates when the model answers");
      return;
    }
    switch (res.error) {
      case "empty":
        break;
      case "needs-provider":
        flash("Pick an AI provider in the ⚙ Create-bar settings to refine with words");
        break;
      case "driving":
        flash("Exit the vehicle (E) before refining it");
        break;
      case "already-refining":
        flash("Already refining — hang on…");
        break;
      default:
        flash("Couldn't refine — check the log (L)");
    }
  };

  return (
    <div className="px-4 pb-2">
      <div className="flex items-center gap-1.5">
        <Sparkles size={14} className="text-white/60 shrink-0" />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") (e.target as HTMLInputElement).blur();
          }}
          placeholder={isLocal ? "Refine needs an AI provider (⚙)" : "Refine… e.g. make it red, bigger wheels"}
          className="flex-1 min-w-0 glass rounded-full px-3 py-1.5 text-xs bg-black/20 outline-none placeholder-white/40"
          data-testid="refine-input"
          disabled={pending}
          aria-label="Refine this object with a prompt"
        />
        <button
          onClick={submit}
          disabled={pending || !text.trim()}
          className="glass-btn glass-strong rounded-full px-3 py-1.5 text-xs shrink-0 disabled:opacity-40"
          data-testid="refine-submit"
        >
          {pending ? "Refining…" : "Refine"}
        </button>
      </div>
      {note && (
        <div className="text-[10px] text-white/55 mt-1 px-1" data-testid="refine-note">
          {note}
        </div>
      )}
    </div>
  );
}

function Control({
  name,
  ctrl,
  onChange,
}: {
  name: string;
  ctrl: ControlSpec;
  onChange: (v: number | boolean) => void;
}) {
  const label = ctrl.label ?? name;

  if (ctrl.type === "checkbox") {
    const checked = Boolean(ctrl.value);
    return (
      <div className="flex items-center justify-between">
        <span className="text-sm">{label}</span>
        <button
          role="switch"
          aria-checked={checked}
          onClick={() => onChange(!checked)}
          data-testid={`control-${name}`}
          className={`w-11 h-6 rounded-full transition-colors relative ${checked ? "bg-sky-400/80" : "bg-white/20"}`}
        >
          <span
            className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${checked ? "left-[22px]" : "left-0.5"}`}
          />
        </button>
      </div>
    );
  }

  const value = Number(ctrl.value);

  if (ctrl.type === "slider") {
    return (
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm">{label}</span>
          <span className="text-xs font-mono text-white/70" data-testid={`value-${name}`}>
            {round(value)}
          </span>
        </div>
        <input
          type="range"
          min={ctrl.min ?? 0}
          max={ctrl.max ?? 100}
          step={ctrl.step ?? 1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full"
          data-testid={`control-${name}`}
        />
      </div>
    );
  }

  // stepper
  const step = ctrl.step ?? 1;
  const multipliers = ctrl.multipliers ?? [5, 10, 20];
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm">{label}</span>
        <span className="text-xs font-mono text-white/70" data-testid={`value-${name}`}>
          {round(value)}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <StepBtn label={`–`} onClick={() => onChange(value - step)} testid={`control-${name}-dec`} />
        <StepBtn label={`+`} onClick={() => onChange(value + step)} testid={`control-${name}`} />
        <div className="flex-1" />
        {multipliers.map((m) => (
          <div key={m} className="flex flex-col gap-0.5">
            <StepBtn label={`+${m}×`} small onClick={() => onChange(value + step * m)} testid={`control-${name}-plus${m}`} />
            <StepBtn label={`-${m}×`} small onClick={() => onChange(value - step * m)} testid={`control-${name}-minus${m}`} />
          </div>
        ))}
      </div>
    </div>
  );
}

function StepBtn({
  label,
  onClick,
  small,
  testid,
}: {
  label: string;
  onClick: () => void;
  small?: boolean;
  testid?: string;
}) {
  return (
    <button
      onClick={onClick}
      data-testid={testid}
      className={`glass-btn glass-strong rounded-md font-mono ${small ? "px-1.5 py-0.5 text-[10px]" : "px-2.5 py-1 text-sm"}`}
    >
      {label}
    </button>
  );
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
