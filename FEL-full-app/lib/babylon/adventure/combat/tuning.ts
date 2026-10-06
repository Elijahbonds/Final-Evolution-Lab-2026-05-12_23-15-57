/**
 * The Adventure's fight numbers (ADVENTURE PLAN A2, 2026-10-06). One table, so the owner can find every feel number
 * in one place and every one says where it came from.
 *
 * EVERY VALUE HERE IS A STARTING VALUE, [TUNE]. The plan fixed some (stamina costs, regen, lock range, slow-time
 * scales); the rest are reused from the shipped combat stack, so a fight in the Adventure starts out feeling like the
 * fights the owner already signed off (StormCombat's dash, EvadeMoves' roll, FightCore's parry, DodgeRead's window).
 * A value with no source is marked NEW and listed as TUNED in the lane report.
 *
 * Pure data. No Babylon.
 */

import { GUARD_BREAK_STAGGER_SEC, PARRY_STAGGER_SEC, PARRY_WINDOW_MS, COMBO_WINDOW_SEC } from '@/lib/babylon/core/FightCore';
import { DASH, LAUNCH_AIR_SEC } from '@/lib/babylon/core/StormCombat';
import { ROLL_IFRAMES_SEC, ROLL_SEC, ROLL_SPEED, ROLL_COOLDOWN_SEC, JUMP_G } from '@/lib/babylon/core/EvadeMoves';
import { COUNTER_SEC, COUNTER_DAMAGE_MULT } from '@/lib/babylon/core/DodgeRead';
import { JUGGLE_DAMAGE_MULT } from '@/lib/babylon/core/OnslaughtCore';
import {
  SUBSTITUTION_CHI_COST, SUBSTITUTION_COOLDOWN_SEC, SUBSTITUTION_VULN_SEC,
} from '@/lib/babylon/core/DefenseSystem';

/** Souls-like stamina (plan A2: "100 max from A3; light 10, heavy 22, dodge 18, sprint 8/s, a blocked hit 0.6 × its
 *  damage; regen 35/s after a 0.6 s pause; guard breaks at zero"). [TUNE] */
export const STAMINA = {
  light: 10,
  heavy: 22,
  dodge: 18,
  sprintPerSec: 8,
  /** A blocked hit costs this × its damage (before the school's guard trait). */
  blockPerDamage: 0.6,
  regenPerSec: 35,
  regenDelaySec: 0.6,
  /** NEW [TUNE]: regen while the guard is up runs at this fraction (a raised guard is not a rest). */
  guardRegenMult: 0.5,
} as const;

/** Poise: stagger resistance. NEW [TUNE]. At zero the actor staggers for `breakStaggerSec` and poise refills. */
export const POISE = {
  regenPerSec: 18,
  regenDelaySec: 1.5,
  breakStaggerSec: 1.2,
  /** Poise damage of a strike = its damage × this (a heavy breaks a brute's poise in a few hits, a jab barely does). */
  perDamage: 1.0,
} as const;

/** Lock-on (plan A2: "pick by distance, screen-centre and line of sight; switch with a stick flick; break past 25 m or
 *  out of sight for 1 s"). [TUNE] */
export const LOCK = {
  /** Acquire range. NEW [TUNE]: inside the 25 m break range, so a fresh lock never breaks on its first tick. */
  acquireM: 20,
  breakM: 25,
  lostSightSec: 1,
  /** Score weights: metres of distance vs radians off the camera's forward (screen centre). NEW [TUNE]. */
  distWeight: 1,
  angleWeight: 8,
  /** Only targets within this angle of the camera forward are considered on acquire (the screen, roughly). */
  acquireHalfAngleRad: (75 * Math.PI) / 180,
  /** A flick: |look.x| past this on the tick it crosses (MoveInput.look's comment). */
  flick: 0.7,
} as const;

/** Guard and parry. FightCore's window and staggers, unchanged. */
export const GUARD = {
  parryWindowMs: PARRY_WINDOW_MS,                 // 160 (FightCore)
  parryStaggerSec: PARRY_STAGGER_SEC,             // 0.9 (FightCore): the attacker's punish window
  guardBreakStaggerSec: GUARD_BREAK_STAGGER_SEC,  // 1.4 (FightCore)
  /** NEW [TUNE]: the guard only covers the front (a souls-like shield): attacks from within this half-angle. */
  frontHalfAngleRad: (100 * Math.PI) / 180,
  /** After a parry the defender's next strike within this window hits harder (DodgeRead's counter numbers). */
  riposteSec: COUNTER_SEC,                        // 0.85
  riposteMult: COUNTER_DAMAGE_MULT,               // 1.5
} as const;

/** Dodge, the Storm dash and the homing dash to the lock. */
export const DODGE = {
  /** The locked dodge is EvadeMoves' roll: further, longer i-frames, a commitment. */
  rollSpeed: ROLL_SPEED,              // 7.4 m/s
  rollSec: ROLL_SEC,                  // 0.42
  rollIframeSec: ROLL_IFRAMES_SEC,    // 0.26 (ends before the roll does: a read, not a state)
  rollCooldownSec: ROLL_COOLDOWN_SEC, // 0.75
  /** The unlocked dash is StormCombat's: short, cheap i-frames. */
  dashIframeSec: DASH.iframes,        // 0.16
  /** Double-tap: the homing dash to the lock (StormCombat's chakra-dash numbers). */
  homingSpeed: DASH.homingSpeed,      // 12.5 m/s
  homingMaxSec: DASH.homingMaxSec,    // 0.6
  homingStopM: DASH.homingStopM,      // 1.5
  doubleTapSec: DASH.doubleSec,       // 0.32
} as const;

/** Substitution: DefenseSystem's numbers, spent from energy (the Adventure's chi). Guard held + dash. */
export const SUBSTITUTION = {
  energyCost: SUBSTITUTION_CHI_COST,          // 25
  cooldownSec: SUBSTITUTION_COOLDOWN_SEC,     // 3.0
  vulnerableSec: SUBSTITUTION_VULN_SEC,       // 0.6
  /** NEW [TUNE]: how long a substitution stays armed waiting for the hit it answers. */
  armedSec: 0.2,
  behindM: 1.1,                               // DefenseController.substitutionSpot's default
} as const;

/** Launchers and air strings. */
export const AIR = {
  /** How long a launched body stays up (StormCombat). */
  launchSec: LAUNCH_AIR_SEC,          // 0.9
  /**
   * assumption: A1's gravity on a launched body is EvadeMoves' combat gravity (19.5 m/s²). The launch impulse is sized
   * so the body is in the air for `launchSec` under it: v = g·T/2.
   */
  gravity: -JUMP_G,                   // 19.5
  /** An air link holds the body up: its vertical speed is set to this and its air time extended. NEW [TUNE]. */
  holdVy: 3.2,
  linkExtendSec: 0.45,
  /** NEW [TUNE]: the most air links one launch can take before the body drops (a juggle must end; BR sanity). */
  maxLinks: 4,
  /** Air links reach this far up or down (the attacker stays on the ground under a low juggle). */
  verticalReachM: 2.6,
  juggleMult: JUGGLE_DAMAGE_MULT,     // 1.5 (OnslaughtCore)
  /** NEW [TUNE]: a slam's downward speed and the knockdown it leaves. */
  slamVy: -9,
  slamStunSec: 0.9,
  /** NEW [TUNE]: a launcher's knockback is cut to this share, so the body goes UP in front of you, not away. */
  launchKnockbackMult: 0.2,
} as const;

/** Hit reactions. */
export const HIT = {
  comboWindowSec: COMBO_WINDOW_SEC,   // 1.1 (FightCore)
  /** FightCore.applyHit's scaling: each link past the first takes 12 % off, floor 40 %. */
  comboStep: 0.12,
  comboFloor: 0.4,
  /** Knockback: metres of slide become a velocity over this many seconds. NEW [TUNE]. */
  knockbackSec: 0.18,
  /** NEW [TUNE]: i-frames after a boss phase change (the camera beat). */
  phaseChangeSec: 1.4,
} as const;

/**
 * THE DAMAGE BOUNDS (the BR economy's guard). Whatever stacks — level, style, PRQ force, a route's payoff, a counter,
 * a juggle, an element, a fused partner spell — one hit never takes more than `maxFractionOfMaxHp` of the target's
 * max HP nor more than `maxAbsolute`, so nothing one-shots and the time to kill never collapses. NEW [TUNE].
 */
export const DAMAGE = {
  /** 0.34: no hit takes more than a third, so a fighter at full HP survives any two hits. */
  maxFractionOfMaxHp: 0.34,
  maxAbsolute: 80,
  /** The product of every multiplier is clamped to this before the caps. */
  maxMultiplier: 3,
  /** Level scaling of outgoing damage: +1.5 % a level (level 50 = ×1.735). */
  perLevel: 0.015,
  /** Spells scale with the PRQ mental attribute instead of style and force: ×(0.85 + 0.3 × mental / 100). */
  mentalBase: 0.85,
  mentalSpan: 0.3,
} as const;
