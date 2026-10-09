/**
 * Bosses (plan A2: "BossDef: phases by HP thresholds, i-frames and a camera beat at each change, weak points as
 * LockTarget.part; one placeholder boss").
 *
 * A boss is a monster brain with a phase table. Each phase starts when the boss's HP falls to its threshold; the
 * change makes the boss invulnerable for `phaseChangeSec` (the camera beat), and opens the phase with a telegraphed
 * signature attack whose tell is at least BOSS_MIN_OPENER_TELL. Weak points are lockable parts that take extra damage
 * (the monster-slayer read: lock the weak point, hit it).
 *
 * The one boss here is a [PLACEHOLDER] for the sandbox and the tests, not a design: no boss from a feel reference.
 */

import type { Element, Vec3 } from '../../contracts';
import { MIN_TELL_SEC, type MonsterAttack, type SteeringPreset } from '../monsters/defs';
import { HIT } from '../tuning';

/** A phase opener must read from across the arena. NEW [TUNE]. */
export const BOSS_MIN_OPENER_TELL = 0.6;

export interface BossWeakPoint {
  part: string;
  /** `[PLACEHOLDER] …` */
  label: string;
  /** Body-local: +x right, +y up, +z forward. */
  offset: Vec3;
  damageMult: number;
  /** Poise damage multiplier on the part (a weak point staggers). */
  poiseMult: number;
}

export interface BossPhase {
  /** The phase begins when hp / max ≤ this (the first phase is 1). */
  fromHp01: number;
  attacks: MonsterAttack[];
  /** The signature attack that opens the phase (telegraphed). */
  opener: MonsterAttack;
  speedMult: number;
  /** A phase may change the boss's element. */
  element?: Element | null;
}

export interface BossDef {
  id: string;
  /** `[PLACEHOLDER] …` */
  name: string;
  steering: SteeringPreset;
  hp: number;
  poise: number;
  element: Element | null;
  radius: number;
  height: number;
  level: number;
  aggroM: number;
  phaseChangeSec: number;
  phases: BossPhase[];
  weakPoints: BossWeakPoint[];
}

const PH = (s: string): string => `[PLACEHOLDER] ${s}`;

const slam = (id: string, tellSec: number, damage: number): MonsterAttack => ({
  id, label: PH('Ground Slam'), kind: 'melee', tellSec, landAt: 0.2, strikeSec: 0.55, recoverSec: 0.8, range: 3.4,
  arcDeg: 90, damage, staggerSec: 0.7, knockbackM: 2, poiseMult: 1.6, weight: 2,
});
const sweep = (id: string, tellSec: number, damage: number): MonsterAttack => ({
  id, label: PH('Tail Sweep'), kind: 'melee', tellSec, landAt: 0.22, strikeSec: 0.55, recoverSec: 0.7, range: 3.6,
  arcDeg: 220, damage, staggerSec: 0.5, knockbackM: 1.6, weight: 1,
});
const roar = (id: string, tellSec: number, damage: number, radius: number): MonsterAttack => ({
  id, label: PH('Shockwave'), kind: 'nova', tellSec, landAt: 0.15, strikeSec: 0.5, recoverSec: 1.0, range: radius,
  arcDeg: 360, damage, staggerSec: 0.6, knockbackM: 2.4, blockable: true, parryable: false, weight: 1,
});
const shard = (id: string, damage: number): MonsterAttack => ({
  id, label: PH('Stone Shard'), kind: 'projectile', tellSec: 0.65, landAt: 0.1, strikeSec: 0.3, recoverSec: 0.9, range: 18,
  arcDeg: 0, damage, staggerSec: 0.4, knockbackM: 0.8, projectileSpeed: 13, projectileRadius: 0.45, weight: 1,
});

/** The placeholder boss: three phases at 100 %, 66 % and 33 %, a core and a shoulder to lock. */
export const PLACEHOLDER_BOSS: BossDef = {
  id: 'boss.placeholder', name: PH('Stone Warden'), steering: 'striker',
  hp: 900, poise: 160, element: 'earth', radius: 1.6, height: 4.2, level: 5, aggroM: 30,
  phaseChangeSec: HIT.phaseChangeSec,
  phases: [
    { fromHp01: 1, speedMult: 1, attacks: [slam('boss.p1.slam', 0.8, 22), sweep('boss.p1.sweep', 0.7, 16)],
      opener: roar('boss.p1.roar', 0.9, 10, 6) },
    { fromHp01: 0.66, speedMult: 1.15, attacks: [slam('boss.p2.slam', 0.65, 26), sweep('boss.p2.sweep', 0.6, 18), shard('boss.p2.shard', 14)],
      opener: roar('boss.p2.roar', 0.8, 14, 7) },
    { fromHp01: 0.33, speedMult: 1.3, element: 'fire',
      attacks: [slam('boss.p3.slam', 0.55, 30), sweep('boss.p3.sweep', 0.5, 20), shard('boss.p3.shard', 16)],
      opener: roar('boss.p3.roar', 0.7, 18, 8) },
  ],
  weakPoints: [
    { part: 'core', label: PH('Core'), offset: { x: 0, y: 2.4, z: 0.9 }, damageMult: 1.5, poiseMult: 2 },
    { part: 'shoulder', label: PH('Cracked Shoulder'), offset: { x: 1.1, y: 3.4, z: 0.2 }, damageMult: 1.25, poiseMult: 1.5 },
  ],
};

/** Authoring lint for a boss. Empty = valid. */
export function validateBossDef(def: BossDef): string[] {
  const errs: string[] = [];
  if (!def.name.startsWith('[PLACEHOLDER]')) errs.push(`${def.id}: name must stay [PLACEHOLDER]`);
  if (!def.phases.length || def.phases[0].fromHp01 !== 1) errs.push(`${def.id}: the first phase must start at 1`);
  for (let i = 1; i < def.phases.length; i++) {
    const p = def.phases[i];
    if (!(p.fromHp01 > 0 && p.fromHp01 < def.phases[i - 1].fromHp01)) errs.push(`${def.id}: phase ${i + 1} threshold must fall below the last`);
  }
  for (const p of def.phases) {
    if (!(p.opener.tellSec >= BOSS_MIN_OPENER_TELL)) errs.push(`${p.opener.id}: opener tell ${p.opener.tellSec}s < ${BOSS_MIN_OPENER_TELL}s`);
    for (const a of [...p.attacks, p.opener]) {
      if (!(a.tellSec >= MIN_TELL_SEC)) errs.push(`${a.id}: tell ${a.tellSec}s < ${MIN_TELL_SEC}s (unreadable)`);
      if (!a.label.startsWith('[PLACEHOLDER]')) errs.push(`${a.id}: label must stay [PLACEHOLDER]`);
    }
  }
  const parts = new Set<string>();
  for (const w of def.weakPoints) {
    if (parts.has(w.part)) errs.push(`${def.id}: duplicate weak point ${w.part}`);
    parts.add(w.part);
    if (!(w.damageMult >= 1)) errs.push(`${def.id}: weak point ${w.part} must not take less damage`);
  }
  return errs;
}
