# Launch post drafts (X / Twitter)

Pick one, attach `public/screenshot.png` (or better: a 15–30s screen recording of typing
"create a supercar", it spawning, and driving off — motion outperforms stills massively).

## Option A — the hook (recommended)

> I open-sourced a game where the console is a text box.
>
> Type "create a supercar" → it exists, with physics. Press E → you're driving it.
> Type "create the Taj Mahal" → an AI builds it, part by part.
>
> Runs in your browser, free, no account:
> https://project-orbit-ten.vercel.app
>
> Code (MIT): https://github.com/Tarachand-Gupta/project-orbit

## Option B — the builder's angle

> Weekend project that got out of hand: an open-source AI sandbox game.
>
> • React Three Fiber + Rapier physics
> • Type anything → an LLM builds it from low-poly primitives (offline template engine as
>   fallback — the game never needs a key)
> • Drive/fly whatever you spawn
> • Ships as a native macOS app too (Zig + WebView)
>
> Play: https://project-orbit-ten.vercel.app/play
> Source: https://github.com/Tarachand-Gupta/project-orbit — PRs welcome, good first issues up.

## Option C — short & mysterious

> "create a helicopter"
>
> …okay. Now press E.
>
> https://project-orbit-ten.vercel.app
> (open source → https://github.com/Tarachand-Gupta/project-orbit)

## Thread follow-ups (reply to your own post)

1. How generation works: prompt → Zod-validated Object Spec → low-poly primitives + physics
   tags + live controls. Weak models can't break the game — validation + a deterministic
   fallback engine catch everything.
2. The native app story: same bundle in a Zig + WKWebView shell; had to emulate pointer lock
   with CGWarpMouseCursorPosition because WKWebView never grants the real API. Write-up in the
   repo.
3. Ask: "What should the template engine learn next? Best suggestion gets built."
