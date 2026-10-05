// synthBody — synthetic pose numbers for the jump detector.
//
// Numbers only. No video and no photograph of a person. A standing stick figure in image
// space (y down, 0..1) plus a rise, a crouch, or a step. The detector tests build every stream from here.

import {
  LANDMARK_COUNT, LEFT_ANKLE, LEFT_HIP, LEFT_KNEE, LEFT_SHOULDER, NOSE,
  RIGHT_ANKLE, RIGHT_HIP, RIGHT_KNEE, RIGHT_SHOULDER,
  type Lm, type PoseFrame,
} from '@/lib/pose/landmarks';

const VIS = 0.95;

export interface Stick {
  nose: [number, number];
  lShoulder: [number, number];
  rShoulder: [number, number];
  lHip: [number, number];
  rHip: [number, number];
  lKnee: [number, number];
  rKnee: [number, number];
  lAnkle: [number, number];
  rAnkle: [number, number];
}

type Pair = [number, number];

const add = (p: Pair, dx: number, dy: number): Pair => [p[0] + dx, p[1] + dy];

/** A front-on stand. `shiftX` slides the whole figure. */
export function stand(shiftX = 0): Stick {
  const x = shiftX;
  return {
    nose: [0.50 + x, 0.22],
    lShoulder: [0.58 + x, 0.32],
    rShoulder: [0.42 + x, 0.32],
    lHip: [0.56 + x, 0.52],
    rHip: [0.44 + x, 0.52],
    lKnee: [0.56 + x, 0.70],
    rKnee: [0.44 + x, 0.70],
    lAnkle: [0.56 + x, 0.88],
    rAnkle: [0.44 + x, 0.88],
  };
}

/** Move every point up by `rise` (image y decreases). */
export function risen(s: Stick, rise: number): Stick {
  const up = (p: Pair): Pair => [p[0], p[1] - rise];
  return {
    nose: up(s.nose), lShoulder: up(s.lShoulder), rShoulder: up(s.rShoulder),
    lHip: up(s.lHip), rHip: up(s.rHip), lKnee: up(s.lKnee), rKnee: up(s.rKnee),
    lAnkle: up(s.lAnkle), rAnkle: up(s.rAnkle),
  };
}

/**
 * A load: hips drop a little, knees bend forward. Ankles stay, so the lower foot is still on the floor.
 */
export function crouched(s: Stick): Stick {
  return {
    ...s,
    lHip: add(s.lHip, 0, 0.03),
    rHip: add(s.rHip, 0, 0.03),
    lKnee: add(s.lKnee, 0.05, 0.02),
    rKnee: add(s.rKnee, -0.05, 0.02),
    nose: add(s.nose, 0, 0.02),
    lShoulder: add(s.lShoulder, 0, 0.02),
    rShoulder: add(s.rShoulder, 0, 0.02),
  };
}

/** One foot up, the other planted. The lower ankle stays on the floor, which is what a step is. */
export function stepped(s: Stick, side: 'left' | 'right', lift = 0.05): Stick {
  if (side === 'left') return { ...s, lAnkle: add(s.lAnkle, 0, -lift), lKnee: add(s.lKnee, 0, -lift * 0.4) };
  return { ...s, rAnkle: add(s.rAnkle, 0, -lift), rKnee: add(s.rKnee, 0, -lift * 0.4) };
}

export function frameAt(tMs: number, s: Stick): PoseFrame {
  const image: Lm[] = Array.from({ length: LANDMARK_COUNT }, () => ({ x: 0.5, y: 0.55, z: 0, v: 0.3 }));
  const put = (i: number, p: Pair) => { image[i] = { x: p[0], y: p[1], z: 0, v: VIS }; };
  put(NOSE, s.nose);
  put(LEFT_SHOULDER, s.lShoulder);
  put(RIGHT_SHOULDER, s.rShoulder);
  put(LEFT_HIP, s.lHip);
  put(RIGHT_HIP, s.rHip);
  put(LEFT_KNEE, s.lKnee);
  put(RIGHT_KNEE, s.rKnee);
  put(LEFT_ANKLE, s.lAnkle);
  put(RIGHT_ANKLE, s.rAnkle);
  return { t: tMs, present: true, image };
}

const FPS = 30;
const DT = 1000 / FPS;

function pushHold(out: PoseFrame[], fromMs: number, untilMs: number, s: Stick): number {
  let t = fromMs;
  while (t < untilMs) { out.push(frameAt(t, s)); t += DT; }
  return t;
}

/**
 * One standing jump: a short still (so the floor can be read), two steps, a crouch, a flight, a landing.
 * `flightMs` is the time the figure is held in the air. The detector's own flight is a little shorter,
 * because the feet cross the floor line inside that window.
 */
export function cleanJump(flightMs = 480, peakRise = 0.14): PoseFrame[] {
  const out: PoseFrame[] = [];
  const base = stand();
  let t = pushHold(out, 0, 400, base);
  const steps = 4;
  for (let i = 0; i < steps; i++) {
    t = pushHold(out, t, t + 180, stepped(base, i % 2 === 0 ? 'left' : 'right'));
  }
  t = pushHold(out, t, t + 160, crouched(base));
  const airFrom = t;
  const airUntil = t + flightMs;
  while (t < airUntil) {
    const u = (t - airFrom) / flightMs;
    const rise = peakRise * Math.sin(Math.PI * u);
    out.push(frameAt(t, risen(base, rise)));
    t += DT;
  }
  pushHold(out, t, t + 400, base);
  return out;
}

/** Both feet leave, but only for a moment. Under the flight floor, so it is a hop. */
export function smallHop(): PoseFrame[] {
  const out: PoseFrame[] = [];
  const base = stand();
  let t = pushHold(out, 0, 400, base);
  const airFrom = t;
  while (t < airFrom + 90) {
    const u = (t - airFrom) / 90;
    out.push(frameAt(t, risen(base, 0.08 * Math.sin(Math.PI * u))));
    t += DT;
  }
  pushHold(out, t, t + 300, base);
  return out;
}

/** Walking: one foot is always down, and the hips travel. Not a jump. */
export function walk(): PoseFrame[] {
  const out: PoseFrame[] = [];
  let t = 0;
  const until = 2000;
  let i = 0;
  while (t < until) {
    const shift = (t / until) * 0.2 - 0.1;
    const side = Math.floor(i / 6) % 2 === 0 ? 'left' : 'right';
    out.push(frameAt(t, stepped(stand(shift), side)));
    t += DT;
    i += 1;
  }
  return out;
}

/** Nothing moves. */
export function standStill(ms = 1000): PoseFrame[] {
  const out: PoseFrame[] = [];
  pushHold(out, 0, ms, stand());
  return out;
}
