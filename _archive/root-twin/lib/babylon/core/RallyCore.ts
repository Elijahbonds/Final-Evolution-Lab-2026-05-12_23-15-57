// RallyCore — the shared engine for NET SPORTS (tennis, volleyball).
//
// Tennis and volleyball are the same game underneath: a ball crosses a net,
// each side gets a timing window to return it, and a rally ends when someone
// misses, hits it out, or puts it into the net. Only the scoring and the
// number of touches per side differ. Writing that once means the second mode
// costs a config object instead of a rewrite — the same reasoning behind
// BasketballCore serving 1v1, 3v3 and the dunk contest.
//
// DELIBERATELY FREE OF BABYLON. Every function here is arithmetic on plain
// numbers, which is what lets it be executed and tested directly instead of
// only being read. The modes own all the meshes.

// ── timing ────────────────────────────────────────────────────────────────

export type SwingQuality = 'perfect' | 'good' | 'early' | 'late' | 'miss';

/** Half-width of each timing band, in seconds around the ideal contact time. */
export const SWING_BANDS = { perfect: 0.09, good: 0.20, ok: 0.34 } as const;

/**
 * Grade a swing. `dt` is (swingTime − idealContactTime): negative is early.
 *
 * Note `early` and `late` are distinct results rather than one "ok" — they
 * push the ball to different depths below, which is what makes timing feel
 * like placement instead of a pass/fail dice roll.
 */
export function gradeSwing(dt: number): SwingQuality {
  const a = Math.abs(dt);
  if (a <= SWING_BANDS.perfect) return 'perfect';
  if (a <= SWING_BANDS.good) return 'good';
  if (a <= SWING_BANDS.ok) return dt < 0 ? 'early' : 'late';
  return 'miss';
}

/** Power multiplier by quality. Early contact is rushed and short; late is
 *  jammed and shorter still. */
export const QUALITY_POWER: Record<SwingQuality, number> = {
  perfect: 1.0, good: 0.86, early: 0.70, late: 0.62, miss: 0,
};

// ── flight ────────────────────────────────────────────────────────────────

export interface Vec3 { x: number; y: number; z: number }

export interface RallyConfig {
  /** Court half-length along Z. Baseline sits at ±halfLength. */
  halfLength: number;
  /** Court half-width along X. */
  halfWidth: number;
  netHeight: number;
  /** Seconds for a full-power shot to cross the court. */
  baseFlightTime: number;
  /** Touches each side may take before it must cross (tennis 1, volley 3). */
  touchesPerSide: number;
  gravity: number;
}

export const TENNIS: RallyConfig = {
  halfLength: 12, halfWidth: 5.5, netHeight: 0.95,
  baseFlightTime: 1.05, touchesPerSide: 1, gravity: 9.8,
};

export const VOLLEYBALL: RallyConfig = {
  halfLength: 9, halfWidth: 4.5, netHeight: 2.24,
  baseFlightTime: 1.25, touchesPerSide: 3, gravity: 9.8,
};

export interface Shot {
  from: Vec3;
  to: Vec3;
  /** Peak height above the higher endpoint. */
  apex: number;
  duration: number;
}

/**
 * Aim a return. `aimX` is the player's lateral intent (−1 left … +1 right);
 * quality decides how much of that intent survives and how deep it lands.
 *
 * Depth is the interesting part: a perfect strike lands deep near the
 * baseline, a mistimed one lands short — which is what gives the opponent an
 * attackable ball and makes the rally a conversation rather than a coin flip.
 */
export function planShot(
  cfg: RallyConfig, from: Vec3, toSide: -1 | 1, aimX: number, quality: SwingQuality,
): Shot | null {
  if (quality === 'miss') return null;
  const power = QUALITY_POWER[quality];

  // depth: 0.45 (short, mid-court) … 0.95 (deep, near baseline)
  const depth = 0.45 + 0.5 * power;
  const targetZ = toSide * cfg.halfLength * depth;

  // lateral intent degrades with poor contact
  const accuracy = quality === 'perfect' ? 1 : quality === 'good' ? 0.8 : 0.5;
  const targetX = Math.max(-1, Math.min(1, aimX)) * cfg.halfWidth * 0.85 * accuracy;

  // Apex must clear the net with margin, and a shorter shot needs a HIGHER
  // arc to get over — otherwise weak contact would fire a flat rocket into
  // the tape every time, which reads as a bug rather than a mistake.
  const apex = cfg.netHeight + 0.6 + (1 - power) * 1.1;

  return {
    from: { ...from },
    to: { x: targetX, y: 0, z: targetZ },
    apex,
    duration: cfg.baseFlightTime * (1.25 - 0.35 * power),
  };
}

/** Position along a parabolic flight at normalised time t (0…1). */
export function shotAt(shot: Shot, t: number): Vec3 {
  const u = Math.max(0, Math.min(1, t));
  return {
    x: shot.from.x + (shot.to.x - shot.from.x) * u,
    z: shot.from.z + (shot.to.z - shot.from.z) * u,
    // parabola peaking at u = 0.5
    y: shot.from.y + (shot.to.y - shot.from.y) * u + shot.apex * 4 * u * (1 - u),
  };
}

/** Height at the moment the ball crosses z = 0. Returns null if it never does. */
export function heightAtNet(shot: Shot): number | null {
  const dz = shot.to.z - shot.from.z;
  if (Math.abs(dz) < 1e-6) return null;
  const u = (0 - shot.from.z) / dz;
  if (u < 0 || u > 1) return null;
  return shotAt(shot, u).y;
}

export type RallyFault = 'net' | 'long' | 'wide' | 'missed';

/** Judge a completed flight. Order matters: a ball into the net never gets to
 *  be "out", which is how the sport actually adjudicates it. */
export function judgeShot(cfg: RallyConfig, shot: Shot): RallyFault | null {
  const net = heightAtNet(shot);
  if (net !== null && net < cfg.netHeight) return 'net';
  if (Math.abs(shot.to.z) > cfg.halfLength) return 'long';
  if (Math.abs(shot.to.x) > cfg.halfWidth) return 'wide';
  return null;
}

// ── scoring ───────────────────────────────────────────────────────────────

/** Tennis game scoring, including deuce/advantage. */
export class TennisScore {
  /** Points within the current game, per side. */
  private pts: [number, number] = [0, 0];
  games: [number, number] = [0, 0];
  readonly gamesToWin: number;

  constructor(gamesToWin = 4) { this.gamesToWin = gamesToWin; }

  /** @returns 'point' | 'game' | 'match' */
  award(side: 0 | 1): 'point' | 'game' | 'match' {
    const other = (1 - side) as 0 | 1;
    this.pts[side]++;
    // A game needs 4+ points AND a two-point margin; below that it is deuce.
    if (this.pts[side] >= 4 && this.pts[side] - this.pts[other] >= 2) {
      this.games[side]++;
      this.pts = [0, 0];
      return this.games[side] >= this.gamesToWin ? 'match' : 'game';
    }
    return 'point';
  }

  /** Umpire call for the current game: "40-30", "DEUCE", "AD IN"/"AD OUT". */
  callFor(side: 0 | 1): string {
    const NAMES = ['0', '15', '30', '40'];
    const me = this.pts[side], them = this.pts[1 - side];
    if (me >= 3 && them >= 3) {
      if (me === them) return 'DEUCE';
      return me > them ? 'AD IN' : 'AD OUT';
    }
    return `${NAMES[Math.min(3, me)]}-${NAMES[Math.min(3, them)]}`;
  }

  get points(): [number, number] { return [this.pts[0], this.pts[1]]; }
}

/** Volleyball rally scoring: every rally scores, win by 2. */
export class VolleyScore {
  points: [number, number] = [0, 0];
  // Explicit fields, not TS parameter properties: strip-only toolchains
  // (Node's --experimental-strip-types among them) reject `constructor(readonly
  // x = 1)`. Writing them out costs two lines and runs everywhere — which is
  // what lets this file be executed as a test instead of only type-checked.
  readonly target: number;
  readonly cap: number;
  constructor(target = 25, cap = 30) { this.target = target; this.cap = cap; }

  award(side: 0 | 1): 'point' | 'set' {
    this.points[side]++;
    const other = this.points[1 - side];
    const mine = this.points[side];
    if ((mine >= this.target && mine - other >= 2) || mine >= this.cap) return 'set';
    return 'point';
  }
}

// ── rally state ───────────────────────────────────────────────────────────

export type RallySide = 0 | 1;

/** Tracks touches so volleyball's three-touch limit is enforced without each
 *  mode reimplementing it. */
export class RallyState {
  side: RallySide = 0;
  touches = 0;
  live = false;
  private cfg: RallyConfig;
  constructor(cfg: RallyConfig) { this.cfg = cfg; }

  serve(by: RallySide): void { this.side = by; this.touches = 0; this.live = true; }

  /** Register a touch. Returns 'fault' when the side exceeded its allowance. */
  touch(): 'ok' | 'fault' {
    this.touches++;
    return this.touches > this.cfg.touchesPerSide ? 'fault' : 'ok';
  }

  /** Ball crossed the net to the other side. */
  cross(): void {
    this.side = (1 - this.side) as RallySide;
    this.touches = 0;
  }

  end(): void { this.live = false; }
}
