// ballistic — ground-truth jump takes for the accuracy bench (JUMP-PRO, 2026-10-24).
//
// WHY ANOTHER BUILDER. lib/assess/replay.ts cmj() is a 60 Hz joint clip: its flight is round(T·60) source frames, so
// its own truth is ±8 ms before any camera sees it, its body leaves the floor flat-footed (toes and heels together),
// and it always lands in the take-off posture. The three things that decide a camera jump's error are exactly the
// three it cannot show: a frame rate past 60, a toe that leaves LAST (the ankle still extending as the body rises),
// and a landing with bent knees or pointed toes (the body lower at touch-down than at take-off, so the flight runs
// long). So here the body is a function of time, sampled at 1 kHz, and every event is solved, not counted:
//
//   take-off   end of the drive: hips at the take-off posture's standing height, rising at v0 = √(2gh)
//   flight     the hips are ballistic; the posture blends take-off → (tuck) → touch-down posture; the feet hang off
//              the hips, so a toe still extending trails the body, and a bent landing knee lifts the feet
//   touch-down solved by bisection: the instant the lowest foot point reaches the floor
//
// TRUTH, two of them, both from the joints (never from an image):
//   heightV0Cm      v0²/2g: the take-off velocity's height — the force-plate (impulse) definition, the gold standard
//   heightFlightCm  g·T²/8 of the true flight T: what a perfect flight-time method reads. It equals heightV0Cm only
//                   when the body lands in its take-off posture; the gap is the landing-posture error, kept apart so a
//                   timing error and a posture error are never mixed up.
//
// Filmed through lib/pose/synth.ts synthesize (its camera, seeded landmark noise, visibility, dropped and missed
// frames, shutter jitter, optional motion blur), then optionally occluded in bursts.
//
// Pure, Node or browser, deterministic for a seed.
import { bodyPoints, synthesize, mulberry32, type Joints, type JointClip, type SynthOptions, type V3 } from '@/lib/pose/synth';
import type { PoseFrame } from '@/lib/pose/landmarks';
import { squatPose } from '@/lib/mirror/fixtures/build';

export const G = 9.81;
/** The clip's source rate: 1 kHz, so a 240 fps camera samples a smooth body, never a staircase. */
export const SOURCE_HZ = 1000;

// ── the posture ──────────────────────────────────────────────────────────────────────────────────────────────────

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const midV = (a: V3, b: V3): V3 => mul(add(a, b), 0.5);
const rad = (d: number) => (d * Math.PI) / 180;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const ease = (u: number) => { const x = clamp01(u); return x * x * (3 - 2 * x); };
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const mapJ = (j: Joints, f: (p: V3, k: keyof Joints) => V3): Joints =>
  Object.fromEntries(Object.entries(j).map(([k, p]) => [k, f(p as V3, k as keyof Joints)])) as Joints;
function rotX(p: V3, pivot: V3, a: number): V3 {
  const y = p[1] - pivot[1], z = p[2] - pivot[2], c = Math.cos(a), s = Math.sin(a);
  return [p[0], pivot[1] + y * c - z * s, pivot[2] + y * s + z * c];
}

/** Hands on the hips, elbows out: the CMJ standard (as lib/assess/replay.ts builds it). */
function handsOnHips(j: Joints): Joints {
  const k = { ...j };
  for (const s of ['Left', 'Right'] as const) {
    const f = s === 'Left' ? 1 : -1;
    const hip = k[`${s}UpLeg`], sh = k[`${s}Arm`];
    k[`${s}Hand`] = add(hip, [0.06 * f, 0.06, 0.02]);
    k[`${s}ForeArm`] = add(midV(sh, k[`${s}Hand`]), [0.12 * f, 0, -0.04]);
  }
  return k;
}

/** A posture: squat depth (0 standing … 1 hips at knee level) and plantarflexion (deg, heels up about the toes). */
export interface Posture { d: number; toeDeg: number }

const FOOT_POINTS = [27, 28, 29, 30, 31, 32];

/**
 * The posture with its lowest foot point on the floor (y = 0). Plantarflexion turns each ankle about its toe joint and
 * carries everything above the ankle with it, so a body on its toes stands taller.
 */
export function posed(p: Posture): Joints {
  let j = handsOnHips(squatPose(Math.max(0, p.d)));
  if (p.toeDeg) {
    const a = rad(p.toeDeg);
    const lf = rotX(j.LeftFoot, j.LeftToe, a), rf = rotX(j.RightFoot, j.RightToe, a);
    const lift = midV(sub(lf, j.LeftFoot), sub(rf, j.RightFoot));
    j = mapJ(j, (v, k) => (k === 'LeftToe' || k === 'RightToe' ? v : k === 'LeftFoot' ? lf : k === 'RightFoot' ? rf : add(v, lift)));
  }
  const pts = bodyPoints(j);
  const low = Math.min(...FOOT_POINTS.map((i) => pts[i][1]));
  return mapJ(j, (v) => [v[0], v[1] - low, v[2]]);
}

/** Lowest-foot-point → hip height of a posture standing on the floor. */
const hipOf = (p: Posture) => posed(p).Hips[1];

// ── a take ───────────────────────────────────────────────────────────────────────────────────────────────────────

export interface TrialSpec {
  /** Truth: the take-off velocity's height (m), v0 = √(2gh). */
  heightM: number;
  /** Squat depth of the dip (default 0.55). */
  dip?: number;
  /** Plantarflexion at take-off (deg, default 25): the toes leave last. */
  toeOffDeg?: number;
  /** The ankle keeps extending this much more (deg) over toeLagMs after take-off: the toe trails the body (default 15 / 60). */
  toeLagDeg?: number;
  toeLagMs?: number;
  /** Squat depth the legs tuck to at the top of the flight (default 0: legs straight). */
  tuck?: number;
  /** Squat depth AT TOUCH-DOWN: 0 lands in the take-off posture's knee; 0.2 ≈ 35° of knee bend already at contact. */
  landKnee?: number;
  /** Plantarflexion at touch-down (deg); default = toeOffDeg (lands as it left). */
  landToeDeg?: number;
  /** Absorb depth after touch-down (default 0.5). */
  absorb?: number;
  /**
   * REBOUND: land and leave again after this long on the floor (ms) — the next trial starts at its take-off, no
   * stand, no dip (a 10/5 repeated-jump or a pogo). The contact dips to `reboundDip` and stays on the toes.
   */
  reboundMs?: number;
  reboundDip?: number;
}

export interface TrialTruth {
  /** Capture-clock ms (the take's t0 + source time). */
  takeoffT: number;
  landT: number;
  flightMs: number;
  /** v0²/2g, the force-plate height. */
  heightV0Cm: number;
  /** g·T²/8 of the true flight. */
  heightFlightCm: number;
  /** Hip height at touch-down minus at take-off (cm): negative = landed lower (the flight runs long). */
  landDropCm: number;
  /** Ground contact before this take-off (ms), when it rebounded out of the last landing. */
  contactMs?: number;
}

/** Something that moved but was not a jump (the false-trial set). */
export type Decoy =
  | { kind: 'squat'; depth: number }            // a deep squat stood up fast
  | { kind: 'calfRaise'; deg: number }          // up on the toes and down
  | { kind: 'hop'; heightM: number }            // a tiny hop under the flight minimum
  | { kind: 'step'; dz: number };               // a step toward (+) or away from the lens

export type Beat = { trial: TrialSpec } | { decoy: Decoy } | { rest: number };

interface Segment { from: number; to: number; at: (t: number) => Joints }

/** Build the 1 kHz clip and its truth. Time 0 is the start of the take. */
export function buildTake(beats: readonly Beat[], o: { leadS?: number } = {}): { clip: JointClip; truth: TrialTruth[]; decoys: number } {
  const segs: Segment[] = [];
  const truth: TrialTruth[] = [];
  let t = 0, decoys = 0;
  const stand = posed({ d: 0, toeDeg: 0 });
  const still = (dur: number, j: Joints = stand) => { segs.push({ from: t, to: t + dur, at: () => j }); t += dur; };
  still(o.leadS ?? 1.4);
  let zOff = 0;
  /** The last trial rebounded: the next one takes off from the contact (no stand, no dip). */
  let chained: { contactMs: number } | null = null;
  const shift = (j: Joints, dy = 0): Joints => mapJ(j, (v) => [v[0], v[1] + dy, v[2] + zOff]);
  for (const b of beats) {
    if ('rest' in b) { const z = zOff; segs.push({ from: t, to: t + b.rest, at: () => mapJ(stand, (v) => [v[0], v[1], v[2] + z]) }); t += b.rest; continue; }
    if ('decoy' in b) {
      decoys++;
      const d = b.decoy, z0 = zOff;
      if (d.kind === 'squat') {
        const t0 = t;
        segs.push({ from: t0, to: t0 + 0.9, at: (x) => { const u = (x - t0) / 0.9; const dd = u < 0.6 ? d.depth * ease(u / 0.6) : d.depth * (1 - ease((u - 0.6) / 0.4)); return mapJ(posed({ d: dd, toeDeg: 0 }), (v) => [v[0], v[1], v[2] + z0]); } });
        t += 0.9;
      } else if (d.kind === 'calfRaise') {
        const t0 = t;
        segs.push({ from: t0, to: t0 + 0.8, at: (x) => { const u = (x - t0) / 0.8; const a = d.deg * (u < 0.3 ? ease(u / 0.3) : u < 0.6 ? 1 : 1 - ease((u - 0.6) / 0.4)); return mapJ(posed({ d: 0, toeDeg: a }), (v) => [v[0], v[1], v[2] + z0]); } });
        t += 0.8;
      } else if (d.kind === 'step') {
        const t0 = t, dz = d.dz;
        segs.push({ from: t0, to: t0 + 0.5, at: (x) => { const u = ease((x - t0) / 0.5); return mapJ(stand, (v) => [v[0], v[1] + 0.04 * Math.sin(Math.PI * u), v[2] + z0 + dz * u]); } });
        t += 0.5; zOff += dz;
      } else {
        addTrial({ heightM: d.heightM, dip: 0.2, toeOffDeg: 20 }, false);
      }
      still(0.8, shift(stand));
      continue;
    }
    addTrial(b.trial, true);
  }
  still(0.6, shift(stand));

  function addTrial(s: TrialSpec, record: boolean) {
    const dip = s.dip ?? 0.55, toeOff = s.toeOffDeg ?? 25, lagDeg = s.toeLagDeg ?? 15, lagS = (s.toeLagMs ?? 60) / 1000;
    const tuck = s.tuck ?? 0, landKnee = s.landKnee ?? 0, landToe = s.landToeDeg ?? toeOff, absorb = s.absorb ?? 0.5;
    const z = zOff;
    const at = (p: Posture, dy = 0) => mapJ(posed(p), (v) => [v[0], v[1] + dy, v[2] + z]);
    const contactMs = chained?.contactMs;
    chained = null;
    // the dip and the drive (the heels rise through the last 60 % of the drive) — unless it rebounds out of a contact
    const t0 = t, down = 0.35, hold = 0.05, drive = 0.25;
    if (contactMs === undefined) segs.push({
      from: t0, to: t0 + down + hold + drive,
      at: (x) => {
        const u = x - t0;
        if (u < down) return at({ d: dip * ease(u / down), toeDeg: 0 });
        if (u < down + hold) return at({ d: dip, toeDeg: 0 });
        const w = (u - down - hold) / drive;
        return at({ d: dip * (1 - ease(w)), toeDeg: toeOff * ease((w - 0.4) / 0.6) });
      },
    });
    if (contactMs === undefined) t += down + hold + drive;
    // the flight
    const v0 = Math.sqrt(2 * G * s.heightM), Tn = (2 * v0) / G, tTO = t;
    const pose = (tau: number): Posture => {
      const sN = clamp01(tau / Tn), late = ease((sN - 0.5) / 0.5);
      const toeAir = toeOff + lagDeg * clamp01(tau / lagS);
      return { d: tuck * Math.sin(Math.PI * sN) + landKnee * late, toeDeg: lerp(toeAir, landToe, late) };
    };
    const hip0 = hipOf({ d: 0, toeDeg: toeOff });
    const hipAt = (tau: number) => hip0 + v0 * tau - (G * tau * tau) / 2;
    // the lowest foot point is (hips − that posture's standing hip height): touch-down where it reaches the floor
    const footLow = (tau: number) => hipAt(tau) - hipOf(pose(tau));
    let lo = Tn * 0.5, hi = Tn * 1.6;
    for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (footLow(m) > 0) lo = m; else hi = m; }
    const T = (lo + hi) / 2;
    segs.push({ from: tTO, to: tTO + T, at: (x) => { const tau = x - tTO; const p = pose(tau); return at(p, hipAt(tau) - hipOf(p)); } });
    t += T;
    if (record) {
      const pTD = pose(T);
      truth.push({
        takeoffT: tTO * 1000, landT: (tTO + T) * 1000, flightMs: T * 1000,
        heightV0Cm: s.heightM * 100, heightFlightCm: ((G * T * T) / 8) * 100,
        landDropCm: (hipOf(pTD) - hip0) * 100,
        ...(contactMs !== undefined ? { contactMs } : {}),
      });
    }
    if (s.reboundMs !== undefined) {
      // the contact: down onto the toes, a short dip, and straight back to the next take-off posture
      const tC = t, pTD = pose(T), c = s.reboundMs / 1000, rd = s.reboundDip ?? 0.15;
      segs.push({
        from: tC, to: tC + c,
        at: (x) => {
          const u = (x - tC) / c;
          return at({ d: lerp(pTD.d, 0, u) + rd * Math.sin(Math.PI * u), toeDeg: lerp(pTD.toeDeg, toeOff, u) - 12 * Math.sin(Math.PI * u) });
        },
      });
      t += c;
      chained = { contactMs: s.reboundMs };
      return;
    }
    // the landing: heels down, absorb, stand up, stand still
    const tL = t, pTD = pose(T), heels = 0.06, sink = 0.15, up = 0.45, rest = 1.0;
    segs.push({
      from: tL, to: tL + heels + sink + up + rest,
      at: (x) => {
        const u = x - tL;
        if (u < heels) { const w = ease(u / heels); return at({ d: lerp(pTD.d, Math.max(pTD.d, absorb * 0.3), w), toeDeg: lerp(pTD.toeDeg, 0, w) }); }
        const d1 = Math.max(pTD.d, absorb * 0.3);
        if (u < heels + sink) return at({ d: lerp(d1, absorb, ease((u - heels) / sink)), toeDeg: 0 });
        if (u < heels + sink + up) return at({ d: absorb * (1 - ease((u - heels - sink) / up)), toeDeg: 0 });
        return at({ d: 0, toeDeg: 0 });
      },
    });
    t += heels + sink + up + rest;
  }

  const n = Math.floor(t * SOURCE_HZ) + 1;
  const frames: Joints[] = new Array(n);
  let si = 0;
  for (let k = 0; k < n; k++) {
    const x = k / SOURCE_HZ;
    while (si < segs.length - 1 && x >= segs[si].to) si++;
    frames[k] = segs[si].at(Math.min(x, segs[si].to));
  }
  return { clip: { fps: SOURCE_HZ, frames }, truth, decoys };
}

// ── filming it ───────────────────────────────────────────────────────────────────────────────────────────────────

export interface FilmOptions {
  fps: number;
  seed?: number;
  /** Landmark noise multiplier on the synth's default (0 = clean). */
  noise?: number;
  /** Share of frames never delivered / delivered with no body. */
  dropRate?: number;
  missRate?: number;
  /** The synth's motion-blur model (fast feet come back unsure). */
  blur?: boolean;
  /** Partial occlusion: bursts where the feet come back unsure (visibility 0.3, 3× noise). */
  occlusion?: { burstsPerS: number; burstMs: number };
  /** Camera distance (m); the default rig is 3 m. */
  distance?: number;
}

/** Film a take. Returns the frames and the truth on the capture clock. */
export function filmTake(take: ReturnType<typeof buildTake>, o: FilmOptions): { frames: PoseFrame[]; truth: TrialTruth[] } {
  const k = o.noise ?? 1;
  const opt: SynthOptions = {
    fps: o.fps, seed: o.seed ?? 1, t0: 0,
    noise: k === 0 ? false : { imageTorso: 0.002 * k, imageLimb: 0.004 * k, worldTorso: 0.008 * k, worldLimb: 0.015 * k },
    dropRate: o.dropRate ?? 0.02, missRate: o.missRate ?? 0.01,
    frameJitterMs: k === 0 ? 0 : 1, latencyJitterMs: 0,
    camera: { width: 640, height: 480, hfovDeg: 60, distance: o.distance ?? 3.0, heightM: 1.1 },
    ...(o.blur ? { blur: { px: 6, mult: 3 } } : {}),
  };
  const frames = synthesize(take.clip, opt).frames;
  if (o.occlusion) {
    const rand = mulberry32((o.seed ?? 1) * 7919 + 13);
    const p = (o.occlusion.burstsPerS / o.fps);
    let until = -Infinity;
    for (const f of frames) {
      if (f.present && f.t >= until && rand() < p) until = f.t + o.occlusion.burstMs;
      if (!f.present || f.t >= until) continue;
      for (const i of FOOT_POINTS) {
        const l = f.image[i];
        l.v = 0.3 + rand() * 0.15;
        l.x += (rand() - 0.5) * 0.02; l.y += (rand() - 0.5) * 0.02;
      }
    }
  }
  return { frames, truth: take.truth };
}
