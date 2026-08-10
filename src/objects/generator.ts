/**
 * Local, deterministic prompt → ObjectSpec generator.
 *
 * This is the guaranteed-stable, model-independent path (Tech Doc §4.1, constraint #1:
 * "core mechanics must always be solid regardless of model quality"). It runs entirely
 * client-side with no API key: a keyword matcher maps the prompt to a template, and an
 * always-valid generic fallback composes primitives for anything unrecognised.
 *
 * An optional LLM adapter (see llmAdapter.ts) can later enrich this, but the game never
 * depends on it.
 */

import type { ObjectSpec, PartSpec, PhysicsSpec, ControlSpec, InteractionSpec } from "./spec";

export interface GeneratedResult {
  spec: ObjectSpec;
  /** "template" when a known keyword matched; "generic" for the procedural fallback. */
  source: "template" | "generic";
  matched?: string;
}

type Template = (label: string, prompt: string) => {
  type: string;
  parts: PartSpec[];
  physics: PhysicsSpec;
  config: Record<string, ControlSpec>;
  interaction?: InteractionSpec;
};

const slider = (value: number, min: number, max: number, step = 1, tab = "General", label?: string): ControlSpec => ({
  type: "slider", value, min, max, step, tab, label,
});
const checkbox = (value: boolean, tab = "General", label?: string): ControlSpec => ({
  type: "checkbox", value, tab, label,
});
const stepper = (value: number, min: number, max: number, step = 1, tab = "General", label?: string): ControlSpec => ({
  type: "stepper", value, min, max, step, multipliers: [5, 10, 20], tab, label,
});

const box = (size: [number, number, number], material: string, position?: [number, number, number], rotation?: [number, number, number]): PartSpec =>
  ({ primitive: "box", size, material, position, rotation });
const cyl = (rTop: number, rBottom: number, h: number, material: string, position?: [number, number, number], rotation?: [number, number, number]): PartSpec =>
  ({ primitive: "cylinder", size: [rTop, rBottom, h], material, position, rotation });
const sphere = (r: number, material: string, position?: [number, number, number]): PartSpec =>
  ({ primitive: "sphere", size: [r], material, position });
const cone = (r: number, h: number, material: string, position?: [number, number, number], rotation?: [number, number, number]): PartSpec =>
  ({ primitive: "cone", size: [r, h], material, position, rotation });

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

// A sleek open-cockpit sports car. Modeled facing +Z (forward), so it drives the way it points.
const supercar: Template = () => ({
  type: "vehicle",
  parts: [
    // chassis + body (length along Z)
    box([1.95, 0.32, 4.3], "paint_red", [0, 0.42, 0]),
    box([1.8, 0.34, 2.6], "paint_red", [0, 0.66, -0.1]),
    // sloped hood (front +Z) and rear deck
    box([1.7, 0.26, 1.5], "paint_red", [0, 0.6, 1.5]),
    box([1.7, 0.32, 1.2], "paint_red", [0, 0.7, -1.6]),
    // side sills
    box([0.18, 0.25, 3.4], "paint_black", [0.95, 0.45, 0]),
    box([0.18, 0.25, 3.4], "paint_black", [-0.95, 0.45, 0]),
    // open cockpit: seat + headrest + dashboard/windshield
    box([1.15, 0.18, 1.0], "paint_black", [0, 0.78, -0.35]),
    box([1.0, 0.5, 0.16], "paint_black", [0, 1.05, -0.85]),
    box([1.5, 0.45, 0.12], "glass", [0, 1.0, 0.35], [-0.5, 0, 0]),
    // wheels (axle along X → roll forward in Z)
    cyl(0.52, 0.52, 0.42, "rubber", [0.92, 0.5, 1.35], [0, 0, Math.PI / 2]),
    cyl(0.52, 0.52, 0.42, "rubber", [-0.92, 0.5, 1.35], [0, 0, Math.PI / 2]),
    cyl(0.52, 0.52, 0.42, "rubber", [0.92, 0.5, -1.35], [0, 0, Math.PI / 2]),
    cyl(0.52, 0.52, 0.42, "rubber", [-0.92, 0.5, -1.35], [0, 0, Math.PI / 2]),
    // hubcaps
    cyl(0.22, 0.22, 0.44, "chrome", [0.92, 0.5, 1.35], [0, 0, Math.PI / 2]),
    cyl(0.22, 0.22, 0.44, "chrome", [-0.92, 0.5, 1.35], [0, 0, Math.PI / 2]),
    // headlights (front +Z) + rear spoiler (-Z)
    box([0.45, 0.18, 0.12], "paint_yellow", [0.6, 0.55, 2.16]),
    box([0.45, 0.18, 0.12], "paint_yellow", [-0.6, 0.55, 2.16]),
    box([1.9, 0.08, 0.45], "paint_black", [0, 1.0, -2.05]),
    box([0.1, 0.3, 0.3], "paint_black", [0.8, 0.88, -2.0]),
    box([0.1, 0.3, 0.3], "paint_black", [-0.8, 0.88, -2.0]),
  ],
  physics: { mass: 1400, friction: 0.8, restitution: 0.1, flammable: false },
  config: {
    topSpeed: slider(260, 0, 400, 5, "Performance", "Top speed (km/h)"),
    acceleration: slider(6, 1, 10, 0.5, "Performance", "Acceleration"),
    handling: slider(6, 1, 10, 0.5, "Performance", "Handling"),
    headlights: checkbox(true, "Lights"),
    spoiler: checkbox(true, "Style", "Rear spoiler"),
    wheelCount: stepper(4, 3, 8, 1, "Chassis", "Wheel count"),
  },
  interaction: { mode: "drive", verb: "drive", seatHeight: 0.7, posture: "sit" },
});

const tajMahal: Template = () => {
  const parts: PartSpec[] = [
    box([10, 0.6, 10], "marble", [0, 0.3, 0]), // plinth
    box([7, 5, 7], "marble", [0, 3, 0]), // main hall
    // central dome
    sphere(2.6, "marble", [0, 6.5, 0]),
    cone(0.5, 1.4, "gold", [0, 9.2, 0]),
  ];
  // four corner minarets
  const m = 5.5;
  for (const [x, z] of [[m, m], [m, -m], [-m, m], [-m, -m]] as const) {
    parts.push(cyl(0.5, 0.5, 8, "marble", [x, 4, z]));
    parts.push(cone(0.7, 1.2, "gold", [x, 8.6, z]));
  }
  return {
    type: "building",
    parts,
    physics: { mass: 50000, friction: 0.9, restitution: 0.05, flammable: false, fixed: true },
    config: {
      domeSize: slider(2.6, 1, 4, 0.1, "Structure", "Dome radius"),
      minaretHeight: slider(8, 4, 14, 0.5, "Structure", "Minaret height"),
      gilded: checkbox(true, "Finish", "Gold finials"),
    },
  };
};

const racingTrack: Template = () => {
  const parts: PartSpec[] = [];
  const segments = 16;
  const radius = 9;
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    parts.push(box([3, 0.2, 1.6], "asphalt", [Math.cos(a) * radius, 0.1, Math.sin(a) * radius], [0, -a, 0]));
  }
  return {
    type: "track",
    parts,
    physics: { mass: 0, friction: 0.95, restitution: 0.1, flammable: false, fixed: true },
    config: {
      segments: stepper(segments, 6, 48, 1, "Layout", "Segments"),
      radius: slider(radius, 4, 20, 0.5, "Layout", "Radius"),
      thickness: slider(0.2, 0.1, 1, 0.05, "Layout", "Track thickness"),
      width: slider(1.6, 0.8, 4, 0.1, "Layout", "Track width"),
    },
  };
};

const bowlingBall: Template = () => ({
  type: "ball",
  parts: [sphere(1, "paint_black", [0, 1, 0])],
  physics: { mass: 7, friction: 0.3, restitution: 0.2, flammable: false },
  config: {
    radius: slider(1, 0.3, 3, 0.1, "Physics", "Radius"),
    bounciness: slider(0.2, 0, 1, 0.05, "Physics", "Restitution"),
  },
});

const bowlingPins: Template = () => {
  const parts: PartSpec[] = [];
  // standard 4-row triangle
  let idx = 0;
  for (let row = 0; row < 4; row++) {
    for (let i = 0; i <= row; i++) {
      const x = row * 1.0;
      const z = (i - row / 2) * 1.0;
      parts.push(cyl(0.18, 0.3, 1.2, "paint_white", [x, 0.6, z]));
      idx++;
    }
  }
  return {
    type: "pins",
    parts,
    physics: { mass: 1.5, friction: 0.4, restitution: 0.3, flammable: false },
    config: {
      pinCount: stepper(idx, 1, 10, 1, "Layout", "Pins"),
    },
  };
};

const tree: Template = () => ({
  type: "tree",
  parts: [
    cyl(0.3, 0.45, 3, "bark", [0, 1.5, 0]),
    cone(1.8, 2.4, "leaf", [0, 3.8, 0]),
    cone(1.4, 2, "leaf", [0, 5, 0]),
    cone(1, 1.6, "leaf", [0, 6, 0]),
  ],
  physics: { mass: 800, friction: 0.8, restitution: 0.1, flammable: true },
  config: {
    height: slider(3, 1, 8, 0.2, "Growth", "Trunk height"),
    foliage: slider(1.8, 0.5, 3, 0.1, "Growth", "Foliage size"),
    evergreen: checkbox(true, "Type"),
  },
});

const house: Template = () => ({
  type: "building",
  parts: [
    box([4, 3, 4], "brick", [0, 1.5, 0]),
    cone(3.2, 2, "paint_red", [0, 4, 0], [0, Math.PI / 4, 0]),
    box([0.8, 1.6, 0.1], "wood", [0, 0.8, 2.0]),
    box([1, 1, 0.1], "glass", [1.2, 1.8, 2.0]),
  ],
  physics: { mass: 20000, friction: 0.9, restitution: 0.05, flammable: true, fixed: true },
  config: {
    width: slider(4, 2, 10, 0.5, "Structure", "Width"),
    height: slider(3, 2, 8, 0.5, "Structure", "Wall height"),
    roofColor: checkbox(true, "Finish", "Red roof"),
  },
});

const campfire: Template = () => ({
  type: "fire",
  parts: [
    cyl(0.15, 0.15, 1.4, "wood", [0, 0.2, 0], [0, 0, Math.PI / 2.4]),
    cyl(0.15, 0.15, 1.4, "wood", [0, 0.2, 0], [Math.PI / 2.4, 0, 0]),
    cone(0.7, 1.4, "fire", [0, 0.8, 0]),
    cone(0.4, 0.9, "fire", [0.1, 1.1, 0]),
  ],
  physics: { mass: 5, friction: 0.6, restitution: 0.1, flammable: false, fire: true },
  config: {
    intensity: slider(1.4, 0.2, 3, 0.1, "Flame", "Flame intensity"),
    radius: slider(0.7, 0.3, 2, 0.1, "Flame", "Flame radius"),
  },
});

const rocket: Template = () => ({
  type: "vehicle",
  parts: [
    cyl(0.6, 0.9, 4, "paint_white", [0, 2, 0]),
    cone(0.6, 1.4, "paint_red", [0, 4.7, 0]),
    box([0.15, 1, 0.6], "paint_red", [0, 0.6, 0.9]),
    box([0.15, 1, 0.6], "paint_red", [0, 0.6, -0.9]),
    box([0.15, 1, 0.6], "paint_red", [0.9, 0.6, 0]),
    box([0.15, 1, 0.6], "paint_red", [-0.9, 0.6, 0]),
    cone(0.5, 0.8, "fire", [0, -0.2, 0], [Math.PI, 0, 0]),
  ],
  physics: { mass: 1000, friction: 0.5, restitution: 0.2, flammable: true },
  config: {
    thrust: slider(50, 0, 200, 5, "Flight", "Thrust"),
    finCount: stepper(4, 3, 6, 1, "Body", "Fin count"),
  },
});

const motorcycle: Template = () => ({
  type: "motorcycle",
  parts: [
    cyl(0.6, 0.6, 0.25, "rubber", [0, 0.6, 1.1], [0, 0, Math.PI / 2]), // front wheel
    cyl(0.6, 0.6, 0.25, "rubber", [0, 0.6, -1.1], [0, 0, Math.PI / 2]), // rear wheel
    box([0.35, 0.3, 2], "paint_red", [0, 0.95, 0]), // frame
    box([0.4, 0.25, 0.7], "paint_black", [0, 1.15, -0.3]), // seat
    cyl(0.06, 0.06, 0.7, "chrome", [0, 1.1, 1], [Math.PI / 2.6, 0, 0]), // forks
    box([0.7, 0.08, 0.2], "chrome", [0, 1.35, 1.1]), // handlebars
    box([0.5, 0.4, 0.6], "steel", [0, 0.85, 0]), // engine
    box([0.42, 0.18, 0.5], "paint_red", [0, 1.05, 0.6]), // tank
  ],
  physics: { mass: 250, friction: 0.8, restitution: 0.05, flammable: true },
  config: {
    topSpeed: slider(180, 0, 300, 5, "Performance", "Top speed (km/h)"),
    acceleration: slider(7, 1, 10, 0.5, "Performance", "Acceleration"),
    handling: slider(7, 1, 10, 0.5, "Performance", "Handling"),
    suspension: slider(1, 0.2, 2, 0.1, "Chassis", "Suspension"),
    offRoad: checkbox(true, "Chassis", "Off-road tyres"),
  },
  interaction: { mode: "drive", verb: "ride", seatHeight: 0.8, posture: "sit" },
});

const airplane: Template = () => ({
  type: "aircraft",
  parts: [
    cyl(0.5, 0.5, 6, "paint_white", [0, 1.2, 0], [Math.PI / 2, 0, 0]), // fuselage along Z
    cone(0.5, 1.2, "paint_white", [0, 1.2, 3.4], [Math.PI / 2, 0, 0]), // nose
    box([7.5, 0.18, 1.4], "paint_blue", [0, 1.2, 0]), // main wing
    box([3, 0.16, 1], "paint_blue", [0, 1.5, -2.6]), // tailplane
    box([0.16, 1.2, 1], "paint_blue", [0, 1.9, -2.7]), // vertical stabilizer
    cyl(0.12, 0.12, 0.5, "rubber", [1, 0.4, 1], [0, 0, Math.PI / 2]), // wheels
    cyl(0.12, 0.12, 0.5, "rubber", [-1, 0.4, 1], [0, 0, Math.PI / 2]),
    cyl(0.12, 0.12, 0.5, "rubber", [0, 0.4, -1.8], [0, 0, Math.PI / 2]),
    cone(0.55, 0.3, "chrome", [0, 1.2, 4], [Math.PI / 2, 0, 0]), // spinner
  ],
  physics: { mass: 1200, friction: 0.4, restitution: 0.2, flammable: true },
  config: {
    liftPower: slider(1, 0.3, 2, 0.1, "Flight", "Lift power"),
    topSpeed: slider(60, 10, 160, 5, "Flight", "Top speed"),
    wingspan: slider(7.5, 4, 14, 0.5, "Body", "Wingspan"),
  },
  interaction: { mode: "fly", verb: "fly", seatHeight: 1.2, posture: "sit" },
});

// A hoverboard / skateboard — you STAND on it (posture: "stand").
const hoverboard: Template = () => ({
  type: "hoverboard",
  parts: [
    box([0.9, 0.12, 2.4], "paint_black", [0, 0.25, 0]), // deck
    box([0.95, 0.06, 0.5], "glass", [0, 0.18, 0.9]), // glowing front pad
    box([0.95, 0.06, 0.5], "glass", [0, 0.18, -0.9]), // glowing rear pad
    box([0.2, 0.18, 0.2], "fire", [0, 0.12, 1.0]), // thruster glow
    box([0.2, 0.18, 0.2], "fire", [0, 0.12, -1.0]),
  ],
  physics: { mass: 12, friction: 0.4, restitution: 0.05, flammable: false },
  config: {
    topSpeed: slider(50, 0, 140, 5, "Performance", "Top speed"),
    glow: checkbox(true, "Style", "Neon glow"),
  },
  interaction: { mode: "ride", verb: "ride", seatHeight: 0.32, posture: "stand" },
});

// A skateboard, modeled facing +Z — you stand on it sideways (posture inferred from type).
const skateboard: Template = () => ({
  type: "skateboard",
  parts: [
    box([0.7, 0.1, 2.4], "wood", [0, 0.22, 0]), // deck
    box([0.72, 0.04, 0.6], "paint_red", [0, 0.16, 0.85]), // grip pads
    box([0.72, 0.04, 0.6], "paint_red", [0, 0.16, -0.85]),
    cyl(0.16, 0.16, 0.5, "rubber", [0, 0.14, 0.85], [0, 0, Math.PI / 2]), // wheels
    cyl(0.16, 0.16, 0.5, "rubber", [0, 0.14, -0.85], [0, 0, Math.PI / 2]),
  ],
  physics: { mass: 5, friction: 0.5, restitution: 0.05, flammable: true },
  config: { topSpeed: slider(30, 0, 80, 5, "Performance", "Top speed") },
  interaction: { mode: "ride", verb: "ride", seatHeight: 0.3, posture: "stand-left" },
});

// A small motorboat, modeled facing +Z. Boats float on the river (see the driving controller).
const boat: Template = () => ({
  type: "boat",
  parts: [
    box([2.2, 0.5, 5], "paint_white", [0, 0.4, 0]),
    box([1.9, 0.4, 4.2], "wood", [0, 0.7, -0.1]),
    cone(1.05, 1.6, "paint_white", [0, 0.5, 2.9], [Math.PI / 2, 0, 0]), // bow (+Z)
    // open cockpit
    box([1.2, 0.18, 1.0], "paint_blue", [0, 0.86, -0.6]),
    box([1.0, 0.5, 0.16], "paint_blue", [0, 1.12, -1.1]),
    box([1.4, 0.42, 0.1], "glass", [0, 1.05, 0.1], [-0.5, 0, 0]),
    box([0.5, 0.7, 0.5], "steel", [0, 0.85, -2.5]), // outboard motor
  ],
  physics: { mass: 700, friction: 0.4, restitution: 0.1, flammable: false },
  config: {
    topSpeed: slider(40, 0, 120, 5, "Performance", "Top speed"),
  },
  interaction: { mode: "drive", verb: "sail", seatHeight: 0.85, posture: "sit" },
});

// A helicopter, modeled facing +Z. Flyable (mode "fly").
const helicopter: Template = () => ({
  type: "aircraft",
  parts: [
    sphere(1.1, "paint_blue", [0, 1.4, 0.4]), // cockpit bubble
    box([1.6, 1.4, 2.6], "paint_blue", [0, 1.4, 0]), // cabin
    box([1.4, 1.0, 1.0], "glass", [0, 1.55, 1.5]), // windshield
    box([0.35, 0.35, 3.4], "paint_blue", [0, 1.9, -2.6]), // tail boom
    box([0.1, 1.0, 0.5], "paint_blue", [0, 2.4, -4.1]), // tail fin
    { ...cyl(0.06, 0.06, 1.0, "paint_black", [0.35, 2.2, -4.2], [0, 0, Math.PI / 2]), spin: { axis: "x" as const, speed: 26, config: "rotorSpeed" } }, // tail rotor
    { ...cyl(0.06, 0.06, 1.0, "paint_black", [0.35, 2.2, -4.2], [Math.PI / 2, 0, 0]), spin: { axis: "x" as const, speed: 26, config: "rotorSpeed" } },
    cyl(0.18, 0.18, 0.6, "steel", [0, 2.4, 0]), // rotor mast
    { ...box([0.25, 0.08, 9], "paint_black", [0, 2.7, 0]), spin: { axis: "y" as const, speed: 16, config: "rotorSpeed" } }, // main rotor blade 1
    { ...box([9, 0.08, 0.25], "paint_black", [0, 2.7, 0]), spin: { axis: "y" as const, speed: 16, config: "rotorSpeed" } }, // main rotor blade 2
    cyl(0.07, 0.07, 2.4, "steel", [0.7, 0.4, 0], [Math.PI / 2, 0, 0]), // skids
    cyl(0.07, 0.07, 2.4, "steel", [-0.7, 0.4, 0], [Math.PI / 2, 0, 0]),
    box([0.08, 0.5, 0.08], "steel", [0.7, 0.7, 1]),
    box([0.08, 0.5, 0.08], "steel", [-0.7, 0.7, 1]),
    box([0.08, 0.5, 0.08], "steel", [0.7, 0.7, -1]),
    box([0.08, 0.5, 0.08], "steel", [-0.7, 0.7, -1]),
  ],
  physics: { mass: 2200, friction: 0.5, restitution: 0.1, flammable: true },
  config: {
    rotorSpeed: slider(1, 0, 3, 0.1, "Flight", "Rotor speed"),
    topSpeed: slider(55, 10, 150, 5, "Flight", "Top speed"),
    liftPower: slider(1.2, 0.3, 2, 0.1, "Flight", "Lift power"),
    handling: slider(6, 1, 10, 0.5, "Flight", "Handling"),
  },
  interaction: { mode: "fly", verb: "fly", seatHeight: 1.0, posture: "sit" },
});

const robot: Template = () => ({
  type: "character",
  parts: [
    box([1.4, 1.8, 0.8], "steel", [0, 2.4, 0]),
    box([1, 1, 0.8], "chrome", [0, 3.7, 0]),
    sphere(0.12, "fire", [0.25, 3.8, 0.42]),
    sphere(0.12, "fire", [-0.25, 3.8, 0.42]),
    cyl(0.2, 0.2, 1.4, "steel", [0.9, 2.4, 0]),
    cyl(0.2, 0.2, 1.4, "steel", [-0.9, 2.4, 0]),
    cyl(0.25, 0.25, 1.4, "steel", [0.4, 0.7, 0]),
    cyl(0.25, 0.25, 1.4, "steel", [-0.4, 0.7, 0]),
  ],
  physics: { mass: 300, friction: 0.7, restitution: 0.1, flammable: false },
  config: {
    eyeGlow: slider(1, 0, 3, 0.1, "Head", "Eye glow"),
    height: slider(1.8, 1, 4, 0.1, "Body", "Torso height"),
  },
});

// A low-poly firearm, modeled facing +Z (muzzle points forward). Wieldable (mode "wield"): pick it
// up with E and fire with F / left-click. The "force"/"range"/"fireRate" controls drive the shot.
const gun: Template = () => ({
  type: "gun",
  parts: [
    box([0.16, 0.5, 0.34], "steel", [0, 0.0, -0.32]), // grip
    box([0.2, 0.26, 1.5], "paint_black", [0, 0.42, 0.25]), // body/receiver
    cyl(0.07, 0.07, 1.1, "chrome", [0, 0.5, 0.95], [Math.PI / 2, 0, 0]), // barrel (+Z)
    box([0.16, 0.12, 0.5], "wood", [0, 0.3, -0.7]), // stock
    box([0.06, 0.18, 0.1], "steel", [0, 0.18, 0.5]), // trigger guard
    box([0.14, 0.3, 0.18], "paint_black", [0, 0.18, -0.05]), // magazine
    box([0.04, 0.08, 0.04], "steel", [0, 0.6, 1.45]), // front sight (marks the muzzle, +Z)
  ],
  physics: { mass: 4, friction: 0.6, restitution: 0.1, flammable: false },
  config: {
    force: slider(60, 5, 200, 5, "Ballistics", "Impact force"),
    range: slider(80, 10, 200, 5, "Ballistics", "Range"),
    fireRate: slider(6, 1, 20, 1, "Ballistics", "Fire rate (shots/s)"),
    automatic: checkbox(false, "Ballistics", "Full-auto"),
  },
  interaction: { mode: "wield", verb: "equip" },
});

const crate: Template = () => ({
  type: "prop",
  parts: [box([1.4, 1.4, 1.4], "wood", [0, 0.7, 0])],
  physics: { mass: 30, friction: 0.6, restitution: 0.2, flammable: true },
  config: {
    size: slider(1.4, 0.5, 4, 0.1, "Physics", "Size"),
    mass: slider(30, 1, 500, 1, "Physics", "Mass (kg)"),
  },
});

// keyword → template, checked in order (more specific first)
const TEMPLATES: Array<{ keys: string[]; name: string; build: Template }> = [
  // Weapons first so "rocket launcher" → gun, not the rocket vehicle.
  { keys: ["gun", "pistol", "rifle", "revolver", "shotgun", "smg", "blaster", "raygun", "ray gun", "laser gun", "cannon", "bazooka", "rocket launcher", "launcher", "minigun", "uzi", "ak47", "ak-47", "musket", "sniper", "weapon", "firearm", "handgun"], name: "gun", build: gun },
  { keys: ["motorcycle", "motorbike", "superbike", "super bike", "sportbike", "sport bike", "off-road bike", "offroad bike", "dirt bike", "dirtbike", "bicycle", "pushbike", "mountain bike", "bmx", "cycle", "bike", "scooter", "moped"], name: "motorcycle", build: motorcycle },
  { keys: ["supercar", "sports car", "race car", "racing car", "car", "vehicle", "ferrari", "lamborghini", "truck", "pickup", "pick-up", "bus", "van", "jeep", "suv", "buggy", "dune buggy", "go-kart", "go kart", "kart", "tank", "hovercraft", "hover car", "atv", "quad bike", "quad", "taxi", "cab", "police car", "cop car", "ambulance", "convertible", "sedan", "coupe", "roadster"], name: "supercar", build: supercar },
  { keys: ["taj mahal", "taj", "palace", "temple", "monument", "mahal"], name: "tajMahal", build: tajMahal },
  { keys: ["helicopter", "chopper", "heli"], name: "helicopter", build: helicopter },
  { keys: ["airplane", "aeroplane", "plane", "jet", "aircraft", "fighter jet"], name: "airplane", build: airplane },
  { keys: ["skateboard", "skate board", "longboard", "snowboard", "surfboard"], name: "skateboard", build: skateboard },
  { keys: ["hoverboard", "hover board", "segway"], name: "hoverboard", build: hoverboard },
  { keys: ["boat", "speedboat", "motorboat", "ship", "yacht", "canoe", "dinghy"], name: "boat", build: boat },
  { keys: ["racing track", "race track", "racetrack", "track", "circuit", "loop"], name: "racingTrack", build: racingTrack },
  { keys: ["bowling ball"], name: "bowlingBall", build: bowlingBall },
  { keys: ["bowling pins", "pins", "bowling"], name: "bowlingPins", build: bowlingPins },
  { keys: ["campfire", "bonfire", "fire", "flame", "torch"], name: "campfire", build: campfire },
  { keys: ["rocket", "spaceship", "missile"], name: "rocket", build: rocket },
  { keys: ["robot", "mech", "android", "droid"], name: "robot", build: robot },
  { keys: ["tree", "oak", "pine", "forest"], name: "tree", build: tree },
  { keys: ["house", "home", "cabin", "building", "hut"], name: "house", build: house },
  { keys: ["ball", "sphere", "marble", "orb"], name: "bowlingBall", build: bowlingBall },
  { keys: ["crate", "box", "cube", "block", "barrel"], name: "crate", build: crate },
];

// Deterministic string hash → used to vary the generic fallback by prompt without Math.random.
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const GENERIC_MATERIALS = ["paint_blue", "paint_green", "paint_yellow", "stone", "wood", "steel", "marble"];
const GENERIC_PRIMS = ["box", "sphere", "cylinder", "cone"] as const;

/** Procedural fallback: always produces a valid, sensible object for any prompt. */
function genericObject(label: string): ReturnType<Template> {
  const h = hashString(label);
  const partCount = 1 + (h % 3);
  // NOTE: use unsigned right shift (>>>) — signed >> can go negative for h > 2^31,
  // which would yield a negative array index and an undefined material.
  const material = GENERIC_MATERIALS[h % GENERIC_MATERIALS.length];
  const accent = GENERIC_MATERIALS[(h >>> 3) % GENERIC_MATERIALS.length];
  const parts: PartSpec[] = [];
  let y = 0;
  for (let i = 0; i < partCount; i++) {
    const prim = GENERIC_PRIMS[(h >>> (i * 2)) % GENERIC_PRIMS.length];
    const w = 0.8 + ((h >>> i) % 5) * 0.3;
    const mat = i === 0 ? material : accent;
    if (prim === "sphere") {
      parts.push(sphere(w * 0.6, mat, [0, y + w * 0.6, 0]));
      y += w * 1.2;
    } else if (prim === "cone") {
      parts.push(cone(w * 0.6, w, mat, [0, y + w * 0.5, 0]));
      y += w;
    } else if (prim === "cylinder") {
      parts.push(cyl(w * 0.5, w * 0.5, w, mat, [0, y + w * 0.5, 0]));
      y += w;
    } else {
      parts.push(box([w, w, w], mat, [0, y + w * 0.5, 0]));
      y += w;
    }
  }
  return {
    type: "object",
    parts,
    physics: { mass: 20 + (h % 80), friction: 0.6, restitution: 0.3, flammable: (h & 1) === 1 },
    config: {
      scale: slider(1, 0.2, 5, 0.1, "Physics", "Scale"),
      mass: slider(20 + (h % 80), 1, 500, 1, "Physics", "Mass (kg)"),
      bounciness: slider(0.3, 0, 1, 0.05, "Physics", "Restitution"),
    },
  };
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Precompiled word-boundary matchers so "orb" doesn't match inside "glorbax",
// while multi-word keys like "taj mahal" still match.
const TEMPLATE_MATCHERS = TEMPLATES.map((t) => ({
  ...t,
  res: t.keys.map((k) => new RegExp(`\\b${escapeRegExp(k)}\\b`, "i")),
}));

export interface TemplateSuggestion {
  /** Internal template name (e.g. "supercar"). */
  name: string;
  /** The keyword to surface/spawn (e.g. "police car"). */
  keyword: string;
}

/**
 * Typeahead for the prompt box: known template keywords matching the partially-typed text,
 * best match first (exact > prefix > text-extends-keyword > substring). Selecting one spawns
 * that template instantly with no AI round-trip. Pure + tested.
 */
export function suggestTemplates(text: string, limit = 5): TemplateSuggestion[] {
  const subject = extractSubject(text).toLowerCase().trim();
  if (subject.length < 2) return [];
  const candidates: Array<TemplateSuggestion & { score: number }> = [];
  for (const t of TEMPLATES) {
    for (const k of t.keys) {
      let score = -1;
      if (k === subject) score = 0;
      else if (k.startsWith(subject)) score = 1;
      else if (subject.startsWith(`${k} `)) score = 2; // typed past it ("car with wings")
      else if (k.includes(subject)) score = 3;
      if (score >= 0) candidates.push({ name: t.name, keyword: k, score });
    }
  }
  candidates.sort((a, b) => a.score - b.score || a.keyword.length - b.keyword.length);
  const out: TemplateSuggestion[] = [];
  const seenNames = new Set<string>();
  for (const c of candidates) {
    if (seenNames.has(c.name)) continue; // one chip per template
    seenNames.add(c.name);
    // Display/spawn the full completion, not the typed fragment: "heli" should offer
    // "helicopter" (the longest exact-or-prefix keyword of this template), so the spawned
    // object is labeled properly. Substring matches keep the keyword that matched.
    const completions = candidates.filter((x) => x.name === c.name && x.score <= 1);
    const keyword = completions.reduce((best, x) => (x.keyword.length > best.length ? x.keyword : best), c.keyword);
    out.push({ name: c.name, keyword });
    if (out.length >= limit) break;
  }
  return out;
}

/** Strip a leading "create/make/spawn/build a/an" so the label reads cleanly. */
export function extractSubject(prompt: string): string {
  return prompt
    .trim()
    .replace(/^\s*(please\s+)?(create|make|spawn|build|generate|add|give me|i want|place)\s+(the|some|an|a)?\s*/i, "")
    .replace(/[.!?]+$/, "")
    .trim();
}

/**
 * Generate a validated object spec from a prompt. Always succeeds (falls back to generic).
 * @param prompt natural-language input
 * @param id unique id to assign (caller-controlled for determinism)
 */
export function generateSpec(prompt: string, id: string): GeneratedResult {
  const subject = extractSubject(prompt) || prompt.trim() || "object";
  const label = titleCase(subject).slice(0, 40) || "Object";
  for (const t of TEMPLATE_MATCHERS) {
    if (t.res.some((re) => re.test(prompt))) {
      const built = t.build(label, prompt);
      return {
        source: "template",
        matched: t.name,
        spec: { id, label, prompt, ...built },
      };
    }
  }

  const built = genericObject(label);
  return { source: "generic", spec: { id, label, prompt, ...built } };
}
