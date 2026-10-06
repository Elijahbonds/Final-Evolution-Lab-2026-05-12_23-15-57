// FightCore — the shared 1v1 dueling systems behind Karate VS and Mixed
// Combat (M53, Phase 3). Where BasketballCore owns "movement + shooting +
// defense," this owns "strikes + guard + parry + combos + specials":
//   AttackDef        — data-driven strike table (range/startup/stun/knockback
//                      per move), with a karate set and two weapon profiles
//                      (FISTS vs STAFF) for the matchup-variety duel.
//   FighterState     — hp, guard gauge, chi, hit-stun/stagger timers, combo
//                      bookkeeping. Guard regenerates only while not held.
//   resolveStrike()  — one authoritative resolution for every swing:
//                      whiff / PARRIED (block tapped inside the 160ms
//                      window) / blocked (guard chips) / GUARD BREAK (gauge
//                      emptied → long stagger) / hit (stun + combo scaling).
//   RivalFightBrain  — the AI duelist: approaches to its weapon's range,
//                      circles at range, blocks reactively when you swing,
//                      attacks on a difficulty-scaled cooldown, spends full
//                      chi on its special. Same decide()-per-frame shape as
//                      every AI this project ships.
// Design references (mechanics only, all-original implementation): the
// hit-stun chain + guard-break rhythm of arena anime fighters, and the
// spacing/ring-awareness of 3D weapon fighters.

import type { Vector3 } from '@babylonjs/core';
import { nerve, standingOf, NEUTRAL, type NerveShift } from './Nerve';
import type { Tier } from './Difficulty';

// ── Attack data ──────────────────────────────────────────────────────────
export interface AttackDef {
  id: string;
  label: string;
  clip: string;              // SPORT_CLIP value the mode plays
  dmg: number;
  range: number;             // meters
  startupMs: number;         // swing → impact-check delay
  stunSec: number;           // defender hit-stun on clean hit
  knockback: number;         // meters of backward slide on hit
  chiGain: number;           // attacker chi on clean hit
  guardDmg: number;          // guard-gauge chip when blocked
  /**
   * The attack's line (Soul Calibur's vertical/horizontal grammar).
   *   vertical   — powerful, but STEPPABLE: if the defender is more than
   *                STEP_EVADE_M off the attacker's facing line at impact,
   *                the swing whiffs past them ('stepped').
   *   horizontal — sweeps wide: catches steppers. The answer to circling.
   * Optional: modes that don't pass a lateral offset to resolveStrike never
   * trigger the check, so the karate modes' behavior is unchanged whether or
   * not their attack sets declare a line.
   */
  line?: 'vertical' | 'horizontal';
}

/** Unarmed karate set (Karate VS, and the FISTS loadout in Mixed Combat):
 *  fast and short — win by getting inside and chaining stuns.
 *  Line grammar (only enforced where the mode passes lateral offsets —
 *  Mixed Combat): jab/heavy are vertical (steppable), the roundhouse kick
 *  is horizontal (catches steppers). */
export const KARATE_ATTACKS: Record<'jab' | 'kick' | 'heavy', AttackDef> = {
  jab:   { id: 'jab',   label: 'JAB',   clip: 'jab',       dmg: 6,  range: 1.6, startupMs: 120, stunSec: 0.35, knockback: 0.4, chiGain: 8,  guardDmg: 6,  line: 'vertical' },
  kick:  { id: 'kick',  label: 'KICK',  clip: 'high_kick', dmg: 9,  range: 1.9, startupMs: 180, stunSec: 0.45, knockback: 0.9, chiGain: 10, guardDmg: 10, line: 'horizontal' },
  heavy: { id: 'heavy', label: 'HEAVY', clip: 'uppercut',  dmg: 14, range: 1.8, startupMs: 260, stunSec: 0.7,  knockback: 1.6, chiGain: 14, guardDmg: 22, line: 'vertical' },
};

/** STAFF loadout (Mixed Combat): long and slow — win by keeping distance
 *  and punishing approaches. The reach-vs-speed tradeoff IS the matchup. */
export const STAFF_ATTACKS: Record<'jab' | 'kick' | 'heavy', AttackDef> = {
  jab:   { id: 'poke',     label: 'POKE',     clip: 'jab',        dmg: 8,  range: 2.6, startupMs: 200, stunSec: 0.4,  knockback: 0.8, chiGain: 8,  guardDmg: 8,  line: 'vertical' },
  kick:  { id: 'sweep',    label: 'SWEEP',    clip: 'roundhouse', dmg: 11, range: 2.8, startupMs: 260, stunSec: 0.5,  knockback: 1.4, chiGain: 10, guardDmg: 12, line: 'horizontal' },
  heavy: { id: 'overhead', label: 'OVERHEAD', clip: 'hook',       dmg: 16, range: 2.6, startupMs: 340, stunSec: 0.8,  knockback: 2.2, chiGain: 14, guardDmg: 26, line: 'vertical' },
};

/** Full-chi special — replaces HEAVY while chi is maxed. Huge knockback:
 *  in Mixed Combat this is the ring-out tool. Horizontal: the finisher is
 *  not steppable — you beat it with range, guard or a parry, not a sidestep. */
export const SPECIAL_ATTACK: AttackDef =
  { id: 'special', label: 'DRAGON', clip: 'roundhouse', dmg: 26, range: 2.2, startupMs: 320, stunSec: 1.0, knockback: 3.4, chiGain: 0, guardDmg: 100, line: 'horizontal' };

// ── Fighter state ────────────────────────────────────────────────────────
export const GUARD_MAX = 100;
export const CHI_MAX = 100;
export const PARRY_WINDOW_MS = 160;
export const GUARD_BREAK_STAGGER_SEC = 1.4;
export const PARRY_STAGGER_SEC = 0.9;
export const COMBO_WINDOW_SEC = 1.1;

export class FighterState {
  hp: number;
  guard = GUARD_MAX;
  chi = 0;
  stunSec = 0;               // brief, from clean hits — chains into combos
  staggerSec = 0;            // long, from guard break / being parried
  blockHeld = false;
  lastBlockPressMs = -1e9;   // for the parry window
  combo = 0;                 // hits landed BY this fighter in the window
  comboTimer = 0;

  constructor(public maxHp = 100) { this.hp = maxHp; }

  get controllable(): boolean { return this.stunSec <= 0 && this.staggerSec <= 0; }
  get guardBroken(): boolean { return this.guard <= 0; }

  tick(dt: number): void {
    this.stunSec = Math.max(0, this.stunSec - dt);
    this.staggerSec = Math.max(0, this.staggerSec - dt);
    this.comboTimer = Math.max(0, this.comboTimer - dt);
    if (this.comboTimer === 0) this.combo = 0;
    if (!this.blockHeld && this.guard < GUARD_MAX) this.guard = Math.min(GUARD_MAX, this.guard + 9 * dt);
  }

  pressBlock(nowMs: number): void { this.blockHeld = true; this.lastBlockPressMs = nowMs; }
  releaseBlock(): void { this.blockHeld = false; }

  resetRound(): void {
    this.hp = this.maxHp; this.guard = GUARD_MAX;
    this.stunSec = 0; this.staggerSec = 0; this.combo = 0; this.comboTimer = 0;
    this.blockHeld = false; this.lastBlockPressMs = -1e9;
  }
}

// ── Strike resolution ────────────────────────────────────────────────────
export type StrikeOutcome = 'whiff' | 'parried' | 'blocked' | 'guardBreak' | 'hit' | 'stepped';

/** How far off the attack line a defender must be for a vertical to whiff
 *  past them. TUNE(elijah), MEASURED: fighters move 3.3 m/s, so a committed
 *  orbit covers 0.40m inside a jab's 120ms startup and 0.86m inside a
 *  heavy's 260ms. 0.5 made the step invisible (0 steps in a 150s driven
 *  match — only heavies qualified, and heavies are 20% of the brain's mix).
 *  0.32 makes deliberate lateral movement beat even jabs — the Soul Calibur
 *  answer to which is the horizontal, which is what B is FOR. Slight drift
 *  (~0.2m from re-aiming) still connects. */
export const STEP_EVADE_M = 0.32;

/** Chi the stepper earns for making a vertical miss — the read IS the
 *  reward (Soul Calibur pays initiative for a good step). */
export const STEP_CHI_GAIN = 8;

/** One authoritative answer for a swing landing at `dist` right now (`nowMs`: the impact instant).
 *  Mutates the DEFENDER's guard/stagger state for blocked/broken/parried
 *  outcomes; 'hit' damage is applied by the caller via applyHit (so the
 *  attacker's combo scaling stays with the attacker).
 *
 *  `lateralOffsetM` = the defender's sideways distance from the attacker's
 *  facing line at impact. Only vertical attacks check it (a stepped
 *  vertical whiffs past); horizontals ignore it — that's their job. */
export function resolveStrike(atk: AttackDef, dist: number, defender: FighterState, nowMs: number, lateralOffsetM?: number, parryWindowMs = PARRY_WINDOW_MS): StrikeOutcome {
  if (dist > atk.range) return 'whiff';
  if (!defender.controllable) return 'hit';                 // stunned/staggered = defenseless
  // MOVEMENT PLAY P7 (2026-09-25): `parryWindowMs` is a BODY defender's widened window (bodyFight.BODY_PARRY_WINDOW_MS);
  // every pad defender keeps the default
  if (nowMs - defender.lastBlockPressMs <= parryWindowMs) return 'parried';
  if (defender.blockHeld) {
    defender.guard -= atk.guardDmg;
    if (defender.guard <= 0) {
      defender.guard = 0;
      defender.blockHeld = false;
      defender.staggerSec = GUARD_BREAK_STAGGER_SEC;
      return 'guardBreak';
    }
    return 'blocked';
  }
  if (atk.line === 'vertical' && lateralOffsetM != null && Math.abs(lateralOffsetM) > STEP_EVADE_M) {
    return 'stepped';
  }
  return 'hit';
}

/** Apply a clean hit: combo-scaled damage (each chain link past the first
 *  takes 12% off, floor 40%) + stun + attacker chi/combo bookkeeping.
 *  Returns the damage actually dealt. */
export function applyHit(attacker: FighterState, defender: FighterState, atk: AttackDef): number {
  attacker.combo += 1;
  attacker.comboTimer = COMBO_WINDOW_SEC;
  const scale = Math.max(0.4, 1 - 0.12 * (attacker.combo - 1));
  const dealt = Math.round(atk.dmg * scale);
  defender.hp = Math.max(0, defender.hp - dealt);
  defender.stunSec = Math.max(defender.stunSec, atk.stunSec);
  attacker.chi = Math.min(CHI_MAX, attacker.chi + atk.chiGain);
  return dealt;
}

// ── AI duelist ───────────────────────────────────────────────────────────
/** IMPROVE (2026-10-06): what a rival's guard IS when `block` is true. Modes used to guess it from the press stamp —
 *  Showdown and Duel stamped `now − 200 ms` (always a plain block, never a parry), Karate VS and Mixed stamped `now`
 *  (a parry whenever the swing landed inside 160 ms, i.e. every jab it read, by accident). The brain says it now:
 *    block  — hold it; chips the gauge.
 *    parry  — a tap timed to the impact (PARRY_WINDOW_MS).
 *    impact — a guard impact: the tap plus the flick, timed to its tighter window (DefenseSystem modes only; a
 *             FighterState-only mode treats it as a parry). */
export type GuardIntent = 'block' | 'parry' | 'impact';

export interface FightAction {
  moveX: number; moveY: number;        // same convention as Intent: -1..1, y+ = toward camera
  attack: 'jab' | 'kick' | 'heavy' | null;
  block: boolean;
  /** IMPROVE (2026-10-06): set when `block` is true — see GuardIntent; null otherwise. Feed it to guardPressMs. */
  guard?: GuardIntent | null;
}

/** The guard-impact window as FightCore knows it (DefenseSystem.GUARD_IMPACT_WINDOW_MS imports FightCore, so the
 *  number lives here too; defense-system tests pin that the two agree). */
const IMPACT_WINDOW_MS = 90;

/**
 * IMPROVE (2026-10-06): the timestamp a rival's block press should carry, so the defense code reads the guard the
 * brain meant. `impactInMs` = ms until the incoming strike connects, when the mode knows it (a StrikeController's
 * secToActive, a swing's impact stamp); unknown → the press is stamped now, which is what the karate modes did.
 *   block  → stamped before the parry window, so the hold is a block and never an accidental parry.
 *   parry  → stamped so the impact lands mid-window.
 *   impact → stamped so the impact lands inside the guard-impact window (pair it with flick = true).
 */
export function guardPressMs(nowMs: number, guard: GuardIntent | null | undefined, impactInMs?: number | null): number {
  if (guard !== 'parry' && guard !== 'impact') return nowMs - PARRY_WINDOW_MS - 40;
  if (impactInMs == null || !Number.isFinite(impactInMs) || impactInMs < 0) return nowMs;
  const win = guard === 'impact' ? IMPACT_WINDOW_MS : PARRY_WINDOW_MS;
  // never later than the impact itself: a press stamped after the blow is no guard at all
  return nowMs + Math.max(0, impactInMs - win * 0.5);
}

/** RIVAL-PRESSURE-FLOOR (2026-10-04): once the rival is in range of a
 *  stationary, never-blocking foe, it must land its first hit within this
 *  many seconds of difficulty — otherwise a low roll on the jab share (32%,
 *  1.6 m) against a rival parked at its circling radius (~1.70 m, outside
 *  jab range) could whiff indefinitely. Sorted ascending by difficulty,
 *  clamped at both ends, linearly interpolated between points. Easy rivals
 *  keep the loose 6 s ceiling — they do not get faster, they just can't
 *  stall forever. */
export const PRESSURE_FLOOR_TABLE: Array<[number, number]> = [[0.4, 6.0], [0.7, 3.0]];

export function pressureFloorSec(difficulty: number): number {
  const table = PRESSURE_FLOOR_TABLE;
  if (difficulty <= table[0][0]) return table[0][1];
  const last = table[table.length - 1];
  if (difficulty >= last[0]) return last[1];
  for (let i = 0; i < table.length - 1; i++) {
    const [d0, f0] = table[i];
    const [d1, f1] = table[i + 1];
    if (difficulty >= d0 && difficulty <= d1) {
      const t = (difficulty - d0) / (d1 - d0);
      return f0 + (f1 - f0) * t;
    }
  }
  return last[1];
}

/** IMPROVE (2026-10-06), TUNED: of the guard reads (not the sidesteps), the share that is a timed PARRY rather than a
 *  held block — `PARRY_READ_PER_SKILL × difficulty`, capped. 0.72 → 32 %. Before, Showdown/Duel never parried and
 *  Karate VS/Mixed parried every jab they read by accident of the press stamp. */
export const PARRY_READ_PER_SKILL = 0.45;
export const PARRY_READ_CAP = 0.4;
/** IMPROVE (2026-10-06), TUNED: the chance to read an opening — the foe in a whiff's recovery, a dash or a roll — and
 *  punish it, once per opening: `PUNISH_READ_PER_SKILL × difficulty`, capped. 0.72 → 50 %. */
export const PUNISH_READ_PER_SKILL = 0.7;
export const PUNISH_READ_CAP = 0.85;
/** IMPROVE (2026-10-06): edge awareness — how far ahead the brain probes a step, and how much floor it keeps. */
export const EDGE_PROBE_M = 1.0;
export const EDGE_SAFE_M = 1.4;

/**
 * IMPROVE (2026-10-06), TUNED: THE DIFFICULTY PICK reaches the duels. Every combat mode hard-coded its rival's dial
 * (0.72 Karate VS / Showdown / Duel, 0.68 Mixed) and the brain had no setter, so the shared OPPONENT picker
 * (core/Difficulty) could not be offered on a fight. PRO is the owner-tuned base exactly; ROOKIE and ELITE move it.
 * The brain's own round ramp caps the effective dial at 0.92, so ELITE stays a read, never a wall.
 */
export const RIVAL_TIER_OFFSET: Readonly<Record<Tier, number>> = { rookie: -0.22, pro: 0, elite: 0.12 };
export function rivalDifficulty(base: number, tier: Tier | null | undefined): number {
  const off = tier ? RIVAL_TIER_OFFSET[tier] ?? 0 : 0;
  return Math.max(0.3, Math.min(0.95, base + off));
}

export class RivalFightBrain {
  private cooldown = 1.2;
  private circleDir = 1;
  private circleTimer = 2;
  private blockHoldSec = 0;
  /** Phase 5 (2026-09-03, mixed combat D2): a deliberate sidestep burst —
   *  the brain reads the wind-up and moves off the attack line instead of
   *  guarding. Seconds left in the burst, and its direction. */
  private stepHoldSec = 0;
  private stepDir = 1;
  /** Have we already reacted to the wind-up currently on screen? */
  private reactedToStrike = false;
  /** COMBAT-AI (2026-09-30): punishable strings — consecutive player swings. */
  private foeStrikeStreak = 0;
  private foeStrikeGap = 0;
  private wasFoeStriking = false;
  /** Seconds left to counter after a successful block read. */
  private punishSec = 0;
  /** Round ramp: each round the rival reads a little sooner and presses harder. */
  private roundBonus = 0;
  /** Vary the attack mix so rounds do not read as jab spam. */
  private attackBias = 0;
  /** RIVAL-PRESSURE-FLOOR: seconds spent continuously inside the swing gate
   *  (dist <= attacks.heavy.range) since the last committed swing that could
   *  connect. See pressureFloorSec() below for why this exists. */
  private pressureClock = 0;
  /** IMPROVE (2026-10-06): what the current guard read is (see GuardIntent). */
  private guardIntent: GuardIntent = 'block';
  /** IMPROVE (2026-10-06): may a full chi bar become the special? A mode whose rival cannot throw the DRAGON (the force
   *  gate, FighterStyle) said nothing, so a full bar locked the brain onto heavies it could never upgrade. */
  private canSpecial = true;
  /** IMPROVE (2026-10-06): metres inside the arena's edge at (x, z), negative outside; null = no edge to respect. */
  private edgeIn: ((x: number, z: number) => number) | null = null;
  /** IMPROVE (2026-10-06): the whiff/recovery read — have we already looked at the opening on screen? */
  private wasFoeOpen = false;
  /** IMPROVE (2026-10-06): memo of the last standing applied (setStanding), so a per-frame caller costs nothing. */
  private standingKey = '';
  private standingShift: NerveShift = NEUTRAL;
  /** IMPROVE (2026-10-06): one output object, rewritten every decide() — no per-frame allocation. Valid until the next
   *  decide() call; every caller reads it on the spot. */
  private readonly out: FightAction = { moveX: 0, moveY: 0, attack: null, block: false, guard: null };

  constructor(private difficulty = 0.6, private attacks: Record<'jab' | 'kick' | 'heavy', AttackDef> = KARATE_ATTACKS) {
    this.attackBias = Math.random();
  }

  /** IMPROVE (2026-10-06): the dial is a setter now (a difficulty pick, a ladder rung) — it was fixed at construction. */
  setDifficulty(d: number): void {
    if (Number.isFinite(d)) this.difficulty = Math.max(0.05, Math.min(2, d));
  }
  get skill(): number { return this.difficulty; }

  /** IMPROVE (2026-10-06): see `canSpecial`. Default true keeps the old behaviour for a mode that never says. */
  setCanSpecial(ok: boolean): void { this.canSpecial = ok; }

  /** IMPROVE (2026-10-06): give the brain the arena — `insideBy` for the picked arena. Circling, backing off and the
   *  sidestep then turn away from an edge instead of walking the rival off a drop arena. null = no edge (the default). */
  setEdge(edgeIn: ((x: number, z: number) => number) | null): void { this.edgeIn = edgeIn; }

  /**
   * IMPROVE (2026-10-06): NERVE IN ONE PLACE. Showdown and Duel computed nerve() every frame; Karate VS and Mixed
   * at round end. The standing only moves when a round ends, so every mode now calls this at ROUND START (next to
   * setRound) with the rounds as they stand. Memoised: calling it again with the same score is free. Returns the
   * shift for a log line.
   */
  setStanding(rivalWins: number, playerWins: number, toWin: number): NerveShift {
    const key = `${rivalWins}:${playerWins}:${toWin}`;
    if (key === this.standingKey) return this.standingShift;
    this.standingKey = key;
    const late = Math.min(1, Math.max(rivalWins, playerWins) / Math.max(1, toWin));
    this.standingShift = nerve(standingOf(rivalWins, playerWins, toWin, late));
    this.setNerve(this.standingShift.aggression, this.standingShift.mistake);
    return this.standingShift;
  }

  /** IMPROVE (2026-10-06): the shared write into `out`. */
  private emit(moveX: number, moveY: number, attack: FightAction['attack'], block: boolean): FightAction {
    const o = this.out;
    o.moveX = moveX; o.moveY = moveY; o.attack = attack; o.block = block; o.guard = block ? this.guardIntent : null;
    return o;
  }

  /** IMPROVE (2026-10-06): metres inside the edge one PROBE step along world (wx, wz) from (sx, sz); +Inf with no edge. */
  private probe(sx: number, sz: number, wx: number, wz: number): number {
    return this.edgeIn ? this.edgeIn(sx + wx * EDGE_PROBE_M, sz + wz * EDGE_PROBE_M) : Infinity;
  }

  /**
   * How hard it is pressing, and what that costs it. Both 1 = it is playing its normal game.
   *
   * NERVE (2026-09-14). The rival fought the decider exactly the way it fought round one, because
   * `difficulty` was fixed at construction — the one thing separating every opponent in the game from the
   * dunk contest's rival.
   *
   * THIS IS TWO DIALS AND NOT ONE ON PURPOSE. `difficulty` bundles pressure and skill: raising it makes
   * the rival attack more often AND guard more, so nerving it upward when the rival is behind would be a
   * straight buff — which is exactly the trap Nerve exists to refuse. So the two halves are separated.
   * `press` shortens the attack cooldown; `loose` widens the reactive guard's failure. A rival that is
   * behind comes forward more and reads less, which is what chasing a fight looks like.
   */
  private press = 1;
  private loose = 1;
  setNerve(aggression: number, mistake: number): void {
    if (Number.isFinite(aggression)) this.press = Math.max(0.5, Math.min(2, aggression));
    if (Number.isFinite(mistake)) this.loose = Math.max(0.5, Math.min(2, mistake));
  }

  /** COMBAT-AI: later rounds read mash strings and counter more reliably. */
  setRound(round: number): void {
    this.roundBonus = Math.max(0, Math.min(0.22, (round - 1) * 0.08));
  }

  /** `foeStriking` = the player is mid-swing (readable startup — what the
   *  rival reacts to, exactly like a human watching the wind-up). */
  decide(dt: number, self: Pick<Vector3, 'x' | 'z'>, foe: Pick<Vector3, 'x' | 'z'>, selfState: FighterState, foeStriking: boolean, foeOpen = false): FightAction {
    // IMPROVE (2026-10-06): `foeOpen` = the foe is punishable rather than threatening — a whiff's recovery, a dash, a
    // roll. The brain only ever read `foeStriking`, so it never punished a whiff. Default false: a mode that does not
    // say plays exactly as before (no extra roll is drawn).
    if (!selfState.controllable) { this.wasFoeOpen = foeOpen; return this.emit(0, 0, null, false); }

    this.cooldown -= dt;
    this.circleTimer -= dt;
    this.blockHoldSec = Math.max(0, this.blockHoldSec - dt);
    this.stepHoldSec = Math.max(0, this.stepHoldSec - dt);
    this.punishSec = Math.max(0, this.punishSec - dt);
    if (this.circleTimer <= 0) { this.circleTimer = 1.4 + Math.random() * 1.6; this.circleDir *= -1; }

    // IMPROVE (2026-10-06): plain numbers — the old `to`, `dir` and `perp` were three Vector3s a frame per rival
    const tx = foe.x - self.x, tz = foe.z - self.z;
    const dist = Math.hypot(tx, tz);
    const dx = dist > 0 ? tx / dist : 0, dz = dist > 0 ? tz / dist : 0;
    const idealRange = this.attacks.jab.range * 0.9;
    const effDiff = Math.min(0.92, this.difficulty + this.roundBonus);

    // RIVAL-PRESSURE-FLOOR: the clock only runs inside the swing gate used
    // below (dist <= attacks.heavy.range) and resets the moment it leaves
    // range — the floor is measured from "in range", not total fight time.
    const inSwingRange = dist <= this.attacks.heavy.range;
    if (inSwingRange) this.pressureClock += dt; else this.pressureClock = 0;

    // Track punishable strings: a mash is three swings inside ~1.1 s.
    if (foeStriking && !this.wasFoeStriking) this.foeStrikeStreak += 1;
    this.wasFoeStriking = foeStriking;
    if (foeStriking) this.foeStrikeGap = 0;
    else {
      this.foeStrikeGap += dt;
      if (this.foeStrikeGap > 0.55) this.foeStrikeStreak = 0;
    }
    const stringRead = this.foeStrikeStreak >= 2 ? 0.22 : 0;

    // RIVAL-PRESSURE-FLOOR: once the clock gets within a swing's startup of
    // the per-difficulty ceiling, force a committed swing that is guaranteed
    // to connect (dist <= chosen attack's range — the same "hit" the tests
    // use) instead of rolling/circling/guarding this frame. This fires
    // rarely (only seeds that would otherwise breach the floor) and never
    // calls Math.random(), so every frame that was never close to breaching
    // plays out byte-identical to before. attackBias (already rolled once at
    // construction) still decides which covering move fires, so
    // personalities keep their mix instead of collapsing onto one move
    // under pressure.
    //
    // Uses this.difficulty (not effDiff) for the floor lookup: effDiff is a
    // separate per-round ramp; the floor table is keyed to the base dial
    // the sweep tests set.
    if (inSwingRange) {
      const floorSec = pressureFloorSec(this.difficulty);
      const margin = this.attacks.heavy.startupMs / 1000;
      if (floorSec - this.pressureClock <= margin) {
        const candidates = (['heavy', 'kick', 'jab'] as const).filter((k) => this.attacks[k].range >= dist);
        const forcedAttack = this.canSpecial && selfState.chi >= CHI_MAX ? 'heavy'
          : candidates[Math.floor(this.attackBias * candidates.length) % candidates.length];
        this.cooldown = 1.0 / Math.max(0.3, effDiff * this.press);
        this.pressureClock = 0;
        this.wasFoeOpen = foeOpen;
        return this.emit(0, 0, forcedAttack, false);
      }
    }

    // IMPROVE (2026-10-06): PUNISH THE OPENING — once per opening (its rising edge), a skill-scaled read; a hit opens
    // the counter window the block read already uses, and clears the cooldown so the counter can come now. NERVE's
    // `loose` costs it like the guard read.
    if (foeOpen && !this.wasFoeOpen && dist <= this.attacks.heavy.range + 0.6 && this.blockHoldSec === 0 && this.stepHoldSec === 0) {
      const punishAt = Math.min(PUNISH_READ_CAP, (effDiff * PUNISH_READ_PER_SKILL) / this.loose);
      if (Math.random() < punishAt) { this.punishSec = Math.max(this.punishSec, 0.5); this.cooldown = Math.min(this.cooldown, 0); }
    }
    this.wasFoeOpen = foeOpen;

    // REACTIVE GUARD — once per wind-up, not once per frame.
    //
    // This rolled `difficulty * 0.5` on EVERY FRAME the player was mid-swing.
    // A jab's startup is 120ms and a kick's 180ms, so at 60fps that is 7-11
    // rolls per attack: at difficulty 0.6 the rival blocked about 98% of
    // everything thrown at it. Measured outcomes over a run of kicks were
    // blocked / blocked / blocked / parried / whiff — and not one HIT. The
    // player could not damage the rival at all, which is not a hard opponent,
    // it is an unbeatable one.
    //
    // Rolling once on the rising edge of the wind-up makes the number mean what
    // it reads as: a 30% chance to read the attack and guard it.
    if (!foeStriking) this.reactedToStrike = false;
    if (foeStriking && !this.reactedToStrike) {
      this.reactedToStrike = true;
      if (dist < this.attacks.heavy.range + 0.4 && this.blockHoldSec === 0 && this.stepHoldSec === 0) {
        const roll = Math.random();
        // One read per wind-up, split between the two honest answers to a
        // vertical: step off the line (the sidestep grammar pays chi and
        // opens a punish) or guard it. Difficulty scales both.
        // NERVE: `loose` is the price of pressing. A rival chasing the fight reads the wind-up less often,
        // so the guard it does not put up is what pays for the pressure it is applying.
        const read = Math.min(0.95, effDiff / this.loose + stringRead);
        // STEP_SHARE of the roll sidesteps; READ_SHARE is the whole answer
        // (step or guard). The 0.92 / 0.95 caps bound the in-match ramp so a
        // later round cannot become a wall. They must not also clip a skill
        // dial that already covers every roll: before the caps, difficulty 2
        // made `read * 0.85` land past 1, and fight-balance C1 still requires
        // that a maxed dial always answers the wind-up. In-match bases
        // (0.68, 0.72) stay under this line, so their step and guard rates
        // do not move. `loose` still opens a miss — a chasing rival pays for
        // pressing by reading less, even on a high dial.
        const STEP_SHARE = 0.30;
        const READ_SHARE = 0.88;
        const dialCovers = (this.difficulty / this.loose) * READ_SHARE >= 1;
        const stepAt = dialCovers ? STEP_SHARE / READ_SHARE : read * STEP_SHARE;
        const readAt = dialCovers ? 1 : read * READ_SHARE;
        if (roll < stepAt) {
          this.stepHoldSec = 0.22;
          this.stepDir = Math.random() < 0.5 ? -1 : 1;
          // IMPROVE (2026-10-06): EDGE — the coin picks the side, unless that side is the drop and the other is not
          if (this.edgeIn && this.probe(self.x, self.z, -dz * this.stepDir, dx * this.stepDir) < EDGE_SAFE_M
            && this.probe(self.x, self.z, dz * this.stepDir, -dx * this.stepDir) > this.probe(self.x, self.z, -dz * this.stepDir, dx * this.stepDir)) {
            this.stepDir = -this.stepDir;
          }
        } else if (roll < readAt) {
          this.blockHoldSec = this.foeStrikeStreak >= 2 ? 0.55 : 0.45;
          this.punishSec = 0.42;
          // IMPROVE (2026-10-06): THE PARRY ON PURPOSE. Where in the guard share the same roll fell decides whether the
          // guard is a timed tap or a held block — no second roll, so every seeded sequence draws the same numbers.
          const u = readAt > stepAt ? (roll - stepAt) / (readAt - stepAt) : 1;
          const parryShare = Math.min(PARRY_READ_CAP, (effDiff * PARRY_READ_PER_SKILL) / this.loose);
          this.guardIntent = u < parryShare ? 'parry' : 'block';
        }
      }
    }
    if (this.stepHoldSec > 0) {
      // perp = (−dir.z, dir.x) × stepDir, in the Intent convention (moveY = −world z)
      return this.emit(-dz * this.stepDir, -dx * this.stepDir, null, false);
    }
    if (this.blockHoldSec > 0) return this.emit(0, 0, null, true);

    // Counter window after a read — punish the string with a heavy or kick.
    if (this.punishSec > 0 && dist <= this.attacks.heavy.range && this.cooldown <= 0) {
      this.cooldown = (0.85 + Math.random() * 0.7) / Math.max(0.3, effDiff * this.press);
      this.punishSec = 0;
      const attack = this.canSpecial && selfState.chi >= CHI_MAX ? 'heavy'
        : this.foeStrikeStreak >= 2 || Math.random() < 0.55 ? 'heavy' : 'kick';
      // RIVAL-PRESSURE-FLOOR: a committed swing that already covers `dist`
      // resets the clock, same as the forced branch above.
      if (this.attacks[attack].range >= dist) this.pressureClock = 0;
      return this.emit(0, 0, attack, false);
    }

    // attack when in range and off cooldown
    if (dist <= this.attacks.heavy.range && this.cooldown <= 0) {
      // NERVE: pressing comes forward sooner. The skill baseline stays `difficulty`; `press` is situation.
      this.cooldown = (1.0 + Math.random() * 0.9) / Math.max(0.3, effDiff * this.press);
      const roll = (Math.random() + this.attackBias) % 1;
      const attack = this.canSpecial && selfState.chi >= CHI_MAX ? 'heavy'          // full chi → the mode upgrades heavy to the special
        : roll < 0.32 ? 'jab' : roll < 0.68 ? 'kick' : 'heavy';
      // RIVAL-PRESSURE-FLOOR: same reset as above.
      if (this.attacks[attack].range >= dist) this.pressureClock = 0;
      return this.emit(0, 0, attack, false);
    }

    // spacing: back off from a mashing foe; approach when out of range; circle at ideal range
    // IMPROVE (2026-10-06): EDGE — backing off toward a drop is not spacing, it is a ring-out; it circles instead
    if (this.foeStrikeStreak >= 2 && dist < idealRange + 0.15 && this.probe(self.x, self.z, -dx, -dz) >= EDGE_SAFE_M) {
      return this.emit(-dx * 0.85, dz * 0.85, null, false);
    }
    if (dist > idealRange + 0.3) {
      return this.emit(dx, -dz, null, false);
    }
    // circle: perp = (−dir.z, dir.x) × circleDir. EDGE: turn the circle around when this way runs out of floor and the
    // other way has more, and near the edge lean in toward the foe (he is the inside of the fight)
    if (this.edgeIn) {
      const ahead = this.probe(self.x, self.z, -dz * this.circleDir, dx * this.circleDir);
      if (ahead < EDGE_SAFE_M && this.probe(self.x, self.z, dz * this.circleDir, -dx * this.circleDir) > ahead) {
        this.circleDir *= -1;
        this.circleTimer = Math.max(this.circleTimer, 1.0);
      }
      if (this.edgeIn(self.x, self.z) < EDGE_SAFE_M) {
        const px = -dz * this.circleDir * 0.6 + dx * 0.35, pz = dx * this.circleDir * 0.6 + dz * 0.35;
        return this.emit(px, -pz, null, false);
      }
    }
    return this.emit(-dz * this.circleDir * 0.6, -dx * this.circleDir * 0.6, null, false);
  }
}
