// reach — the one-time standing reach, and the touch height it turns an approach jump into (JUMP-PRO 2, 2026-10-24;
// owner: "an approach jump shows BOTH the vertical in inches and the touch height. Touch height needs a one-time
// standing-reach check").
//
// THE CHECK. Facing the camera, whole body in the shot: stand still, raise one arm straight up, hold it. The reach is
// the raised hand's index point over the floor, read while the arm is straight, near vertical and still for HOLD_MS.
//
// THE SCALE, WITHOUT A TAPE MEASURE. A camera sees the reach in picture units, and the picture's metres change with the
// distance. The body carries its own ruler: the reach is kept as a SHARE OF THE LEG (hip → knee → ankle, both legs), a
// number that does not change with the distance or the phone. Each approach jump then measures that same leg in metres
// through free fall (lib/jump/approach.ts legPathM: the leg in the picture × the jump's own gravity ruler), so
//   reach (m) = reachOverLeg × legPathM
//   touch     = reach + the jump's vertical (the centre of mass's rise: the Vertec convention, reach + jump)
// and a fingertip share is added (MediaPipe's "index" point is the knuckle, not the fingertip; jump.fingertipOverLeg).
//
// What this cannot see (docs/JUMP-PRO.md §9): a reach on tiptoe or a shrug reads as reach (the bench measures the shrug);
// MediaPipe's hip point is an estimate and may sit differently front-on and side-on (unmeasured: needs a real capture).
//
// Pure.
import type { PoseFrame } from '@/lib/pose/landmarks';
import { th } from '@/lib/assess/thresholds';
import { jr } from './PROPOSED-jump';

/** The reach check's numbers (new, JUMP-PRO 2; measured on lib/jump/reachBench.ts). */
export const REACH = {
  /** The arm is held straight and still at least this long (ms). */
  holdMs: 500,
  /** Straight: the shoulder–elbow–wrist angle at least this (deg). */
  straightDeg: 163,
  /** Up: the shoulder → wrist line within this of vertical (deg). */
  uprightDeg: 25,
  /** Still: the index point's height, first half of the hold against the second (share of the leg), within this. */
  stillShare: 0.02,
  /** A frame's up / straight is the majority of the frames within this (ms) either side. */
  smoothMs: 100,
  /**
   * The ankle point's height over the floor, standing, as a share of the leg (hip → knee → ankle): 0.039 of stature over
   * 0.491 (Drillis–Contini: ankle height, thigh + shank) = 0.079; the bench body 0.068 / 0.87 = 0.078.
   */
  ankleOverLeg: 0.079,
} as const;

const L = { shoulder: 11, elbow: 13, wrist: 15, index: 19, hip: 23, knee: 25, ankle: 27 } as const;
const R = { shoulder: 12, elbow: 14, wrist: 16, index: 20, hip: 24, knee: 26, ankle: 28 } as const;
const FEET = [27, 28, 29, 30, 31, 32];

const median = (v: number[]) => { if (!v.length) return NaN; const s = [...v].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const mad = (v: number[]) => { const m = median(v); return 1.4826 * median(v.map((x) => Math.abs(x - m))); };

/** The leg's length in the picture (hip → knee → ankle, mean of both legs), aspect-corrected; null if a leg is unseen. */
export function legPathOf(f: PoseFrame, aspect: number, minVis = th('gate.visibility')): number | null {
  if (!f.present || f.image.length < 33) return null;
  const seg = (a: number, b: number) => Math.hypot((f.image[a].x - f.image[b].x) * aspect, f.image[a].y - f.image[b].y);
  let sum = 0, n = 0;
  for (const s of [L, R]) {
    if ([s.hip, s.knee, s.ankle].some((k) => f.image[k].v < minVis)) continue;
    sum += seg(s.hip, s.knee) + seg(s.knee, s.ankle); n++;
  }
  return n ? sum / n : null;
}

export type ReachRead =
  | {
    ok: true;
    /** The index point over the floor ÷ the leg (hip → knee → ankle). */
    reachOverLeg: number;
    /** Its ±1 SD (share), from the hold's spread and length. */
    reachOverLegSd: number;
    /** The index point over the floor ÷ the standing nose-to-floor height (for the record). */
    reachOverBody: number | null;
    arm: 'left' | 'right';
    holdMs: number;
  }
  | { ok: false; why: string };

/** The standing reach in a clip facing the camera. `aspect` is the picture's width ÷ height. */
export function readReach(frames: readonly PoseFrame[], aspect: number): ReachRead {
  const vis = th('gate.visibility');
  const ok = frames.filter((f) => f.present && f.image.length >= 33 && FEET.every((k) => f.image[k].v >= vis));
  if (ok.length < 10) return { ok: false, why: 'Step back so your whole body, feet too, is in the shot.' };
  const angle = (f: PoseFrame, s: typeof L | typeof R) => {
    const p = (k: number) => ({ x: f.image[k].x * aspect, y: f.image[k].y });
    const a = p(s.shoulder), b = p(s.elbow), c = p(s.wrist);
    const u = { x: a.x - b.x, y: a.y - b.y }, w = { x: c.x - b.x, y: c.y - b.y };
    const elbow = (Math.acos(Math.max(-1, Math.min(1, (u.x * w.x + u.y * w.y) / (Math.hypot(u.x, u.y) * Math.hypot(w.x, w.y) || 1)))) * 180) / Math.PI;
    const tilt = (Math.atan2(Math.abs(c.x - a.x), a.y - c.y) * 180) / Math.PI;
    return { elbow, tilt, up: c.y < f.image[0].y };
  };
  // each side: each frame up, straight and seen or not — then a majority over ±SMOOTH_MS, so one jittered frame (an elbow
  // read 160° on a straight arm) does not break a hold, and the longest run of it
  let best: { side: 'left' | 'right'; run: PoseFrame[] } | null = null;
  let bentSeen = false;
  const span = (r: readonly PoseFrame[]) => r[r.length - 1].t - r[0].t;
  for (const [side, s] of [['left', L], ['right', R]] as const) {
    const state = ok.map((f) => {
      const a = [s.shoulder, s.elbow, s.wrist, s.index].every((k) => f.image[k].v >= vis) ? angle(f, s) : null;
      const upright = !!a && a.up && a.tilt <= REACH.uprightDeg;
      return { up: upright, straight: upright && a!.elbow >= REACH.straightDeg };
    });
    const maj = (k: 'up' | 'straight') => ok.map((f) => { let y = 0, n = 0; ok.forEach((g, j) => { if (Math.abs(g.t - f.t) <= REACH.smoothMs) { n++; if (state[j][k]) y++; } }); return y * 2 > n; });
    const up = maj('up'), straight = maj('straight');
    let run: PoseFrame[] = [];
    const flush = () => { if (run.length && (!best || span(run) > span(best.run))) best = { side, run }; run = []; };
    ok.forEach((f, i) => {
      if (up[i] && !straight[i]) bentSeen = true;
      if (straight[i]) run.push(f); else flush();
    });
    flush();
  }
  const b = best as { side: 'left' | 'right'; run: PoseFrame[] } | null;
  if (!b || span(b.run) < REACH.holdMs) {
    return { ok: false, why: bentSeen ? 'Straighten your arm all the way up and hold it for a second.' : 'Raise one arm straight up and hold it still for a second.' };
  }
  const s = b.side === 'left' ? L : R;
  // the floor UNDER THE BODY, during the hold. Facing the lens the toes stand 15–20 cm nearer it than the body and the
  // heels ~8 cm further, so in the picture the toes put the floor low and the heels high (perspective: −3 to +7 cm of
  // reach at 3 m, by the foot's length and the lens's height). The ankles stand under the hips, at the body's own
  // distance: the floor is the ankles' line plus the ankle's height, a fixed share of the leg (REACH.ankleOverLeg)
  const ankleY = median(b.run.map((f) => (f.image[27].y + f.image[28].y) / 2));
  const legs = b.run.map((f) => legPathOf(f, aspect)).filter((x): x is number => x !== null);
  const leg = median(legs);
  if (!(leg > 0)) return { ok: false, why: 'Keep your legs in the shot, hips to feet.' };
  const floor = ankleY + REACH.ankleOverLeg * leg;
  const shares = b.run.map((f) => (floor - f.image[s.index].y) / leg);
  // still: the hold's first half and second half agree (the landmarks' own jitter is not movement)
  const half = b.run[0].t + span(b.run) / 2;
  const drift = Math.abs(median(shares.filter((_, i) => b.run[i].t < half)) - median(shares.filter((_, i) => b.run[i].t >= half)));
  if (drift > REACH.stillShare) return { ok: false, why: 'Hold your arm still at the top for a second.' };
  const spread = mad(shares);
  const share = median(shares);
  // the standing height (nose to floor) from the frames before the arm went up, for the record
  const before = ok.filter((f) => f.t < b.run[0].t - 300).map((f) => floor - f.image[0].y);
  const body = before.length >= 5 ? median(before) : NaN;
  return {
    ok: true,
    reachOverLeg: Math.round(share * 10000) / 10000,
    // the median's standard error (1.25 σ/√n) and the leg's own (its frames' spread over √n), together
    reachOverLegSd: Math.round(Math.hypot((1.25 * spread) / Math.sqrt(shares.length), (share * mad(legs)) / leg / Math.sqrt(legs.length)) * 10000) / 10000,
    reachOverBody: Number.isFinite(body) && body > 0 ? Math.round(((floor - median(b.run.map((f) => f.image[s.index].y))) / body) * 1000) / 1000 : null,
    arm: b.side, holdMs: Math.round(b.run[b.run.length - 1].t - b.run[0].t),
  };
}

/** A stored standing reach (lib/jump/reachStore.ts): the share, and when it was taken. */
export interface StandingReach { reachOverLeg: number; reachOverLegSd: number; at: string }

export interface Touch {
  /** The standing reach (cm, the fingertip), the jump's vertical (cm) and their sum, the touch height (cm). */
  reachCm: number;
  verticalCm: number;
  touchCm: number;
  /** The touch's 95 % range (cm): the jump's ± and the reach's scale (the leg ruler's and the stored share's). */
  plusMinusCm: number;
}

/**
 * The touch height of an approach jump: the stored reach scaled by the jump's own leg in metres, plus the jump.
 * Null when the jump has no leg ruler.
 */
export function touchHeight(j: { heightCm: number; plusMinusCm: number; legPathM: number | null; legPathSdShare: number | null }, reach: Pick<StandingReach, 'reachOverLeg' | 'reachOverLegSd'>): Touch | null {
  if (!j.legPathM || !(reach.reachOverLeg > 0)) return null;
  const legCm = j.legPathM * 100;
  const reachCm = (reach.reachOverLeg + jr('jump.fingertipOverLeg')) * legCm;
  const reachSdCm = reachCm * Math.hypot(reach.reachOverLegSd / reach.reachOverLeg, j.legPathSdShare ?? jr('jump.legRulerSdPct') / 100);
  return {
    reachCm: Math.round(reachCm * 10) / 10,
    verticalCm: j.heightCm,
    touchCm: Math.round((reachCm + j.heightCm) * 10) / 10,
    plusMinusCm: Math.round(Math.hypot(j.plusMinusCm, 1.96 * reachSdCm) * 10) / 10,
  };
}

/** Centimetres as feet and inches, to the nearest half inch: 290 → "9 ft 6½ in". */
export function feetInches(cm: number): string {
  const halves = Math.round((cm / 2.54) * 2);
  const ft = Math.floor(halves / 24), inHalves = halves - ft * 24;
  const whole = Math.floor(inHalves / 2), half = inHalves % 2 ? '½' : '';
  return `${ft} ft ${whole}${half} in`;
}
