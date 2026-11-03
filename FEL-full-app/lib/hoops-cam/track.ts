// lib/hoops-cam/track.ts — basketball on the camera (BBS, 2026-10-26): one ball, frame to frame.
//
// The detector (ball.ts) returns every disc-like moving orange group in a frame: the ball, and now and then a knee, a
// hand or a shoe of the right colour. This keeps a few TRACKS at once and says which one is the ball:
//   ASSOCIATE  each track predicts itself (its velocity, and gravity in pixels when the scale is known) and takes the
//              best group inside its gate — disc-like, the track's size within SIZE_KEEP, near the prediction. The gate
//              grows with the track's speed and with every frame it goes unseen.
//   BIRTH      a disc-like group (START_SHAPE) of a size the caller allows that no track took starts a new track; up to
//              MAX_TRACKS live at once (the weakest goes first).
//   COAST      a track unseen (behind the net, a hand) keeps its prediction for up to COAST_MS, then ends.
//   THE BALL   a track confirmed in CONFIRM sightings, scored by how disc-like it has been, how far it has GOT AROUND (the
//              span of its last second, or its net speed now: a ball flies, bounces and is carried; a knee or a shoe
//              jitters in place) and how long it has lasted. The ball's track is kept
//              until another beats it by SWITCH_MARGIN, so the read never flickers between two.
// Times are the camera's own (ms); nothing assumes even frames.
//
// Pure.
import { BallDetector, poseMask, type BallCand, type Mask } from './ball';
import type { Rgb } from './frame';

/** (new) Tracking thresholds. */
export const START_SHAPE = 0.45;
export const CONFIRM = 2;
export const SIZE_KEEP = 2.2;
export const COAST_MS = 260;
/** A gate's floor: this many radii around the prediction. */
export const GATE_RADII = 3.5;
export const MAX_TRACKS = 8;
/** A new track's standing against the confirmed ones when there are too many (a still blob scores ~0.7). */
const NEWBORN = 0.45;
export const SWITCH_MARGIN = 0.25;
/** (new) A track that has travelled this many of its radii (summed over its last second) reads fully as "moving". */
export const TRAVEL_FULL_R = 12;
/** (new) …or is moving this many of its radii a second right now (a ball just released). */
export const FAST_R_PER_S = 25;
const FAST_WINDOW_MS = 150;
/** (new) A tracked ball this big (px radius) has its seams closed before grouping. */
export const CLOSE_FROM_R = 6;

export interface BallObs {
  t: number;
  x: number; y: number; r: number;
  /** Velocity (px/s), from the track. */
  vx: number; vy: number;
  /** The prediction, not a sighting (the ball was hidden this frame). */
  coast: boolean;
}

interface Track {
  id: number;
  x: number; y: number; r: number; vx: number; vy: number;
  t: number; seenT: number; bornT: number; hits: number;
  shape: number;
  /** Recent sightings (t, x, y) over the last second, for the travel. */
  path: { t: number; x: number; y: number }[];
  coast: boolean;
}

export interface TrackerOpts {
  /** The radius range a ball may have here (px), when the caller knows the scale (the rim's size). */
  rRange?: { min: number; max: number } | null;
  /** Gravity in px/s² (down is +), when the scale is known; 0 = constant velocity. */
  gPx?: number;
}

export class BallTracker {
  private tracks: Track[] = [];
  private ballId: number | null = null;
  private nextId = 1;
  constructor(private opts: TrackerOpts = {}) {}

  setOpts(o: TrackerOpts): void { this.opts = { ...this.opts, ...o }; }
  reset(): void { this.tracks = []; this.ballId = null; }
  get tracking(): boolean { return this.ballId !== null; }

  /** How many 3×3 dilations close a ball of the tracked size (its seams widen with it): none for a small ball (a dilation
   *  would join it to the ring or a hand), 1 to 3 from CLOSE_FROM_R up. */
  closeFor(): number {
    const tr = this.tracks.find((k) => k.id === this.ballId);
    return tr && tr.r >= CLOSE_FROM_R ? Math.max(1, Math.min(3, Math.round(tr.r * 0.1))) : 0;
  }

  private sizeOk(r: number): boolean {
    const rr = this.opts.rRange;
    return !rr || (r >= rr.min && r <= rr.max);
  }

  private predict(tr: Track, t: number): { x: number; y: number } {
    const dt = Math.max(0, (t - tr.t) / 1000);
    return { x: tr.x + tr.vx * dt, y: tr.y + tr.vy * dt + 0.5 * (this.opts.gPx ?? 0) * dt * dt };
  }

  private gate(tr: Track, t: number): number {
    const dt = Math.max(0, (t - tr.t) / 1000);
    const speed = Math.hypot(tr.vx, tr.vy);
    const unseen = Math.max(0, (t - tr.seenT) / 1000);
    return Math.max(GATE_RADII * tr.r, 0.35 * speed * dt + 2.5 * tr.r) + unseen * speed * 0.5 + 3;
  }

  /** How far the track has got around over its last second, in its radii: the span of its path (jitter in place is ~0). */
  private travel(tr: Track): number {
    if (tr.path.length < 2) return 0;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of tr.path) { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; }
    return Math.hypot(x1 - x0, y1 - y0) / Math.max(1, tr.r);
  }

  /** Its speed now, in its radii a second, from its net displacement over the last FAST_WINDOW_MS (not frame jitter). */
  private speedR(tr: Track): number {
    const last = tr.path[tr.path.length - 1];
    const from = tr.path.find((p) => p.t >= last.t - FAST_WINDOW_MS) ?? tr.path[0];
    const dt = (last.t - from.t) / 1000;
    return dt > 0.04 ? Math.hypot(last.x - from.x, last.y - from.y) / dt / Math.max(1, tr.r) : 0;
  }

  /** How ball-like a confirmed track is (0..~2). */
  private score(tr: Track): number {
    const moving = Math.min(1, Math.max(this.travel(tr) / TRAVEL_FULL_R, this.speedR(tr) / FAST_R_PER_S));
    const age = Math.min(1, tr.hits / 8);
    return tr.shape * 0.6 + moving * 0.9 + age * 0.3 - (tr.coast ? 0.15 : 0);
  }

  /** One frame's candidates (time-ordered calls). The ball this frame, seen or coasted, or null. */
  step(t: number, cands: readonly BallCand[]): BallObs | null {
    const free = cands.filter((c) => this.sizeOk(c.r));
    const taken = new Set<BallCand>();
    // associate: the most-seen tracks pick first
    for (const tr of [...this.tracks].sort((a, b) => b.hits - a.hits)) {
      const p = this.predict(tr, t);
      const g = this.gate(tr, t);
      let best: BallCand | null = null, bestScore = -Infinity;
      for (const c of free) {
        if (taken.has(c)) continue;
        const d = Math.hypot(c.x - p.x, c.y - p.y);
        if (d > g) continue;
        if (c.r > tr.r * SIZE_KEEP || c.r < tr.r / SIZE_KEEP) continue;
        const s = c.shape - 0.8 * (d / g) - 0.3 * Math.abs(Math.log(c.r / tr.r));
        if (s > bestScore) { bestScore = s; best = c; }
      }
      const dt = Math.max(1e-3, (t - tr.t) / 1000);
      if (best) {
        taken.add(best);
        const nvx = (best.x - tr.x) / dt, nvy = (best.y - tr.y) / dt;
        const a = tr.hits < 3 ? 1 : 0.6;
        tr.vx += (nvx - tr.vx) * a; tr.vy += (nvy - tr.vy) * a;
        tr.x = best.x; tr.y = best.y; tr.r = tr.r * 0.7 + best.r * 0.3; tr.t = t; tr.seenT = t; tr.hits++;
        tr.shape = tr.shape * 0.7 + best.shape * 0.3; tr.coast = false;
        tr.path.push({ t, x: best.x, y: best.y });
        while (tr.path.length && tr.path[0].t < t - 1000) tr.path.shift();
      } else {
        tr.x = p.x; tr.y = p.y; tr.vy += (this.opts.gPx ?? 0) * dt; tr.t = t; tr.coast = true;
      }
    }
    this.tracks = this.tracks.filter((tr) => t - tr.seenT <= COAST_MS);
    // births
    for (const c of free) {
      if (taken.has(c) || c.shape < START_SHAPE) continue;
      this.tracks.push({ id: this.nextId++, x: c.x, y: c.y, r: c.r, vx: 0, vy: 0, t, seenT: t, bornT: t, hits: 1, shape: c.shape, path: [{ t, x: c.x, y: c.y }], coast: false });
    }
    if (this.tracks.length > MAX_TRACKS) {
      // the weakest go: a newborn is worth a still, confirmed blob (a shoe, a knee) so a fresh ball always gets its chance
      const rank = (tr: Track) => (tr.hits >= CONFIRM ? this.score(tr) : tr.shape * 0.6 + NEWBORN);
      this.tracks.sort((a, b) => rank(b) - rank(a));
      this.tracks.length = MAX_TRACKS;
    }
    // which is the ball
    const confirmed = this.tracks.filter((tr) => tr.hits >= CONFIRM);
    const cur = confirmed.find((tr) => tr.id === this.ballId) ?? null;
    let pick = cur;
    for (const tr of confirmed) {
      if (tr === cur) continue;
      if (!pick || this.score(tr) > this.score(pick) + (pick === cur ? SWITCH_MARGIN : 0)) pick = tr;
    }
    this.ballId = pick ? pick.id : null;
    if (!pick) return null;
    return { t, x: pick.x, y: pick.y, r: pick.r, vx: pick.vx, vy: pick.vy, coast: pick.coast };
  }
}

/** The detector and the tracker together: one call per frame, the pose's face and torso masked. */
export class BallEye {
  readonly detector = new BallDetector();
  readonly tracker: BallTracker;
  constructor(opts: TrackerOpts = {}) { this.tracker = new BallTracker(opts); }

  reset(): void { this.detector.reset(); this.tracker.reset(); }

  see(t: number, f: Rgb, pose?: readonly { x: number; y: number; v: number }[] | null, extraMask?: Mask | null): BallObs | null {
    const pm = poseMask(pose, f.w, f.h);
    const exclude: Mask | null = pm || extraMask ? { discs: [...(pm?.discs ?? []), ...(extraMask?.discs ?? [])], quads: [...(pm?.quads ?? []), ...(extraMask?.quads ?? [])] } : null;
    const cands = this.detector.detect(f, { exclude, close: this.tracker.closeFor() });
    return this.tracker.step(t, cands);
  }
}
