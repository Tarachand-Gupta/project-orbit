import { useGameStore } from "@/state/store";

/**
 * Top-right generation indicator (PRD §4.5): a simple spinner shown while an AI model is creating
 * or enriching an object, so the player can see something is being generated (instead of objects
 * appearing "out of nowhere"). Lists the label(s) in flight.
 */
export function GenerationIndicator() {
  const pending = useGameStore((s) => s.pendingGen);
  const labels = Object.values(pending);
  if (labels.length === 0) return null;

  const text = labels.length === 1 ? `Generating ${labels[0]}…` : `Generating ${labels.length} objects…`;

  return (
    <div className="glass glass-strong rounded-full pl-2.5 pr-4 py-1.5 flex items-center gap-2.5" data-testid="generation-indicator">
      <span className="spinner" />
      <span className="text-sm">{text}</span>
    </div>
  );
}
