/**
 * Named low-poly material palette. Specs reference materials by name (e.g. "paint_red");
 * the builder resolves them to flat-shaded colors. A material name may also be a raw hex
 * string ("#ff8800"), which is passed through.
 */

export interface MaterialDef {
  color: string;
  metalness?: number;
  roughness?: number;
  emissive?: string;
  emissiveIntensity?: number;
}

export const MATERIALS: Record<string, MaterialDef> = {
  paint_red: { color: "#e04848", roughness: 0.4, metalness: 0.3 },
  paint_blue: { color: "#3b7dd8", roughness: 0.4, metalness: 0.3 },
  paint_yellow: { color: "#f2c14e", roughness: 0.4, metalness: 0.3 },
  paint_green: { color: "#4caf6e", roughness: 0.5, metalness: 0.2 },
  paint_white: { color: "#f4f4f0", roughness: 0.5 },
  paint_black: { color: "#23272e", roughness: 0.5, metalness: 0.4 },
  glass: { color: "#a8d8ff", roughness: 0.05, metalness: 0.1 },
  chrome: { color: "#cfd6dd", roughness: 0.15, metalness: 0.95 },
  rubber: { color: "#1c1f24", roughness: 0.9 },
  wood: { color: "#9c6b3f", roughness: 0.8 },
  bark: { color: "#6b4a2b", roughness: 0.9 },
  leaf: { color: "#5aa55a", roughness: 0.7 },
  stone: { color: "#8c8c8c", roughness: 0.85 },
  marble: { color: "#ede9e0", roughness: 0.3, metalness: 0.1 },
  gold: { color: "#e8c24a", roughness: 0.25, metalness: 0.9 },
  sand: { color: "#d9c08a", roughness: 0.95 },
  asphalt: { color: "#36393f", roughness: 0.95 },
  fire: { color: "#ff7a18", emissive: "#ff5a00", emissiveIntensity: 1.4, roughness: 0.6 },
  ember: { color: "#7a1a00", emissive: "#ff3000", emissiveIntensity: 0.6, roughness: 0.9 },
  brick: { color: "#a8533a", roughness: 0.85 },
  steel: { color: "#9aa3ad", roughness: 0.3, metalness: 0.8 },
};

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function resolveMaterial(name: string): MaterialDef {
  if (MATERIALS[name]) return MATERIALS[name];
  if (HEX_RE.test(name)) return { color: name, roughness: 0.6 };
  // Unknown material — fall back to neutral stone so a bad spec still renders.
  return MATERIALS.stone;
}

export const MATERIAL_NAMES = Object.keys(MATERIALS);
