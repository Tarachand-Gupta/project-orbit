import { usePlayerStore } from "@/state/playerStore";
import { useGameStore } from "@/state/store";
import { interactionFor } from "@/objects/spec";

/**
 * Center-screen interaction prompt (PRD: character interacts with objects). Shows "Press E to
 * <verb>" when the player stands next to an interactable object, and the controls + "Press E to
 * exit" while controlling one. Verb comes from the object's interaction spec (drive/fly/ride).
 */
export function InteractionPrompt() {
  const nearby = usePlayerStore((s) => s.nearbyVehicleId);
  const driving = usePlayerStore((s) => s.drivingId);
  const objects = useGameStore((s) => s.objects);

  if (driving) {
    const obj = objects[driving];
    const verb = obj ? interactionFor(obj.spec).verb ?? interactionFor(obj.spec).mode : "drive";
    const fly = obj ? interactionFor(obj.spec).mode === "fly" : false;
    return (
      <Prompt testid="interaction-prompt">
        {capitalize(verb)} <b>{obj?.spec.label ?? "vehicle"}</b> — <Key>W</Key><Key>A</Key><Key>S</Key><Key>D</Key>
        {fly ? <> · <Key>Space</Key>/<Key>Shift</Key> up/down</> : null} · <Key>E</Key> exit
      </Prompt>
    );
  }
  if (nearby) {
    const obj = objects[nearby];
    const verb = obj ? interactionFor(obj.spec).verb ?? interactionFor(obj.spec).mode : "drive";
    return (
      <Prompt testid="interaction-prompt">
        Press <Key>E</Key> to {verb} the <b>{obj?.spec.label ?? "vehicle"}</b>
      </Prompt>
    );
  }
  return null;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function Prompt({ children, testid }: { children: React.ReactNode; testid: string }) {
  return (
    <div className="absolute left-1/2 -translate-x-1/2 bottom-28" data-testid={testid}>
      <div className="glass glass-strong rounded-full px-5 py-2 text-sm flex items-center gap-1.5">{children}</div>
    </div>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded bg-white/25 border border-white/30 text-[11px] font-semibold mx-0.5">
      {children}
    </kbd>
  );
}
