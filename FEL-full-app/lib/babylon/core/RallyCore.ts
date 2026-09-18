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
 * A STUFF block needs a tighter read than a perfect swing — a third of the
 * window.
 *
 * Without this the block strictly dominates the dig: a player who can time a
 * swing can time a block, so blocking every incoming attack beat digging 9-1
 * against 3-0 and there was never a reason to dig. A choice where one option is
 * better in every case is not a choice. The block is meant to be the read you
 * can be punished for, so it asks for more than the shot it answers.
 */
export const BLOCK_STUFF_WINDOW = 0.03;

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
  // 2.43m — the men's indoor net (women's is 2.24). Elijah's call, 2026-08-31.
  // planShot derives its apex from netHeight, so raising the net raises every
  // arc with it rather than making shots clip the tape.
  halfLength: 9, halfWidth: 4.5, netHeight: 2.43,
  baseFlightTime: 1.25, touchesPerSide: 3, gravity: 9.8,
};

/**
 * Which of a side's touches this is.
 *
 * The three-touch limit was enforced as a COUNT and nothing else -- and even
 * that never fired, because every human swing called cross(), and cross() zeroes
 * the counter. So a mode with touchesPerSide 3 played exactly like one with 1.
 *
 * In the locked benchmark (Nintendo Switch Sports volleyball) the SEQUENCE is
 * the game: you bump to control the ball, set to place it, and spike to win the
 * point. Three touches that behave identically have the rule and not the sport.
 */
export type VolleyTouch = 'bump' | 'set' | 'spike';

/** What the Nth touch of a rally is. The last allowed touch is the attack. */
export function volleyTouchFor(touchNo: number, touchesPerSide: number): VolleyTouch {
  if (touchesPerSide <= 1) return 'spike';          // tennis: every touch crosses
  if (touchNo >= touchesPerSide) return 'spike';
  return touchNo === 1 ? 'bump' : 'set';
}

/**
 * A tennis shot. This is the Mario Tennis Aces vocabulary, minus the energy
 * layer: the rally is a conversation because you are choosing between these
 * under time pressure, not because the ball is hard to reach.
 *
 * 'drive' is the default and reproduces the original single swing exactly, so a
 * mode that never picks a shot behaves as it always did.
 */
export type TennisShot = 'drive' | 'slice' | 'lob' | 'drop';

/** Does this touch send the ball over the net, or keep it on your own side? */
export function volleyCrosses(touch: VolleyTouch): boolean {
  return touch === 'spike';
}

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
  touch?: VolleyTouch, shot?: TennisShot,
): Shot | null {
  if (quality === 'miss') return null;
  const power = QUALITY_POWER[quality];

  // depth: 0.45 (short, mid-court) … 0.95 (deep, near baseline)
  let depth = 0.45 + 0.5 * power;

  // The three touches are three different SHOTS, which is the whole point of
  // the sequence. Omitting `touch` leaves the original behaviour exactly as it
  // was, so tennis (touchesPerSide 1) is untouched by any of this.
  if (touch === 'bump') {
    depth = 0.5;                       // dig it up into your own mid-court
  } else if (touch === 'set') {
    depth = 0.18;                      // float it to the net for the attack
  } else if (touch === 'spike') {
    depth = 0.55 + 0.35 * power;       // driven down into their court
  }

  // Tennis DEPTH belongs here, with the other depths, because targetZ is
  // computed immediately below. Setting it further down (next to the shot's
  // apex, where it reads more naturally) silently does nothing: a drop shot
  // would arc like a drop shot and land as deep as a drive, which is most of
  // what makes it a drop shot.
  if (shot === 'slice') depth = 0.42 + 0.34 * power;
  else if (shot === 'lob') depth = 0.86 + 0.1 * power;
  else if (shot === 'drop') depth = 0.2 + 0.08 * power;
  const targetZ = toSide * cfg.halfLength * depth;

  // lateral intent degrades with poor contact
  const accuracy = quality === 'perfect' ? 1 : quality === 'good' ? 0.8 : 0.5;
  const targetX = Math.max(-1, Math.min(1, aimX)) * cfg.halfWidth * 0.85 * accuracy;

  // Apex must clear the net with margin, and a shorter shot needs a HIGHER
  // arc to get over — otherwise weak contact would fire a flat rocket into
  // the tape every time, which reads as a bug rather than a mistake.
  let apex = cfg.netHeight + 0.6 + (1 - power) * 1.1;
  let flight = cfg.baseFlightTime * (1.25 - 0.35 * power);

  // THE TENNIS VOCABULARY. Each of these is a real trade, which is the point:
  // a shot menu where one option dominates is a menu with one option.
  if (shot === 'slice') {
    // Low and skidding: hard to attack off, but it sits up if you are late.
    apex = cfg.netHeight + 0.22 + (1 - power) * 0.55;
    flight = cfg.baseFlightTime * (1.32 - 0.3 * power);
  } else if (shot === 'lob') {
    // Over a player at the net. Slow, so it is a gift if they are not there.
    apex = cfg.netHeight + 3.4 + (1 - power) * 0.8;
    flight = cfg.baseFlightTime * 1.62;
  } else if (shot === 'drop') {
    // Dies just past the tape. Punishes a deep opponent, feeds a close one.
    apex = cfg.netHeight + 0.5 + (1 - power) * 0.4;
    flight = cfg.baseFlightTime * 0.92;
  }

  if (touch === 'bump') {
    // A dig is a controlled loop: enough hang time to get under it for the set.
    apex = 3.0; flight = cfg.baseFlightTime * 1.25;
  } else if (touch === 'set') {
    // A set is the highest ball in volleyball and the slowest — it exists to
    // buy the spiker time to arrive under it.
    apex = 4.4; flight = cfg.baseFlightTime * 1.5;
  } else if (touch === 'spike') {
    // A spike is the opposite: flat and fast, over the tape rather than lofted.
    //
    // The margin has to be honest about what `apex` means, though. It is the
    // peak of the ARC, and judgeShot measures the height AT THE NET, which is
    // lower whenever contact happens deep in court and the ball is still
    // climbing as it reaches the tape. A first cut used netHeight + 0.18 and
    // every attack from the back court hit the net -- the opponent conceded
    // 4-0 on nothing but "INTO THE NET". This margin clears a 2.43m men's net
    // from realistic contact positions while staying far flatter than the
    // lofted arc above, which is what makes it read as an attack.
    // Small, because the ball now STARTS above the net and apex is measured
    // from the higher endpoint: the arc peaks just past the attacker and drops.
    //
    // ...but it grows with distance from the net, because the tape falls
    // EARLIER in a longer flight and a flat attack from the baseline evaluates
    // below the net however high the contact is. That is also what a real
    // player does: you spike flat from the net and drive with more arc from the
    // back court. Close attacks are unchanged and stay flat.
    const backCourt = Math.max(0, Math.abs(from.z) - 2);
    apex = 0.35 + (1 - power) * 0.5 + backCourt * 0.24;
    flight = cfg.baseFlightTime * (0.62 + 0.18 * (1 - power));
  }

  // A SPIKE IS HIT FROM ABOVE THE NET, travelling down. That is not a detail:
  // a set lands the ball AT the net (depth 0.18), so a ground-launched spike
  // has covered only about a quarter of its arc by the time it reaches the
  // tape and is still climbing — height there works out near 2.25m against a
  // 2.43m net, so every attack from a good set hit the net. Raising the apex
  // did not fix it and could not, because the problem is the launch height,
  // not the peak.
  //
  // Starting the shot above the tape models the jumping attacker and makes the
  // ball descend into the opponent's court, which is what a spike is.
  const origin = touch === 'spike'
    // netHeight + 0.85. Solved, not guessed: the flight is
    // y = from.y + (to.y - from.y)u + apex*4u(1-u), and the net sits at
    // u = -from.z / (to.z - from.z). From the back court that lands near
    // u = 0.31-0.39, where +0.35 of clearance evaluates to about 2.34m against
    // a 2.43m net -- which is why deep attacks kept hitting the tape even after
    // the launch was raised once. +0.85 clears it from anywhere on the court,
    // and 3.28m of contact height is what a real attacker reaches for a men's
    // net anyway.
    ? { x: from.x, y: Math.max(from.y, cfg.netHeight + 0.85), z: from.z }
    : { ...from };

  return {
    from: origin,
    to: { x: targetX, y: 0, z: targetZ },
    apex,
    duration: flight,
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
