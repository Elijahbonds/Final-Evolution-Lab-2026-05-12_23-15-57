// protocols — the standard jump test set (JUMP-TESTS, 2026-10-25): the squat jump, the jump with an arm swing and
// with hands on hips, single-leg jumps (left and right, with the asymmetry) and the 10-5 repeated-jump test.
//
// WHAT A PROTOCOL ADDS. Every test is read by the jump check's own pipeline: the video's clock from gravity
// (lib/jump/slowmo.ts), the flights found and refused by lib/assess/graders/t5-cmj.ts, each re-timed by refine.ts,
// each trial's flags and the verified rule from session.ts, the rebounds from rebound.ts. A protocol then says, per
// jump, whether it was THAT test, and why not, in words — the same `invalidWhy` every refusal already uses — and the
// set is summed up again over the jumps that count:
//   sj          a held squat (still for jump.sjHoldMs, at least jump.sjMinDepthCm deep), then no dip before the drive
//               (the centre of mass, lib/jump/com.ts, never more than jump.sjDipCm under the hold)
//   cmjHips     hands on hips throughout, from the pose (wrist by its hip AND the elbow bent: arms hanging are straight)
//   cmjArms     the arm swing is the test: T5's "your hands left your hips" is lifted, and arms that never rose over the
//               shoulders (t5.armSwingWrist, the same line T5 reads) are refused instead
//   singleLeft / singleRight
//               one leg: the free foot stays up from before the take-off to after the landing; the side is the one the
//               athlete chose (a front camera's video may be mirrored, so the picture's left is not trusted to name it)
//   rj105       ten rebounds: contact (refine.ts edges) and RSI = flight ÷ contact per rebound; the best five of those
//               on the floor no longer than jump.rjMaxContactMs
//
// HONEST LIMITS. The arm-swing height is read through the hips like every standing jump, and swinging arms move the
// centre of mass against the hips: that error is not modelled on the bench (its hips fly the parabola). The protocol
// bench (lib/jump/protocolBench.ts) measures which jumps are counted and refused, not a new accuracy. No accuracy is
// claimed for any test until the force-plate pilot (docs/JUMP-PILOT-PROTOCOL.md).
//
// Pure.
import type { PoseFrame } from '@/lib/pose/landmarks';
import type { FrontCalibration } from '@/lib/assess/calibration';
import type { JumpRead, T5Extra } from '@/lib/assess/scoring';
import { footLowY, wristsAboveShoulders } from '@/lib/assess/geometry';
import { bandOf, th } from '@/lib/assess/thresholds';
import { comOf } from './com';
import { jr } from './PROPOSED-jump';
import { reboundStats, MAX_CONTACT_MS } from './rebound';
import { CI95_Z, sessionStats, verifyJump, type TrialFlag, type Verified } from './session';
import { analyseSlowMo } from './slowmo';

export type ProtocolId = 'sj' | 'cmjHips' | 'cmjArms' | 'singleLeft' | 'singleRight' | 'rj105';
export const PROTOCOL_IDS: readonly ProtocolId[] = ['sj', 'cmjArms', 'cmjHips', 'singleLeft', 'singleRight', 'rj105'];

export interface ProtocolDef {
  id: ProtocolId;
  /** Its name, and a few words under it. */
  name: string;
  short: string;
  /** The setup cue: how to film it, a line each. */
  steps: readonly string[];
}

const FILM = 'Film it, or pick a video. It is read on this phone and never uploaded.';
const FRONT = 'Prop the phone at hip height, facing you, about 3 m away. Whole body in the shot, feet too.';
const singleSteps = (leg: 'left' | 'right'): string[] => [
  FRONT,
  'Stand still on both feet for two seconds, hands on your hips.',
  `Lift your ${leg === 'left' ? 'right' : 'left'} foot behind you and keep it up the whole time.`,
  `Dip and jump as high as you can off your ${leg} leg, and land on the same leg. Up to three jumps.`,
  FILM,
];

export const PROTOCOLS: Record<ProtocolId, ProtocolDef> = {
  sj: {
    id: 'sj', name: 'Squat jump', short: 'From a held squat, no dip',
    steps: [
      FRONT,
      'Stand still for two seconds, hands on your hips.',
      'Squat until your knees are bent about 90°, and hold still for two to three seconds.',
      'Jump straight up from the squat without dipping first. Land tall. Up to three jumps, standing up between them.',
      FILM,
    ],
  },
  cmjArms: {
    id: 'cmjArms', name: 'Jump with arm swing', short: 'Dip, swing, jump',
    steps: [
      FRONT,
      'Stand still for two seconds, arms by your sides.',
      'Dip and swing your arms back, then swing them up hard as you jump. Land tall. Up to three jumps.',
      FILM,
    ],
  },
  cmjHips: {
    id: 'cmjHips', name: 'Jump, hands on hips', short: 'The standard jump, no arms',
    steps: [
      FRONT,
      'Stand still for two seconds, hands on your hips.',
      'Keep your hands on your hips the whole time. Dip and jump as high as you can, land tall. Up to three jumps.',
      FILM,
    ],
  },
  singleLeft: { id: 'singleLeft', name: 'Single-leg jump, left', short: 'Off your left leg', steps: singleSteps('left') },
  singleRight: { id: 'singleRight', name: 'Single-leg jump, right', short: 'Off your right leg', steps: singleSteps('right') },
  rj105: {
    id: 'rj105', name: '10-5 rebound jumps', short: 'Ten quick jumps, best five',
    steps: [
      FRONT,
      'Stand still for two seconds, hands on your hips.',
      'Jump ten times in a row, as high as you can and as fast off the floor as you can, as if the floor were hot.',
      'Stay on the balls of your feet and keep your legs fairly straight when you land.',
      FILM,
    ],
  },
};

/** Why a jump was not that test, in words (each beside the jump, like every other refusal). */
export const PROTOCOL_WHY = {
  sjNoHold: 'no still squat before it: hold the squat for two seconds, then jump',
  sjShallow: 'it did not start from a squat: bend your knees to about 90° and hold',
  sjDip: 'you dipped before you jumped, so it was a countermovement jump',
  handsOff: 'your hands left your hips',
  noSwing: 'your arms did not swing: swing them back, then up as you jump',
  otherFoot: 'your other foot came down: keep it up the whole time',
} as const;
export type ProtocolWhyId = keyof typeof PROTOCOL_WHY;

/** T5's own refusal for an arm swing (lib/assess/graders/t5-cmj.ts); the arm-swing test lifts it. */
export const T5_ARMS_WHY = 'your hands left your hips';

// ── the per-jump checks ──────────────────────────────────────────────────────────────────────────────────────────

const VIS = () => th('gate.visibility');
const metresPerUnit = (front: FrontCalibration) => (front.worldHeight ?? th('t5.nominalHeightM')) / front.bodyHeight;
const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : NaN; };
const inWindow = (frames: readonly PoseFrame[], from: number, to: number) => frames.filter((f) => f.t >= from && f.t <= to && f.present && f.image.length >= 33);

/**
 * The centre of mass's height (image units, up = +) over time, smoothed over ±smoothMs; `point: 'hips'` reads the hips'
 * midpoint instead (the push-off: Samozino's hpo is measured at the hip, so the trunk's lean in the dip is not in it).
 */
export function comTrack(frames: readonly PoseFrame[], from: number, to: number, smoothMs = 40, point: 'com' | 'hips' = 'com'): { t: number; u: number }[] {
  const vis = VIS();
  const raw = inWindow(frames, from, to).filter((f) => [11, 12, 23, 24].every((k) => f.image[k].v >= vis))
    .map((f) => ({ t: f.t, u: point === 'hips' ? -(f.image[23].y + f.image[24].y) / 2 : -comOf(f.image).y }));
  return raw.map((p, i) => {
    let a = 0, n = 0;
    for (let k = i; k >= 0 && p.t - raw[k].t <= smoothMs; k--) { a += raw[k].u; n++; }
    for (let k = i + 1; k < raw.length && raw[k].t - p.t <= smoothMs; k++) { a += raw[k].u; n++; }
    return { t: p.t, u: a / n };
  });
}

export interface SquatHold { holdFrom: number; holdTo: number; depthCm: number; dipCm: number; stillCm: number }

/**
 * The squat jump's start: the LATEST window of jump.sjHoldMs before the take-off where the centre of mass is still
 * (moves less than jump.sjStillCm), how deep the hips sit there under the standing hips, and how far the centre of
 * mass then dropped under that hold before the take-off (a countermovement). Null: no still window at all.
 */
export function squatHold(frames: readonly PoseFrame[], front: FrontCalibration, takeoffT: number): SquatHold | null {
  const mpu = metresPerUnit(front), holdMs = jr('jump.sjHoldMs'), still = jr('jump.sjStillCm') / 100 / mpu;
  const tr = comTrack(frames, takeoffT - 4000, takeoffT);
  if (tr.length < 4) return null;
  for (let e = tr.length - 1; e >= 0; e--) {
    if (tr[e].t > takeoffT - 40) continue;
    const win = tr.filter((p) => p.t <= tr[e].t && p.t >= tr[e].t - holdMs);
    if (!win.length || tr[e].t - win[0].t < holdMs * 0.9 || win.length < 3) continue;
    const us = win.map((p) => p.u), range = Math.max(...us) - Math.min(...us);
    if (range > still) continue;
    const level = median(us);
    const after = tr.filter((p) => p.t > tr[e].t && p.t < takeoffT);
    const low = after.length ? Math.min(...after.map((p) => p.u)) : level;
    // the hips in the hold against the standing hips (the calibration's)
    const vis = VIS();
    const hipYs = inWindow(frames, win[0].t, tr[e].t).filter((f) => f.image[23].v >= vis && f.image[24].v >= vis).map((f) => (f.image[23].y + f.image[24].y) / 2);
    const depthCm = hipYs.length ? (median(hipYs) - front.hipY) * mpu * 100 : 0;
    return {
      holdFrom: win[0].t, holdTo: tr[e].t, depthCm: Math.round(depthCm * 10) / 10,
      dipCm: Math.round(Math.max(0, level - low) * mpu * 1000) / 10, stillCm: Math.round(range * mpu * 1000) / 10,
    };
  }
  return null;
}

/** The squat jump's verdict on one jump: null when it was a squat jump. */
export function squatJumpWhy(frames: readonly PoseFrame[], front: FrontCalibration, takeoffT: number): ProtocolWhyId | null {
  const h = squatHold(frames, front, takeoffT);
  if (!h) return 'sjNoHold';
  if (h.depthCm < jr('jump.sjMinDepthCm')) return 'sjShallow';
  if (h.dipCm > jr('jump.sjDipCm')) return 'sjDip';
  return null;
}

/** Angle at b (deg) of a–b–c in the picture, x stretched to the picture's width (aspect = width ÷ height). */
function angleAt(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }, aspect: number): number {
  const ux = (a.x - b.x) * aspect, uy = a.y - b.y, vx = (c.x - b.x) * aspect, vy = c.y - b.y;
  const n = Math.hypot(ux, uy) * Math.hypot(vx, vy);
  return n > 0 ? (Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / n))) * 180) / Math.PI : 180;
}

/** One frame: are both hands on the hips? Null when the arms are not seen well enough to say. */
export function handsOnHipsFrame(img: PoseFrame['image'], aspect: number): boolean | null {
  const vis = VIS();
  if (![11, 12, 13, 14, 15, 16, 23, 24].every((k) => img[k].v >= vis)) return null;
  const d = (a: number, b: number) => Math.hypot((img[a].x - img[b].x) * aspect, img[a].y - img[b].y);
  const torso = Math.hypot(((img[11].x + img[12].x - img[23].x - img[24].x) / 2) * aspect, (img[11].y + img[12].y - img[23].y - img[24].y) / 2);
  if (!(torso > 0)) return null;
  for (const [sh, el, wr, hip] of [[11, 13, 15, 23], [12, 14, 16, 24]] as const) {
    if (d(wr, hip) / torso > jr('jump.hipsWristShare')) return false;
    if (angleAt(img[sh], img[el], img[wr], aspect) > jr('jump.hipsElbowDeg')) return false;
  }
  return true;
}

/** From the dip (800 ms before the take-off) to just after the landing: did a hand leave its hip? */
export function handsLeftHips(frames: readonly PoseFrame[], j: { takeoffT: number; landT: number }, aspect: number): boolean {
  const reads = inWindow(frames, j.takeoffT - 800, j.landT + 100).map((f) => handsOnHipsFrame(f.image, aspect)).filter((x): x is boolean => x !== null);
  if (reads.length < 3) return false;          // the arms were not seen: T5's own wrist check still stands
  return (reads.filter((x) => !x).length / reads.length) * 100 > jr('jump.hipsOffPct');
}

/** The arm swing: did a wrist rise over the shoulder line (t5.armSwingWrist, T5's own line) from the dip to the landing? */
export function armsSwung(frames: readonly PoseFrame[], j: { takeoffT: number; landT: number }): boolean {
  return inWindow(frames, j.takeoffT - 600, j.landT).some((f) => wristsAboveShoulders(f.image) > th('t5.armSwingWrist'));
}

/**
 * One leg: from 500 ms before the take-off to 300 ms after the landing, one foot (the same one) stays
 * jump.slFreeFootShare body heights over the other on jump.slFreeFootPct of the frames where both feet are seen.
 */
export function freeFootDown(frames: readonly PoseFrame[], front: FrontCalibration, j: { takeoffT: number; landT: number }): boolean {
  const vis = VIS();
  const reads = inWindow(frames, j.takeoffT - 500, j.landT + 300)
    .filter((f) => [27, 28, 29, 30, 31, 32].every((k) => f.image[k].v >= vis))
    .map((f) => (footLowY(f.image, 'left') - footLowY(f.image, 'right')) / front.bodyHeight);   // + = the right foot is higher
  if (reads.length < 3) return false;
  const free = median(reads) >= 0 ? 1 : -1;                                                   // the foot held up, read from the take
  const up = reads.filter((x) => x * free >= jr('jump.slFreeFootShare')).length;
  return (up / reads.length) * 100 < jr('jump.slFreeFootPct');
}

// ── the set, summed up again ─────────────────────────────────────────────────────────────────────────────────────

const G = 9.81;

/**
 * The read's summary over the jumps that now count: the same fields gradeT5 fills, from the same functions. A jump's
 * outlier flag is re-read for the new set.
 */
export function resummarise(t5: T5Extra, jumps: JumpRead[]): T5Extra {
  const js = jumps.map((j) => {
    const flags = (j.quality?.flags ?? []).filter((f): f is TrialFlag => f !== 'outlier');
    return { ...j, ...(j.quality ? { quality: { flags, clean: j.valid && flags.every((f) => f === 'frameRate') } } : {}) };
  });
  const valid = js.filter((j) => j.valid);
  const best = valid.reduce<JumpRead | null>((a, j) => (!a || j.heightCm > a.heightCm ? j : a), null);
  const hs = valid.map((j) => j.heightCm), mean = hs.length ? hs.reduce((a, b) => a + b, 0) / hs.length : 0;
  const cvPct = hs.length >= 2 ? Math.round((Math.sqrt(hs.reduce((a, h) => a + (h - mean) ** 2, 0) / hs.length) / mean) * 1000) / 10 : null;
  const hz = t5.poseFps;
  return {
    ...t5, jumps: js,
    bestHeightCm: best ? best.heightCm : null, bestFlightMs: best ? best.flightMs : null, bestJump: best ? best.index : null,
    heightPlusMinusCm: best && hz > 0 ? Math.round(Math.max((G * (best.flightMs / 1000) * (1 / hz)) / 4 * 100, CI95_Z * (best.heightSdCm ?? 0)) * 10) / 10 : null,
    cvPct, inconsistent: cvPct !== null && cvPct >= bandOf('t5.cvPct').fault!,
    session: sessionStats(valid),
    rebounds: reboundStats(js),
  };
}

// ── the 10-5 test ────────────────────────────────────────────────────────────────────────────────────────────────

export interface RjRebound { from: number; to: number; contactMs: number; flightMs: number; heightCm: number; rsi: number; rsiFlight: number; counted: boolean }
export interface RjRead {
  /** Valid jumps read, of the ten asked for. */
  jumps: number;
  rebounds: RjRebound[];
  /** Rebounds on the floor no longer than jump.rjMaxContactMs. */
  counted: number;
  /** The best five counted rebounds by RSI (flight ÷ contact): their mean RSI, contact, flight and height. */
  best5RsiFlight: number | null;
  best5Rsi: number | null;
  best5ContactMs: number | null;
  best5HeightCm: number | null;
  /** Why the test has no result, in words (null: it has one). */
  why: string | null;
}

export const RJ_WHY = {
  tooFew: 'fewer than five quick rebounds were read: jump ten times in a row without stopping',
  slow: 'on the floor too long between jumps: bounce off the floor faster',
} as const;

export function readRepeated(t5: T5Extra): RjRead {
  const valid = t5.jumps.filter((j) => j.valid).sort((a, b) => a.takeoffT - b.takeoffT);
  const max = jr('jump.rjMaxContactMs');
  const rebounds: RjRebound[] = [];
  const r2 = (x: number) => Math.round(x * 100) / 100;
  for (let k = 1; k < valid.length; k++) {
    const c = valid[k].takeoffT - valid[k - 1].landT;
    if (c <= 0 || c > MAX_CONTACT_MS) continue;
    const j = valid[k];
    rebounds.push({ from: valid[k - 1].index, to: j.index, contactMs: Math.round(c), flightMs: j.flightMs, heightCm: j.heightCm, rsi: r2(j.heightCm / 100 / (c / 1000)), rsiFlight: r2(j.flightMs / c), counted: c <= max });
  }
  const counted = rebounds.filter((r) => r.counted);
  const top = [...counted].sort((a, b) => b.rsiFlight - a.rsiFlight).slice(0, 5);
  const ok = top.length >= 5;
  const mean = (f: (r: RjRebound) => number) => top.reduce((a, r) => a + f(r), 0) / top.length;
  return {
    jumps: valid.length, rebounds, counted: counted.length,
    best5RsiFlight: ok ? r2(mean((r) => r.rsiFlight)) : null,
    best5Rsi: ok ? r2(mean((r) => r.rsi)) : null,
    best5ContactMs: ok ? Math.round(mean((r) => r.contactMs)) : null,
    best5HeightCm: ok ? Math.round(mean((r) => r.heightCm) * 10) / 10 : null,
    why: ok ? null : rebounds.length >= 5 ? RJ_WHY.slow : RJ_WHY.tooFew,
  };
}

// ── a protocol over a read ───────────────────────────────────────────────────────────────────────────────────────

/** Each jump of a T5 read judged as the protocol: T5's refusals stand (the arm swing's lifted for cmjArms), plus the protocol's own. */
export function applyProtocol(id: ProtocolId, t5: T5Extra, frames: readonly PoseFrame[], front: FrontCalibration, aspect: number): T5Extra {
  const jumps = t5.jumps.map((j): JumpRead => {
    let why = j.invalidWhy;
    if (id === 'cmjArms' && why === T5_ARMS_WHY) why = undefined;
    if (!why) {
      const p: ProtocolWhyId | null =
        id === 'sj' ? (handsLeftHips(frames, j, aspect) ? 'handsOff' : squatJumpWhy(frames, front, j.takeoffT))
        : id === 'cmjHips' ? (handsLeftHips(frames, j, aspect) ? 'handsOff' : null)
        : id === 'cmjArms' ? (armsSwung(frames, j) ? null : 'noSwing')
        : id === 'singleLeft' || id === 'singleRight' ? (handsLeftHips(frames, j, aspect) ? 'handsOff' : freeFootDown(frames, front, j) ? 'otherFoot' : null)
        : null;
      if (p) why = PROTOCOL_WHY[p];
    }
    const { invalidWhy: _old, ...rest } = j;
    void _old;
    return { ...rest, valid: !why, ...(why ? { invalidWhy: why } : {}) };
  });
  return resummarise(t5, jumps);
}

export type ProtocolRead =
  | { ok: false; why: string }
  | {
      ok: true; protocol: ProtocolId; fps: number; stretch: number; t5: T5Extra;
      /** The frames at the real clock (the file's time ÷ the stretch): the frame-by-frame review steps through these. */
      frames: PoseFrame[];
      /** The stand's calibration (the body's scale: the push-off and the squat's depth read through it). */
      front: FrontCalibration;
      /** The best counted jump, and the owner's verified rule on it (a video is read as the slow-mo is). */
      best: JumpRead | null;
      verified: Verified | null;
      /** The 10-5 test's read (rj105 only). */
      rj: RjRead | null;
    };

/** A test's video, decoded (lib/jump/slowmoDecode.ts): its clock from gravity, its jumps, then the protocol. */
export function readProtocolClip(fileFrames: readonly PoseFrame[], aspect: number, id: ProtocolId): ProtocolRead {
  const r = analyseSlowMo(fileFrames, aspect);
  if (!r.ok) return r;
  const front = r.calibration.front!;
  const frames = r.stretch === 1 ? [...fileFrames] : fileFrames.map((f) => ({ ...f, t: f.t / r.stretch, ...(f.arrive !== undefined ? { arrive: f.arrive / r.stretch } : {}) }));
  const t5 = applyProtocol(id, r.t5, frames, front, aspect);
  const best = t5.jumps.find((j) => j.index === t5.bestJump) ?? null;
  return {
    ok: true, protocol: id, fps: r.fps, stretch: r.stretch, t5, frames, front, best,
    verified: best ? verifyJump(best, { poseHz: r.fps, source: 'slowmo' }) : null,
    rj: id === 'rj105' ? readRepeated(t5) : null,
  };
}

// ── comparisons: one leg against the other, the arms against the hips ───────────────────────────────────────────

export interface SideBest { bestCm: number; teCm: number }

export interface Asymmetry {
  /** |left − right| over the higher (%), whole. */
  pct: number;
  /** The higher leg, or null when the difference is inside the noise. */
  higher: 'left' | 'right' | null;
  /** The noise band on that difference (%): z·√(te_L² + te_R²) over the higher, the same gate realChange uses. */
  bandPct: number;
}

export function asymmetry(left: SideBest, right: SideBest): Asymmetry {
  const hi = Math.max(left.bestCm, right.bestCm);
  const d = left.bestCm - right.bestCm, band = jr('jump.realChangeZ') * Math.hypot(left.teCm, right.teCm);
  return {
    pct: hi > 0 ? Math.round((Math.abs(d) / hi) * 100) : 0,
    higher: Math.abs(d) <= band ? null : d > 0 ? 'left' : 'right',
    bandPct: hi > 0 ? Math.round((band / hi) * 100) : 0,
  };
}

/** The arm swing's gain over the hands-on-hips jump (cm, %), and whether it is past the noise. */
export function armSwingGain(arms: SideBest, hips: SideBest): { cm: number; pct: number; real: boolean; bandCm: number } {
  const d = arms.bestCm - hips.bestCm, band = jr('jump.realChangeZ') * Math.hypot(arms.teCm, hips.teCm);
  return { cm: Math.round(d * 10) / 10, pct: hips.bestCm > 0 ? Math.round((d / hips.bestCm) * 100) : 0, real: Math.abs(d) > band, bandCm: Math.round(band * 10) / 10 };
}

/** A read's best and typical error, for the comparisons (null: nothing counted). */
export function sideBest(t5: T5Extra | null | undefined): SideBest | null {
  const s = t5?.session;
  return s?.bestCm != null && s.typicalErrorCm != null ? { bestCm: s.bestCm, teCm: s.typicalErrorCm } : null;
}
