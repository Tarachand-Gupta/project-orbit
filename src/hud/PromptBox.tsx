import { useEffect, useMemo, useRef, useState } from "react";
import { Settings, Sparkles, X, Zap } from "lucide-react";
import { useGameStore } from "@/state/store";
import { spawnFromPrompt } from "@/objects/spawn";
import { suggestTemplates } from "@/objects/generator";
import { fetchModels, type Provider } from "@/objects/llm";
import { PROVIDERS, getProvider } from "@/objects/providers";

const EXAMPLES = ["a supercar", "the Taj Mahal", "a racing track", "an oak tree", "a campfire", "a robot"];

function titleCaseKeyword(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Provider + bring-your-own-key settings (⚙ on the Create bar). Pick any of the top providers
 * (or a custom OpenAI-compatible endpoint), paste your key, and choose a model — the model list
 * loads live from the provider once a key is present. Everything is stored only in your browser
 * and sent only to the provider you pick; this project ships no server keys.
 */
function PromptSettings({ onClose }: { onClose: () => void }) {
  const provider = useGameStore((s) => s.provider);
  const setProvider = useGameStore((s) => s.setProvider);
  const apiKeys = useGameStore((s) => s.apiKeys);
  const setApiKey = useGameStore((s) => s.setApiKey);
  const models = useGameStore((s) => s.models);
  const setModel = useGameStore((s) => s.setModel);
  const baseUrls = useGameStore((s) => s.baseUrls);
  const setBaseUrl = useGameStore((s) => s.setBaseUrl);

  const info = getProvider(provider);
  const apiKey = apiKeys[provider] ?? "";
  const [liveModels, setLiveModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // A different provider has its own models — drop the previously-fetched list.
  useEffect(() => setLiveModels([]), [provider]);

  const modelList = useMemo(() => {
    const set = new Set<string>([...(info?.models ?? []), ...liveModels]);
    if (models[provider]) set.add(models[provider] as string);
    return Array.from(set);
  }, [info, liveModels, models, provider]);

  const loadModels = async () => {
    setLoading(true);
    const found = await fetchModels(provider, apiKey, baseUrls[provider] || info?.baseUrl);
    setLiveModels(found);
    if (found.length && !models[provider]) setModel(provider, found[0]);
    setLoading(false);
  };

  const showBaseUrl = info?.apiStyle === "openai" && provider !== "local";
  const inputCls = "w-full glass rounded-lg px-2.5 py-1.5 text-xs bg-black/20 outline-none placeholder-white/40";

  return (
    <div className="glass glass-strong rounded-2xl p-3 w-[320px] mb-2 space-y-2" data-testid="prompt-settings">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-white/55">Provider · bring your own key</span>
        <button onClick={onClose} className="text-white/50 hover:text-white" aria-label="Close settings"><X size={14} /></button>
      </div>

      <select
        value={provider}
        onChange={(e) => setProvider(e.target.value as Provider)}
        className={`${inputCls} cursor-pointer`}
        data-testid="prompt-provider"
        aria-label="AI provider"
      >
        {PROVIDERS.map((p) => (
          <option key={p.id} value={p.id} className="bg-slate-800 text-white">{p.label}</option>
        ))}
      </select>

      {info?.note && <div className="text-[10px] text-white/45">{info.note}</div>}

      {showBaseUrl && (
        <input
          type="url"
          value={baseUrls[provider] ?? info?.baseUrl ?? ""}
          onChange={(e) => setBaseUrl(provider, e.target.value)}
          placeholder="Base URL, e.g. https://api.groq.com/openai/v1"
          className={inputCls}
          data-testid="prompt-baseurl"
        />
      )}

      {info?.needsKey && (
        <>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(provider, e.target.value)}
            placeholder="API key (stays in your browser)"
            className={inputCls}
            data-testid="prompt-apikey"
          />
          {info.keyUrl && <div className="text-[10px] text-white/40">Get a key → {info.keyUrl}</div>}
        </>
      )}

      {provider !== "local" && (
        <>
          <div className="flex items-center gap-1.5">
            <input
              list="orbit-model-list"
              value={models[provider] ?? ""}
              onChange={(e) => setModel(provider, e.target.value)}
              placeholder={info?.models[0] ? `Model — default ${info.models[0]}` : "Model name"}
              className={`${inputCls} flex-1 min-w-0`}
              data-testid="prompt-model"
              aria-label="Model name"
            />
            <datalist id="orbit-model-list">
              {modelList.map((m) => <option key={m} value={m} />)}
            </datalist>
            <button
              onClick={loadModels}
              disabled={loading || (info?.needsKey && !apiKey)}
              className="glass-btn glass-strong rounded-lg px-2 py-1.5 text-[11px] shrink-0 disabled:opacity-40 whitespace-nowrap"
              data-testid="prompt-load-models"
              title="Fetch the available models from the provider"
            >
              {loading ? "…" : "Load models"}
            </button>
          </div>
          <div className="text-[10px] text-white/40">
            {liveModels.length > 0
              ? `${liveModels.length} models loaded — type or pick one.`
              : "Type a model, or add your key and Load models to pick from the live list."}
          </div>
        </>
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
  // Typeahead: index into `suggestions` selected with ↑/↓ (−1 = none, Enter submits the text).
  const [selectedSuggestion, setSelectedSuggestion] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const provider = useGameStore((s) => s.provider);

  // Known-object matches for what's typed so far. Selecting one spawns that template instantly —
  // no AI round-trip; plain Create sends the full text to the model (when a provider is set).
  const suggestions = useMemo(() => suggestTemplates(value), [value]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);
  useEffect(() => setSelectedSuggestion(-1), [value]);

  const lastSubmit = useRef<{ prompt: string; at: number }>({ prompt: "", at: 0 });

  const showHint = (text: string) => {
    setHint(text);
    window.setTimeout(() => setHint(null), 2600);
  };

  /** Spawn a typeahead pick: the deterministic template, instantly, exactly one object. */
  const spawnSuggestion = (keyword: string) => {
    const res = spawnFromPrompt(keyword, { forceLocal: true });
    showHint(res.ok ? `Spawned “${res.label}”` : `Couldn’t create that — see errors ▲`);
    if (res.ok) setValue("");
  };

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
      showHint(`Generating “${res.label}”… it will appear when ready`);
      setValue("");
    } else if (res.ok) {
      showHint(`Spawned “${res.label}”`);
      setValue("");
    } else if (res.error === "already generating") {
      showHint(`Already generating “${res.label}” — hang on…`);
    } else {
      showHint(`Couldn’t create that — see errors ▲`);
    }
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
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                if (suggestions.length > 0) {
                  e.preventDefault();
                  const dir = e.key === "ArrowDown" ? 1 : -1;
                  // Cycle through −1 (free text) and each suggestion.
                  setSelectedSuggestion((i) => ((i + 1 + dir + (suggestions.length + 1)) % (suggestions.length + 1)) - 1);
                }
                return;
              }
              if (e.key === "Enter") {
                const picked = suggestions[selectedSuggestion];
                if (picked) spawnSuggestion(picked.keyword);
                else submit();
              }
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

      {open && suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 justify-center max-w-[560px]" data-testid="prompt-suggestions">
          {suggestions.map((s, i) => (
            <button
              key={s.name}
              // The input keeps focus (and the ↑/↓ selection) — spawn on mousedown-driven click.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => spawnSuggestion(s.keyword)}
              className={`glass glass-btn rounded-full pl-2 pr-3 py-1 text-xs flex items-center gap-1 ${
                i === selectedSuggestion ? "glass-strong text-white" : "text-white/80"
              }`}
              data-testid={`prompt-suggestion-${s.name}`}
              title="Known object — spawns instantly"
            >
              <Zap size={11} className="text-amber-300" />
              {titleCaseKeyword(s.keyword)}
            </button>
          ))}
          <span className="text-[10px] text-white/45 self-center">↑↓ pick · Enter spawns instantly · or press Create to generate</span>
        </div>
      )}

      {open && suggestions.length === 0 && (
        <div className="flex flex-wrap gap-1.5 justify-center max-w-[560px]">
          {EXAMPLES.map((s) => (
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
