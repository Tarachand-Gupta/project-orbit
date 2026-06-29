# Object & Interaction API — Project Orbit

This is the contract every generated object follows. Humans and AI agents can read this to create
objects, expose controls, and make objects interactable (drive / fly / ride). It is the same
schema the LLM is asked to produce and the engine validates (`src/objects/spec.ts`).

## Object Spec

```jsonc
{
  "type": "vehicle",                 // semantic type — drives default interaction (see below)
  "label": "Red Sports Car",
  "parts": [                          // 1..60 low-poly primitive parts, composed in local space
    { "primitive": "box", "size": [4,0.7,1.9], "position": [0,0.6,0], "rotation": [0,0,0], "material": "paint_red" },
    // moving part: a helicopter main rotor that spins about Y, scaled live by the "rotorSpeed" control
    { "primitive": "box", "size": [9,0.08,0.25], "position": [0,2.7,0], "material": "paint_black",
      "spin": { "axis": "y", "speed": 16, "config": "rotorSpeed" } }
  ],
  "physics": { "mass": 1500, "friction": 0.7, "restitution": 0.1, "flammable": false,
               "fire": false, "fixed": false },
  "config": {                         // auto-rendered controls (sliders/checkboxes/steppers)
    "topSpeed": { "type": "slider", "label": "Top speed", "tab": "Performance",
                  "min": 0, "max": 400, "step": 5, "value": 250 }
  },
  "interaction": { "mode": "drive", "verb": "drive", "seatHeight": 0.7, "posture": "sit" }
}
```

### Primitives (size array meaning)
`box[w,h,d]` · `sphere[r]` · `cylinder[rTop,rBottom,h]` · `cone[r,h]` · `capsule[r,length]` ·
`torus[r,tube]` · `tetrahedron[r]`. Default orientation is +Y up; build resting on the ground
(lowest point at y≈0), forward = +Z. The engine re-grounds objects on spawn, but model them
upright.

### Materials
`paint_red, paint_blue, paint_yellow, paint_green, paint_white, paint_black, glass, chrome,
rubber, wood, bark, leaf, stone, marble, gold, sand, asphalt, fire, ember, brick, steel` — or any
`#rrggbb` hex. `fire`/`ember` glow. Tag `physics.flammable: true` to let fire ignite it; tag
`physics.fire: true` to make it an igniter (e.g. a campfire).

### Moving parts (`spin`)
Any part may declare `spin: { axis: "x"|"y"|"z", speed: number /* rad/s */, config?: string }` to
rotate continuously — helicopter/drone main rotors (axis `"y"`), tail rotors, wheels, turbines, fans.
If `config` names a control key, that control's value scales the speed live (0 = stopped). Rotorcraft
(helicopter/chopper/drone…) get a spinning main rotor **automatically** even if `spin` is omitted.

### Config controls (the tweak panel + API)
- `slider`  → `{ min, max, step, value:number }`
- `checkbox`→ `{ value:boolean }`  (LLM array form uses `value: 0|1`)
- `stepper` → `{ min, max, step, value:number }`, shown with ×5/×10/×20 multipliers
- `tab` groups controls into the bottom-right panel's tabs.

#### Controls that change BEHAVIOUR live
These reserved control **keys** are read every frame by the engine, so dragging them in the panel
actually changes how the object moves (a slider's position within its own `min..max` maps onto a
playable range, so any units work):

| key | affects |
| --- | ------- |
| `topSpeed` (or `maxSpeed`/`speed`) | max drive/fly speed |
| `acceleration` (or `accel`/`power`) | how fast it reaches top speed |
| `handling` (or `turnRate`/`steering`) | steering / yaw turn rate |
| `liftPower` (or `lift`/`climbRate`/`thrust`) | aircraft climb rate |
| `rotorSpeed` | helicopter rotor speed **and** lift — at 0 the rotor stops and it can't take off |
| `scale` | overall size multiplier |
| `mass` (or `weight`) | body mass (kg) |
| `bounciness` (or `restitution`) | how much it bounces (0..0.95) |

Give vehicles `topSpeed` + `acceleration` + `handling`; aircraft `topSpeed` + `liftPower`
(+ `rotorSpeed` for helicopters); bouncy props a `bounciness`; resizable props a `scale`.

## Interaction (controls) API

Declare `interaction.mode` so the player can control the object. **Enter/exit is always `E`**
(GTA-style): walk within range, press **E** to enter, **E** again to exit.

| mode    | use for                                   | controls while controlling |
| ------- | ----------------------------------------- | -------------------------- |
| `drive` | cars, trucks, buses, jeeps, buggies, bikes, karts, tanks, hovercraft, boats | **W/S** throttle · **A/D** steer (drives off cliffs/ramps and arcs under gravity) |
| `fly`   | planes, jets, helicopters, drones, rockets| **W/S** forward cyclic (nose dips, accelerates) · **A/D** yaw (banks into turns) · **Space** ascend · **Shift** descend — GTA-style |
| `ride`  | hoverboards, skateboards, mounts/animals  | same as drive |
| `none`  | props, buildings, scenery (default)       | — |

Also set:
- **`seatHeight`** — height above the object origin where the rider is placed (car seat ~0.6, board deck ~0.28).
- **`posture`** — how the avatar is posed on it (inferred from `type` if omitted, and a clear type like "skateboard" overrides a wrong guess):
  - `"sit"` — cars, boats, planes
  - `"straddle"` — motorbikes, horses/mounts
  - `"stand"` — hoverboards, segways, platforms
  - `"stand-left"` / `"stand-right"` — skateboards/snowboards/surf (sideways stance)
  - `"lie"` — hang gliders, luge, sleds (prone)

Vehicles are automatically kept **flat on the terrain, upright** (parked and driven) — they never float or tip, and they conform to slopes. Model them upright resting at y≈0; the engine does the rest.

If `interaction` is omitted, it is **inferred from `type`**: types containing
plane/jet/helicopter/drone/aircraft/spaceship → `fly`; car/truck/bus/bike/boat/tank/kart/vehicle →
`drive`; otherwise `none`. So at minimum, give a drivable thing `type: "vehicle"` and a flyable
thing `type: "aircraft"`.

## Programmatic API — `window.game`

```ts
game.spawn(prompt)            // create from natural language → { ok, id, label }
game.list()                  // all objects with live config
game.get(id) / game.describe(id)   // spec / documented schema incl. interaction
game.setConfig(id, key, val) // live-tune a control
game.select(id)              // open its controls panel
game.setHidden(id, bool)     // unload/hide (keeps it) ↔ reload/show
game.remove(id) / game.clear()
game.getLogs()               // structured error log (agents self-correct from this)
game.save() / game.load()    // IndexedDB persistence
game.setProvider("local"|"gemini"|"kimi"|"deepseek")
game.setTimeOfDay(0..1 | null)     // null = real local time
```

Agents: read `game.getLogs()` after a spawn to detect a failed/invalid object and regenerate.
