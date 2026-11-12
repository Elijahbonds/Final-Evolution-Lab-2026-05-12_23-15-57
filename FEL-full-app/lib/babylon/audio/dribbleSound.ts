// dribbleSound.ts — THE BALL ON THE FLOOR MAKES A SOUND (hoops-sound, phase 11a, 2026-11-12).
//
// The audit (docs/HOOPS-AAA-GAP-SHOW.md §3.7, sinker 1): the most-heard sound in basketball was not in the game. The ball bounced on
// every handler's dribble and no cue fired (anim/Dribble.ts, anim/ballCarry.ts, core/BasketballCore.ts called no sound; handleFx.ts
// described "the dribble's pound" that did not exist). This is the pure half of the fix:
//   · FloorContact: one call per drawn frame with the ball's height over its floor contact; it reports the frame the ball meets the
//     floor, ONCE per bounce (it re-arms only after the ball has risen again), with the speed it came down at;
//   · the level: the bounce's speed sets it (a hard pound is louder than a soft one), the player's handler at the dribble volume and
//     every AI handler at a share of it; and a pan from where the ball is on screen.
// anim/ballCarry.ts watches THE BALL itself (one watcher per ball, read after each frame is drawn, whoever moved it): the plain dribble,
// the handle moves' paths, the 1v1 rival and all six 3v3 bodies, the last bounce into a gather, a bounce pass and a loose ball. One
// detector per ball, so one contact is never heard twice. The catch is core/BallHandling.ts PassFlight's.
import { feel } from '../../feel-panel/feel';

/** feel knob `hoops.dribbleSoundOn` default: the ball meeting the floor plays the bounce (1). 0 = no bounce sound, as before. */
export const DRIBBLE_SOUND_ON = 1;
/** feel knob `hoops.dribbleSoundVol` default: the player's dribble at a full-speed bounce (SoundKit volume; the bank's gain applies). */
export const DRIBBLE_SOUND_VOL = 0.6;
/** feel knob `hoops.dribbleSoundAiK` default: an AI handler's dribble as a share of the player's. */
export const DRIBBLE_SOUND_AI_K = 0.5;
/** feel knob `hoops.passCatchSoundOn` default: a 3v3 pass is heard in the hands when it arrives (1). 0 = no catch sound, as before. */
export const PASS_CATCH_SOUND_ON = 1;
/** feel knob `hoops.passCatchVol` default: the catch's level. */
export const PASS_CATCH_VOL = 0.7;

/** The bounce speed that plays at the full dribble volume: the hoops dribble's floor contact at 2 bounces a second (Dribble.ts: the
 *  pushed bounce's peak speed 3.1·H·hz, H ≈ 0.86 m) is about 5 m/s. */
export const BOUNCE_REF_MPS = 5;
/** The quietest share a slow bounce plays at, and the loudest a hard one does. */
export const BOUNCE_LEVEL_MIN = 0.3, BOUNCE_LEVEL_MAX = 1.25;
/** Contact: the ball's centre within this of its floor contact on the way down… */
export const CONTACT_BAND_M = 0.03;
/** …or its fall stopped since the last frame, and that frame was within reach of the floor: at most this many frames of its fall
 *  above it (a pushed bounce speeds up into the floor, so a frame covers up to about 1.3 of the last frame's travel). A ball that slows
 *  in the air (a hand meeting it, a move's re-aim) further up than that is not a contact. */
export const REACH_FRAMES = 1.3;
/** A new contact counts only after the ball has risen this far off the floor (one sound per bounce). */
export const REARM_M = 0.2;
/** Slower than this downward is not a bounce (a ball set down, a hand-off low to the floor). */
export const MIN_DESCENT_MPS = 0.4;
/** No ball moves faster than this: a bigger step between two frames is a jump, not a fall. */
export const MAX_BALL_MPS = 15;

/**
 * One ball's floor contacts. `step(h, dt)` each drawn frame, `h` = the ball centre's height above its contact height (0 = touching
 * the floor), `dt` the frame's seconds. Returns the impact speed (m/s, > 0) on the frame of a contact, else 0.
 */
export class FloorContact {
  private prevH = Number.NaN;
  private prevV = 0;
  private armed = true;
  /** Contacts reported so far (a probe reads it). */
  count = 0;
  step(h: number, dt: number): number {
    if (!Number.isFinite(h)) { this.reset(); return 0; }
    if (!(dt > 0)) return 0;   // a paused frame (hit-stop, pause): nothing moved, nothing is read
    if (!Number.isFinite(this.prevH)) { this.prevH = h; this.prevV = 0; if (h > REARM_M) this.armed = true; return 0; }
    const v = (h - this.prevH) / dt;
    // faster than a ball moves is a jump (a reset, a hand-over across the body): no speed is read across it
    if (Math.abs(v) > MAX_BALL_MPS) { this.prevH = h; this.prevV = 0; if (h > REARM_M) this.armed = true; return 0; }
    let hit = 0;
    if (this.armed) {
      // it was falling and has lost more than half its fall since (coming up, or still down but slower), and the last frame was close
      // enough to reach the floor in one frame of that fall: it met the floor between the two frames (a long frame can straddle the
      // contact with both samples well off the floor). Its level is the fall it had (this frame's average mixes the fall and the rise).
      if (this.prevV < -MIN_DESCENT_MPS && v > this.prevV * 0.5 && this.prevH <= CONTACT_BAND_M - REACH_FRAMES * this.prevV * dt) hit = -this.prevV;
      // or it is on the way down and meets the floor inside this frame's travel (its level: the faster of this frame's fall and the
      // last one's, as this frame may already hold the first of the rise)
      else if (v < -MIN_DESCENT_MPS && h <= Math.max(CONTACT_BAND_M, -v * dt * 0.5)) hit = Math.max(-v, -this.prevV);
      if (hit > 0) { this.armed = false; this.count++; }
    } else if (h > REARM_M) this.armed = true;
    this.prevH = h; this.prevV = v;
    return hit;
  }
  /** Forget the ball (it left this carry, or a frame was not drawn by it): the next frame starts fresh, armed. */
  reset(): void { this.prevH = Number.NaN; this.prevV = 0; this.armed = true; }
}

/** Who a carry's dribble belongs to: the player's handler, an AI handler, or a carry that makes no sound. */
export type DribbleSoundRole = 'player' | 'ai' | 'off';
/** Whose ball meets the floor: a carry's role, or 'loose' (no carry has it: a rebound, a gather's last bounce) at the player's level. */
export type BounceRole = DribbleSoundRole | 'loose';
const carriesOn = new WeakMap<object, number>();
/**
 * The role a hoops carry plays its bounce at. Asked for: that. Not asked (every caller today): the FIRST hoops carry mounted on a scene
 * is the player's, every later one an AI handler's. assumption: that holds in every court mode — 1v1 mounts mine then the rival's,
 * 3v3 mounts [me, ...mates, ...foes], the 3-point contest mounts one. A mode can name it (BallCarryOpts.soundRole) when it is next edited.
 */
export function claimDribbleRole(scene: object, asked?: DribbleSoundRole): DribbleSoundRole {
  const n = carriesOn.get(scene) ?? 0;
  carriesOn.set(scene, n + 1);
  return asked ?? (n === 0 ? 'player' : 'ai');
}

/** The bounce's SoundKit volume for a contact at `speedMps` by a `role` carry (0 for 'off'). */
export function bounceVolume(speedMps: number, role: BounceRole): number {
  if (role === 'off' || !(speedMps > 0)) return 0;
  const k = Math.max(BOUNCE_LEVEL_MIN, Math.min(BOUNCE_LEVEL_MAX, speedMps / BOUNCE_REF_MPS));
  const v = feel('hoops.dribbleSoundVol', DRIBBLE_SOUND_VOL) * k;
  return role === 'ai' ? v * feel('hoops.dribbleSoundAiK', DRIBBLE_SOUND_AI_K) : v;
}

/** The pan for a sound `rightM` metres to the camera's right at `distM` from it: the angle off the view's centre, gentle and capped. */
export function panFor(rightM: number, distM: number): number {
  if (!Number.isFinite(rightM) || !Number.isFinite(distM)) return 0;
  const p = (rightM / Math.max(1, distM)) * 1.2;
  return Math.max(-0.7, Math.min(0.7, p));
}
