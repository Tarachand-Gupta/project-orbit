import { useEffect, useRef, useState } from "react";
import { X, ChevronLeft, ChevronRight, HelpCircle } from "lucide-react";
import { Tooltip } from "./Tooltip";
import { useGameStore } from "@/state/store";

/**
 * First-launch onboarding: a paged, glass-styled guide shown once (localStorage
 * `orbit.welcomed`), reopenable any time from the ? button (top-right). Covers what the game
 * is, what you can do, every shortcut, configuration, and AI provider setup — including the
 * custom OpenAI-compatible option. While open it counts as a HUD panel, so native mouse
 * capture frees the cursor automatically.
 */

export const WELCOMED_KEY = "orbit.welcomed";

export function hasBeenWelcomed(): boolean {
  try {
    return localStorage.getItem(WELCOMED_KEY) === "1";
  } catch {
    return true; // no storage (privacy mode) — don't nag on every load
  }
}

function markWelcomed(): void {
  try {
    localStorage.setItem(WELCOMED_KEY, "1");
  } catch {
    /* ignore */
  }
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded bg-white/20 border border-white/25 text-[11px] font-semibold">
      {children}
    </kbd>
  );
}

const PAGES: Array<{ title: string; body: React.ReactNode }> = [
  {
    title: "Welcome to Project Orbit AI",
    body: (
      <div className="space-y-3">
        <p>
          This is a sandbox where <b>typing is the game mechanic</b>. Walk a pixel character
          through a low-poly island — jungle hills, a settlement, a river — and describe anything
          you want to exist: <i>"create a supercar"</i>, <i>"create the Taj Mahal"</i>,{" "}
          <i>"create a campfire"</i>. It drops into the world with real physics.
        </p>
        <p>
          If what you made drives, flies, or floats — walk up to it and press <Key>E</Key>. Now
          you're driving it.
        </p>
        <p className="text-white/60 text-xs">
          Your world auto-saves in this browser. No account, nothing leaves your machine unless
          you turn on an AI provider.
        </p>
      </div>
    ),
  },
  {
    title: "What you can do",
    body: (
      <ul className="space-y-2 list-disc pl-4">
        <li>
          <b>Create</b> — press <Key>C</Key> and type. Known objects appear as ⚡ suggestions and
          spawn instantly; anything else is built by an AI model, part by part (with a local
          fallback, so it always works).
        </li>
        <li>
          <b>Ride</b> — cars, bikes, helicopters, planes, boats, hoverboards. <Key>E</Key> to get
          in and out; arrows/WASD steer, helicopters climb with <Key>Space</Key>.
        </li>
        <li>
          <b>Tune &amp; refine</b> — click any object to open its controls: top speed, size, mass,
          colors, rotor speed… changes apply live, mid-drive. With an AI provider you can also{" "}
          <i>refine it with words</i> right in that panel — "make it red", "bigger wheels" — and the
          model reworks that exact object.
        </li>
        <li>
          <b>Rough-house</b> — kick <Key>Z</Key>, punch <Key>X</Key>, and fire spawned weapons
          with <Key>F</Key>. Flammable things burn if fire touches them.
        </li>
        <li>
          <b>Script it</b> — open the console and try <code>window.game.spawn("a red bus")</code>.
          The whole game has a typed API for humans and agents.
        </li>
      </ul>
    ),
  },
  {
    title: "Controls & shortcuts",
    body: (
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
        {(
          [
            ["WASD / arrows", "walk (drive when riding)"],
            ["Mouse", "look around · click the world to lock · Esc frees the cursor"],
            ["Shift", "run"],
            ["Space", "jump (Shift+Space super-jump · climb in aircraft)"],
            ["C or /", "create bar"],
            ["E", "enter / exit vehicles"],
            ["F", "fire equipped weapon"],
            ["Z / X", "kick / punch"],
            ["O", "objects explorer (list, hide, remove)"],
            ["T", "time of day"],
            ["L", "debug log"],
            ["⌘C", "save a screenshot"],
            ["Esc", "close panels / free the cursor"],
          ] as Array<[string, string]>
        ).map(([k, v]) => (
          <div key={k} className="contents">
            <dt>
              <Key>{k}</Key>
            </dt>
            <dd className="text-white/75 self-center">{v}</dd>
          </div>
        ))}
      </dl>
    ),
  },
  {
    title: "Configuring the game",
    body: (
      <ul className="space-y-2 list-disc pl-4">
        <li>
          <b>⚙ top-left gear</b> — world & rendering settings: glass frostiness, pixel scale,
          physics toggles (solid obstacles, realistic vehicle physics), world scale.
        </li>
        <li>
          <b>🕐 clock (or <Key>T</Key>)</b> — the sun tracks real-world time by default; override
          the time of day for permanent sunsets.
        </li>
        <li>
          <b>Per-object controls</b> — click an object (or pick it in <Key>O</Key>) and use the
          sliders: <code>topSpeed</code>, <code>acceleration</code>, <code>handling</code>,{" "}
          <code>scale</code>, <code>mass</code>, <code>bounciness</code> actually change behavior.
        </li>
        <li>
          <b>Debug log (<Key>L</Key>)</b> — every generation and physics error lands here, and{" "}
          <code>window.game.getLogs()</code> gives agents the same view to self-correct.
        </li>
      </ul>
    ),
  },
  {
    title: "AI setup (optional)",
    body: (
      <div className="space-y-3">
        <p>
          The game is fully playable without any of this. To let an AI model build anything you
          can imagine, open the <b>⚙ gear on the Create bar</b> and:
        </p>
        <ol className="space-y-1.5 list-decimal pl-4">
          <li>
            <b>Pick a provider</b> — OpenAI, Anthropic, Google Gemini, Groq, OpenRouter, xAI (Grok),
            NVIDIA, Mistral, DeepSeek, or a <b>Custom</b> OpenAI-compatible endpoint.
          </li>
          <li>
            <b>Paste your own API key</b> — stored only in your browser and sent only to that
            provider. This project ships no keys of its own.
          </li>
          <li>
            <b>Choose a model</b> — type one, or hit <i>Load models</i> to pull the live list from
            your provider once your key is in.
          </li>
        </ol>
        <p className="text-white/60 text-xs">
          New here? <b>Google Gemini</b> has a free tier and is the easiest start — grab a key at{" "}
          <span className="font-mono">aistudio.google.com</span>. Running your own endpoint
          (Together, Fireworks, a local llama.cpp / Ollama server)? Pick <b>Custom</b> and enter its
          base URL.
        </p>
      </div>
    ),
  },
];

export function WelcomeGuide() {
  const open = useGameStore((s) => s.welcomeOpen);
  const toggleWelcome = useGameStore((s) => s.toggleWelcome);
  const [page, setPage] = useState(0);

  // Any way of dismissing the guide counts as "seen" — including the global Esc handler,
  // which flips the store flag without going through close() below.
  const wasOpen = useRef(open);
  useEffect(() => {
    if (wasOpen.current && !open) markWelcomed();
    wasOpen.current = open;
  }, [open]);

  if (!open) return null;
  const last = page === PAGES.length - 1;

  const close = () => {
    markWelcomed();
    toggleWelcome(false);
    setPage(0);
  };

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-40" data-testid="welcome-guide">
      <div className="glass glass-strong rounded-3xl w-[min(94vw,620px)] max-h-[86vh] flex flex-col text-sm text-white/85">
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h2 className="text-lg font-semibold text-white">{PAGES[page].title}</h2>
          <button onClick={close} className="text-white/50 hover:text-white" aria-label="Close guide" data-testid="welcome-close">
            <X size={18} />
          </button>
        </div>
        <div className="px-6 overflow-y-auto scrollbar-thin leading-relaxed">{PAGES[page].body}</div>
        <div className="flex items-center justify-between px-6 py-4 mt-2">
          <div className="flex gap-1.5" aria-hidden>
            {PAGES.map((_, i) => (
              <span key={i} className={`w-1.5 h-1.5 rounded-full ${i === page ? "bg-sky-300" : "bg-white/25"}`} />
            ))}
          </div>
          <div className="flex gap-2">
            {page > 0 && (
              <button
                onClick={() => setPage((p) => p - 1)}
                className="glass glass-btn rounded-full px-4 py-2 text-sm flex items-center gap-1"
              >
                <ChevronLeft size={14} /> Back
              </button>
            )}
            {last ? (
              <button
                onClick={close}
                className="glass glass-btn glass-strong rounded-full px-5 py-2 text-sm font-semibold"
                data-testid="welcome-start"
              >
                Start playing
              </button>
            ) : (
              <button
                onClick={() => setPage((p) => p + 1)}
                className="glass glass-btn glass-strong rounded-full px-4 py-2 text-sm flex items-center gap-1"
                data-testid="welcome-next"
              >
                Next <ChevronRight size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Small ? button (top-right cluster) that reopens the guide any time. */
export function HelpButton() {
  const toggleWelcome = useGameStore((s) => s.toggleWelcome);
  return (
    <Tooltip label="Guide & shortcuts" side="bottom-end">
      <button
        onClick={() => toggleWelcome(true)}
        className="glass glass-btn rounded-full w-10 h-10 flex items-center justify-center text-white/75"
        aria-label="Open the guide"
        data-testid="help-button"
      >
        <HelpCircle size={17} />
      </button>
    </Tooltip>
  );
}
