// poseControl — your body as the controller, for every mode at once.
//
// MOVEMENT PLAY P3 (2026-09-24): FROZEN — the P1 baseline mapper. Nothing plays through this any more: body play is the
// seam (lib/pose/BodyReader → lib/input/bodyFloor, one profile per mode, run by the harness). It is kept unchanged as
// the BEFORE the seam is measured against, and it is imported only by lib/pose/baseline.ts, scripts/body/baseline.mts
// and its own tests (lib/babylon/core/bodySeam.scan.test.ts pins that list). Do not tune it; do not wire it back in.
// Everything below describes it as it shipped.
//
// THE REASON THIS IS ONE FILE AND NOT THIRTY-THREE. Modes do not read a camera; they read InputBus, whose whole
// contract is four event shapes (stick / dpad / button / trigger) and whose emit() is already called directly by
// the touch overlay. So body control is not a feature added to each game — it is another input device. Nothing in
// any mode file changes, and a mode written next year gets it for free.
//
// This module is PURE: landmarks in, FelInput out. No camera, no DOM, no Babylon. The runtime bridge that owns the
// video element is a thin wrapper around it (lib/input/poseSource.ts), which means the mapping — the part that is
// actually hard to get right — is testable frame by frame without a webcam.
//
// ── The three things that make gesture control unplayable, and what is done about each ──────────────────────────
//
//   1. CHATTER. A threshold crossed at 30fps fires ten times in a third of a second. Every gesture here is a
//      Schmitt trigger: it turns on at one level and off at a LOWER one, so a hand hovering at the boundary
//      cannot machine-gun the button.
//
//   2. A HELD DIRECTION THAT NEVER RELEASES. If tracking drops while you are leaning, the stick stays pushed and
//      your character walks into a wall until the heat death of the universe. `release()` exists for exactly that
//      and the bridge calls it the moment the body is not present — absence is not zero, it is unknown, and the
//      only safe reading of unknown is hands off.
//
//   3. EVERY BODY IS A DIFFERENT SIZE AND STANDS A DIFFERENT DISTANCE AWAY. Nothing is measured in absolute image
//      units; everything is measured against a CALIBRATION taken while standing still, and in units of the
//      player's own shoulder width, so a tall adult far away and a short kid up close get the same game.

import type { FelInput } from '../babylon/core/InputBus';

export interface PoseLandmark { x: number; y: number; visibility?: number }
export interface PoseInput { landmarks: readonly PoseLandmark[]; present?: boolean }

/** MediaPipe pose indices, named. */
export const IDX = {
  shoulderL: 11, shoulderR: 12,
  elbowL: 13, elbowR: 14,
  wristL: 15, wristR: 16,
  hipL: 23, hipR: 24,
  kneeL: 25, kneeR: 26,
  ankleL: 27, ankleR: 28,
} as const;

/** Below this a landmark is a guess, and a guess must not press a button. */
export const MIN_VISIBILITY = 0.5;

/**
 * What "standing still, arms down" looks like for this player, in this room, at this distance. Every threshold
 * below is expressed against it.
 */
export interface Calibration {
  /** Mid-hip height when standing. */
  hipY: number;
  /** Mid-shoulder height when standing. */
  shoulderY: number;
  /** Shoulder width — the ruler everything else is measured in. */
  shoulderW: number;
  /** Where the body's centre sits, so leaning is measured from where they actually stand. */
  centreX: number;
}

/** Turn-on and turn-off levels, in shoulder-widths unless stated. Kept in one place because tuning is a whole job. */
export const T = {
  /** Lean, as a fraction of shoulder width, before the stick reads anything at all. */
  leanDead: 0.18,
  /** Lean that counts as full stick. */
  leanFull: 0.85,
  /** Squat depth (hip drop / shoulder width) where the charge starts and where it is full. */
  squatStart: 0.14,
  squatFull: 0.72,
  /** Jump: both ankles risen above the standing ankle line, in shoulder widths. */
  jumpOn: 0.16,
  jumpOff: 0.08,
  /** Arm raised: wrist above shoulder by this much turns on; it turns off lower. */
  raiseOn: 0.10,
  raiseOff: 0.02,
  /** Arm extended sideways: wrist out from shoulder, in shoulder widths. */
  reachOn: 0.95,
  reachOff: 0.70,
} as const;

/** The gestures, and the pad event each one is. One gesture, one action — nothing is overloaded. */
export type Gesture = 'jump' | 'raiseL' | 'raiseR' | 'raiseBoth' | 'reachL' | 'reachR';

export const GESTURE_BUTTON: Record<Gesture, 'A' | 'B' | 'X' | 'Y' | 'L1' | 'R1'> = {
  jump: 'A',
  raiseR: 'B',
  raiseL: 'X',
  raiseBoth: 'Y',
  reachR: 'R1',
  reachL: 'L1',
};

/** What a player is told to do, in the order the calibration card lists them. */
export const GESTURE_LABEL: Record<Gesture, string> = {
  jump: 'Jump',
  raiseR: 'Right hand up',
  raiseL: 'Left hand up',
  raiseBoth: 'Both hands up',
  reachR: 'Right arm out',
  reachL: 'Left arm out',
};

function vis(l: PoseLandmark | undefined): boolean {
  return !!l && (l.visibility === undefined || l.visibility >= MIN_VISIBILITY);
}

function mid(a: PoseLandmark, b: PoseLandmark): { x: number; y: number } {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Everything the mapper needs from one frame, or null when the frame cannot be trusted. */
export function readBody(frame: PoseInput): {
  hip: { x: number; y: number };
  shoulder: { x: number; y: number };
  shoulderW: number;
  ankleY: number;
  wristL: PoseLandmark | null;
  wristR: PoseLandmark | null;
  shoulderL: PoseLandmark;
  shoulderR: PoseLandmark;
} | null {
  if (frame.present === false) return null;
  const l = frame.landmarks;
  const sL = l[IDX.shoulderL], sR = l[IDX.shoulderR], hL = l[IDX.hipL], hR = l[IDX.hipR];
  if (!vis(sL) || !vis(sR) || !vis(hL) || !vis(hR)) return null;

  const shoulderW = Math.abs(sR.x - sL.x);
  // A shoulder width near zero means the person is edge-on or the tracker is lost; dividing by it would turn
  // a twitch into full stick deflection.
  if (!(shoulderW > 0.02)) return null;

  const aL = l[IDX.ankleL], aR = l[IDX.ankleR];
  const ankles = [aL, aR].filter(vis) as PoseLandmark[];

  return {
    hip: mid(hL, hR),
    shoulder: mid(sL, sR),
    shoulderW,
    // Feet may be out of shot — that is normal when a phone is close — so the ankle line is optional and
    // anything that needs it checks for NaN rather than pretending the floor is at zero.
    ankleY: ankles.length ? Math.max(...ankles.map((a) => a.y)) : NaN,
    wristL: vis(l[IDX.wristL]) ? l[IDX.wristL] : null,
    wristR: vis(l[IDX.wristR]) ? l[IDX.wristR] : null,
    shoulderL: sL,
    shoulderR: sR,
  };
}

/** Build a calibration from a frame taken while the player stands still. Null when the frame is not usable. */
export function calibrateFrom(frame: PoseInput): Calibration | null {
  const b = readBody(frame);
  if (!b) return null;
  return { hipY: b.hip.y, shoulderY: b.shoulder.y, shoulderW: b.shoulderW, centreX: b.hip.x };
}

function ramp(v: number, from: number, to: number): number {
  if (to === from) return 0;
  return Math.max(0, Math.min(1, (v - from) / (to - from)));
}

/**
 * The mapper. One instance per player; feed it frames and it returns the events that changed — never the ones
 * that did not, because re-emitting a held button every frame is how a menu ends up unusable.
 */
export class PoseController {
  private on: Record<Gesture, boolean> = {
    jump: false, raiseL: false, raiseR: false, raiseBoth: false, reachL: false, reachR: false,
  };
  private lastStick = { x: 0, y: 0 };
  private lastTrigger = 0;
  private hadBody = false;

  constructor(private calibration: Calibration) {}

  recalibrate(c: Calibration): void {
    this.calibration = c;
  }

  /** Hands off everything. Called when the body leaves the frame, and when body control is switched off. */
  release(): FelInput[] {
    const out: FelInput[] = [];
    (Object.keys(this.on) as Gesture[]).forEach((g) => {
      if (this.on[g]) { out.push({ t: 'button', btn: GESTURE_BUTTON[g], pressed: false }); this.on[g] = false; }
    });
    if (this.lastStick.x !== 0 || this.lastStick.y !== 0) {
      out.push({ t: 'stick', side: 'L', x: 0, y: 0 });
      this.lastStick = { x: 0, y: 0 };
    }
    if (this.lastTrigger !== 0) { out.push({ t: 'trigger', side: 'R', value: 0 }); this.lastTrigger = 0; }
    this.hadBody = false;
    return out;
  }

  /** One frame in, the events that changed out. */
  read(frame: PoseInput): FelInput[] {
    const b = readBody(frame);
    if (!b) {
      // ABSENCE IS NOT ZERO — it is unknown, and the only safe reading of unknown is to let go of everything.
      return this.hadBody ? this.release() : [];
    }
    this.hadBody = true;

    const cal = this.calibration;
    const w = cal.shoulderW || b.shoulderW;
    const out: FelInput[] = [];

    // ── the stick: lean to move ────────────────────────────────────────────────────────────────────────────
    // Measured from where they were standing when they calibrated, in their own shoulder widths, so distance
    // from the camera and body size both fall out of it.
    const leanX = (b.hip.x - cal.centreX) / w;
    const dirX = Math.sign(leanX);
    const magX = ramp(Math.abs(leanX), T.leanDead, T.leanFull);
    // The image is mirrored for the player — leaning right on screen should push right.
    const x = -dirX * magX;

    // Rising on the toes / sinking pushes the stick forward and back; it shares the squat signal, so the stick's
    // vertical only reads the SHALLOW part and the deep part becomes the trigger.
    const drop = (b.hip.y - cal.hipY) / w;
    const y = -ramp(-drop, T.leanDead, T.leanFull) + ramp(drop, T.leanDead, T.squatStart);

    const rx = Math.round(x * 100) / 100, ry = Math.round(y * 100) / 100;
    if (rx !== this.lastStick.x || ry !== this.lastStick.y) {
      this.lastStick = { x: rx, y: ry };
      out.push({ t: 'stick', side: 'L', x: rx, y: ry });
    }

    // ── the trigger: squat to charge ───────────────────────────────────────────────────────────────────────
    const charge = Math.round(ramp(drop, T.squatStart, T.squatFull) * 100) / 100;
    if (charge !== this.lastTrigger) {
      this.lastTrigger = charge;
      out.push({ t: 'trigger', side: 'R', value: charge });
    }

    // ── the buttons ────────────────────────────────────────────────────────────────────────────────────────
    const fire = (g: Gesture, onNow: boolean) => {
      if (onNow === this.on[g]) return;
      this.on[g] = onNow;
      out.push({ t: 'button', btn: GESTURE_BUTTON[g], pressed: onNow });
    };

    // Jump needs the floor, and the floor is only known when the feet are in shot.
    if (Number.isFinite(b.ankleY) && Number.isFinite(cal.hipY)) {
      const rise = (cal.hipY - b.hip.y) / w;   // hips rising is the reliable half of a jump
      fire('jump', this.on.jump ? rise > T.jumpOff : rise > T.jumpOn);
    } else if (this.on.jump) {
      fire('jump', false);
    }

    const raisedL = b.wristL ? (b.shoulder.y - b.wristL.y) / w : null;
    const raisedR = b.wristR ? (b.shoulder.y - b.wristR.y) / w : null;
    const upL = raisedL === null ? false : (this.on.raiseL || this.on.raiseBoth ? raisedL > T.raiseOff : raisedL > T.raiseOn);
    const upR = raisedR === null ? false : (this.on.raiseR || this.on.raiseBoth ? raisedR > T.raiseOff : raisedR > T.raiseOn);

    // Both hands up is its own gesture, not the two single ones at once — otherwise raising both fires three
    // buttons and the player has no way to ask for Y on its own.
    fire('raiseBoth', upL && upR);
    fire('raiseL', upL && !upR);
    fire('raiseR', upR && !upL);

    const outL = b.wristL ? Math.abs(b.wristL.x - b.shoulderL.x) / w : null;
    const outR = b.wristR ? Math.abs(b.wristR.x - b.shoulderR.x) / w : null;
    fire('reachL', outL === null ? false : (this.on.reachL ? outL > T.reachOff : outL > T.reachOn) && !upL);
    fire('reachR', outR === null ? false : (this.on.reachR ? outR > T.reachOff : outR > T.reachOn) && !upR);

    return out;
  }
}
