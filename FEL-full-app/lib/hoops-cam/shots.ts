// lib/hoops-cam/shots.ts — basketball on the camera (BBS, 2026-10-26): a shot, and whether it went in.
//
// The brief: "a shot = a ball rising out of the shooter's hands, then entering or missing the rim box". Read on the
// tracked ball (track.ts) in the frame's pixels, against the rim the user marked (rim.ts). The unit is the ring's
// half-width U in pixels (≈ 0.23 m at the ring), so every threshold below holds at any distance.
//
//   LAUNCH    the ball rising faster than LAUNCH_UPS ring half-widths a second for LAUNCH_FRAMES sightings, not off
//             the ring (seen at it inside REBOUND_MS: a rebound) and not inside COOLDOWN_MS of the last shot. With a
//             pose, the ball is also over the shooter's shoulders (a dribble coming up is not a shot).
//   A SHOT    only once the flight's top comes within APEX_BELOW_U of the ring's height or over it: a dribble, a pass
//             or a toss never does, and it is dropped without a word.
//   THROUGH   coming down, the ball crosses the ring's line inside INSIDE_U of its centre (the ball's centre clear of
//             the ring's ends): a candidate make. It is a MAKE once it is seen NET_DEPTH_U under the ring still inside
//             NET_SIDE_U of its centre; it goes back to ON THE RIM if it pops back up over the ring.
//   ON THE RIM crossing within the ring's reach (ends + a ball): it may roll in. It is a miss once it falls RIM_OUT_U
//             under the ring outside it, or after ON_RIM_MS. Seen under the ring and inside it with no crossing inside
//             seen (hidden by the ring): rolled in when the net braked it (it got there NET_SLOW times later than a free
//             fall from its speed at the ring), else it fell past — either way NOT SURE, and asked.
//   OFF       crossing farther out than that: a miss (short, long, wide or an air ball, by where it came down).
//   LOST      the ball unseen past LOST_MS while the shot is open: decided from what was seen, and flagged NOT SURE —
//             the page asks the user to tap make or miss (beta, tap-to-correct).
//
// A camera that looks along the shot (behind the shooter) cannot tell a ball in front of the ring from one through it:
// depth is invisible to one lens. That is why the guide asks for the phone off to the side, and why the bench reports
// the behind-the-shooter set-up on its own.
//
// Pure.
import type { BallObs } from './track';
import type { RimPx } from './rim';
import type { Lm } from '@/lib/pose/landmarks';
import { segmentUnits } from '@/lib/vbt/track';

/** (new) Shot-reading thresholds, in ring half-widths (U) and ms. */
export const LAUNCH_UPS = 7;
export const LAUNCH_FRAMES = 2;
export const APEX_BELOW_U = 1.2;
export const INSIDE_U = 0.82;
export const RIM_REACH_U = 1.75;
export const NET_DEPTH_U = 1.6;
export const NET_SIDE_U = 1.5;
export const RIM_OUT_U = 1.6;
export const NET_MS = 600;
export const ON_RIM_MS = 1400;
export const LOST_MS = 450;
export const COOLDOWN_MS = 700;
/** A rising ball that came down onto the ring this recently (ms) is a rebound, not a shot. */
export const REBOUND_MS = 600;
/** A flight that never comes within reach of the ring by this long after its top is given up as a miss. */
export const FLIGHT_MAX_MS = 2600;
/** (new) Through the net = reaching NET_DEPTH_U at least this many times later than a free fall would. */
export const NET_SLOW = 1.25;

export type ShotOutcome = 'make' | 'miss';
export type ShotWhy = 'through' | 'rolled_in' | 'rim_out' | 'off' | 'air_ball' | 'lost';

export interface ShotRead {
  index: number;
  /** The release (ms, the camera's clock): the flight's first rising sighting. */
  t: number;
  outcome: ShotOutcome;
  /** false: the ball was lost at the ring; the page asks. */
  sure: boolean;
  why: ShotWhy;
  /** Where it crossed the ring's line, in half-widths from the centre (− left in the picture), when it did. */
  crossU: number | null;
  /** The flight's top, in half-widths above the ring (+ over it). */
  apexU: number;
  /** The shooter at the release: the feet's midpoint (normalised image) and the shoulder→ankle length (image heights). */
  feet: { x: number; y: number } | null;
  bodyUnits: number | null;
  /** The release point (normalised image). */
  from: { x: number; y: number };
}

type State = 'idle' | 'flight' | 'through' | 'rim';

interface Flight {
  t0: number;
  from: { x: number; y: number };
  apexY: number;
  apexT: number;
  last: BallObs;
  lastSeen: number;
  crossU: number | null;
  enteredAt: number;
  feet: ShotRead['feet'];
  bodyUnits: number | null;
  nearRim: boolean;
  /** It touched down on the ring before going through. */
  rolled: boolean;
  /** The last crossing of the ring's line going down: when, and how fast (px/s, down +). */
  cross: { t: number; vy: number } | null;
}

const mid = (a: Lm | undefined, b: Lm | undefined) => (a && b && a.v >= 0.5 && b.v >= 0.5 ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : null);

export class ShotReader {
  private state: State = 'idle';
  private rising: BallObs[] = [];
  private f: Flight | null = null;
  private lastShotT = -Infinity;
  private atRimT = -Infinity;
  private n = 0;
  private pose: { t: number; image: readonly Lm[] } | null = null;

  constructor(private rim: RimPx, private frame: { w: number; h: number }) {}

  setRim(rim: RimPx): void { this.rim = rim; this.reset(); }
  reset(): void { this.state = 'idle'; this.rising = []; this.f = null; }
  get open(): boolean { return this.state !== 'idle'; }

  /** The latest pose (normalised landmarks), for the shooter's feet and shoulders at the release. */
  seePose(t: number, image: readonly Lm[] | null): void { if (image && image.length >= 29) this.pose = { t, image }; }

  /** One frame's ball (null: nothing tracked). Returns a shot when one was decided this frame. */
  step(t: number, obs: BallObs | null): ShotRead | null {
    const U = Math.max(1, this.rim.hw);
    switch (this.state) {
      case 'idle': return this.idle(t, obs, U);
      case 'flight': return this.flight(t, obs, U);
      case 'through': return this.through(t, obs, U);
      case 'rim': return this.onRim(t, obs, U);
    }
  }

  /** Close an open shot now (the session ended): decided from what was seen, not sure. */
  flush(t: number): ShotRead | null {
    if (this.state === 'idle' || !this.f) return null;
    const valid = this.f.apexY <= this.rim.y + APEX_BELOW_U * this.rim.hw;
    if (!valid) { this.reset(); return null; }
    return this.decide(t, this.state === 'through' ? 'make' : 'miss', false, 'lost');
  }

  private idle(t: number, obs: BallObs | null, U: number): ShotRead | null {
    // a ball that came DOWN onto the ring and goes up again is a rebound (a shot rising past the ring is not)
    if (obs && !obs.coast && obs.vy > 0 && Math.abs(obs.x - this.rim.x) <= RIM_REACH_U * U * 1.5 && Math.abs(obs.y - this.rim.y) <= RIM_REACH_U * U) this.atRimT = t;
    if (!obs || obs.coast) { if (!obs) this.rising = []; return null; }
    const up = -obs.vy / U >= LAUNCH_UPS;
    // a flight starts in the shooter's hands, not off the ring (a rebound) and not right after the last shot
    if (!up || t - this.lastShotT < COOLDOWN_MS || t - this.atRimT < REBOUND_MS) { this.rising = []; return null; }
    this.rising.push(obs);
    if (this.rising.length < LAUNCH_FRAMES) return null;
    const first = this.rising[0];
    // with a pose: the ball is up over the shoulders (out of the hands, not a dribble coming up)
    const p = this.pose && Math.abs(this.pose.t - t) < 300 ? this.pose.image : null;
    const sh = p ? mid(p[11], p[12]) : null;
    if (sh && obs.y > sh.y * this.frame.h) return null;
    const feet = p ? mid(p[27], p[28]) : null;
    this.f = {
      t0: first.t, from: { x: first.x / this.frame.w, y: first.y / this.frame.h }, apexY: obs.y, apexT: t, last: obs, lastSeen: t,
      crossU: null, enteredAt: -Infinity, feet, bodyUnits: p ? segmentUnits(p, this.frame.w / this.frame.h) : null, nearRim: false, rolled: false, cross: null,
    };
    this.rising = [];
    this.state = 'flight';
    return null;
  }

  private seen(t: number, obs: BallObs | null): BallObs | null {
    const f = this.f!;
    if (!obs || obs.coast) return null;
    if (obs.y < f.apexY) { f.apexY = obs.y; f.apexT = t; }
    const near = Math.abs(obs.x - this.rim.x) <= 3 * this.rim.hw && Math.abs(obs.y - this.rim.y) <= 3 * this.rim.hw;
    if (near) f.nearRim = true;
    return obs;
  }

  /** The ball crossed the ring's line going down between the last sighting and this one: where, in U (else null). */
  private crossing(prev: BallObs, cur: BallObs, U: number): number | null {
    if (!(prev.y < this.rim.y && cur.y >= this.rim.y)) return null;
    const u = (this.rim.y - prev.y) / Math.max(1e-6, cur.y - prev.y);
    this.f!.cross = { t: prev.t + (cur.t - prev.t) * u, vy: Math.max(0, (cur.y - prev.y) / Math.max(1e-3, (cur.t - prev.t) / 1000)) };
    return (prev.x + (cur.x - prev.x) * u - this.rim.x) / U;
  }

  /**
   * The net's brake: a ball through the net reaches NET_DEPTH_U under the ring later than a free fall from its speed at
   * the ring would (the net holds it); a ball falling past the ring (in front of it or behind it, which one lens cannot
   * tell apart) does not. Gravity in pixels comes from the ring's size: 9.81 m/s² over its 0.2286 m half-width.
   */
  private netSlowed(t: number, y: number, U: number): boolean | null {
    const c = this.f!.cross;
    if (!c) return null;
    const g = (9.81 / 0.2286) * U, d = y - this.rim.y;
    if (d <= 0) return null;
    const free = (-c.vy + Math.sqrt(c.vy * c.vy + 2 * g * d)) / g;
    return (t - c.t) / 1000 >= NET_SLOW * free;
  }

  private lost(t: number): boolean { return t - this.f!.lastSeen > LOST_MS; }

  private flight(t: number, obs: BallObs | null, U: number): ShotRead | null {
    const f = this.f!;
    const valid = () => f.apexY <= this.rim.y + APEX_BELOW_U * U;
    const o = this.seen(t, obs);
    if (!o) {
      if (!this.lost(t)) return null;
      if (!valid()) { this.reset(); return null; }
      return this.decide(t, 'miss', false, 'lost');
    }
    const prev = f.last;
    f.last = o; f.lastSeen = t;
    const cu = this.crossing(prev, o, U);
    if (cu !== null && valid()) {
      f.crossU = cu;
      if (Math.abs(cu) <= INSIDE_U) { this.state = 'through'; f.enteredAt = t; return null; }
      if (Math.abs(cu) <= RIM_REACH_U) { this.state = 'rim'; f.enteredAt = t; return null; }
      return this.decide(t, 'miss', true, f.nearRim ? 'off' : 'air_ball');
    }
    // came down past the ring's line without ever being over it: not a shot (a pass, a toss) — or, if it was, an air ball
    if (o.y > this.rim.y + RIM_OUT_U * U && o.vy > 0 && t > f.apexT) {
      if (!valid()) { this.reset(); return null; }
      if (f.crossU === null) return this.decide(t, 'miss', true, 'air_ball');
    }
    if (t - f.apexT > FLIGHT_MAX_MS) { if (!valid()) { this.reset(); return null; } return this.decide(t, 'miss', false, 'lost'); }
    return null;
  }

  private through(t: number, obs: BallObs | null, U: number): ShotRead | null {
    const f = this.f!;
    const o = this.seen(t, obs);
    if (!o) {
      if (t - f.enteredAt > NET_MS && this.lost(t)) return this.decide(t, 'make', false, 'lost');
      return null;
    }
    f.last = o; f.lastSeen = t;
    if (o.y < this.rim.y - 0.3 * U && o.vy < 0) { this.state = 'rim'; f.enteredAt = t; return null; }   // popped back up
    if (o.y >= this.rim.y + NET_DEPTH_U * U) {
      if (Math.abs(o.x - this.rim.x) > NET_SIDE_U * U) return this.decide(t, 'miss', false, 'rim_out');
      // through the ring's line inside it, and under it inside: a make
      return this.decide(t, 'make', true, 'through');
    }
    if (t - f.enteredAt > NET_MS * 2) return this.decide(t, 'make', false, 'through');
    return null;
  }

  private onRim(t: number, obs: BallObs | null, U: number): ShotRead | null {
    const f = this.f!;
    const o = this.seen(t, obs);
    if (!o) {
      if (this.lost(t)) return this.decide(t, 'miss', false, 'lost');
      return null;
    }
    const prev = f.last;
    f.last = o; f.lastSeen = t;
    const cu = this.crossing(prev, o, U);
    if (cu !== null && Math.abs(cu) <= INSIDE_U) { f.crossU = cu; f.rolled = true; this.state = 'through'; f.enteredAt = t; return null; }
    if (o.y >= this.rim.y + RIM_OUT_U * U && Math.abs(o.x - this.rim.x) > INSIDE_U * U) return this.decide(t, 'miss', true, 'rim_out');
    // under the ring and inside it with no crossing seen inside: rolled in only if the net held it; else it fell past
    if (o.y >= this.rim.y + NET_DEPTH_U * U && Math.abs(o.x - this.rim.x) <= INSIDE_U * U) {
      return this.netSlowed(t, o.y, U) ? this.decide(t, 'make', false, 'rolled_in') : this.decide(t, 'miss', false, 'off');
    }
    if (t - f.enteredAt > ON_RIM_MS) return this.decide(t, 'miss', false, 'rim_out');
    return null;
  }

  private decide(t: number, outcome: ShotOutcome, sure: boolean, why: ShotWhy): ShotRead {
    const f = this.f!;
    const U = Math.max(1, this.rim.hw);
    const read: ShotRead = {
      index: ++this.n, t: f.t0, outcome, sure, why: why === 'through' && f.rolled ? 'rolled_in' : why,
      crossU: f.crossU === null ? null : Math.round(f.crossU * 100) / 100,
      apexU: Math.round(((this.rim.y - f.apexY) / U) * 10) / 10,
      feet: f.feet, bodyUnits: f.bodyUnits, from: f.from,
    };
    this.lastShotT = t;
    this.reset();
    return read;
  }

}
