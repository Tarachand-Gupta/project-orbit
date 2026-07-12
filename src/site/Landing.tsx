import { useEffect, useState } from "react";

/**
 * Public landing page (served at "/"; the game itself lives at /play and is the default in the
 * native shell). Deliberately speaks the game's own visual language — glass panels, the world's
 * jungle/sky palette, the pixel wordmark — and the hero is the game's thesis: a Create bar
 * typing real prompts. Static content only; the heavy three.js bundle is NOT loaded here
 * (main.tsx code-splits the game behind the /play route).
 */

const REPO = "https://github.com/Tarachand-Gupta/project-orbit";
const DOWNLOAD_MAC = `${REPO}/releases/latest/download/Project-Orbit-macOS.zip`;
const DOWNLOAD_LINUX = `${REPO}/releases/latest/download/Project-Orbit-linux-x64.tar.gz`;

const DEMO_PROMPTS = [
  "create a supercar",
  "create the Taj Mahal",
  "create a helicopter",
  "create a campfire by the river",
  "create a tank with a real cannon",
];

/** The hero's animated Create bar: types each prompt, holds, clears, moves to the next. */
function TypingPrompt() {
  const [text, setText] = useState("");
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setText(DEMO_PROMPTS[0]);
      return;
    }
    let prompt = 0;
    let len = 0;
    let deleting = false;
    let timer: number;
    const tick = () => {
      const full = DEMO_PROMPTS[prompt];
      len += deleting ? -2 : 1;
      if (len >= full.length + 14) deleting = true; // hold ~14 ticks before clearing
      if (len <= 0 && deleting) {
        deleting = false;
        prompt = (prompt + 1) % DEMO_PROMPTS.length;
      }
      setText(full.slice(0, Math.max(0, Math.min(len, full.length))));
      timer = window.setTimeout(tick, deleting ? 26 : 55 + Math.random() * 45);
    };
    tick();
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="glass glass-strong flex items-center gap-3 px-5 py-3.5 rounded-full w-full max-w-[560px] text-left shadow-2xl">
      <span className="text-sky-200 text-lg leading-none">✦</span>
      <span className="font-mono text-[15px] sm:text-base text-white/90 min-h-[1.5em]">
        {text}
        <span className="landing-caret" aria-hidden />
      </span>
    </div>
  );
}

function PlayButton({ big = false }: { big?: boolean }) {
  return (
    <a
      href="/play"
      className={`glass-btn glass-strong rounded-full font-semibold inline-flex items-center gap-2.5 transition-transform hover:scale-[1.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300 ${
        big ? "px-8 py-4 text-lg" : "px-6 py-3"
      }`}
      style={{ background: "linear-gradient(135deg, rgba(125,211,252,0.35), rgba(125,211,252,0.12))" }}
      data-testid="landing-play"
    >
      <span aria-hidden>▶</span> Play in your browser
    </a>
  );
}

export function Landing() {
  return (
    <div className="landing min-h-screen text-white overflow-x-hidden">
      {/* Backdrop: the game's day sky falling into jungle dark, with a low-poly ridge line. */}
      <div className="landing-sky" aria-hidden />

      <div className="relative max-w-[1060px] mx-auto px-5 sm:px-8">
        {/* Nav */}
        <nav className="flex items-center justify-between py-6">
          <span className="landing-wordmark text-lg sm:text-xl select-none">PROJECT ORBIT</span>
          <div className="flex items-center gap-3">
            <a href={REPO} className="glass glass-btn rounded-full px-4 py-2 text-sm text-white/85" rel="noreferrer">
              GitHub ↗
            </a>
            <a href="/play" className="glass glass-btn glass-strong rounded-full px-4 py-2 text-sm font-medium">
              Play
            </a>
          </div>
        </nav>

        {/* Hero */}
        <header className="flex flex-col items-center text-center pt-10 sm:pt-16 pb-14 gap-7">
          <h1 className="landing-display text-4xl sm:text-6xl leading-[1.05] max-w-[760px]">
            Type it.
            <br />
            <span className="text-sky-200">It exists.</span>
          </h1>
          <p className="text-white/75 text-base sm:text-lg max-w-[620px]">
            An open-source, AI-driven sandbox. Walk a pixel character through a low-poly world, describe anything in
            plain words — a supercar, the Taj Mahal, a helicopter — and it drops into the world with real physics.
            If it drives, get in and drive it.
          </p>
          <TypingPrompt />
          <div className="flex flex-wrap items-center justify-center gap-3 mt-1">
            <PlayButton big />
            <div className="flex gap-2">
              <a href={DOWNLOAD_MAC} className="glass glass-btn rounded-full px-5 py-3 text-sm text-white/85" data-testid="landing-download-mac">
                ⬇ macOS app
              </a>
              <a href={DOWNLOAD_LINUX} className="glass glass-btn rounded-full px-5 py-3 text-sm text-white/85" data-testid="landing-download-linux">
                ⬇ Linux
              </a>
            </div>
          </div>
          <p className="text-white/45 text-xs -mt-2">
            Free & open source · MIT · no account, no install — the browser version runs everything locally
          </p>

          {/* Live world screenshot in a shell frame */}
          <figure className="w-full max-w-[880px] mt-6">
            <div className="glass rounded-2xl p-2 shadow-2xl">
              <div className="flex items-center gap-1.5 px-2 pb-2 pt-0.5" aria-hidden>
                <span className="w-2.5 h-2.5 rounded-full bg-white/25" />
                <span className="w-2.5 h-2.5 rounded-full bg-white/25" />
                <span className="w-2.5 h-2.5 rounded-full bg-white/25" />
              </div>
              <img
                src="/screenshot.png"
                alt="Project Orbit gameplay: a pixel character beside a spawned car on a jungle road"
                className="rounded-xl w-full"
                width={1280}
                height={720}
                loading="eager"
              />
            </div>
          </figure>
        </header>

        {/* How it works — a real sequence, so numbers carry meaning */}
        <section className="py-12">
          <h2 className="landing-display text-2xl sm:text-3xl text-center mb-8">One loop, endless stuff</h2>
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              {
                n: "1",
                title: "Describe it",
                body: "Press C and type. Known objects appear as ⚡ suggestions and spawn instantly; anything else is built by an AI model, part by part.",
              },
              {
                n: "2",
                title: "Watch it land",
                body: "Every object is real low-poly geometry with real physics — mass, friction, fire. It drops in front of you and settles on the terrain.",
              },
              {
                n: "3",
                title: "Use it",
                body: "Walk up and press E: drive cars, fly helicopters, ride boards. Tune top speed, size, and mass live from the controls panel.",
              },
            ].map((s) => (
              <div key={s.n} className="glass rounded-2xl p-5">
                <div className="landing-wordmark text-sky-200/90 text-sm mb-2">STEP {s.n}</div>
                <h3 className="font-semibold text-lg mb-1.5">{s.title}</h3>
                <p className="text-white/70 text-sm leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section className="py-12">
          <h2 className="landing-display text-2xl sm:text-3xl text-center mb-8">What's in the world</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              ["🌴", "A hand-built island", "Jungle hills, dirt roads, a settlement, and a river — with a day/night cycle synced to real-world time."],
              ["⚡", "Works offline", "A deterministic template engine answers instantly with no API key. AI providers (Gemini, DeepSeek, Kimi) enrich when configured."],
              ["🚗", "Drive anything drivable", "Cars, bikes, helicopters, boats, hoverboards — spawned objects declare how they're ridden, and the engine takes it from there."],
              ["🧊", "Real physics", "Rapier (Rust → WASM) simulates every object: convex hulls, fire propagation, kicks and punches, ballistics."],
              ["🖥️", "Native desktop app", "The same game ships as a real macOS/Linux app with retina rendering and pointer capture, via a Zig + WebView shell."],
              ["🛠️", "Scriptable", "window.game gives you and your agents a typed API: spawn, list, configure, save. The whole game is a sandbox for LLM tinkering."],
            ].map(([icon, title, body]) => (
              <div key={title as string} className="glass rounded-2xl p-5">
                <div className="text-2xl mb-2" aria-hidden>{icon}</div>
                <h3 className="font-semibold mb-1.5">{title}</h3>
                <p className="text-white/70 text-sm leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Controls */}
        <section className="py-12">
          <h2 className="landing-display text-2xl sm:text-3xl text-center mb-8">Controls</h2>
          <div className="glass rounded-2xl p-6 max-w-[640px] mx-auto">
            <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-3 text-sm">
              {[
                ["WASD", "walk (Shift to run, Space to jump)"],
                ["Mouse", "look around — click the world to lock, Esc to free"],
                ["C", "create something (type, or pick a ⚡ suggestion)"],
                ["E", "enter / exit whatever you're standing next to"],
                ["F / Z / X", "fire · kick · punch"],
                ["O / T / L", "objects · time of day · debug log"],
              ].map(([k, v]) => (
                <div key={k as string} className="contents">
                  <dt>
                    <kbd className="landing-wordmark inline-block glass rounded px-2 py-1 text-[11px] text-sky-100">{k}</kbd>
                  </dt>
                  <dd className="text-white/75 self-center">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* Open source CTA */}
        <section className="py-14 text-center">
          <div className="glass glass-strong rounded-3xl px-6 py-10 max-w-[760px] mx-auto flex flex-col items-center gap-4">
            <h2 className="landing-display text-2xl sm:text-3xl">Built in the open</h2>
            <p className="text-white/75 max-w-[560px]">
              React Three Fiber, Rapier physics, Zustand, and the Vercel AI SDK — 130+ unit tests and a Playwright
              suite that drives cars headlessly. Good first issues waiting.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <a href={REPO} className="glass-btn glass rounded-full px-6 py-3 font-medium" rel="noreferrer">
                ⭐ Star on GitHub
              </a>
              <a href={`${REPO}/blob/main/CONTRIBUTING.md`} className="glass-btn glass rounded-full px-6 py-3 text-white/85" rel="noreferrer">
                Contributing guide
              </a>
              <PlayButton />
            </div>
          </div>
        </section>

        <footer className="py-10 text-center text-white/40 text-xs">
          MIT License · <a href={REPO} className="underline hover:text-white/70" rel="noreferrer">source</a> ·{" "}
          <a href={`${REPO}/releases/latest`} className="underline hover:text-white/70" rel="noreferrer">latest release</a>
        </footer>
      </div>
    </div>
  );
}
