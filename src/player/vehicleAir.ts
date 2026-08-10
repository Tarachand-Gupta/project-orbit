/**
 * Arcade airborne physics for kinematic ground vehicles (bikes, boats, and cars when the realistic
 * raycast mode is off). A kinematic vehicle normally hugs the terrain surface, which is exactly why
 * it used to "stick" to a cliff face and slide down instead of launching. This pure step decides,
 * each frame, whether the ground has dropped away faster than the vehicle would fall — if so the
 * vehicle goes airborne and follows a ballistic arc under gravity until it lands. Pure + tested.
 */

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

export interface AirState {
  airborne: boolean;
  /** Vertical velocity (m/s) while airborne. */
  vy: number;
}

export interface AirStep extends AirState {
  /** New world Y for this frame. */
  y: number;
  /** Nose pitch (radians) to tilt into the arc; 0 on the ground. */
  pitch: number;
  /** True on the frame the vehicle just touched back down (for landing effects). */
  landed: boolean;
}

/** Speed (m/s) below which we don't auto-launch off an edge (prevents jitter when crawling). */
const LAUNCH_MIN_SPEED = 2.5;

/**
 * Advance a kinematic vehicle's vertical motion for one frame.
 *
 * @param curY      current vehicle Y
 * @param surfaceY  terrain (or water) surface Y at the vehicle's new XZ, incl. ride clearance
 * @param prevY     vehicle Y last frame (to carry ramp/jump launch momentum upward)
 * @param speed     horizontal speed (signed) m/s
 * @param state     previous {airborne, vy}
 * @param dt        timestep (s)
 * @param gravity   downward accel (m/s²)
 * @param onWater   boats floating — never go airborne
 */
export function vehicleVerticalStep(
  curY: number,
  surfaceY: number,
  prevY: number,
  speed: number,
  state: AirState,
  dt: number,
  gravity = 32,
  onWater = false,
): AirStep {
  let airborne = state.airborne;
  let vy = state.vy;
  let y: number;
  let pitch = 0;
  let landed = false;

  if (airborne) {
    vy -= gravity * dt;
    y = curY + vy * dt;
    if (y <= surfaceY) {
      // Touched down.
      y = surfaceY;
      airborne = false;
      vy = 0;
      landed = true;
    } else {
      // Nose follows the arc: pitches up while rising, down while falling.
      pitch = clamp(-vy / Math.max(8, Math.abs(speed) + 6), -0.5, 0.5);
    }
  } else {
    // On the ground: follow the surface, UNLESS it drops away faster than we'd fall this frame
    // (a cliff or ramp lip) while we carry enough speed — then take off.
    const fallThisFrame = 0.5 * gravity * dt * dt + 0.18;
    if (!onWater && curY - surfaceY > fallThisFrame && Math.abs(speed) > LAUNCH_MIN_SPEED) {
      airborne = true;
      // Carry any upward momentum from a ramp (how fast we climbed last frame); flat cliffs start ~0.
      vy = clamp((curY - prevY) / dt, 0, 22);
      y = curY + vy * dt;
    } else {
      y = surfaceY;
    }
  }

  return { y, airborne, vy, pitch, landed };
}
