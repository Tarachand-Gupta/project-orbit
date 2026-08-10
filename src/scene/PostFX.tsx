import { Component, type ReactNode } from "react";
import { EffectComposer, Bloom, Vignette, SMAA, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { BLOOM_INTENSITY } from "@/config/native";

/**
 * Cinematic post-processing to match the reference low-poly art: crisp SMAA edges, a soft sun
 * bloom/glow, a gentle vignette, and ACES filmic tone mapping for warm, filmic color.
 * Wrapped in an error boundary so a post-FX failure (e.g. an unusual GL backend) degrades to the
 * raw scene instead of blanking the canvas.
 */
export function PostFX() {
  return (
    <PostFXBoundary>
      <EffectComposer multisampling={0} enableNormalPass={false}>
        <SMAA />
        <Bloom intensity={BLOOM_INTENSITY} luminanceThreshold={0.7} luminanceSmoothing={0.3} mipmapBlur radius={0.7} />
        <Vignette eskil={false} offset={0.25} darkness={0.5} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>
    </PostFXBoundary>
  );
}

class PostFXBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    // Intentionally silent: rendering without post-FX is a fine fallback.
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
