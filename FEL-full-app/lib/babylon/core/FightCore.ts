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

import { Vector3 } from '@babylonjs/core';

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
export interface FightAction {
  moveX: number; moveY: number;        // same convention as Intent: -1..1, y+ = toward camera
  attack: 'jab' | 'kick' | 'heavy' | null;
  block: boolean;
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

  constructor(private difficulty = 0.6, private attacks: Record<'jab' | 'kick' | 'heavy', AttackDef> = KARATE_ATTACKS) {
    this.attackBias = Math.random();
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
  decide(dt: number, self: Vector3, foe: Vector3, selfState: FighterState, foeStriking: boolean): FightAction {
    const none: FightAction = { moveX: 0, moveY: 0, attack: null, block: false };
    if (!selfState.controllable) return none;

    this.cooldown -= dt;
    this.circleTimer -= dt;
    this.blockHoldSec = Math.max(0, this.blockHoldSec - dt);
    this.stepHoldSec = Math.max(0, this.stepHoldSec - dt);
    this.punishSec = Math.max(0, this.punishSec - dt);
    if (this.circleTimer <= 0) { this.circleTimer = 1.4 + Math.random() * 1.6; this.circleDir *= -1; }

    const to = foe.subtract(self); to.y = 0;
    const dist = to.length();
    const dir = to.normalize();
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
        const forcedAttack = selfState.chi >= CHI_MAX ? 'heavy'
          : candidates[Math.floor(this.attackBias * candidates.length) % candidates.length];
        this.cooldown = 1.0 / Math.max(0.3, effDiff * this.press);
        this.pressureClock = 0;
        return { moveX: 0, moveY: 0, attack: forcedAttack, block: false };
      }
    }

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
        } else if (roll < readAt) {
          this.blockHoldSec = this.foeStrikeStreak >= 2 ? 0.55 : 0.45;
          this.punishSec = 0.42;
        }
      }
    }
    if (this.stepHoldSec > 0) {
      const perp = new Vector3(-dir.z, 0, dir.x).scale(this.stepDir);
      return { moveX: perp.x, moveY: -perp.z, attack: null, block: false };
    }
    if (this.blockHoldSec > 0) return { moveX: 0, moveY: 0, attack: null, block: true };

    // Counter window after a read — punish the string with a heavy or kick.
    if (this.punishSec > 0 && dist <= this.attacks.heavy.range && this.cooldown <= 0) {
      this.cooldown = (0.85 + Math.random() * 0.7) / Math.max(0.3, effDiff * this.press);
      this.punishSec = 0;
      const attack = selfState.chi >= CHI_MAX ? 'heavy'
        : this.foeStrikeStreak >= 2 || Math.random() < 0.55 ? 'heavy' : 'kick';
      // RIVAL-PRESSURE-FLOOR: a committed swing that already covers `dist`
      // resets the clock, same as the forced branch above.
      if (this.attacks[attack].range >= dist) this.pressureClock = 0;
      return { moveX: 0, moveY: 0, attack, block: false };
    }

    // attack when in range and off cooldown
    if (dist <= this.attacks.heavy.range && this.cooldown <= 0) {
      // NERVE: pressing comes forward sooner. The skill baseline stays `difficulty`; `press` is situation.
      this.cooldown = (1.0 + Math.random() * 0.9) / Math.max(0.3, effDiff * this.press);
      const roll = (Math.random() + this.attackBias) % 1;
      const attack = selfState.chi >= CHI_MAX ? 'heavy'          // full chi → the mode upgrades heavy to the special
        : roll < 0.32 ? 'jab' : roll < 0.68 ? 'kick' : 'heavy';
      // RIVAL-PRESSURE-FLOOR: same reset as above.
      if (this.attacks[attack].range >= dist) this.pressureClock = 0;
      return { moveX: 0, moveY: 0, attack, block: false };
    }

    // spacing: back off from a mashing foe; approach when out of range; circle at ideal range
    if (this.foeStrikeStreak >= 2 && dist < idealRange + 0.15) {
      return { moveX: -dir.x * 0.85, moveY: dir.z * 0.85, attack: null, block: false };
    }
    if (dist > idealRange + 0.3) {
      return { moveX: dir.x, moveY: -dir.z, attack: null, block: false };
    }
    const perp = new Vector3(-dir.z, 0, dir.x).scale(this.circleDir);
    return { moveX: perp.x * 0.6, moveY: -perp.z * 0.6, attack: null, block: false };
  }
}
