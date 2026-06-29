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
    { "primitive": "box", "size": [4,0.7,1.9], "position": [0,0.6,0], "rotation": [0,0,0], "material": "paint_red" }
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

### Config controls (the tweak panel + API)
- `slider`  → `{ min, max, step, value:number }`
- `checkbox`→ `{ value:boolean }`  (LLM array form uses `value: 0|1`)
- `stepper` → `{ min, max, step, value:number }`, shown with ×5/×10/×20 multipliers
- `tab` groups controls into the bottom-right panel's tabs.

## Interaction (controls) API

Declare `interaction.mode` so the player can control the object. **Enter/exit is always `E`**
(GTA-style): walk within range, press **E** to enter, **E** again to exit.

| mode    | use for                                   | controls while controlling |
| ------- | ----------------------------------------- | -------------------------- |
| `drive` | cars, trucks, buses, bikes, karts, boats  | **W/S** throttle · **A/D** steer |
| `fly`   | planes, jets, helicopters, drones, rockets| **W/S** throttle · **A/D** yaw · **Space** ascend · **Shift** descend |
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
