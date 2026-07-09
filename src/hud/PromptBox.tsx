import { useEffect, useRef, useState } from "react";
import { Settings, Sparkles, X } from "lucide-react";
import { useGameStore } from "@/state/store";
import { spawnFromPrompt } from "@/objects/spawn";
import type { Provider } from "@/objects/llm";

const SUGGESTIONS = ["a supercar", "the Taj Mahal", "a racing track", "an oak tree", "a campfire", "a robot"];

const PROVIDERS: Array<{ id: Provider; label: string; needsKey: boolean }> = [
  { id: "local", label: "Local (offline)", needsKey: false },
  { id: "gemini", label: "Gemini 3.5 Flash", needsKey: true },
  { id: "kimi", label: "Kimi k2.6", needsKey: true },
  { id: "deepseek", label: "DeepSeek v4 Pro", needsKey: true },
];

/** Provider + bring-your-own-API-key settings, shown from the gear on the Create bar. */
function PromptSettings({ onClose }: { onClose: () => void }) {
  const provider = useGameStore((s) => s.provider);
  const setProvider = useGameStore((s) => s.setProvider);
  const apiKeys = useGameStore((s) => s.apiKeys);
  const setApiKey = useGameStore((s) => s.setApiKey);
  const needsKey = PROVIDERS.find((p) => p.id === provider)?.needsKey;

  return (
    <div className="glass glass-strong rounded-2xl p-3 w-[300px] mb-2" data-testid="prompt-settings">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs uppercase tracking-wide text-white/55">Generation</span>
        <button onClick={onClose} className="text-white/50 hover:text-white" aria-label="Close settings"><X size={14} /></button>
      </div>
      <div className="grid grid-cols-2 gap-1.5 mb-2">
        {PROVIDERS.map((p) => (
          <button
            key={p.id}
            onClick={() => setProvider(p.id)}
            className={`glass-btn rounded-lg px-2 py-1.5 text-xs ${provider === p.id ? "glass-strong text-white" : "text-white/60"}`}
            data-testid={`prompt-provider-${p.id}`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {needsKey && (
        <div>
          <input
            type="password"
            value={apiKeys[provider] ?? ""}
            onChange={(e) => setApiKey(provider, e.target.value)}
            placeholder={`${provider} API key (optional — overrides server)`}
            className="w-full glass rounded-lg px-2.5 py-1.5 text-xs bg-black/20 outline-none placeholder-white/40"
            data-testid="prompt-apikey"
          />
          <div className="text-[10px] text-white/40 mt-1">
            Stored only in your browser. Leave blank to use the app's key (dev).
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Center-bottom prompt toggle + single-line natural-language input (PRD §4.5).
 * Clicking the pill expands the input; submitting spawns an object.
 */
export function PromptBox() {
  const open = useGameStore((s) => s.promptOpen);
  const togglePrompt = useGameStore((s) => s.togglePrompt);
  const [value, setValue] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const provider = useGameStore((s) => s.provider);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const lastSubmit = useRef<{ prompt: string; at: number }>({ prompt: "", at: 0 });

  const submit = () => {
    const prompt = value.trim();
    if (!prompt) return;
    // Guard against an accidental double-fire (e.g. Enter + click, or a fast double-click)
    // creating two objects from one intent.
    const now = Date.now();
    if (prompt === lastSubmit.current.prompt && now - lastSubmit.current.at < 700) return;
    lastSubmit.current = { prompt, at: now };

    const res = spawnFromPrompt(prompt);
    if (res.ok && res.pending) {
      setHint(`Spawned “${res.label}” — enriching with AI…`);
      setValue("");
    } else if (res.ok) {
      setHint(`Spawned “${res.label}”`);
      setValue("");
    } else {
      setHint(`Couldn’t create that — see errors ▲`);
    }
    window.setTimeout(() => setHint(null), 2600);
  };

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
      {hint && (
        <div className="glass px-4 py-1.5 text-sm rounded-full" role="status" data-testid="prompt-hint">
          {hint}
        </div>
      )}

      {open && settingsOpen && <PromptSettings onClose={() => setSettingsOpen(false)} />}

      {open ? (
        <div className="glass glass-strong flex items-center gap-2 px-3 py-2 rounded-full w-[min(92vw,560px)]" data-testid="prompt-input-wrap">
          <button
            onClick={() => setSettingsOpen((o) => !o)}
            className={`glass-btn rounded-full w-8 h-8 flex items-center justify-center shrink-0 ${settingsOpen ? "glass-strong" : "text-white/70"}`}
            data-testid="prompt-settings-toggle"
            title={`Generation settings — ${provider}`}
          >
            <Settings size={15} />
          </button>
          <Sparkles size={16} className="opacity-80 text-sky-200 shrink-0" />
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              // "/" or Escape exits the input back to the game (without typing the slash).
              if (e.key === "Escape" || e.key === "/") {
                e.preventDefault();
                // Consumed here — don't let it bubble to the global Esc handler, which would
                // treat the SAME press as a bare Esc (releasing native mouse capture) because
                // the prompt is already closed and blurred by the time the event reaches it.
                e.stopPropagation();
                togglePrompt(false);
                (e.target as HTMLInputElement).blur();
              }
            }}
            placeholder="Describe something to create…  e.g. create a supercar"
            className="flex-1 bg-transparent outline-none placeholder-white/55 text-[15px] py-1"
            data-testid="prompt-input"
            aria-label="Object prompt"
          />
          <button
            onClick={submit}
            className="glass-btn glass-strong rounded-full px-4 py-1.5 text-sm font-medium"
            data-testid="prompt-submit"
          >
            Create
          </button>
          <button
            onClick={() => togglePrompt(false)}
            className="glass-btn rounded-full w-8 h-8 flex items-center justify-center text-white/70"
            aria-label="Close prompt"
          >
            <X size={15} />
          </button>
        </div>
      ) : (
        <button
          onClick={() => togglePrompt(true)}
          className="glass glass-btn rounded-full px-6 py-3 flex items-center gap-2 font-medium shadow-lg"
          data-testid="prompt-toggle"
        >
          <Sparkles size={17} className="text-sky-200" />
          <span>Create something…</span>
          <kbd className="ml-1 inline-flex items-center justify-center h-5 px-1.5 rounded bg-white/20 border border-white/25 text-[11px] font-semibold">C</kbd>
        </button>
      )}

      {open && (
        <div className="flex flex-wrap gap-1.5 justify-center max-w-[560px]">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => {
                setValue(`create ${s}`);
                inputRef.current?.focus();
              }}
              className="glass glass-btn rounded-full px-3 py-1 text-xs text-white/80"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
