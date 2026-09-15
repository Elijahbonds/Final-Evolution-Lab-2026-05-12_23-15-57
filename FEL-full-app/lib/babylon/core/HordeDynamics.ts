// HordeDynamics — the pure feel layer of The Hundred (THE-HUNDRED-COMBAT-DYNAMICS, 2026-09-14). KarateEndlessMode renders it;
// NeoCombatCore still owns vitals / slow-mo / the enemy brain. The owner's read on the live mode: "laggy", "jab-only".
// Measured on the base (fake pad, /dev/mode/karate, a live wave): 12 strike presses produced 3 swings — NINE were eaten,
// because a strike could only start once the previous clip had fully settled and the harness buffer holds a press for
// 140 ms. The fighter walked at 2.83 m/s and the hit landed on a real-time setTimeout. Five systems, none touch Babylon:
//
//   CANCEL + BUFFER  — every strike has a HIT beat and a CANCEL point (both on the game clock). A press before the cancel
//                      point is QUEUED (StrikeQueue, 0.4 s), and fires the frame the cancel point opens; after it, the press
//                      cuts the swing at once. Movement and the dodge may also cut a swing past its cancel point.
//   STRING BOOK      — button history + stick direction → a named move. Jab strings, kick strings, mixed enders, and
//                      stick variants (push AT a far body = a lunge rush; pull BACK = the spin kick that hits behind).
//   CROWD STUN       — enders carry a stun radius: every body inside it is staggered (helpless, pushed out) with a falloff.
//   REDIRECT         — the target of each press is chosen from the stick (a cone in the stick's direction) or, with no
//                      stick, the most urgent threat (a wound-up agent) before the nearest; a far target in range of the
//                      move's lunge is closed on. Every press re-targets, so a string turns through the crowd.
//   BODY THROW       — a staggered body in front can be grabbed; carried, it is swung (a 360° sweep) or thrown along the
//                      aim; anything the flying body passes is hit. Pure geometry here (sweepHits / pathHits).

export type StrikeBtn = 'A' | 'B' | 'Y';
export type StrikeWeightKey = 'light' | 'medium' | 'heavy' | 'finisher';
/** Stick relative to the committed target line: n = neutral, f = pushed at it, b = pulled away. */
export type StickDir = 'n' | 'f' | 'b';

export interface HordeMove {
  id: string;
  label: string;
  clip: string;
  weight: StrikeWeightKey;
  /** playback rate of the clip — the de-lag: the same authored swing, less dead air */
  speed: number;
  range: number;
  arcDeg: number;
  launch: boolean;
  /** 0 = no crowd stun; otherwise every body inside this radius (from the hero) is staggered */
  stunRadius: number;
  /** stagger seconds at the centre (falls off to half at the edge) */
  stunSec: number;
  /** metres the hero may close on a far target during the startup */
  lunge: number;
  /** a finisher-class beat (the string's last link: hit-stop, shake, the banner) */
  ender: boolean;
}

// ── cancel + buffer ─────────────────────────────────────────────────────────
/** Seconds from the press to the hit (the arc test), and from the press to the point a new command may cut the swing. */
export const STRIKE_TIMING: Record<StrikeWeightKey, { hitAt: number; cancelAt: number }> = {
  light: { hitAt: 0.08, cancelAt: 0.17 },
  medium: { hitAt: 0.12, cancelAt: 0.24 },
  heavy: { hitAt: 0.14, cancelAt: 0.3 },
  finisher: { hitAt: 0.13, cancelAt: 0.34 },
};
/** A queued press survives this long (game seconds) waiting for the cancel point. Longer than any cancelAt. */
export const QUEUE_SEC = 0.4;

export class StrikeQueue {
  private btn: StrikeBtn | null = null;
  private dir: StickDir = 'n';
  private at = -Infinity;
  push(btn: StrikeBtn, dir: StickDir, now: number): void { this.btn = btn; this.dir = dir; this.at = now; }
  /** The queued press if it is still fresh; consumes it. */
  take(now: number): { btn: StrikeBtn; dir: StickDir } | null {
    if (!this.btn || now - this.at > QUEUE_SEC) { this.btn = null; return null; }
    const r = { btn: this.btn, dir: this.dir };
    this.btn = null;
    return r;
  }
  get pending(): boolean { return this.btn !== null; }
  clear(): void { this.btn = null; }
}

/** May a new command cut the swing that started at `startedAt`? */
export const canCancel = (weight: StrikeWeightKey, startedAt: number, now: number): boolean =>
  now - startedAt >= STRIKE_TIMING[weight].cancelAt;

// ── the string book ─────────────────────────────────────────────────────────
const M = (m: Omit<HordeMove, 'ender'> & { ender?: boolean }): HordeMove => ({ ender: false, ...m });
// THE HUNDRED — A DISTINCT MOVE PER STRING (owner 2026-09-15: "combos, get in your bag, chain combos together"; Arkham
// freeflow). Eleven named moves used to share five authored swings — HAMMER FIST, TYPHOON and HEAVY all played the same
// uppercut, so a string read as the same punch with a different banner. Every move now names its own clip, each a CMU
// capture (135 karate, 143 punching / jumping twists, 80 boxing: see scripts/mocap/opponent-clips.json), with a family
// alias under it (clipAliases) so a rig that cannot build the capture still swings the right kind of strike.
export const MOVES = {
  jab:       M({ id: 'jab', label: 'JAB', clip: 'jab', weight: 'light', speed: 1.45, range: 1.55, arcDeg: 100, launch: false, stunRadius: 0, stunSec: 0, lunge: 1.2 }),
  cross:     M({ id: 'cross', label: 'CROSS', clip: 'karate_cross', weight: 'light', speed: 1.5, range: 1.6, arcDeg: 120, launch: false, stunRadius: 0, stunSec: 0, lunge: 1.2 }),
  uppercut:  M({ id: 'uppercut', label: 'RISING DRAGON', clip: 'uppercut', weight: 'finisher', speed: 1.25, range: 1.7, arcDeg: 130, launch: true, stunRadius: 2.4, stunSec: 0.9, lunge: 1.4, ender: true }),
  kick:      M({ id: 'kick', label: 'HIGH KICK', clip: 'high_kick', weight: 'medium', speed: 1.3, range: 1.9, arcDeg: 150, launch: false, stunRadius: 0, stunSec: 0, lunge: 1.4 }),
  whirl:     M({ id: 'whirl', label: 'WHIRLWIND', clip: 'karate_whirl', weight: 'medium', speed: 1.3, range: 2.2, arcDeg: 360, launch: false, stunRadius: 2.6, stunSec: 0.8, lunge: 0.6, ender: true }),
  roundhouse:M({ id: 'roundhouse', label: 'ROUNDHOUSE', clip: 'roundhouse', weight: 'medium', speed: 1.35, range: 2.0, arcDeg: 200, launch: false, stunRadius: 0, stunSec: 0, lunge: 1.2 }),
  typhoon:   M({ id: 'typhoon', label: 'TYPHOON', clip: 'karate_typhoon', weight: 'finisher', speed: 1.15, range: 2.4, arcDeg: 360, launch: true, stunRadius: 3.2, stunSec: 1.1, lunge: 0.8, ender: true }),
  heavy:     M({ id: 'heavy', label: 'HEAVY', clip: 'karate_heavy', weight: 'heavy', speed: 1.25, range: 1.65, arcDeg: 100, launch: true, stunRadius: 1.8, stunSec: 0.6, lunge: 1.4 }),
  hammer:    M({ id: 'hammer', label: 'HAMMER FIST', clip: 'karate_hammer', weight: 'finisher', speed: 1.1, range: 1.9, arcDeg: 180, launch: true, stunRadius: 3.4, stunSec: 1.2, lunge: 1.4, ender: true }),
  rush:      M({ id: 'rush', label: 'RUSH', clip: 'karate_rush', weight: 'heavy', speed: 1.2, range: 1.7, arcDeg: 110, launch: true, stunRadius: 2.0, stunSec: 0.7, lunge: 3.4 }),
  backSpin:  M({ id: 'backSpin', label: 'SPIN BACK KICK', clip: 'karate_backspin', weight: 'medium', speed: 1.4, range: 2.1, arcDeg: 260, launch: false, stunRadius: 2.0, stunSec: 0.6, lunge: 0.4 }),
} as const satisfies Record<string, HordeMove>;
export type MoveId = keyof typeof MOVES;

/** Strings, longest first. A token is a button; the stick variants are resolved before the table (see resolveMove). */
const STRINGS: { seq: StrikeBtn[]; move: MoveId }[] = [
  { seq: ['A', 'A', 'A'], move: 'uppercut' },
  { seq: ['A', 'A', 'B'], move: 'whirl' },
  { seq: ['A', 'B', 'Y'], move: 'hammer' },
  { seq: ['B', 'B', 'Y'], move: 'typhoon' },
  { seq: ['A', 'A', 'Y'], move: 'hammer' },
  { seq: ['B', 'B'], move: 'roundhouse' },
  { seq: ['A', 'A'], move: 'cross' },
  { seq: ['A', 'B'], move: 'kick' },
  { seq: ['A'], move: 'jab' },
  { seq: ['B'], move: 'kick' },
  { seq: ['Y'], move: 'heavy' },
];
/** Chain window: a press this long after the last swing started (game seconds) still extends the string. */
export const STRING_WINDOW_SEC = 0.75;
/** The longest string; an ender resets the book. */
export const STRING_MAX = 3;

export class StringBook {
  private hist: StrikeBtn[] = [];
  private lastAt = -Infinity;
  /** Resolve a press into a move and advance the string. */
  press(btn: StrikeBtn, dir: StickDir, now: number): HordeMove {
    if (now - this.lastAt > STRING_WINDOW_SEC) this.hist = [];
    this.lastAt = now;
    const move = resolveMove([...this.hist, btn], dir);
    this.hist.push(btn);
    if (move.ender || this.hist.length >= STRING_MAX) this.hist = [];
    return move;
  }
  /** The string so far (for the HUD / telemetry). */
  get history(): readonly StrikeBtn[] { return this.hist; }
  reset(): void { this.hist = []; this.lastAt = -Infinity; }
}

/** The move for a button sequence (the last token is the press) and the stick direction on the press. Pure. */
export function resolveMove(seq: StrikeBtn[], dir: StickDir): HordeMove {
  const press = seq[seq.length - 1];
  // stick variants on a string OPENER only — inside a string the table owns the link (a string must be learnable)
  if (seq.length === 1 && dir === 'f' && press === 'Y') return MOVES.rush;
  if (seq.length === 1 && dir === 'b' && press === 'B') return MOVES.backSpin;
  for (const s of STRINGS) {
    if (s.seq.length > seq.length) continue;
    const tail = seq.slice(seq.length - s.seq.length);
    if (tail.every((b, i) => b === s.seq[i])) return MOVES[s.move];
  }
  return MOVES.jab;
}

// ── redirect ────────────────────────────────────────────────────────────────
export interface Body2 { x: number; z: number; /** wound up / striking at the hero */ threat?: boolean }
export const TARGET = { maxRange: 4.6, stickConeDeg: 70, threatRange: 2.6, stickDead: 0.3 } as const;

const yawTo = (fx: number, fz: number, tx: number, tz: number) => Math.atan2(tx - fx, tz - fz);
const wrap = (a: number) => { let d = a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

/**
 * Who this press is aimed at. `stick` = the stick in WORLD space (x, z) or null. With a stick: the best body inside a
 * cone around it (angle first, distance second). Without: a threat inside threatRange (nearest threat), else the
 * nearest body. Returns -1 when nobody qualifies (a stick with nobody in its cone swings at the stick's line).
 */
export function pickTarget(hero: { x: number; z: number }, stick: { x: number; z: number } | null, bodies: Body2[]): number {
  let best = -1, bestScore = Infinity;
  const mag = stick ? Math.hypot(stick.x, stick.z) : 0;
  if (stick && mag > TARGET.stickDead) {
    const sy = Math.atan2(stick.x, stick.z);
    const cone = (TARGET.stickConeDeg * Math.PI) / 180;
    bodies.forEach((b, i) => {
      const d = Math.hypot(b.x - hero.x, b.z - hero.z);
      if (d > TARGET.maxRange) return;
      const ang = Math.abs(wrap(yawTo(hero.x, hero.z, b.x, b.z) - sy));
      if (ang > cone) return;
      const score = ang * 2.2 + d * 0.45;
      if (score < bestScore) { bestScore = score; best = i; }
    });
    return best;
  }
  bodies.forEach((b, i) => {
    const d = Math.hypot(b.x - hero.x, b.z - hero.z);
    if (d > TARGET.maxRange) return;
    const score = d + (b.threat && d <= TARGET.threatRange ? -10 : 0);
    if (score < bestScore) { bestScore = score; best = i; }
  });
  return best;
}

/** The stick's direction RELATIVE to a target line: pushed at it (f), pulled away (b), or neutral / sideways (n). */
export function stickDirTo(stick: { x: number; z: number } | null, lineYaw: number): StickDir {
  if (!stick || Math.hypot(stick.x, stick.z) <= TARGET.stickDead) return 'n';
  const d = Math.abs(wrap(Math.atan2(stick.x, stick.z) - lineYaw));
  return d < Math.PI / 4 ? 'f' : d > (3 * Math.PI) / 4 ? 'b' : 'n';
}

/** How far to close on a target `dist` away for a move: stop at 70 % of the reach, never more than the move's lunge. */
export function lungeFor(dist: number, move: HordeMove, reachMult = 1): number {
  const stopAt = move.range * reachMult * 0.7;
  return Math.max(0, Math.min(move.lunge, dist - stopAt));
}

// ── crowd stun ──────────────────────────────────────────────────────────────
export interface StunHit { index: number; sec: number; push: number; dx: number; dz: number }
/** Every body inside `radius` of `origin`: its stagger (full at the centre → half at the edge) and an outward shove. */
export function crowdStun(origin: { x: number; z: number }, bodies: Body2[], radius: number, sec: number, pushM = 0.9): StunHit[] {
  if (radius <= 0) return [];
  const out: StunHit[] = [];
  bodies.forEach((b, i) => {
    const dx = b.x - origin.x, dz = b.z - origin.z; const d = Math.hypot(dx, dz);
    if (d > radius) return;
    const k = 1 - 0.5 * (d / radius);
    const nx = d > 1e-3 ? dx / d : Math.cos(i * 2.4), nz = d > 1e-3 ? dz / d : Math.sin(i * 2.4);
    out.push({ index: i, sec: sec * k, push: pushM * k, dx: nx, dz: nz });
  });
  return out;
}

/** A light connect staggers too (short): the horde flinches on every hit instead of swinging through it. */
export const FLINCH_SEC = 0.32;

// ── body throw ──────────────────────────────────────────────────────────────
export const THROW = {
  grabRange: 2.4, grabArcDeg: 360,   // any direction: the hero turns onto the body (a 170° front arc missed the stunned pack a WHIRLWIND leaves behind you)
    // a stunned pack has been shoved out ~1 m: the grab has to reach it (1.5 missed every body, measured)
  /** a body counts as staggered (grabbable) this long after a hit, or while stunned */
  grabbableSec: 0.8,
  carryMaxSec: 1.8,
  carryDist: 0.95,
  swingSec: 0.42, swingRadius: 1.35, swingHitM: 1.05,
  throwSec: 0.5, throwDist: 7, throwHitM: 1.15, throwApex: 1.1,
  /** stagger on bodies the weapon hits */
  hitStunSec: 1.0,
} as const;

/** Bodies within `hitM` of the segment a→b (the swept weapon), excluding `skip`. */
export function pathHits(a: { x: number; z: number }, b: { x: number; z: number }, bodies: Body2[], hitM: number, skip: ReadonlySet<number> = new Set()): number[] {
  const vx = b.x - a.x, vz = b.z - a.z; const L2 = vx * vx + vz * vz;
  const out: number[] = [];
  bodies.forEach((p, i) => {
    if (skip.has(i)) return;
    const t = L2 > 1e-6 ? Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.z - a.z) * vz) / L2)) : 0;
    const cx = a.x + vx * t, cz = a.z + vz * t;
    if (Math.hypot(p.x - cx, p.z - cz) <= hitM) out.push(i);
  });
  return out;
}

/** The grab target: the nearest GRABBABLE body inside grabRange and the front arc, or -1. */
export function pickGrab(hero: { x: number; z: number; yaw: number }, bodies: (Body2 & { grabbable: boolean })[]): number {
  let best = -1, bd = Infinity;
  const half = (THROW.grabArcDeg * Math.PI) / 360;
  bodies.forEach((b, i) => {
    if (!b.grabbable) return;
    const d = Math.hypot(b.x - hero.x, b.z - hero.z);
    if (d > THROW.grabRange || d >= bd) return;
    if (d > 0.35 && Math.abs(wrap(yawTo(hero.x, hero.z, b.x, b.z) - hero.yaw)) > half) return;
    bd = d; best = i;
  });
  return best;
}
