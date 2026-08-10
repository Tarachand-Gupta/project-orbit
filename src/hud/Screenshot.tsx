import { useEffect, useState } from "react";

/**
 * Cmd/Ctrl+C snapshots the current scene: copies the canvas to the clipboard (so it can be pasted
 * straight into a chat) and also downloads a PNG. A brief toast confirms it.
 */
export function Screenshot() {
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      const typing = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (typing) return;
      if (!(e.key === "c" || e.key === "C") || !(e.metaKey || e.ctrlKey)) return;
      const canvas = document.querySelector("canvas");
      if (!canvas) return;
      e.preventDefault();
      try {
        const blob: Blob | null = await new Promise((res) => canvas.toBlob((b) => res(b), "image/png"));
        if (!blob) throw new Error("capture failed");
        // Copy to clipboard (best effort — may be unsupported in some browsers).
        try {
          await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
          flash("Screenshot copied to clipboard");
        } catch {
          flash("Screenshot saved");
        }
        // Also download a file.
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `orbit-${stamp()}.png`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      } catch {
        flash("Couldn’t capture the scene");
      }
    };
    const flash = (msg: string) => {
      setToast(msg);
      window.setTimeout(() => setToast(null), 2000);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!toast) return null;
  return (
    <div className="absolute top-20 left-1/2 -translate-x-1/2 glass glass-strong rounded-full px-4 py-2 text-sm" data-testid="screenshot-toast">
      📸 {toast}
    </div>
  );
}

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
