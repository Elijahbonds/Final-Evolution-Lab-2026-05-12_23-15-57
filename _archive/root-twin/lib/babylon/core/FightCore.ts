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
}

/** Unarmed karate set (Karate VS, and the FISTS loadout in Mixed Combat):
 *  fast and short — win by getting inside and chaining stuns. */
export const KARATE_ATTACKS: Record<'jab' | 'kick' | 'heavy', AttackDef> = {
  jab:   { id: 'jab',   label: 'JAB',   clip: 'jab',       dmg: 6,  range: 1.6, startupMs: 120, stunSec: 0.35, knockback: 0.4, chiGain: 8,  guardDmg: 6 },
  kick:  { id: 'kick',  label: 'KICK',  clip: 'high_kick', dmg: 9,  range: 1.9, startupMs: 180, stunSec: 0.45, knockback: 0.9, chiGain: 10, guardDmg: 10 },
  heavy: { id: 'heavy', label: 'HEAVY', clip: 'uppercut',  dmg: 14, range: 1.8, startupMs: 260, stunSec: 0.7,  knockback: 1.6, chiGain: 14, guardDmg: 22 },
};

/** STAFF loadout (Mixed Combat): long and slow — win by keeping distance
 *  and punishing approaches. The reach-vs-speed tradeoff IS the matchup. */
export const STAFF_ATTACKS: Record<'jab' | 'kick' | 'heavy', AttackDef> = {
  jab:   { id: 'poke',     label: 'POKE',     clip: 'jab',        dmg: 8,  range: 2.6, startupMs: 200, stunSec: 0.4,  knockback: 0.8, chiGain: 8,  guardDmg: 8 },
  kick:  { id: 'sweep',    label: 'SWEEP',    clip: 'roundhouse', dmg: 11, range: 2.8, startupMs: 260, stunSec: 0.5,  knockback: 1.4, chiGain: 10, guardDmg: 12 },
  heavy: { id: 'overhead', label: 'OVERHEAD', clip: 'hook',       dmg: 16, range: 2.6, startupMs: 340, stunSec: 0.8,  knockback: 2.2, chiGain: 14, guardDmg: 26 },
};

/** Full-chi special — replaces HEAVY while chi is maxed. Huge knockback:
 *  in Mixed Combat this is the ring-out tool. */
export const SPECIAL_ATTACK: AttackDef =
  { id: 'special', label: 'DRAGON', clip: 'roundhouse', dmg: 26, range: 2.2, startupMs: 320, stunSec: 1.0, knockback: 3.4, chiGain: 0, guardDmg: 100 };

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
export type StrikeOutcome = 'whiff' | 'parried' | 'blocked' | 'guardBreak' | 'hit';

/** One authoritative answer for a swing landing at `dist` right now.
 *  Mutates the DEFENDER's guard/stagger state for blocked/broken/parried
 *  outcomes; 'hit' damage is applied by the caller via applyHit (so the
 *  attacker's combo scaling stays with the attacker). */
export function resolveStrike(atk: AttackDef, dist: number, defender: FighterState, nowMs: number): StrikeOutcome {
  if (dist > atk.range) return 'whiff';
  if (!defender.controllable) return 'hit';                 // stunned/staggered = defenseless
  if (nowMs - defender.lastBlockPressMs <= PARRY_WINDOW_MS) return 'parried';
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

export class RivalFightBrain {
  private cooldown = 1.2;
  private circleDir = 1;
  private circleTimer = 2;
  private blockHoldSec = 0;

  constructor(private difficulty = 0.6, private attacks: Record<'jab' | 'kick' | 'heavy', AttackDef> = KARATE_ATTACKS) {}

  /** `foeStriking` = the player is mid-swing (readable startup — what the
   *  rival reacts to, exactly like a human watching the wind-up). */
  decide(dt: number, self: Vector3, foe: Vector3, selfState: FighterState, foeStriking: boolean): FightAction {
    const none: FightAction = { moveX: 0, moveY: 0, attack: null, block: false };
    if (!selfState.controllable) return none;

    this.cooldown -= dt;
    this.circleTimer -= dt;
    this.blockHoldSec = Math.max(0, this.blockHoldSec - dt);
    if (this.circleTimer <= 0) { this.circleTimer = 1.4 + Math.random() * 1.6; this.circleDir *= -1; }

    const to = foe.subtract(self); to.y = 0;
    const dist = to.length();
    const dir = to.normalize();
    const idealRange = this.attacks.jab.range * 0.9;

    // reactive guard: see the wind-up, hold block for a beat
    if (foeStriking && dist < this.attacks.heavy.range + 0.4 && this.blockHoldSec === 0
        && Math.random() < this.difficulty * 0.5) {
      this.blockHoldSec = 0.45;
    }
    if (this.blockHoldSec > 0) return { moveX: 0, moveY: 0, attack: null, block: true };

    // attack when in range and off cooldown
    if (dist <= this.attacks.heavy.range && this.cooldown <= 0) {
      this.cooldown = (1.0 + Math.random() * 0.9) / Math.max(0.3, this.difficulty);
      const roll = Math.random();
      const attack = selfState.chi >= CHI_MAX ? 'heavy'          // full chi → the mode upgrades heavy to the special
        : roll < 0.45 ? 'jab' : roll < 0.8 ? 'kick' : 'heavy';
      return { moveX: 0, moveY: 0, attack, block: false };
    }

    // spacing: approach when out of range, circle when in range
    if (dist > idealRange + 0.3) {
      return { moveX: dir.x, moveY: -dir.z, attack: null, block: false };
    }
    const perp = new Vector3(-dir.z, 0, dir.x).scale(this.circleDir);
    return { moveX: perp.x * 0.6, moveY: -perp.z * 0.6, attack: null, block: false };
  }
}
