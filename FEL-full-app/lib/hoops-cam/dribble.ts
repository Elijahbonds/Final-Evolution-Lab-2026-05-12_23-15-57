// lib/hoops-cam/dribble.ts — basketball on the camera (BBS-02, 2026-10-26): dribbles counted off a plain ball.
//
// The tracked ball (track.ts) goes down to the floor and back up to the hand. Its path is read for its turning points
// with a hysteresis of HYST_R radii (noise and blur never make a turn):
//   a BOTTOM   (the floor) that drops at least AMP_R radii from the top before it is a dribble;
//   a TOP      (the hand) says which side the ball is on: left or right of the player's middle (the hips' midpoint from
//              the pose, else the running middle of the ball's own path), and with a pose, WHICH HAND — the wrist nearer
//              the ball. A dribble whose top lands on the other side from the one before is a CROSSOVER.
// From the dribbles: the count, crossovers, each hand's count, the rate (the median gap, a set at a time: a pause
// longer than SET_GAP_MS starts a new set), the rhythm (the gaps' spread, CV %), and the height (the tops against the
// hips and knees, when the pose sees them).
//
// The previous read of a crossover was a hand crossing the body (lib/move/bodyControlSource.ts): that is kept for the
// games; this one needs a real ball.
//
// Pure.
import type { BallObs } from './track';
import type { Lm } from '@/lib/pose/landmarks';

/** (new) Turning-point hysteresis and the smallest dribble, in ball radii; a pause that starts a new set (ms). */
export const HYST_R = 0.9;
export const AMP_R = 2.6;
export const SET_GAP_MS = 1300;
/** (new) The ball unseen this long (ms) forgets its direction (a new dribble starts clean). */
export const DRIBBLE_LOST_MS = 500;
/** (new) A top this far (ball radii) from the middle is on a side; nearer, it keeps the side before. */
export const SIDE_R = 0.8;

export interface Bounce {
  /** The floor contact (ms, the camera's clock). */
  t: number;
  /** The hand that took it back (the player's own side), when known. */
  hand: 'L' | 'R' | null;
  /** The ball came back up on the other side from the dribble before. */
  cross: boolean;
  /** How high it came back (share of the hips' height over the floor), when the pose sees both. */
  topShare: number | null;
}

export interface DribbleRead {
  bounces: Bounce[];
  count: number;
  crossovers: number;
  left: number;
  right: number;
  /** Dribbles a second over the sets (null under 3 dribbles). */
  rateHz: number | null;
  /** The gaps' spread as a CV % (lower = steadier), null under 4 dribbles. */
  rhythmCv: number | null;
  /** The dribble's height, from the tops: under the knee, knee to hip, over the hip. */
  height: 'low' | 'mid' | 'high' | null;
  sets: number;
}

const median = (xs: number[]) => { if (!xs.length) return NaN; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export class DribbleReader {
  private dir: 'down' | 'up' | null = null;
  private ext: { t: number; x: number; y: number; r: number } | null = null;
  private lastTop: { t: number; x: number; y: number; side: number } | null = null;
  private pendingBounce: { t: number; depth: number } | null = null;
  private seenT = -Infinity;
  private xs: number[] = [];
  private pose: { t: number; image: readonly Lm[] } | null = null;
  private out: Bounce[] = [];
  private tops: number[] = [];

  constructor(private frame: { w: number; h: number }) {}

  reset(): void {
    this.dir = null; this.ext = null; this.lastTop = null; this.pendingBounce = null; this.seenT = -Infinity;
    this.xs = []; this.out = []; this.tops = []; this.pose = null;
  }

  /** One frame: the ball (null or a coast are skipped) and the pose (normalised), in time order. */
  step(t: number, obs: BallObs | null, pose?: readonly Lm[] | null): Bounce | null {
    if (pose && pose.length >= 29) this.pose = { t, image: pose };
    if (!obs || obs.coast) {
      if (t - this.seenT > DRIBBLE_LOST_MS) { this.dir = null; this.ext = null; }
      return null;
    }
    this.seenT = t;
    this.xs.push(obs.x); if (this.xs.length > 90) this.xs.shift();
    const hyst = Math.max(2.5, HYST_R * obs.r);
    if (!this.ext || !this.dir) { this.ext = { t, x: obs.x, y: obs.y, r: obs.r }; this.dir = obs.vy >= 0 ? 'down' : 'up'; return null; }
    if (this.dir === 'down') {
      if (obs.y >= this.ext.y) { this.ext = { t, x: obs.x, y: obs.y, r: obs.r }; return null; }
      if (this.ext.y - obs.y < hyst) return null;
      // a bottom: a dribble when it fell far enough from the last top
      const b = this.ext;
      this.dir = 'up'; this.ext = { t, x: obs.x, y: obs.y, r: obs.r };
      const fell = this.lastTop ? b.y - this.lastTop.y : Infinity;
      if (fell >= AMP_R * b.r) this.pendingBounce = { t: b.t, depth: b.y };
      return null;
    }
    if (obs.y <= this.ext.y) { this.ext = { t, x: obs.x, y: obs.y, r: obs.r }; return null; }
    if (obs.y - this.ext.y < hyst) return null;
    // a top
    const top = this.ext;
    this.dir = 'down'; this.ext = { t, x: obs.x, y: obs.y, r: obs.r };
    return this.onTop(top);
  }

  private middleX(t: number): number {
    const p = this.pose && Math.abs(this.pose.t - t) < 400 ? this.pose.image : null;
    const l = p?.[23], r = p?.[24];
    if (l && r && l.v >= 0.5 && r.v >= 0.5) return ((l.x + r.x) / 2) * this.frame.w;
    return median(this.xs);
  }

  private handAt(top: { t: number; x: number; y: number }): 'L' | 'R' | null {
    const p = this.pose && Math.abs(this.pose.t - top.t) < 400 ? this.pose.image : null;
    const lw = p?.[15], rw = p?.[16];
    if (!lw || !rw || lw.v < 0.5 || rw.v < 0.5) return null;
    const d = (w: Lm) => Math.hypot(w.x * this.frame.w - top.x, w.y * this.frame.h - top.y);
    return d(lw) <= d(rw) ? 'L' : 'R';
  }

  private topShare(y: number, t: number): number | null {
    const p = this.pose && Math.abs(this.pose.t - t) < 400 ? this.pose.image : null;
    const hip = p && p[23] && p[24] && p[23].v >= 0.5 && p[24].v >= 0.5 ? ((p[23].y + p[24].y) / 2) * this.frame.h : null;
    const ank = p && p[27] && p[28] && p[27].v >= 0.5 && p[28].v >= 0.5 ? ((p[27].y + p[28].y) / 2) * this.frame.h : null;
    if (hip === null || ank === null || ank - hip < 5) return null;
    return Math.round(((ank - y) / (ank - hip)) * 100) / 100;
  }

  private onTop(top: { t: number; x: number; y: number; r: number }): Bounce | null {
    const mx = this.middleX(top.t);
    const off = top.x - mx;
    // a dribble after a pause (a new set) is not a crossover, whatever side the ball was held on
    const prevSide = this.lastTop && top.t - this.lastTop.t <= SET_GAP_MS ? this.lastTop.side : 0;
    const side = Math.abs(off) >= SIDE_R * top.r ? Math.sign(off) : prevSide;
    const bounce = this.pendingBounce;
    this.pendingBounce = null;
    this.lastTop = { t: top.t, x: top.x, y: top.y, side };
    if (!bounce) return null;
    const b: Bounce = { t: bounce.t, hand: this.handAt(top), cross: prevSide !== 0 && side !== 0 && side !== prevSide, topShare: this.topShare(top.y, top.t) };
    this.out.push(b);
    if (b.topShare !== null) this.tops.push(b.topShare);
    return b;
  }

  read(): DribbleRead {
    const b = this.out;
    const gaps: number[] = [];
    let sets = b.length ? 1 : 0;
    for (let i = 1; i < b.length; i++) {
      const g = b[i].t - b[i - 1].t;
      if (g > SET_GAP_MS) { sets++; continue; }
      gaps.push(g);
    }
    const med = median(gaps);
    const mean = gaps.length ? gaps.reduce((a, x) => a + x, 0) / gaps.length : NaN;
    const sd = gaps.length > 1 ? Math.sqrt(gaps.reduce((a, x) => a + (x - mean) ** 2, 0) / (gaps.length - 1)) : NaN;
    const topMed = this.tops.length ? median(this.tops) : null;
    // the knee sits at about 0.53 of the hip's height (Drillis–Contini segment shares: knee 0.285, hip 0.53 of stature)
    const height = topMed === null ? null : topMed < 0.55 ? 'low' : topMed <= 1.05 ? 'mid' : 'high';
    return {
      bounces: [...b], count: b.length, crossovers: b.filter((x) => x.cross).length,
      left: b.filter((x) => x.hand === 'L').length, right: b.filter((x) => x.hand === 'R').length,
      rateHz: b.length >= 3 && Number.isFinite(med) && med > 0 ? Math.round((1000 / med) * 100) / 100 : null,
      rhythmCv: gaps.length >= 3 && Number.isFinite(sd) ? Math.round((sd / mean) * 1000) / 10 : null,
      height, sets,
    };
  }
}
