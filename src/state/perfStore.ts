/**
 * Runtime performance metrics for the on-screen resource monitor. Updated ~3×/second by the
 * in-canvas PerfProbe so the DOM panel can render without churning every frame.
 */

import { create } from "zustand";

export interface PerfStats {
  fps: number;
  ms: number; // ms per frame (main-thread render)
  calls: number; // WebGL draw calls
  triangles: number;
  geometries: number;
  textures: number;
  programs: number;
  heapMB: number | null; // JS heap used (Chrome only)
  heapLimitMB: number | null;
}

export interface PerfState extends PerfStats {
  open: boolean;
  update: (s: PerfStats) => void;
  toggle: (open?: boolean) => void;
}

export const usePerfStore = create<PerfState>((set) => ({
  fps: 0,
  ms: 0,
  calls: 0,
  triangles: 0,
  geometries: 0,
  textures: 0,
  programs: 0,
  heapMB: null,
  heapLimitMB: null,
  open: false,
  update: (s) => set(s),
  toggle: (open) => set((state) => ({ open: open ?? !state.open })),
}));
