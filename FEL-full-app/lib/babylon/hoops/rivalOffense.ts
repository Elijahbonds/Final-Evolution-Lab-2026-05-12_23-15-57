// rivalOffense — the 1v1 rival's MOVE KIT and his READS (1v1 / 3v3 ten-phase pass, phase 3 "rivals that play basketball",
// owner playtest 2026-10-27: "1v1 and 3v3 mode are way behind goal").
//
// Before this the rival was a script (AttackerBrain, BasketballCore): a check, a sinusoidal weave, a sidestep (a crossover or a
// same-hand shuffle) when contained, a step-back, three shots. Whatever the defender did, he did those things in that order.
//
// THE KIT. Contained, he picks a MOVE: crossover, hesitation, in-and-out, behind the back, spin, post-up (or the old same-hand
// shuffle). Each move is a wish-velocity profile in the lane's frame and an exposure window (the steal read) — nothing about a
// move is a roll of its success: it beats the defender if the defender's body is out of the lane when it ends, and loses if it
// is not (the body standoff, the reaction delay and the defender's accel decide that, as they do for the hero's moves). The
// finish is picked the same way: at the rim a layup (a dunk on a beaten man), held in front a step-back, a floater from the short
// corridor, or a straight pull-up; out of a post-up a hook (close) or a turnaround fade. Every shot is still `rivalShotPct` on
// a 'layup' or a 'jumper' — the odds are untouched; a floater is a jumper from where it is let go, a hook a layup.
//
// THE READS. Which move comes out depends on the defender: TIGHT (inside TIGHT_M) invites the spin, the hesitation and the
// post-up; OFF him, the crossover and the in-and-out; CLOSING hard, the hesitation; a defender SAGGING in the lane inside the
// shooter's range gets a pull-up (PRO and up). The rival remembers what worked against THIS defender (a move that cleared the lane)
// and leans on it by the tier's `adaptRate` (core/Difficulty: ROOKIE 0, ELITE 0.75): punish the same mistake twice. A move that got
// stripped is used less (the old `caution`, for every exposed move now).
//
// THE TIERS differ in what he does, not only in how often it goes in (core/Difficulty's contract): ROOKIE crosses over, shuffles,
// hesitates now and then and pulls up; PRO has the whole kit; ELITE leans on the spin, the post and the in-and-out, reads harder
// and adapts. Pure: Vector3 in, a decision out; headless-testable (rivalOffense.test.ts, scripts/probes/hoops-gap/rival-sim.mts).
import { Vector3 } from '@babylonjs/core';
import { feel } from '../../feel-panel/feel';
import { profileFor, type Tier, type TierProfile } from '../core/Difficulty';
import {
  bodySide, type AttackDecision, type AttackerBrain, type AttackerDelegate, type RivalShotLook,
  RIVAL_DRIVE_SPEED, RIVAL_SIDESTEP_SPEED, CONTAIN_RANGE, CONTAIN_CONE, CONTAIN_PULLUP_SEC, SHOT_CLOCK_SEC, LAYUP_RANGE, GATHER_SEC,
  STEPBACK_SEC, STEPBACK_SPEED, BLOWBY_SEC, BLOWBY_SPEED, CHECK_HOLD_SEC, EXPOSURE_LATERAL_SPEED, CROSSOVER_EXPOSED_FROM,
  CROSSOVER_EXPOSED_TO, SIDESTEP_SEC, CROSSOVER_CHANCE, LAYUP_STRIDE_SPEED,
} from '../core/BasketballCore';

// ── THE ACTIONS (the gate's vocabulary: ≥ 6 distinct per 10 rival possessions, entropy ≥ 2 bits) ─────────────────────────────
export type RivalAction =
  | 'crossover' | 'hesitation' | 'in_and_out' | 'behind' | 'spin' | 'stepback' | 'post_up'
  | 'pull_up' | 'drive' | 'layup' | 'floater' | 'dunk' | 'swing_pass' | 'screen';
export const RIVAL_ACTIONS: readonly RivalAction[] = [
  'crossover', 'hesitation', 'in_and_out', 'behind', 'spin', 'stepback', 'post_up', 'pull_up', 'drive', 'layup', 'floater', 'dunk',
  'swing_pass', 'screen',
];
const IS_ACTION = new Set<string>(RIVAL_ACTIONS);
/** The variety of a list of actions: how many distinct, and the Shannon entropy (bits) of their mix. Names outside RIVAL_ACTIONS
 *  (the same-hand shuffle) are not counted. */
export function actionVariety(actions: readonly string[]): { distinct: number; bits: number; n: number } {
  const c = new Map<string, number>();
  for (const a of actions) if (IS_ACTION.has(a)) c.set(a, (c.get(a) ?? 0) + 1);
  let n = 0; for (const v of c.values()) n += v;
  let bits = 0; for (const v of c.values()) { const p = v / n; bits -= p * Math.log2(p); }
  return { distinct: c.size, bits: n ? bits : 0, n };
}
/** The gate read: actionVariety over every run of `window` consecutive possessions (each a list of its actions); mean and min. */
export function windowedVariety(possessions: readonly (readonly string[])[], window = 10): { distinctMean: number; distinctMin: number; bitsMean: number; bitsMin: number; windows: number } {
  const rows: { distinct: number; bits: number }[] = [];
  for (let i = 0; i + window <= possessions.length; i += window) rows.push(actionVariety(possessions.slice(i, i + window).flat()));
  if (!rows.length) return { distinctMean: 0, distinctMin: 0, bitsMean: 0, bitsMin: 0, windows: 0 };
  const mean = (f: (r: { distinct: number; bits: number }) => number) => rows.reduce((s, r) => s + f(r), 0) / rows.length;
  return { distinctMean: mean((r) => r.distinct), distinctMin: Math.min(...rows.map((r) => r.distinct)), bitsMean: mean((r) => r.bits), bitsMin: Math.min(...rows.map((r) => r.bits)), windows: rows.length };
}

// ── THE NUMBERS (each a feel knob, group "Hoops · rival offense"; defaults are this lane's, the owner has felt none) ─────────────
/** 1 = the kit and the reads; 0 = the release's script exactly (the A/B). Knob `hoops.rivalKitOn`. */
export const RIVAL_KIT_ON = true;
/** A defender inside this (m, planar) is TIGHT: the spin, the hesitation and the post-up read him. Knob `hoops.rivalTightM`. */
export const RIVAL_TIGHT_M = 1.25;
/** The hesitation's sell: this long at a crawl before the go. Knob `hoops.rivalHesiSec`. */
export const RIVAL_HESI_SEC = 0.3;
/** …and the go: this fast (m/s) for HESI_GO_SEC. Under the defender's 6.4 top: he beats a man who stopped with him, not one who
 *  stayed down. Knob `hoops.rivalHesiGoMps`. */
export const RIVAL_HESI_GO_MPS = 5.8;
/** The spin's length (s): into the shoulder, then the roll off it. Knob `hoops.rivalSpinSec`. */
export const RIVAL_SPIN_SEC = 0.6;
/** The post-up: the rim distance band it is taken in (m). Knobs `hoops.rivalPostMinM` / `hoops.rivalPostMaxM`. */
export const RIVAL_POST_MIN_M = 2.6;
export const RIVAL_POST_MAX_M = 5.6;
/** …the back-down's pace (m/s; the defender's body holds it, or gives ground). Knob `hoops.rivalPostMps`. */
export const RIVAL_POST_MPS = 1.4;
/** …the longest he works it before the turnaround (s). Knob `hoops.rivalPostMaxSec`. */
export const RIVAL_POST_MAX_SEC = 1.6;
/** …inside this of the rim the post ends in a hook (a layup's odds). Knob `hoops.rivalPostHookM`. */
export const RIVAL_POST_HOOK_M = 2.3;
/** The floater's corridor: a contained finish this far from the rim is a floater, not a step-back (m). Knobs
 *  `hoops.rivalFloaterMinM` / `hoops.rivalFloaterMaxM`. */
export const RIVAL_FLOATER_MIN_M = 2.0;
export const RIVAL_FLOATER_MAX_M = 4.2;
/** The sag read: a defender in the lane but this far off (m), inside the rival's range, gets a pull-up (PRO and up). Knob
 *  `hoops.rivalSagM`; 0 = never. */
export const RIVAL_SAG_M = 2.6;
/** …from inside this of the rim (m). Knob `hoops.rivalPullUpRangeM`. */
export const RIVAL_PULLUP_RANGE_M = 6.2;
/** How much a tier's adaptRate moves a move's weight toward what has worked against this defender (× 1 + adapt × lean). Knob
 *  `hoops.rivalAdaptK`; 0 = no memory. */
export const RIVAL_ADAPT_K = 1;
/** A defender closing this fast (m/s along the line to him) is biting: the hesitation reads him. Knob `hoops.rivalClosingMps`. */
export const RIVAL_CLOSING_MPS = 1.6;

export const rivalKitOn = (): boolean => feel('hoops.rivalKitOn', RIVAL_KIT_ON ? 1 : 0) >= 0.5;
const tightM = (): number => feel('hoops.rivalTightM', RIVAL_TIGHT_M);
const hesiSec = (): number => feel('hoops.rivalHesiSec', RIVAL_HESI_SEC);
const hesiGoMps = (): number => feel('hoops.rivalHesiGoMps', RIVAL_HESI_GO_MPS);
const spinSec = (): number => feel('hoops.rivalSpinSec', RIVAL_SPIN_SEC);
const postMinM = (): number => feel('hoops.rivalPostMinM', RIVAL_POST_MIN_M);
const postMaxM = (): number => feel('hoops.rivalPostMaxM', RIVAL_POST_MAX_M);
const postMps = (): number => feel('hoops.rivalPostMps', RIVAL_POST_MPS);
const postMaxSec = (): number => feel('hoops.rivalPostMaxSec', RIVAL_POST_MAX_SEC);
const postHookM = (): number => feel('hoops.rivalPostHookM', RIVAL_POST_HOOK_M);
const floaterMinM = (): number => feel('hoops.rivalFloaterMinM', RIVAL_FLOATER_MIN_M);
const floaterMaxM = (): number => feel('hoops.rivalFloaterMaxM', RIVAL_FLOATER_MAX_M);
const sagM = (): number => feel('hoops.rivalSagM', RIVAL_SAG_M);
const pullUpRangeM = (): number => feel('hoops.rivalPullUpRangeM', RIVAL_PULLUP_RANGE_M);
const adaptK = (): number => feel('hoops.rivalAdaptK', RIVAL_ADAPT_K);
const closingMps = (): number => feel('hoops.rivalClosingMps', RIVAL_CLOSING_MPS);

// ── THE MOVES ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** A contained rival's move. `shuffle` is the old same-hand sidestep (not one of the gate's actions: nothing changes hands). */
export type KitMove = 'crossover' | 'shuffle' | 'hesitation' | 'in_and_out' | 'behind' | 'spin' | 'post_up';
export const KIT_MOVES: readonly KitMove[] = ['crossover', 'shuffle', 'hesitation', 'in_and_out', 'behind', 'spin', 'post_up'];
/** The handle move the mode renders for a kit move (core/HandleSystem's vocabulary; the post-up is a beat of its own). */
export const KIT_RENDER: Readonly<Record<KitMove, 'crossover' | 'hesi' | 'in_and_out' | 'behind_back' | 'spin' | null>> = {
  crossover: 'crossover', shuffle: null, hesitation: 'hesi', in_and_out: 'in_and_out', behind: 'behind_back', spin: 'spin', post_up: null,
};
/** Does the ball change hands (the crossover's hand-switch, the behind-the-back's wrap)? */
export const KIT_CROSSES: Readonly<Record<KitMove, boolean>> = { crossover: true, shuffle: false, hesitation: false, in_and_out: false, behind: true, spin: false, post_up: false };

/** The base mix per tier (a weight per move, before the reads). ROOKIE: the cross, the shuffle, a hesitation now and then. */
export const KIT_WEIGHTS: Readonly<Record<Tier, Readonly<Record<KitMove, number>>>> = {
  rookie: { crossover: 1.0, shuffle: 1.0, hesitation: 0.3, in_and_out: 0, behind: 0, spin: 0, post_up: 0 },
  pro: { crossover: 0.9, shuffle: 0.45, hesitation: 0.8, in_and_out: 0.55, behind: 0.5, spin: 0.4, post_up: 0.5 },
  elite: { crossover: 0.8, shuffle: 0.2, hesitation: 0.9, in_and_out: 0.75, behind: 0.65, spin: 0.75, post_up: 0.75 },
};
/** The finish mix when held in front (the pull-up's clock): step-back / floater (in its corridor) / a straight pull-up. */
export const FINISH_WEIGHTS: Readonly<Record<Tier, { stepback: number; floater: number; straight: number }>> = {
  rookie: { stepback: 0.35, floater: 0, straight: 0.65 },
  pro: { stepback: 0.6, floater: 0.6, straight: 0.3 },
  elite: { stepback: 0.7, floater: 0.7, straight: 0.2 },
};

/** One frame of a move, in the lane's frame: `fwd` along the line to the rim, `lat` across it (× the move's side), m/s. */
export interface MoveFrame { fwd: number; lat: number; exposure: number; done: boolean }
/** The move's shape at `t` s into it (pure). The exposure is the steal read: 1 while the ball is out where a hand can get it. */
export function moveFrame(move: KitMove, t: number): MoveFrame {
  switch (move) {
    case 'crossover':
    case 'shuffle': {
      // the old sidestep, exactly: across at the sidestep's speed, a little downhill; a crossover's ball crosses the body in its window
      const exposed = move === 'crossover' && t >= CROSSOVER_EXPOSED_FROM && t <= CROSSOVER_EXPOSED_TO;
      return { fwd: 0.9, lat: RIVAL_SIDESTEP_SPEED, exposure: exposed ? 1 : 0.3, done: t >= SIDESTEP_SEC };
    }
    case 'hesitation': {
      // the sell (a crawl, the ball out front and protected by the off arm), then the GO at a speed a set defender can match
      // (the sell holds the ball out front for a beat: a poke timed on the sell gets it, a poke at the go is beaten)
      const h = hesiSec();
      if (t < h) return { fwd: 0.5, lat: 0, exposure: t >= HESI_EXPOSED_FROM && t <= h * 0.85 ? 1 : 0.3, done: false };
      return { fwd: hesiGoMps(), lat: 0.9, exposure: 0.25, done: t >= h + HESI_GO_SEC };
    }
    case 'in_and_out': {
      // the fake in (the shoulder and the ball toward the cross), then out the same hand, hard — the ball is out wide at the turn
      if (t < IN_OUT_FAKE_SEC) return { fwd: 0.6, lat: -1.4, exposure: 0.3, done: false };
      const exposed = t >= IN_OUT_EXPOSED_FROM && t <= IN_OUT_EXPOSED_TO;
      return { fwd: 1.2, lat: 3.8, exposure: exposed ? 1 : 0.3, done: t >= IN_OUT_SEC };
    }
    case 'behind':
      // wrapped behind the back: slower across than the crossover, but the body is between the ball and a poke
      return { fwd: 1.4, lat: 3.1, exposure: 0.15, done: t >= BEHIND_SEC };
    case 'spin': {
      // into his shoulder, then the roll off it and downhill: committed (no pump-fake read), the ball on the far side of the body
      const s = spinSec(), into = s * SPIN_INTO_K;
      if (t < into) return { fwd: 1.0, lat: 2.2, exposure: 0.2, done: false };
      return { fwd: 4.4, lat: 2.4, exposure: 0.2, done: t >= s };
    }
    case 'post_up':
      // backed down (the brain owns the post's end: the hook or the turnaround); the ball is behind the body
      return { fwd: postMps(), lat: 0, exposure: 0.1, done: false };
  }
}
/** The shape constants of the moves (their lengths and windows): the crossover's are the release's SIDESTEP_SEC and window. */
export const HESI_GO_SEC = 0.5, HESI_EXPOSED_FROM = 0.08;
export const IN_OUT_FAKE_SEC = 0.16, IN_OUT_SEC = 0.5, IN_OUT_EXPOSED_FROM = 0.2, IN_OUT_EXPOSED_TO = 0.36;
export const BEHIND_SEC = 0.6;
export const SPIN_INTO_K = 0.33;
/** After a move ends, the read of whether it worked runs this long (did the defender's body leave the lane?). */
export const MOVE_JUDGE_SEC = 0.4;

// ── THE READ OF THE DEFENDER ────────────────────────────────────────────────────────────────────────────────────────────────
export interface DefenderRead {
  /** Planar distance to the defender (m). */
  dist: number;
  /** He is in the lane (CONTAIN_RANGE and CONTAIN_CONE). */
  inLane: boolean;
  /** His speed along the line to the rival (m/s, + = closing). */
  closing: number;
  /** Distance to the rim (m). */
  rimDist: number;
}
/** Move weights for this defender (pure): the tier's base × the reads × the memory × the caution. Exported for the tests. */
export function moveWeights(tier: Tier, r: DefenderRead, memory: Readonly<Record<KitMove, number>>, caution: number, last: KitMove | null): Record<KitMove, number> {
  const base = KIT_WEIGHTS[tier];
  const prof = profileFor(tier);
  const reads = prof.punishRate;   // how hard he reads (ROOKIE 0.15, PRO 0.55, ELITE 0.9)
  const tight = r.dist < tightM();
  const postable = r.rimDist >= postMinM() && r.rimDist <= postMaxM() && tight;
  const bite = r.closing > closingMps();
  const w = {} as Record<KitMove, number>;
  for (const m of KIT_MOVES) {
    let x = base[m];
    if (x <= 0) { w[m] = 0; continue; }
    let read = 1;
    if (m === 'spin') read = tight ? 1.8 : 0.4;
    else if (m === 'hesitation') read = (bite ? 2.2 : 1) * (tight ? 1.2 : 1);
    else if (m === 'post_up') read = postable ? 1.8 : 0;
    else if (m === 'crossover' || m === 'in_and_out') read = tight ? 0.85 : 1.3;
    // a read is the tier's: 1 + (read − 1) × reads (ROOKIE barely reads; the post-up's band is a rule, not a read)
    x *= m === 'post_up' ? read : 1 + (read - 1) * reads;
    // memory: what has cleared the lane against THIS defender, × the tier's adaptRate
    x *= Math.max(0.2, 1 + prof.adaptRate * adaptK() * (memory[m] ?? 0));
    // a stripped move is used less (the release's caution, for every exposed move)
    if (m === 'crossover' || m === 'in_and_out') x *= Math.max(CROSSOVER_FLOOR_K, 1 - caution / CROSSOVER_CHANCE);
    // the same move three times running is a tell (ELITE is the least predictable)
    if (last === m) x *= 0.55 + 0.35 * (1 - prof.adaptRate);
    w[m] = x;
  }
  return w;
}
/** A cautious rival still crosses this share as often (the release's CROSSOVER_FLOOR over its CROSSOVER_CHANCE). */
export const CROSSOVER_FLOOR_K = 0.36;
/** Pick from a weight table with one roll in [0, 1). */
export function pickWeighted<K extends string>(w: Readonly<Record<K, number>>, roll: number): K | null {
  let sum = 0; for (const k in w) sum += Math.max(0, w[k]);
  if (sum <= 0) return null;
  let x = roll * sum;
  for (const k in w) { x -= Math.max(0, w[k]); if (x < 0) return k; }
  for (const k in w) if (w[k] > 0) return k;
  return null;
}

// ── THE KIT ATTACKER (AttackerBrain delegates its decision here when the mode gives it a kit) ───────────────────────────────────
const ZERO = (): Vector3 => new Vector3(0, 0, 0);
const decision = (wish: Vector3, phase: AttackDecision['phase'], o: Partial<AttackDecision> = {}): AttackDecision =>
  ({ wish, phase, contained: false, exposure: 0, step: false, crossover: null, shot: null, action: null, backToRim: false, look: null, moveSide: null, ...o });

export class RivalKit implements AttackerDelegate {
  readonly profile: TierProfile;
  /** What has worked against this defender: a lean in [−1, 1] per move (survives the possession; decays per possession). */
  readonly memory: Record<KitMove, number> = { crossover: 0, shuffle: 0, hesitation: 0, in_and_out: 0, behind: 0, spin: 0, post_up: 0 };
  /** Every action this possession, in order (the probes' read; the mode logs dec.action). */
  actions: RivalAction[] = [];
  // per possession
  private move: KitMove | null = null; private moveT = 0; private moveSide = 1; private lastMove: KitMove | null = null;
  private judge: { move: KitMove; t: number; won: boolean } | null = null;
  private pending: 'layup' | 'jumper' | 'dunk' | null = null; private look: RivalShotLook = null;
  private gatherSec = 0; private stepbackSec = 0; private blowbySec = 0; private postSec = 0;
  private swayPhase = 0; private beaten = false; private drove = 0; private droveSaid = false; private sagRead = false;
  private lastDef: { x: number; z: number } | null = null; private closing = 0;
  private stealArmed: KitMove | null = null;
  constructor(readonly tier: Tier, private rng: () => number = Math.random) { this.profile = profileFor(tier); }

  reset(b: AttackerBrain): void {
    for (const m of KIT_MOVES) this.memory[m] *= MEMORY_DECAY;
    this.actions = [];
    this.move = null; this.moveT = 0; this.judge = null; this.pending = null; this.look = null; this.lastMove = null;
    this.gatherSec = 0; this.stepbackSec = 0; this.blowbySec = 0; this.postSec = 0; this.beaten = false; this.drove = 0; this.droveSaid = false;
    this.sagRead = false; this.lastDef = null; this.closing = 0; this.stealArmed = null;
    this.swayPhase = this.rng() * Math.PI * 2;
    b.t = 0; b.phase = 'check'; b.containedSec = 0;
  }
  /** The ball was stripped: the move it came out of is used less (its memory takes a loss). */
  noteStolen(): void { const m = this.stealArmed ?? this.move ?? this.lastMove; if (m) this.memory[m] = Math.max(-1, this.memory[m] - 0.6); }
  blowBy(b: AttackerBrain): void {
    if (b.phase === 'gather' || b.phase === 'released' || b.phase === 'check' || b.phase === 'stepback' || b.phase === 'post') return;
    if (this.move === 'spin') return;   // a spin is committed: he is already going round
    const wasContained = b.containedSec > 0.15;
    this.endMove(b);
    b.phase = 'blowby'; this.blowbySec = 0; this.beaten = wasContained;
  }
  private endMove(_b: AttackerBrain): void {
    if (this.move && this.move !== 'post_up') this.judge = { move: this.move, t: 0, won: false };
    this.lastMove = this.move ?? this.lastMove; this.move = null; this.moveT = 0;
  }
  private say(a: RivalAction): RivalAction { this.actions.push(a); return a; }

  decide(b: AttackerBrain, dt: number, self: Vector3, defender: Vector3, hoop: Vector3, opts: { defenderAirborne: boolean }): AttackDecision {
    b.t += dt;
    if (b.phase === 'released') return decision(ZERO(), 'released');
    const toRim = new Vector3(hoop.x - self.x, 0, hoop.z - self.z);
    const dist = toRim.length();
    const dir = dist > 1e-4 ? toRim.scale(1 / dist) : new Vector3(0, 0, -1);
    const perp = new Vector3(-dir.z, 0, dir.x);
    // the defender's closing speed (his travel along the line to me), from his last position
    if (this.lastDef && dt > 1e-4) {
      const vx = (defender.x - this.lastDef.x) / dt, vz = (defender.z - this.lastDef.z) / dt;
      const lx = self.x - defender.x, lz = self.z - defender.z, L = Math.hypot(lx, lz);
      const c = L > 1e-4 && vx * vx + vz * vz < 144 ? (vx * lx + vz * lz) / L : 0;
      this.closing += (c - this.closing) * Math.min(1, dt / 0.08);
    }
    this.lastDef = { x: defender.x, z: defender.z };

    if (b.phase === 'gather') {
      this.gatherSec += dt;
      const stride = (this.pending === 'layup' || this.pending === 'dunk') && this.look !== 'hook' && dist > 0.9 ? dir.scale(LAYUP_STRIDE_SPEED) : ZERO();
      if (this.gatherSec >= GATHER_SEC) {
        b.phase = 'released';
        const shot = this.pending;
        const action: RivalAction = shot === 'dunk' ? 'dunk' : shot === 'layup' ? 'layup' : this.look === 'floater' ? 'floater' : 'pull_up';   // a post hook is a layup's odds and name
        return decision(ZERO(), 'released', { shot, look: this.look, action: this.say(action) });
      }
      return decision(stride, 'gather', { look: this.look, backToRim: false });
    }
    if (b.phase === 'stepback') {
      this.stepbackSec += dt;
      if (this.stepbackSec >= STEPBACK_SEC) { b.phase = 'gather'; this.gatherSec = 0; return decision(ZERO(), 'gather'); }
      return decision(dir.scale(-STEPBACK_SPEED), 'stepback', { exposure: 0.2 });
    }
    const dv = new Vector3(defender.x - self.x, 0, defender.z - self.z);
    const dDist = dv.length();
    const along = Vector3.Dot(dv, dir), lat = Vector3.Dot(dv, perp);
    const inLane = dDist < CONTAIN_RANGE && along > 0 && along / Math.max(dDist, 1e-4) > CONTAIN_CONE;
    if (b.phase === 'check') {
      if (b.t < CHECK_HOLD_SEC) return decision(ZERO(), 'check', { contained: inLane });
      b.phase = 'drive';
    }
    // the judge of the last move: it WORKED if his body left the lane while I went by (a beaten defender)
    if (this.judge) {
      this.judge.t += dt;
      if (!inLane && (along <= 0.2 || dDist > CONTAIN_RANGE + 0.2)) this.judge.won = true;
      if (this.judge.won || this.judge.t >= MOVE_JUDGE_SEC) {
        const m = this.judge.move; this.memory[m] = Math.max(-1, Math.min(1, this.memory[m] * 0.6 + (this.judge.won ? 0.6 : -0.3)));
        if (this.judge.won && b.containedSec > 0.15) this.beaten = true;   // a move that cleared a man who was set is a beaten man (a dunk at the rim, D1)
        this.judge = null;
      }
    }
    // the pump-fake read (a defender in the air with nothing to block): driven past — not out of a committed spin or the post
    if (opts.defenderAirborne && dDist < 2.2 && b.phase !== 'blowby' && b.phase !== 'post' && this.move !== 'spin') this.blowBy(b);

    let wish: Vector3; let exposure = 0; let step = false; let crossover: 'left' | 'right' | null = null; let action: RivalAction | null = null;
    let backToRim = false; let moveSide: 'left' | 'right' | null = null;
    if (b.phase === 'blowby') {
      this.blowbySec += dt;
      const away = lat >= 0 ? -1 : 1;
      wish = dir.scale(BLOWBY_SPEED).addInPlace(perp.scale(away * (dDist < 1.6 ? 3.0 : 1.0)));
      exposure = 0.25;
      if (this.blowbySec >= BLOWBY_SEC) b.phase = 'drive';
    } else if (b.phase === 'post') {
      // THE POST-UP: backed down with the body between the defender and the ball. His body holds me (the standoff) or gives ground.
      this.postSec += dt; backToRim = true;
      wish = dir.scale(postMps()).addInPlace(perp.scale(Math.sin(this.postSec * 7) * 0.4));
      exposure = 0.1;
      const gaveRoom = dDist > CONTAIN_RANGE + 0.15 && this.profile.punishRate >= 0.5;   // PRO+ read: he backed off — turn and shoot
      if (dist < postHookM()) { this.pending = 'layup'; this.look = 'hook'; }
      else if (this.postSec >= postMaxSec() || gaveRoom) { this.pending = 'jumper'; this.look = 'fade'; }
      if (this.pending) { b.phase = 'gather'; this.gatherSec = 0; return decision(ZERO(), 'gather', { look: this.look, backToRim: this.look === 'fade' }); }
      return decision(intoBody(wish, self, defender, POST_INTO_MPS), 'post', { contained: inLane, exposure, backToRim });
    } else if (this.move) {
      // A MOVE IN PROGRESS: its shape, on its side
      this.moveT += dt;
      if (inLane) b.containedSec += dt;
      const f = moveFrame(this.move, this.moveT);
      wish = dir.scale(f.fwd).addInPlace(perp.scale(f.lat * this.moveSide));
      exposure = f.exposure;
      if (f.exposure >= 0.5) this.stealArmed = this.move;
      b.phase = this.move === 'hesitation' ? 'hesi' : this.move === 'spin' ? 'spin' : 'sidestep';
      if (f.done) this.endMove(b);
    } else if (inLane) {
      // CONTAINED: a move, picked by the read
      b.containedSec += dt; b.phase = 'sidestep';
      const read: DefenderRead = { dist: dDist, inLane, closing: this.closing, rimDist: dist };
      const m = pickWeighted(moveWeights(this.tier, read, this.memory, b.caution, this.lastMove), this.rng()) ?? 'shuffle';
      this.moveSide = Math.abs(lat) < 0.12 ? (this.rng() < 0.5 ? -1 : 1) : lat > 0 ? -1 : 1;   // away from the defender's shoulder
      this.stealArmed = null;
      if (m === 'post_up') {
        b.phase = 'post'; this.postSec = 0; backToRim = true; this.lastMove = 'post_up';
        action = this.say('post_up');
        return decision(dir.scale(postMps()), 'post', { contained: true, exposure: 0.1, backToRim: true, action });
      }
      this.move = m; this.moveT = 0; step = true;
      if (m !== 'shuffle') action = this.say(m);
      // the crossover keeps the release's event (dec.crossover: the mode's clip and its hand switch); the other moves name their side
      moveSide = bodySide(dir, perp.scale(this.moveSide));
      if (m === 'crossover') crossover = moveSide;
      const f = moveFrame(m, 0);
      wish = dir.scale(f.fwd).addInPlace(perp.scale(f.lat * this.moveSide));
      exposure = f.exposure;
      b.phase = m === 'hesitation' ? 'hesi' : m === 'spin' ? 'spin' : 'sidestep';
    } else {
      // OPEN: downhill with the weave (the release's drive); the reads that start a move in the open
      b.phase = 'drive';
      b.containedSec = Math.max(0, b.containedSec - dt * 0.5);
      const swayV = Math.cos(b.t * 2.6 + this.swayPhase) * 0.8 * 2.6;
      wish = dir.scale(RIVAL_DRIVE_SPEED).addInPlace(perp.scale(swayV));
      exposure = Math.min(1, Math.abs(swayV) / EXPOSURE_LATERAL_SPEED);
      this.drove += dt;
      if (!this.droveSaid && this.drove >= DRIVE_SAY_SEC) { this.droveSaid = true; action = this.say('drive'); }
      // a man CLOSING hard on me inside 2.4 m: the hesitation (PRO and up read it; a rookie runs into him)
      const closingRead = this.profile.punishRate >= 0.5 && this.closing > closingMps() && dDist < 2.4 && along > 0;
      if (closingRead && KIT_WEIGHTS[this.tier].hesitation > 0 && this.rng() < dt * 3) {
        this.move = 'hesitation'; this.moveT = 0; this.moveSide = lat > 0 ? -1 : 1; action = this.say('hesitation'); moveSide = bodySide(dir, perp.scale(this.moveSide));
        b.phase = 'hesi';
      }
    }
    // THE FINISH. At the rim: a layup — a dunk on a beaten man (D1). Held in front (or the clock): the tier's finish mix.
    const moving = this.move === 'hesitation' || this.move === 'spin' || this.move === 'in_and_out' || this.move === 'behind';
    if (dist < LAYUP_RANGE && (!inLane || b.containedSec > 0.5)) { this.pending = this.beaten && !inLane ? 'dunk' : 'layup'; this.look = null; }
    else if (!moving && (b.containedSec >= CONTAIN_PULLUP_SEC * Math.max(0.45, b.patience) || b.t >= SHOT_CLOCK_SEC)) {
      if (dist < LAYUP_RANGE) { this.pending = 'layup'; this.look = null; }
      else {
        const fw = FINISH_WEIGHTS[this.tier];
        const inCorridor = dist >= floaterMinM() && dist <= floaterMaxM();
        const pick = pickWeighted({ stepback: inLane ? fw.stepback : 0, floater: inCorridor ? fw.floater : 0, straight: fw.straight }, this.rng()) ?? 'straight';
        this.pending = 'jumper'; this.look = pick === 'floater' ? 'floater' : null;
        if (pick === 'stepback') {
          this.endMove(b);
          b.phase = 'stepback'; this.stepbackSec = 0;
          return decision(dir.scale(-STEPBACK_SPEED), 'stepback', { contained: inLane, exposure: 0.2, action: this.say('stepback') });
        }
      }
    } else if (!this.sagRead && b.phase === 'drive' && !inLane && along > 0 && dDist <= sagM() && dDist >= CONTAIN_RANGE && dist <= pullUpRangeM() && dist >= floaterMaxM()) {
      // THE SAG READ: he is in the lane but giving me the jumper — PRO and up take it (rolled once a possession)
      this.sagRead = true;
      if (this.rng() < SAG_TAKE[this.tier]) { this.pending = 'jumper'; this.look = null; }
    }
    if (this.pending === 'layup' || this.pending === 'dunk' || this.pending === 'jumper') {
      this.endMove(b);
      b.phase = 'gather'; this.gatherSec = 0;
      return decision(ZERO(), 'gather', { contained: inLane, action, look: this.look });
    }
    return decision(intoBody(wish, self, defender, 0), b.phase, { contained: inLane, exposure, step, crossover, action, backToRim, moveSide });
  }
}
/** A body against a body does not keep running into it (the bodies touch at the hard gap; a wish into the chest only made the contact
 *  push him back every frame — the root's acceleration spikes): inside TOUCH_M of the man, the part of the wish INTO him is capped at
 *  `intoMps` (the post-up leans in at POST_INTO_MPS; everything else stops at the chest and goes round). Pure. */
export function intoBody(wish: Vector3, self: { x: number; z: number }, man: { x: number; z: number } | null, intoMps: number): Vector3 {
  if (!man) return wish;
  const dx = man.x - self.x, dz = man.z - self.z, d = Math.hypot(dx, dz);
  if (d >= TOUCH_M || d < 1e-4) return wish;
  const ux = dx / d, uz = dz / d, into = wish.x * ux + wish.z * uz;
  if (into <= intoMps) return wish;
  const cut = (into - intoMps) * Math.min(1, (TOUCH_M - d) / TOUCH_EASE_M);
  return new Vector3(wish.x - ux * cut, 0, wish.z - uz * cut);
}
/** The bodies' contact range for intoBody (m): the 1v1 capsules' 1.10 m and a hair; the cut eases in over TOUCH_EASE_M. */
export const TOUCH_M = 1.3, TOUCH_EASE_M = 0.2;
/** The post-up's lean into the man's chest (m/s). */
export const POST_INTO_MPS = 0.6;
/** A possession's open run this long is a DRIVE (the action list's). */
export const DRIVE_SAY_SEC = 0.5;
/** Memory fades this much per possession (the defender may have changed what he does). */
export const MEMORY_DECAY = 0.85;
/** The sag read is taken this often by tier (ROOKIE never: he drives into the man). */
export const SAG_TAKE: Readonly<Record<Tier, number>> = { rookie: 0, pro: 0.35, elite: 0.6 };
