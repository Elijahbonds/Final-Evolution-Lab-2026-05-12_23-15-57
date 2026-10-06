/**
 * The monster archetypes (plan A2: "five archetypes on MobSteering presets with EnemyBrain tells of at least 0.35 s:
 * brute, skitter, caster, flyer, swarm"). Generic names, every one [PLACEHOLDER]: the IP line forbids a monster design
 * or name from a feel reference, and the owner names the bestiary (plan: open decision 1).
 *
 * Each archetype is one way to make the player read and answer:
 *   brute    slow, armoured (no flinch until its poise breaks), long tells, big hits: parry or roll, then punish.
 *   skitter  fast and fragile, a short lunge and away again (hit and run): lock and chase, or catch the lunge.
 *   caster   keeps its distance and throws slow element bolts: close the gap, or dodge through the bolt.
 *   flyer    hovers above reach and dives: wait for the dive, punish the landing (telekinesis pulls it down).
 *   swarm    many, weak, flanking: crowd control, sweeps and novas.
 *
 * Speeds come from MobSteering's presets (the shipped mob feel); tells from NeoCombatCore's EnemyBrain (its 0.40 s
 * base is the swarm's), never under MIN_TELL_SEC.
 */

import { STEERING_PRESETS } from '@/lib/babylon/core/MobSteering';
import { ENEMY_ATTACK } from '@/lib/babylon/core/NeoCombatCore';
import {
  MONSTER_TEAM, NO_FUSION, pool, vec3, type ActorId, type AdventureActor, type Element, type TeamId, type Vec3,
} from '../../contracts';
import type { WeightClass } from '../fightState';

/** The readability floor for every monster and boss tell (plan A2). */
export const MIN_TELL_SEC = 0.35;

export type SteeringPreset = keyof typeof STEERING_PRESETS;

export type MonsterAttackKind = 'melee' | 'projectile' | 'dive' | 'nova';

export interface MonsterAttack {
  id: string;
  /** `[PLACEHOLDER] …` */
  label: string;
  kind: MonsterAttackKind;
  /** The wind-up: the telegraph the player reads. ≥ MIN_TELL_SEC. */
  tellSec: number;
  /** Seconds into the strike that the hit lands, and the strike's length. */
  landAt: number;
  strikeSec: number;
  recoverSec: number;
  /** Reach (melee, dive), flight range (projectile) or the radius (nova). */
  range: number;
  arcDeg: number;
  damage: number;
  staggerSec: number;
  knockbackM: number;
  poiseMult?: number;
  launch?: boolean;
  /** A lunge through the strike, m/s (the skitter's dart). */
  lungeSpeed?: number;
  projectileSpeed?: number;
  projectileRadius?: number;
  /** How far up or down the hit reaches (a dive from the air). Default 1.6 m. */
  verticalReachM?: number;
  /** A guard can stop it / a parry can turn it. Default: melee both, projectiles guard only, novas neither. */
  blockable?: boolean;
  parryable?: boolean;
  /** Relative pick weight among the attacks in range. */
  weight: number;
}

export type MonsterArchetype = 'brute' | 'skitter' | 'caster' | 'flyer' | 'swarm';

export interface MonsterDef {
  id: string;
  /** `[PLACEHOLDER] …` */
  name: string;
  archetype: MonsterArchetype;
  steering: SteeringPreset;
  hp: number;
  poise: number;
  element: Element | null;
  weight: WeightClass;
  /** No flinch until its poise breaks. */
  hyperArmor: boolean;
  radius: number;
  height: number;
  level: number;
  /** Notices a hostile within this. */
  aggroM: number;
  /** Prefers to stand this far off (a caster); 0 = close in. */
  keepAwayM: number;
  /** After an attack, backs off for this long (the skitter's hit and run). */
  retreatSec: number;
  /** Hovers this high (a flyer). assumption: A1 lets a flagged monster fly (contract request: `canFly`). */
  hoverM: number;
  attacks: MonsterAttack[];
}

const PH = (s: string): string => `[PLACEHOLDER] ${s}`;

export const MONSTERS: Readonly<Record<MonsterArchetype, MonsterDef>> = {
  brute: {
    id: 'brute', name: PH('Brute'), archetype: 'brute', steering: 'striker',
    hp: 220, poise: 70, element: 'earth', weight: 'heavy', hyperArmor: true, radius: 0.9, height: 2.6, level: 3,
    aggroM: 14, keepAwayM: 0, retreatSec: 0, hoverM: 0,
    attacks: [
      { id: 'brute.overhead', label: PH('Overhead Smash'), kind: 'melee', tellSec: 0.7, landAt: 0.18, strikeSec: 0.5, recoverSec: 0.9,
        range: 2.5, arcDeg: 70, damage: 24, staggerSec: 0.6, knockbackM: 1.6, poiseMult: 1.5, weight: 2 },
      { id: 'brute.sweep', label: PH('Wide Sweep'), kind: 'melee', tellSec: 0.55, landAt: 0.2, strikeSec: 0.5, recoverSec: 0.7,
        range: 2.3, arcDeg: 200, damage: 16, staggerSec: 0.45, knockbackM: 1.2, weight: 1 },
    ],
  },
  skitter: {
    id: 'skitter', name: PH('Skitter'), archetype: 'skitter', steering: 'rusher',
    hp: 45, poise: 12, element: 'wind', weight: 'light', hyperArmor: false, radius: 0.45, height: 1.2, level: 2,
    aggroM: 16, keepAwayM: 0, retreatSec: 0.8, hoverM: 0,
    attacks: [
      { id: 'skitter.dart', label: PH('Dart Bite'), kind: 'melee', tellSec: 0.38, landAt: 0.16, strikeSec: 0.32, recoverSec: 0.3,
        range: 2.6, arcDeg: 80, damage: 8, staggerSec: 0.3, knockbackM: 0.4, lungeSpeed: 7, weight: 1 },
    ],
  },
  caster: {
    id: 'caster', name: PH('Caster'), archetype: 'caster', steering: 'flanker',
    hp: 60, poise: 15, element: 'lightning', weight: 'light', hyperArmor: false, radius: 0.5, height: 1.8, level: 3,
    aggroM: 18, keepAwayM: 9, retreatSec: 0, hoverM: 0,
    attacks: [
      { id: 'caster.bolt', label: PH('Charged Bolt'), kind: 'projectile', tellSec: 0.7, landAt: 0.1, strikeSec: 0.3, recoverSec: 1.1,
        range: 16, arcDeg: 0, damage: 14, staggerSec: 0.35, knockbackM: 0.6, projectileSpeed: 11, projectileRadius: 0.35, weight: 1 },
    ],
  },
  flyer: {
    id: 'flyer', name: PH('Flyer'), archetype: 'flyer', steering: 'defender',
    hp: 50, poise: 12, element: 'wind', weight: 'light', hyperArmor: false, radius: 0.6, height: 1.0, level: 3,
    aggroM: 18, keepAwayM: 0, retreatSec: 0.6, hoverM: 3,
    attacks: [
      { id: 'flyer.dive', label: PH('Dive Rake'), kind: 'dive', tellSec: 0.5, landAt: 0.22, strikeSec: 0.45, recoverSec: 0.8,
        range: 2.4, arcDeg: 90, damage: 12, staggerSec: 0.35, knockbackM: 0.8, lungeSpeed: 6, verticalReachM: 4, weight: 1 },
    ],
  },
  swarm: {
    id: 'swarm', name: PH('Swarmling'), archetype: 'swarm', steering: 'flanker',
    hp: 18, poise: 5, element: null, weight: 'light', hyperArmor: false, radius: 0.35, height: 0.9, level: 1,
    aggroM: 14, keepAwayM: 0, retreatSec: 0, hoverM: 0,
    attacks: [
      // NeoCombatCore's horde jab: its wind-up, its contact beat and its recovery, at the Adventure's damage scale.
      { id: 'swarm.nip', label: PH('Nip'), kind: 'melee', tellSec: ENEMY_ATTACK.windupSec, landAt: ENEMY_ATTACK.landAt,
        strikeSec: ENEMY_ATTACK.strikeSec, recoverSec: ENEMY_ATTACK.recoverSec, range: ENEMY_ATTACK.hitRange, arcDeg: ENEMY_ATTACK.arcDeg,
        damage: 5, staggerSec: 0.2, knockbackM: 0.3, weight: 1 },
    ],
  },
};

/**
 * assumption: A1 maps a full stick to a 9 m/s run (plan A1: "jog 6 m/s, run 9"). A monster's steering speed is its
 * stick's magnitude against that, so MobSteering's metres per second come out the other side. Contract request: a
 * per-actor speed cap would make this exact.
 */
export const ASSUMED_RUN_SPEED = 9;

/** A monster's stick magnitude for its preset speed. */
export function stickFor(def: Pick<MonsterDef, 'steering'>, speedMult = 1): number {
  return Math.min(1, (STEERING_PRESETS[def.steering].maxSpeed * speedMult) / ASSUMED_RUN_SPEED);
}

/**
 * A fresh actor for a monster def: its pools from the def, generic school, READY band (monsters have no PRQ). A4
 * spawns monsters through this, then registers the actor with the combat system.
 */
export function createMonsterActor(def: Pick<MonsterDef, 'hp' | 'poise' | 'element' | 'radius' | 'height' | 'level'>,
  id: ActorId, pos: Vec3, opts: { kind?: 'monster' | 'boss'; team?: TeamId } = {}): AdventureActor {
  return {
    id, kind: opts.kind ?? 'monster', team: opts.team ?? MONSTER_TEAM,
    pos: vec3(pos.x, pos.y, pos.z), vel: vec3(), facingYaw: 0, grounded: true, state: 'ground', stateSec: 0,
    radius: def.radius, height: def.height,
    stats: {
      hp: pool(def.hp), stamina: pool(100), energy: pool(0), poise: pool(def.poise), special: 0,
      level: def.level, prqBand: 'READY', school: { primary: 'straight', secondary: 'straight', mix: 0 }, element: def.element,
    },
    lock: null, stunSec: 0, iframeSec: 0, impulse: null, rail: null, ridingId: null, wantsFlight: false,
    fusion: { ...NO_FUSION }, partnerId: null,
  };
}

/** Authoring lint: every tell readable, every number sane. Empty = valid. */
export function validateMonsterDef(def: Pick<MonsterDef, 'id' | 'name' | 'attacks' | 'hp' | 'poise'>, minTell = MIN_TELL_SEC): string[] {
  const errs: string[] = [];
  if (!def.name.startsWith('[PLACEHOLDER]')) errs.push(`${def.id}: name must stay [PLACEHOLDER] until the owner names it`);
  if (!(def.hp > 0)) errs.push(`${def.id}: hp must be > 0`);
  if (!(def.poise >= 0)) errs.push(`${def.id}: poise must be ≥ 0`);
  if (!def.attacks.length) errs.push(`${def.id}: no attacks`);
  for (const a of def.attacks) {
    if (!(a.tellSec >= minTell)) errs.push(`${a.id}: tell ${a.tellSec}s < ${minTell}s (unreadable)`);
    if (!(a.landAt > 0 && a.landAt < a.strikeSec)) errs.push(`${a.id}: landAt must fall inside the strike`);
    if (!(a.damage > 0)) errs.push(`${a.id}: damage must be > 0`);
    if (!a.label.startsWith('[PLACEHOLDER]')) errs.push(`${a.id}: label must stay [PLACEHOLDER]`);
    if (a.kind === 'projectile' && !(a.projectileSpeed && a.projectileSpeed > 0)) errs.push(`${a.id}: projectile needs a speed`);
  }
  return errs;
}
