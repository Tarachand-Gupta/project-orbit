import { PromptBox } from "./PromptBox";
import { ControlsPanel } from "./ControlsPanel";
import { ErrorIndicator } from "./ErrorIndicator";
import { DebugWindow } from "./DebugWindow";
import { DevPanel } from "./DevPanel";
import { Clock } from "./Clock";
import { InteractionPrompt } from "./InteractionPrompt";
import { ControlsHint } from "./ControlsHint";
import { GenerationIndicator } from "./GenerationIndicator";
import { ObjectExplorer } from "./ObjectExplorer";
import { KeyboardShortcuts } from "./KeyboardShortcuts";
import { PerfStats } from "./PerfStats";
import { Screenshot } from "./Screenshot";
import { NativeBadge } from "./NativeBadge";
import { WelcomeGuide, HelpButton } from "./WelcomeGuide";
import { MouseCaptureHint } from "./MouseCaptureHint";

/**
 * Glass-morphism HUD layer (Tech Doc §8). Regions: top-left dev/scale settings, top-center
 * world clock, top-right error indicator + debug window, center-bottom prompt, bottom-right
 * object controls. The layer is pointer-events:none; only its children capture clicks so the
 * 3D canvas stays interactive everywhere else.
 */
export function Hud() {
  return (
    <div className="hud-layer font-ui">
      <KeyboardShortcuts />
      <Screenshot />
      {/* top-left: dev/scale settings + resource-usage monitor */}
      <div className="absolute top-6 left-6 flex items-start gap-2">
        <DevPanel />
        <PerfStats />
        <NativeBadge />
      </div>

      {/* top-center: globally-synced clock */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2">
        <Clock />
      </div>

      {/* small hint shown while mouse-look capture / pointer lock is engaged */}
      <MouseCaptureHint />

      {/* top-right: generation spinner + object explorer + error indicator + guide */}
      <div className="absolute top-6 right-6 flex items-start gap-2">
        <GenerationIndicator />
        <ObjectExplorer />
        <ErrorIndicator />
        <HelpButton />
      </div>
      <DebugWindow />

      {/* first-launch guide (once per browser; reopenable from ?) */}
      <WelcomeGuide />

      {/* bottom-right: object controls */}
      <ControlsPanel />

      {/* bottom-left: controls legend */}
      <ControlsHint />

      {/* center: interaction prompt (drive/exit) */}
      <InteractionPrompt />

      {/* center-bottom: prompt */}
      <PromptBox />
    </div>
  );
}
